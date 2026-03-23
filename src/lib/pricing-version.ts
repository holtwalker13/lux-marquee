import { createHash } from "crypto";

export function computePriceTableVersion(
  rows: { glyph: string; priceCents: number }[],
): string {
  const body = [...rows]
    .sort((a, b) => a.glyph.localeCompare(b.glyph))
    .map((r) => `${r.glyph}:${r.priceCents}`)
    .join("|");
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}
