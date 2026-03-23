/** Studio reference point: Jackson, Missouri (city center). */
export const SERVICE_BASE = {
  lat: 37.3822737,
  lon: -89.6662078,
  label: "Jackson, MO",
} as const;

/** Travel surcharge threshold (miles). */
export const SERVICE_RADIUS_MILES = 15;

const EARTH_RADIUS_MILES = 3958.7613;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Great-circle distance in statute miles. */
export function haversineMiles(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_MILES * c;
}

export function isOutsideServiceRadius(distanceMiles: number): boolean {
  return distanceMiles > SERVICE_RADIUS_MILES;
}
