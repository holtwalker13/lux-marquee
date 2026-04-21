/** Default per-glyph prices when the Prices sheet tab is empty. */
export type PriceGlyphRow = { glyph: string; priceCents: number };

function centsForLetter(letter: string): number {
  const base = 5000;
  const spread = (letter.charCodeAt(0) % 11) * 100;
  return base + spread;
}

export function getDefaultPriceGlyphRows(): PriceGlyphRow[] {
  const glyphs: PriceGlyphRow[] = [];
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
  glyphs.push({ glyph: "THE", priceCents: 15_000 });
  return glyphs;
}
