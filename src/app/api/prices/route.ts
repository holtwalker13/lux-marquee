import { NextResponse } from "next/server";
import { computePriceTableVersion } from "@/lib/pricing-version";
import { ensurePriceGlyphsFromSheet, loadActivePriceMap } from "@/lib/ensure-price-glyphs";

export async function GET() {
  try {
    await ensurePriceGlyphsFromSheet();
    const priceMap = await loadActivePriceMap();
    const rows = [...priceMap.entries()].map(([glyph, priceCents]) => ({
      glyph,
      priceCents,
    }));
    const version = computePriceTableVersion(rows);
    const glyphs: Record<string, number> = {};
    for (const r of rows) glyphs[r.glyph] = r.priceCents;
    return NextResponse.json({ version, glyphs });
  } catch (e) {
    console.error("[prices GET]", e);
    return NextResponse.json(
      { error: "Could not load prices from Google Sheets." },
      { status: 503 },
    );
  }
}
