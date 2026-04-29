import { NextResponse } from "next/server";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { parseEventStartUtc } from "@/lib/event-datetime";
import {
  formatAddressForGeocode,
  geocodeAddressQuery,
} from "@/lib/geocode-nominatim";
import {
  estimateFromPriceMap,
  formatUsd,
  normalizeLettering,
} from "@/lib/pricing";
import { computePriceTableVersion } from "@/lib/pricing-version";
import {
  SERVICE_BASE,
  SERVICE_RADIUS_MILES,
  haversineMiles,
  isOutsideServiceRadius,
} from "@/lib/service-area";
import { ensurePriceGlyphsFromSheet, loadActivePriceMap } from "@/lib/ensure-price-glyphs";
import {
  appendSubmission,
  createNewSubmissionId,
} from "@/lib/submissions-sheets-store";
import type { SheetSubmission } from "@/lib/submission-sheet-schema";
import { SHEET_VENMO_PAY_BY_CHECK } from "@/lib/payment-preference";

const EVENT_TYPES = new Set(["wedding", "baby_shower", "birthday", "other"]);

type Body = {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  eventType?: string;
  eventDate?: string;
  eventTime?: string;
  lettering?: string;
  notes?: string;
  eventAddressLine1?: string;
  eventAddressLine2?: string;
  eventCity?: string;
  eventState?: string;
  eventPostalCode?: string;
  setupOutdoor?: boolean;
  consentAccepted?: boolean;
  website?: string;
  clientVenmoUsername?: string;
  payViaCheck?: boolean;
};

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function buildMetadata(extra: Record<string, unknown>): string | null {
  const o: Record<string, unknown> = { ...extra };
  return Object.keys(o).length === 0 ? null : JSON.stringify(o);
}

export async function POST(req: Request) {
  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json(
      { error: "Server is not configured to save requests. Try again later." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.website && String(body.website).trim() !== "") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const contactName = String(body.contactName ?? "").trim();
  const contactEmail = String(body.contactEmail ?? "").trim().toLowerCase();
  const contactPhone = body.contactPhone
    ? String(body.contactPhone).trim()
    : "";
  const eventType = String(body.eventType ?? "").trim();
  const eventDateStr = String(body.eventDate ?? "").trim();
  const eventTimeRaw = String(body.eventTime ?? "12:00").trim();
  const letteringRaw = String(body.lettering ?? "");
  const notesRaw = body.notes != null ? String(body.notes).trim() : "";
  const normalized = normalizeLettering(letteringRaw);
  const pickupOnly = /^\d{1,4}$/.test(normalized);
  const consentAccepted = Boolean(body.consentAccepted);
  const setupOutdoor = Boolean(body.setupOutdoor);
  const payViaCheck = Boolean(body.payViaCheck);
  const clientVenmoUsername = String(body.clientVenmoUsername ?? "").trim();
  const venmoNormalized = clientVenmoUsername.replace(/^@+/, "").trim();

  const eventAddressLine1 = String(body.eventAddressLine1 ?? "").trim();
  const eventAddressLine2Raw = body.eventAddressLine2 != null
    ? String(body.eventAddressLine2).trim()
    : "";
  const eventCity = String(body.eventCity ?? "").trim();
  const eventState = String(body.eventState ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const eventPostalCode = String(body.eventPostalCode ?? "").trim();

  if (!contactName) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!contactEmail || !isValidEmail(contactEmail)) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 },
    );
  }
  if (!EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "Pick a valid event type." }, { status: 400 });
  }
  if (!eventDateStr) {
    return NextResponse.json({ error: "Event date is required." }, { status: 400 });
  }

  const eventTimeLocal = /^\d{2}:\d{2}$/.test(eventTimeRaw)
    ? eventTimeRaw
    : "12:00";

  const parsedStart = parseEventStartUtc(eventDateStr, eventTimeLocal);
  if (!parsedStart.ok) {
    return NextResponse.json({ error: parsedStart.message }, { status: 400 });
  }
  const eventStartAt = parsedStart.utc;

  const eventDate = new Date(`${eventDateStr}T12:00:00.000Z`);
  if (Number.isNaN(eventDate.getTime())) {
    return NextResponse.json({ error: "Invalid event date." }, { status: 400 });
  }
  if (!consentAccepted) {
    return NextResponse.json(
      { error: "Please agree to be contacted about your quote." },
      { status: 400 },
    );
  }
  if (!payViaCheck && venmoNormalized.length < 2) {
    return NextResponse.json(
      {
        error:
          "Enter your Venmo username (without @ is fine) or check Pay via check so we know how you’ll pay the deposit.",
      },
      { status: 400 },
    );
  }

  let hit: Awaited<ReturnType<typeof geocodeAddressQuery>> | null = null;
  let distanceRounded = 0;
  let outsideServiceRadius = false;

  if (!pickupOnly) {
    if (!eventAddressLine1) {
      return NextResponse.json(
        { error: "Street address is required." },
        { status: 400 },
      );
    }
    if (!eventCity || !eventState || eventState.length !== 2) {
      return NextResponse.json(
        { error: "City and a 2-letter state are required." },
        { status: 400 },
      );
    }
    if (!eventPostalCode) {
      return NextResponse.json(
        { error: "ZIP or postal code is required." },
        { status: 400 },
      );
    }

    const geoQuery = formatAddressForGeocode({
      line1: eventAddressLine1,
      line2: eventAddressLine2Raw || undefined,
      city: eventCity,
      state: eventState,
      postalCode: eventPostalCode,
    });

    try {
      hit = await geocodeAddressQuery(geoQuery);
    } catch (e) {
      console.error("[submissions POST] geocode", e);
      return NextResponse.json(
        {
          error: "Address lookup failed. Try again in a moment.",
          ...(process.env.NODE_ENV !== "production" && {
            details: e instanceof Error ? e.message : String(e),
          }),
        },
        { status: 503 },
      );
    }
    if (!hit) {
      return NextResponse.json(
        {
          error:
            "We couldn’t verify the event address. Please check the street, city, state, and ZIP.",
        },
        { status: 422 },
      );
    }

    const distanceMiles = haversineMiles(
      { lat: hit.lat, lon: hit.lon },
      SERVICE_BASE,
    );
    distanceRounded = Math.round(distanceMiles * 10) / 10;
    outsideServiceRadius = isOutsideServiceRadius(distanceMiles);
  }

  try {
    await ensurePriceGlyphsFromSheet();
    const priceMap = await loadActivePriceMap();
    const rowsForVersion = [...priceMap.entries()].map(([glyph, priceCents]) => ({
      glyph,
      priceCents,
    }));
    const version = computePriceTableVersion(rowsForVersion);

    const est = estimateFromPriceMap(normalized, priceMap);
    if (!est.ok) {
      return NextResponse.json({ error: est.error.message }, { status: 400 });
    }

    const metadata = buildMetadata({
      geocodedLabel: hit?.displayName ?? null,
      serviceBaseLabel: SERVICE_BASE.label,
      serviceRadiusMiles: SERVICE_RADIUS_MILES,
      travelSurchargeApplies: outsideServiceRadius,
      outdoorSetupPremium: pickupOnly ? false : setupOutdoor,
      pickupOnly,
      intakePayment: payViaCheck ? "check" : "venmo",
    });

    const id = createNewSubmissionId();
    const createdAt = new Date();

    const sub: SheetSubmission = {
      id,
      createdAt,
      contactName,
      contactEmail,
      contactPhone: contactPhone || null,
      eventType,
      eventDate,
      eventTimeLocal,
      eventStartAt,
      eventAddressLine1: pickupOnly ? "LOCAL PICKUP" : eventAddressLine1,
      eventAddressLine2: pickupOnly ? null : eventAddressLine2Raw || null,
      eventCity: pickupOnly ? "" : eventCity,
      eventState: pickupOnly ? "" : eventState,
      eventPostalCode: pickupOnly ? "" : eventPostalCode,
      eventLat: hit?.lat ?? null,
      eventLng: hit?.lon ?? null,
      distanceMilesFromBase: distanceRounded,
      outsideServiceRadius,
      setupOutdoor: pickupOnly ? false : setupOutdoor,
      letteringRaw: letteringRaw.trim(),
      notes: notesRaw || null,
      letteringNormalized: est.normalized,
      estimatedTotalCents: est.totalCents,
      priceTableVersion: version,
      consentAccepted: true,
      pipelineStatus: "pending_request",
      proposedAmountCents: null,
      venmoHandle: payViaCheck ? SHEET_VENMO_PAY_BY_CHECK : venmoNormalized || null,
      depositRequestedAt: null,
      depositPaidAt: null,
      bookingConfirmedAt: null,
      metadata,
    };

    await appendSubmission(sub);

    return NextResponse.json(
      {
        id: sub.id,
        estimatedTotalCents: est.totalCents,
        estimatedTotalFormatted: formatUsd(est.totalCents),
        distanceMilesFromBase: distanceRounded,
        outsideServiceRadius,
        setupOutdoor,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[submissions POST]", e);
    const resp: {
      error: string;
      details?: string;
    } = { error: "Could not save your request. Try again later." };
    if (process.env.NODE_ENV !== "production") {
      resp.details = e instanceof Error ? e.message : String(e);
    }
    return NextResponse.json(resp, { status: 500 });
  }
}
