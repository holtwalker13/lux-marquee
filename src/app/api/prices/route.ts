import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computePriceTableVersion } from "@/lib/pricing-version";

export async function GET() {
  const rows = await prisma.priceGlyph.findMany({
    where: { active: true },
    select: { glyph: true, priceCents: true },
  });
  const version = computePriceTableVersion(rows);
  const glyphs: Record<string, number> = {};
  for (const r of rows) glyphs[r.glyph] = r.priceCents;
  return NextResponse.json({ version, glyphs });
}
