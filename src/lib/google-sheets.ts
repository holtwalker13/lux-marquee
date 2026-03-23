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

/** Row 1 headers for SubmitRequests — must match column order in `append-submission-sheet.ts`. */
export const SUBMIT_REQUESTS_HEADERS = [
  "Submitted at (UTC)",
  "Submission ID",
  "Pipeline status",
  "Contact name",
  "Email",
  "Phone",
  "Event type",
  "Event date",
  "Event time (local)",
  "Event start (UTC)",
  "Event address",
  "Lettering",
  "Estimated total",
  "Setup",
  "Outside radius",
  "Distance (mi)",
  "Proposed total",
  "Client Venmo",
] as const;

let submitRequestsHeaderEnsured = false;

/** Ensures row 1 is a header row before appends (empty sheet, or data mistakenly started on row 1). */
export async function ensureSubmitRequestsHeaderRow(): Promise<void> {
  if (submitRequestsHeaderEnsured) return;

  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!spreadsheetId || !auth) return;

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = pendingTabName();

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const tabMeta = spreadsheet.data.sheets?.find((s) => s.properties?.title === tab);
  const sheetId = tabMeta?.properties?.sheetId;
  if (sheetId == null) {
    console.warn(`[sheets] tab "${tab}" not found — skip header row`);
    submitRequestsHeaderEnsured = true;
    return;
  }

  const lastCol = String.fromCharCode(64 + SUBMIT_REQUESTS_HEADERS.length);
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:${lastCol}1`,
  });
  const firstCell = headerRes.data.values?.[0]?.[0];
  const firstStr = firstCell != null ? String(firstCell) : "";

  if (firstStr === SUBMIT_REQUESTS_HEADERS[0]) {
    submitRequestsHeaderEnsured = true;
    return;
  }

  const looksLikeDataRow = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(firstStr);

  if (firstStr !== "" && !looksLikeDataRow) {
    console.warn(
      `[sheets] "${tab}" row 1 is not empty and not our header — leaving as-is (custom layout?)`,
    );
    submitRequestsHeaderEnsured = true;
    return;
  }

  if (looksLikeDataRow) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: 0,
                endIndex: 1,
              },
              inheritFromBefore: false,
            },
          },
        ],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1:${lastCol}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[...SUBMIT_REQUESTS_HEADERS]] },
  });

  submitRequestsHeaderEnsured = true;
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
  await ensureSubmitRequestsHeaderRow();
  const range = `${pendingTabName()}!A1`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Append many rows in one request (e.g. seeding dummy rows). */
export async function appendPendingSubmissionRows(
  rows: (string | number | boolean)[][],
): Promise<void> {
  if (rows.length === 0) return;
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) return;

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  await ensureSubmitRequestsHeaderRow();
  const range = `${pendingTabName()}!A1`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
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
