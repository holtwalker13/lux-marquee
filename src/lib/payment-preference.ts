/** Stored in SubmitRequests "Client Venmo" when the client chose check at intake. */
export const SHEET_VENMO_PAY_BY_CHECK = "PAY_BY_CHECK";

export function isPayByCheckVenmoHandle(handle: string | null | undefined): boolean {
  return String(handle ?? "").trim().toUpperCase() === SHEET_VENMO_PAY_BY_CHECK;
}
