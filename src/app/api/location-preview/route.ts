import { NextResponse } from "next/server";
import {
  formatAddressForGeocode,
  geocodeAddressQuery,
} from "@/lib/geocode-nominatim";
import {
  SERVICE_BASE,
  SERVICE_RADIUS_MILES,
  haversineMiles,
  isOutsideServiceRadius,
} from "@/lib/service-area";

type Body = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  website?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.website && String(body.website).trim() !== "") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const line1 = String(body.line1 ?? "").trim();
  const line2 = body.line2 != null ? String(body.line2).trim() : "";
  const city = String(body.city ?? "").trim();
  const state = String(body.state ?? "").trim();
  const postalCode = String(body.postalCode ?? "").trim();

  if (!line1 || !city || !state || !postalCode) {
    return NextResponse.json(
      { error: "Street, city, state, and ZIP are required." },
      { status: 400 },
    );
  }

  const query = formatAddressForGeocode({
    line1,
    line2: line2 || undefined,
    city,
    state,
    postalCode,
  });

  const hit = await geocodeAddressQuery(query);
  if (!hit) {
    return NextResponse.json(
      {
        error:
          "We couldn’t find that address. Double-check the street, city, state, and ZIP.",
      },
      { status: 422 },
    );
  }

  const distanceMiles = haversineMiles(
    { lat: hit.lat, lon: hit.lon },
    SERVICE_BASE,
  );
  const rounded = Math.round(distanceMiles * 10) / 10;
  const outsideServiceRadius = isOutsideServiceRadius(distanceMiles);

  return NextResponse.json({
    distanceMiles: rounded,
    outsideServiceRadius,
    serviceRadiusMiles: SERVICE_RADIUS_MILES,
    baseLabel: SERVICE_BASE.label,
    matchedLabel: hit.displayName,
  });
}
