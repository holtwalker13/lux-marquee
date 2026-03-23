const DEPOSIT_DOLLARS = 100;

/** Venmo has no public API for programmatic requests — open a charge link for the client. */
export function buildVenmoDepositUrl(venmoHandle: string, note: string): string {
  const h = venmoHandle.trim().replace(/^@/, "").replace(/\s+/g, "-");
  const amount = DEPOSIT_DOLLARS.toFixed(2);
  const params = new URLSearchParams({
    txn: "charge",
    amount,
    note: note.slice(0, 200),
  });
  return `https://venmo.com/${encodeURIComponent(h)}?${params.toString()}`;
}

export function depositAmountDollars(): number {
  return DEPOSIT_DOLLARS;
}
