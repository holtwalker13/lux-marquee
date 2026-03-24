import {
  ensurePricesSheetSeeded,
  fetchPriceRowsFromSheet,
} from "@/lib/google-sheets";
import { getDefaultPriceGlyphRows } from "@/lib/default-price-glyphs";

export async function ensurePriceGlyphsFromSheet(): Promise<void> {
  await ensurePricesSheetSeeded(getDefaultPriceGlyphRows());
}

export async function loadActivePriceMap(): Promise<Map<string, number>> {
  await ensurePriceGlyphsFromSheet();
  const rows = await fetchPriceRowsFromSheet();
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.active) map.set(r.glyph, r.priceCents);
  }
  return map;
}
