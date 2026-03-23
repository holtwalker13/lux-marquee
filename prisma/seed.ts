import { PrismaClient } from "@prisma/client";

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

function centsForLetter(letter: string): number {
  const base = 5000;
  const spread = (letter.charCodeAt(0) % 11) * 100;
  return base + spread;
}

async function main() {
  await prisma.letterReservation.deleteMany();
  await prisma.contactSubmission.deleteMany();
  await prisma.letterInventory.deleteMany();
  await prisma.priceGlyph.deleteMany();

  const glyphs: { glyph: string; priceCents: number }[] = [];

  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    glyphs.push({ glyph: letter, priceCents: centsForLetter(letter) });
  }
  for (let d = 0; d <= 9; d++) {
    const glyph = String(d);
    glyphs.push({ glyph, priceCents: 5200 + (d % 5) * 100 });
  }
  for (const glyph of ["&", "-", "'"]) {
    glyphs.push({ glyph, priceCents: 5500 });
  }

  await prisma.priceGlyph.createMany({ data: glyphs });

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
