import { google } from "googleapis";

function getJwtAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) return null;
  const key = rawKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEET_ID?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}

function pendingTabName(): string {
  return process.env.GOOGLE_SHEET_PENDING_TAB?.trim() || "SubmitRequests";
}

function inventoryTabName(): string {
  return process.env.GOOGLE_SHEET_INVENTORY_TAB?.trim() || "Inventory";
}

/** Append one row to the pending / non-finalized requests tab. */
export async function appendPendingSubmissionRow(values: (string | number | boolean)[]): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) return;

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const range = `${pendingTabName()}!A1`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Read letter inventory from Sheet columns: letter | total_quantity (header row optional skip A2:B). */
export async function fetchLetterInventoryFromSheet(): Promise<Map<string, number> | null> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) return null;

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = inventoryTabName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A2:B`,
  });

  const rows = res.data.values;
  if (!rows?.length) return new Map();

  const map = new Map<string, number>();
  for (const row of rows) {
    const letter = String(row[0] ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 1);
    const qty = Number(row[1]);
    if (letter >= "A" && letter <= "Z" && Number.isFinite(qty) && qty >= 0) {
      map.set(letter, qty);
    }
  }
  return map;
}
