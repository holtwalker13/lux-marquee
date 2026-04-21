import { getBillableGlyphs } from "@/lib/pricing";

/** Counts each inventory token (A–Z, digits, & - ', and whole-word THE). */
export function letterCountsFromPhrase(normalizedLettering: string): Map<string, number> {
  const billable = getBillableGlyphs(normalizedLettering);
  const map = new Map<string, number>();
  for (const g of billable) {
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}
