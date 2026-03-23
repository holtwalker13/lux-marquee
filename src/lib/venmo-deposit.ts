const DEPOSIT_DOLLARS = 100;

function normalizeVenmoHandle(venmoHandle: string): string {
  return venmoHandle.trim().replace(/^@/, "").replace(/\s+/g, "-");
}

/** Venmo has no public API — open a charge link with any dollar amount. */
export function buildVenmoChargeUrl(
  venmoHandle: string,
  amountDollars: number,
  note: string,
): string {
  const h = normalizeVenmoHandle(venmoHandle);
  const safe = Math.max(0, Math.round(amountDollars * 100) / 100);
  const amount = safe.toFixed(2);
  const params = new URLSearchParams({
    txn: "charge",
    amount,
    note: note.slice(0, 200),
  });
  return `https://venmo.com/${encodeURIComponent(h)}?${params.toString()}`;
}

/** Standard $100 deposit request link. */
export function buildVenmoDepositUrl(venmoHandle: string, note: string): string {
  return buildVenmoChargeUrl(venmoHandle, DEPOSIT_DOLLARS, note);
}

export function depositAmountDollars(): number {
  return DEPOSIT_DOLLARS;
}
