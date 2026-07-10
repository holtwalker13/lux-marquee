/**
 * Tokenizes normalized marquee text for inventory, reservations, and pricing.
 * Whole-word "THE" (as a physical unit) is one token; spaces split words.
 */

/** Words where THE is part of the spelling, not a separate physical block. */
const GLUED_THE_WHOLE_WORDS = new Set([
  "THEATER",
  "THEATRE",
  "THEFT",
  "THEIR",
  "THEM",
  "THEME",
  "THERE",
  "THESE",
  "THETA",
  "THEY",
  "THICK",
  "THIN",
  "THING",
  "THINK",
  "THIRD",
  "THREE",
  "THREW",
  "THROW",
  "THUMB",
  "THUMP",
]);

/**
 * Splits glued segments like THEVESSELS → THE + VESSELS so inventory uses the
 * preset THE block instead of counting T, H, E individually.
 */
export function expandGluedTheSegments(normalized: string): string {
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((seg) => {
      const u = seg.toUpperCase();
      if (u.length > 3 && u.startsWith("THE") && !GLUED_THE_WHOLE_WORDS.has(u)) {
        return ["THE", u.slice(3)];
      }
      return [seg];
    })
    .join(" ");
}

function isLatinAlphanumeric(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9");
}

function tokensFromSegment(seg: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < seg.length) {
    if (i + 3 <= seg.length && seg.slice(i, i + 3) === "THE") {
      const left = i === 0 ? undefined : seg[i - 1];
      const right = i + 3 >= seg.length ? undefined : seg[i + 3];
      const leftOk = left === undefined || !isLatinAlphanumeric(left);
      const rightOk = right === undefined || !isLatinAlphanumeric(right);
      if (leftOk && rightOk) {
        out.push("THE");
        i += 3;
        continue;
      }
    }
    out.push(seg[i]!);
    i += 1;
  }
  return out;
}

/** Parses a LetterReservations column C value (A–Z, THE, etc.). */
export function parseReservationLetterKey(raw: string): string | null {
  const k = raw.trim().toUpperCase();
  if (!k) return null;
  return isInventorySheetKey(k) ? k : null;
}

/** Inventory / reservation keys allowed in the Inventory sheet column A. */
export function isInventorySheetKey(key: string): boolean {
  const k = key.trim().toUpperCase();
  if (!k) return false;
  if (k === "THE") return true;
  if (k.length !== 1) return false;
  if (k >= "A" && k <= "Z") return true;
  if (k >= "0" && k <= "9") return true;
  return k === "&" || k === "-" || k === "'";
}

/**
 * Splits on whitespace, then within each run tokenizes THE as one unit when
 * it is not glued to an alphanumeric on either side (e.g. not inside ATHENA).
 */
export function tokenizeInventoryGlyphs(normalized: string): string[] {
  const tokens: string[] = [];
  const segments = expandGluedTheSegments(normalized).split(/\s+/).filter(Boolean);
  for (const seg of segments) {
    tokens.push(...tokensFromSegment(seg.toUpperCase()));
  }
  return tokens;
}

export function inventoryGlyphCountsFromNormalized(normalized: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of tokenizeInventoryGlyphs(normalized)) {
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}
