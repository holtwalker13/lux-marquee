import type { PrismaClient } from "@prisma/client";
import { getDefaultPriceGlyphRows } from "@/lib/default-price-glyphs";

/** If the DB was pushed but never seeded, quote submission would fail pricing. */
export async function ensurePriceGlyphsSeeded(prisma: PrismaClient): Promise<void> {
  const n = await prisma.priceGlyph.count();
  if (n > 0) return;
  await prisma.priceGlyph.createMany({ data: getDefaultPriceGlyphRows() });
}
