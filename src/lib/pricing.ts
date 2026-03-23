/** @see docs/PRD.md §5 — safe to import from Client Components */
export const LETTERING_MAX_LENGTH = 48;

export type PricingErrorCode =
  | "LETTERING_EMPTY"
  | "LETTERING_TOO_LONG"
  | "LETTERING_INVALID_CHAR"
  | "LETTERING_UNPRICED_CHAR";

export type PricingError = {
  code: PricingErrorCode;
  message: string;
};

function isAllowedChar(ch: string): boolean {
  if (ch.length !== 1) return false;
  if (ch === " ") return true;
  if (ch >= "A" && ch <= "Z") return true;
  if (ch >= "0" && ch <= "9") return true;
  return ch === "&" || ch === "-" || ch === "'";
}

export function normalizeLettering(raw: string): string {
  const trimmed = raw.normalize("NFC").trim();
  return [...trimmed]
    .map((ch) => {
      if (ch >= "a" && ch <= "z") return ch.toUpperCase();
      return ch;
    })
    .join("");
}

export function validateLetteringNormalized(
  normalized: string,
): true | PricingError {
  if (normalized.length === 0) {
    return {
      code: "LETTERING_EMPTY",
      message: "Please enter the letters or numbers for your sign.",
    };
  }
  if (normalized.length > LETTERING_MAX_LENGTH) {
    return {
      code: "LETTERING_TOO_LONG",
      message: `Keep lettering to ${LETTERING_MAX_LENGTH} characters or fewer.`,
    };
  }
  for (const ch of normalized) {
    if (!isAllowedChar(ch)) {
      return {
        code: "LETTERING_INVALID_CHAR",
        message:
          "Use only letters, numbers, spaces, and & - ' (other symbols aren’t available).",
      };
    }
  }
  return true;
}

export function getBillableGlyphs(normalized: string): string[] {
  return [...normalized].filter((c) => c !== " ");
}

export type GlyphLine = {
  glyph: string;
  count: number;
  unitCents: number;
  subtotalCents: number;
};

export type EstimateResult =
  | {
      ok: true;
      normalized: string;
      lines: GlyphLine[];
      totalCents: number;
    }
  | { ok: false; error: PricingError };

export function estimateFromPriceMap(
  normalized: string,
  priceMap: Map<string, number>,
): EstimateResult {
  const v = validateLetteringNormalized(normalized);
  if (v !== true) return { ok: false, error: v };

  const billable = getBillableGlyphs(normalized);
  const linesMap = new Map<string, { count: number; unitCents: number }>();

  for (const g of billable) {
    const unit = priceMap.get(g);
    if (unit === undefined) {
      return {
        ok: false,
        error: {
          code: "LETTERING_UNPRICED_CHAR",
          message:
            "One of your characters isn’t available right now. Please contact us for a custom quote.",
        },
      };
    }
    const cur = linesMap.get(g);
    if (cur) cur.count += 1;
    else linesMap.set(g, { count: 1, unitCents: unit });
  }

  const lines: GlyphLine[] = [...linesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([glyph, { count, unitCents }]) => ({
      glyph,
      count,
      unitCents,
      subtotalCents: count * unitCents,
    }));

  const totalCents = lines.reduce((s, l) => s + l.subtotalCents, 0);
  return { ok: true, normalized, lines, totalCents };
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
