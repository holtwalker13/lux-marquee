import { getBillableGlyphs } from "@/lib/pricing";

/** Count A–Z only (physical marquee letters). Ignores digits & symbols. */
export function letterCountsFromPhrase(normalizedLettering: string): Map<string, number> {
  const billable = getBillableGlyphs(normalizedLettering);
  const map = new Map<string, number>();
  for (const ch of billable) {
    if (ch.length !== 1 || ch < "A" || ch > "Z") continue;
    map.set(ch, (map.get(ch) ?? 0) + 1);
  }
  return map;
}
