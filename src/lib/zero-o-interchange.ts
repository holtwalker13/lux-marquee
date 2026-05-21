/** Marquee zeros and letter O share the same physical shape — one pool for availability. */
export const ZERO_GLYPH = "0";
export const O_GLYPH = "O";

export function isZeroOInterchangeable(letter: string): boolean {
  return letter === ZERO_GLYPH || letter === O_GLYPH;
}

/** How many 0/O units to hold, preferring exact glyph stock then the interchangeable one. */
export function resolveZeroOReservations(
  need0: number,
  needO: number,
  avail0: number,
  availO: number,
): { reserve0: number; reserveO: number } {
  let reserve0 = 0;
  let reserveO = 0;
  let demand0 = need0;
  let demandO = needO;
  let free0 = avail0;
  let freeO = availO;

  const from0For0 = Math.min(demand0, free0);
  reserve0 += from0For0;
  free0 -= from0For0;
  demand0 -= from0For0;

  const fromOFor0 = Math.min(demand0, freeO);
  reserveO += fromOFor0;
  freeO -= fromOFor0;
  demand0 -= fromOFor0;

  const fromOForO = Math.min(demandO, freeO);
  reserveO += fromOForO;
  freeO -= fromOForO;
  demandO -= fromOForO;

  const from0ForO = Math.min(demandO, free0);
  reserve0 += from0ForO;

  return { reserve0, reserveO };
}

export function zeroOIssueLabel(need0: number, needO: number): string {
  if (need0 > 0 && needO > 0) return "0/O";
  if (need0 > 0) return ZERO_GLYPH;
  return O_GLYPH;
}
