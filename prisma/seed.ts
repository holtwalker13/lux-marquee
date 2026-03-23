import { PrismaClient } from "@prisma/client";
import { getDefaultPriceGlyphRows } from "../src/lib/default-price-glyphs";
import { computePriceTableVersion } from "../src/lib/pricing-version";
import { mockContactSubmissionsForSeed } from "./mock-submissions";

const prisma = new PrismaClient();

const LETTER_STOCK: [string, number][] = [
  ["A", 8],
  ["B", 3],
  ["C", 4],
  ["D", 4],
  ["E", 12],
  ["F", 3],
  ["G", 3],
  ["H", 5],
  ["I", 7],
  ["J", 1],
  ["K", 2],
  ["L", 6],
  ["M", 4],
  ["N", 7],
  ["O", 10],
  ["P", 3],
  ["Q", 1],
  ["R", 7],
  ["S", 6],
  ["T", 8],
  ["U", 4],
  ["V", 2],
  ["W", 3],
  ["X", 1],
  ["Y", 3],
  ["Z", 1],
];

async function main() {
  await prisma.letterReservation.deleteMany();
  await prisma.contactSubmission.deleteMany();
  await prisma.letterInventory.deleteMany();
  await prisma.priceGlyph.deleteMany();

  await prisma.priceGlyph.createMany({ data: getDefaultPriceGlyphRows() });

  const glyphRows = await prisma.priceGlyph.findMany({
    where: { active: true },
    select: { glyph: true, priceCents: true },
  });
  const priceTableVersion = computePriceTableVersion(glyphRows);

  await prisma.contactSubmission.createMany({
    data: mockContactSubmissionsForSeed(priceTableVersion),
  });

  await prisma.letterInventory.createMany({
    data: LETTER_STOCK.map(([letter, totalQuantity]) => ({
      letter,
      totalQuantity,
    })),
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
