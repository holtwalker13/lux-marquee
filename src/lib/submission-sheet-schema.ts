import { formatUsd, normalizeLettering } from "@/lib/pricing";
import { parseMoneyToCents } from "@/lib/money-parse";

/** Canonical SubmitRequests columns (row 1). Same order as sheet values. */
export const SUBMIT_REQUEST_HEADERS = [
  "Submitted at (UTC)",
  "Submission ID",
  "Pipeline status",
  "Contact name",
  "Email",
  "Phone",
  "Event type",
  "Event date",
  "Event time (local)",
  "Event start (UTC)",
  "Event address",
  "Lettering",
  "Estimated total",
  "Setup",
  "Outside radius",
  "Distance (mi)",
  "Proposed total",
  "Client Venmo",
  "Address line 1",
  "Address line 2",
  "City",
  "State",
  "ZIP",
  "Lat",
  "Lng",
  "Lettering normalized",
  "Price table version",
  "Consent accepted",
  "Deposit requested (ISO)",
  "Deposit paid (ISO)",
  "Booking confirmed (ISO)",
  "Metadata (JSON)",
] as const;

export const SUBMIT_REQUEST_COL_COUNT = SUBMIT_REQUEST_HEADERS.length;

export type SheetSubmission = {
  id: string;
  createdAt: Date;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  eventType: string;
  eventDate: Date;
  eventTimeLocal: string;
  eventStartAt: Date | null;
  eventAddressLine1: string;
  eventAddressLine2: string | null;
  eventCity: string;
  eventState: string;
  eventPostalCode: string;
  eventLat: number | null;
  eventLng: number | null;
  distanceMilesFromBase: number | null;
  outsideServiceRadius: boolean;
  setupOutdoor: boolean;
  letteringRaw: string;
  letteringNormalized: string;
  estimatedTotalCents: number;
  priceTableVersion: string;
  consentAccepted: boolean;
  pipelineStatus: string;
  proposedAmountCents: number | null;
  venmoHandle: string | null;
  depositRequestedAt: Date | null;
  depositPaidAt: Date | null;
  bookingConfirmedAt: Date | null;
  metadata: string | null;
};

function cell(row: string[], i: number): string {
  return row[i] != null ? String(row[i]).trim() : "";
}

function parseIsoDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEventDateCell(s: string): Date {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00.000Z` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function parseBool(s: string, fallback: boolean): boolean {
  const t = s.toLowerCase();
  if (t === "yes" || t === "true" || t === "1") return true;
  if (t === "no" || t === "false" || t === "0") return false;
  return fallback;
}

/** Parse a data row (may be legacy 18-column). */
export function parseSubmissionRow(row: string[]): SheetSubmission | null {
  const id = cell(row, 1);
  if (!id) return null;

  const eventTimeLocal = cell(row, 8) || "12:00";
  const displayAddr = cell(row, 10);
  const line1 = cell(row, 18) || displayAddr.split(" · ")[0] || displayAddr;
  const line2Raw = cell(row, 19);
  const city = cell(row, 20);
  const state = cell(row, 21);
  const zip = cell(row, 22);
  const latStr = cell(row, 23);
  const lngStr = cell(row, 24);
  const lat = latStr ? Number(latStr) : null;
  const lng = lngStr ? Number(lngStr) : null;

  const estCents =
    parseMoneyToCents(cell(row, 12)) ??
    (Number.isFinite(Number(cell(row, 12)))
      ? Math.round(Number(cell(row, 12)) * 100)
      : 0);
  const proposedCents = parseMoneyToCents(cell(row, 16));

  const letteringNorm = cell(row, 25) || normalizeLettering(cell(row, 11));

  const created = parseIsoDate(cell(row, 0)) ?? new Date();
  const eventStartAt = parseIsoDate(cell(row, 9));

  return {
    id,
    createdAt: created,
    contactName: cell(row, 3),
    contactEmail: cell(row, 4),
    contactPhone: cell(row, 5) || null,
    eventType: cell(row, 6),
    eventDate: parseEventDateCell(cell(row, 7)),
    eventTimeLocal,
    eventStartAt,
    eventAddressLine1: line1,
    eventAddressLine2: line2Raw || null,
    eventCity: city,
    eventState: state,
    eventPostalCode: zip,
    eventLat: Number.isFinite(lat!) ? lat : null,
    eventLng: Number.isFinite(lng!) ? lng : null,
    distanceMilesFromBase: (() => {
      const d = Number(cell(row, 15));
      return Number.isFinite(d) ? d : null;
    })(),
    outsideServiceRadius: parseBool(cell(row, 14), false),
    setupOutdoor: cell(row, 13).toLowerCase() === "outdoor",
    letteringRaw: cell(row, 11),
    letteringNormalized: letteringNorm,
    estimatedTotalCents: estCents,
    priceTableVersion: cell(row, 26) || "sheet",
    consentAccepted: parseBool(cell(row, 27), true),
    pipelineStatus: cell(row, 2) || "pending_request",
    proposedAmountCents: proposedCents,
    venmoHandle: cell(row, 17) || null,
    depositRequestedAt: parseIsoDate(cell(row, 28)),
    depositPaidAt: parseIsoDate(cell(row, 29)),
    bookingConfirmedAt: parseIsoDate(cell(row, 30)),
    metadata: cell(row, 31) || null,
  };
}

export function sheetSubmissionToRowValues(sub: SheetSubmission): string[] {
  const displayAddr = [
    sub.eventAddressLine1,
    sub.eventAddressLine2,
    [sub.eventCity, sub.eventState, sub.eventPostalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  const row: string[] = new Array(SUBMIT_REQUEST_COL_COUNT).fill("");
  const set = (i: number, v: string | number | boolean) => {
    row[i] = v === "" || v == null ? "" : String(v);
  };

  set(0, sub.createdAt.toISOString());
  set(1, sub.id);
  set(2, sub.pipelineStatus);
  set(3, sub.contactName);
  set(4, sub.contactEmail);
  set(5, sub.contactPhone ?? "");
  set(6, sub.eventType);
  set(7, sub.eventDate.toISOString().slice(0, 10));
  set(8, sub.eventTimeLocal);
  set(9, sub.eventStartAt?.toISOString() ?? "");
  set(10, displayAddr);
  set(11, sub.letteringRaw);
  set(12, formatUsd(sub.estimatedTotalCents));
  set(13, sub.setupOutdoor ? "outdoor" : "indoor");
  set(14, sub.outsideServiceRadius ? "yes" : "no");
  set(15, sub.distanceMilesFromBase ?? "");
  set(
    16,
    sub.proposedAmountCents != null && sub.proposedAmountCents > 0
      ? formatUsd(sub.proposedAmountCents)
      : "",
  );
  set(17, sub.venmoHandle ?? "");
  set(18, sub.eventAddressLine1);
  set(19, sub.eventAddressLine2 ?? "");
  set(20, sub.eventCity);
  set(21, sub.eventState);
  set(22, sub.eventPostalCode);
  set(23, sub.eventLat ?? "");
  set(24, sub.eventLng ?? "");
  set(25, sub.letteringNormalized);
  set(26, sub.priceTableVersion);
  set(27, sub.consentAccepted ? "yes" : "no");
  set(28, sub.depositRequestedAt?.toISOString() ?? "");
  set(29, sub.depositPaidAt?.toISOString() ?? "");
  set(30, sub.bookingConfirmedAt?.toISOString() ?? "");
  set(31, sub.metadata ?? "");

  return row;
}

/** JSON shape expected by AdminDashboard + PATCH handlers. */
export function sheetSubmissionToApiJson(sub: SheetSubmission) {
  return {
    id: sub.id,
    createdAt: sub.createdAt.toISOString(),
    pipelineStatus: sub.pipelineStatus,
    contactName: sub.contactName,
    contactEmail: sub.contactEmail,
    contactPhone: sub.contactPhone,
    eventType: sub.eventType,
    eventDate: sub.eventDate.toISOString(),
    eventTimeLocal: sub.eventTimeLocal,
    eventStartAt: sub.eventStartAt?.toISOString() ?? null,
    eventAddressLine1: sub.eventAddressLine1,
    eventCity: sub.eventCity,
    eventState: sub.eventState,
    eventPostalCode: sub.eventPostalCode,
    letteringRaw: sub.letteringRaw,
    letteringNormalized: sub.letteringNormalized,
    setupOutdoor: sub.setupOutdoor,
    outsideServiceRadius: sub.outsideServiceRadius,
    distanceMilesFromBase: sub.distanceMilesFromBase,
    proposedAmountCents: sub.proposedAmountCents,
    venmoHandle: sub.venmoHandle,
    depositRequestedAt: sub.depositRequestedAt?.toISOString() ?? null,
    depositPaidAt: sub.depositPaidAt?.toISOString() ?? null,
    bookingConfirmedAt: sub.bookingConfirmedAt?.toISOString() ?? null,
  };
}
