/**
 * Forward geocode via OpenStreetMap Nominatim (free, no API key).
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */

export type GeocodeHit = {
  lat: number;
  lon: number;
  displayName: string;
};

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT?.trim() ||
  "LuxMarquee/1.0 (event quote form; contact: studio owner)";

function parseLatLon(lat: string, lon: string): { lat: number; lon: number } | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: la, lon: lo };
}

export async function geocodeAddressQuery(query: string): Promise<GeocodeHit | null> {
  const q = query.trim();
  if (q.length < 8) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    lat?: string;
    lon?: string;
    display_name?: string;
  }[];

  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;

  const coords = parseLatLon(first.lat, first.lon);
  if (!coords) return null;

  return {
    lat: coords.lat,
    lon: coords.lon,
    displayName: String(first.display_name ?? q).slice(0, 500),
  };
}

export function formatAddressForGeocode(parts: {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
}): string {
  const bits = [
    parts.line1.trim(),
    parts.line2?.trim(),
    [parts.city.trim(), parts.state.trim(), parts.postalCode.trim()]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);
  return bits.join(", ");
}
