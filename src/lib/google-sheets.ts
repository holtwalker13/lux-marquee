import { google } from "googleapis";
import {
  SUBMIT_REQUEST_COL_COUNT,
  SUBMIT_REQUEST_HEADERS,
} from "@/lib/submission-sheet-schema";
import { isInventorySheetKey } from "@/lib/letter-inventory-tokens";

export { SUBMIT_REQUEST_HEADERS };

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

async function ensureSpreadsheetTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string,
): Promise<void> {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = spreadsheet.data.sheets?.some((s) => s.properties?.title === title);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
}

function pendingTabName(): string {
  return process.env.GOOGLE_SHEET_PENDING_TAB?.trim() || "SubmitRequests";
}

/** 0-based column index → A, B, … Z, AA, AB, … */
export function columnLetter(zeroBasedIndex: number): string {
  let dividend = zeroBasedIndex + 1;
  let name = "";
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return name;
}

const LAST_SUBMIT_COL = columnLetter(SUBMIT_REQUEST_COL_COUNT - 1);

let submitRequestsHeaderEnsured = false;

/** Ensures row 1 matches extended headers (SubmitRequests). */
export async function ensureSubmitRequestsHeaderRow(): Promise<void> {
  if (submitRequestsHeaderEnsured) return;

  const spreadsheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!spreadsheetId || !auth) return;

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = pendingTabName();

  let spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  let tabMeta = spreadsheet.data.sheets?.find((s) => s.properties?.title === tab);
  if (tabMeta?.properties?.sheetId == null) {
    await ensureSpreadsheetTab(sheets, spreadsheetId, tab);
    spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    tabMeta = spreadsheet.data.sheets?.find((s) => s.properties?.title === tab);
  }
  const sheetId = tabMeta?.properties?.sheetId;
  if (sheetId == null) {
    console.warn(`[sheets] tab "${tab}" not found — skip header row`);
    submitRequestsHeaderEnsured = true;
    return;
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:${LAST_SUBMIT_COL}1`,
  });
  const row = headerRes.data.values?.[0] ?? [];
  const firstCell = row[0] != null ? String(row[0]) : "";
  const matchesExtended =
    row.length >= SUBMIT_REQUEST_COL_COUNT &&
    String(row[SUBMIT_REQUEST_COL_COUNT - 1] ?? "") ===
      SUBMIT_REQUEST_HEADERS[SUBMIT_REQUEST_COL_COUNT - 1];

  if (firstCell === SUBMIT_REQUEST_HEADERS[0] && matchesExtended) {
    submitRequestsHeaderEnsured = true;
    return;
  }

  if (firstCell === SUBMIT_REQUEST_HEADERS[0] && !matchesExtended) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1:${LAST_SUBMIT_COL}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...SUBMIT_REQUEST_HEADERS]] },
    });
    submitRequestsHeaderEnsured = true;
    return;
  }

  const looksLikeDataRow = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(firstCell);

  if (firstStrNotEmpty(firstCell) && !looksLikeDataRow && firstCell !== SUBMIT_REQUEST_HEADERS[0]) {
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
    range: `${tab}!A1:${LAST_SUBMIT_COL}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[...SUBMIT_REQUEST_HEADERS]] },
  });

  submitRequestsHeaderEnsured = true;
}

function firstStrNotEmpty(s: string): boolean {
  return s !== "";
}

function inventoryTabName(): string {
  return process.env.GOOGLE_SHEET_INVENTORY_TAB?.trim() || "Inventory";
}

export function pricesTabName(): string {
  return process.env.GOOGLE_SHEET_PRICES_TAB?.trim() || "Prices";
}

export function reservationsTabName(): string {
  return process.env.GOOGLE_SHEET_RESERVATIONS_TAB?.trim() || "LetterReservations";
}

/** Append one row to SubmitRequests (full width). */
export async function appendPendingSubmissionRow(values: string[]): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) return;

  const padded = [...values];
  while (padded.length < SUBMIT_REQUEST_COL_COUNT) padded.push("");
  const row = padded.slice(0, SUBMIT_REQUEST_COL_COUNT);

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  await ensureSubmitRequestsHeaderRow();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${pendingTabName()}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function appendPendingSubmissionRows(rows: string[][]): Promise<void> {
  if (rows.length === 0) return;
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) return;

  const normalized = rows.map((r) => {
    const padded = [...r];
    while (padded.length < SUBMIT_REQUEST_COL_COUNT) padded.push("");
    return padded.slice(0, SUBMIT_REQUEST_COL_COUNT);
  });

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  await ensureSubmitRequestsHeaderRow();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${pendingTabName()}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: normalized },
  });
}

/** Read all SubmitRequests rows: [header row, ...data rows] (raw string[][]). */
export async function fetchSubmitRequestsGrid(): Promise<string[][]> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) throw new Error("Google Sheets is not configured.");

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  await ensureSubmitRequestsHeaderRow();
  const tab = pendingTabName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:${LAST_SUBMIT_COL}`,
  });
  return res.data.values ?? [];
}

/** 1-based sheet row index (including header = 1). */
export async function updateSubmitRequestsRow(
  rowIndex1Based: number,
  values: string[],
): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) throw new Error("Google Sheets is not configured.");

  const padded = [...values];
  while (padded.length < SUBMIT_REQUEST_COL_COUNT) padded.push("");
  const row = padded.slice(0, SUBMIT_REQUEST_COL_COUNT);

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = pendingTabName();
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!A${rowIndex1Based}:${LAST_SUBMIT_COL}${rowIndex1Based}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function fetchLetterInventoryFromSheet(): Promise<Map<string, number> | null> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) return null;

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = inventoryTabName();
  await ensureSpreadsheetTab(sheets, sheetId, tab);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A2:B`,
  });

  const rows = res.data.values;
  if (!rows?.length) return new Map();

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[0] ?? "")
      .trim()
      .toUpperCase();
    const qty = Number(row[1]);
    if (!isInventorySheetKey(key) || !Number.isFinite(qty) || qty < 0) continue;
    map.set(key, qty);
  }
  return map;
}

export const PRICES_HEADERS = ["glyph", "price_cents", "active"] as const;

export async function fetchPriceRowsFromSheet(): Promise<
  { glyph: string; priceCents: number; active: boolean }[]
> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) throw new Error("Google Sheets is not configured.");

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = pricesTabName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A2:C500`,
  });
  const rows = res.data.values ?? [];
  const out: { glyph: string; priceCents: number; active: boolean }[] = [];
  for (const row of rows) {
    const glyph = String(row[0] ?? "").trim();
    if (!glyph) continue;
    const priceCents = Number(row[1]);
    const activeStr = String(row[2] ?? "yes").trim().toLowerCase();
    const active = activeStr !== "no" && activeStr !== "false" && activeStr !== "0";
    if (!Number.isFinite(priceCents) || priceCents < 0) continue;
    out.push({ glyph, priceCents, active });
  }
  return out;
}

export async function ensurePricesSheetSeeded(
  defaultRows: { glyph: string; priceCents: number }[],
): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) throw new Error("Google Sheets is not configured.");

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = pricesTabName();
  await ensureSpreadsheetTab(sheets, sheetId, tab);

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:C1`,
  });
  const first = existing.data.values?.[0]?.[0];
  if (first !== PRICES_HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tab}!A1:C1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...PRICES_HEADERS]] },
    });
  }

  const data = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A2:C`,
  });
  if ((data.data.values?.length ?? 0) > 0) return;

  const values = defaultRows.map((r) => [r.glyph, r.priceCents, "yes"]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export const RESERVATION_HEADERS = [
  "reservation_id",
  "submission_id",
  "letter",
  "quantity_reserved",
  "window_start_utc",
  "window_end_utc",
  "status",
  "created_at",
] as const;

export type SheetReservationRow = {
  id: string;
  submissionId: string;
  letter: string;
  quantityReserved: number;
  windowStart: Date;
  windowEnd: Date;
  status: string;
};

async function ensureLetterReservationsHeaderRowFor(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tab: string,
): Promise<void> {
  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:H1`,
  });
  const h0 = headerCheck.data.values?.[0]?.[0];
  if (h0 !== RESERVATION_HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1:H1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...RESERVATION_HEADERS]] },
    });
  }
}

/** Row 1 headers on LetterReservations (standalone / CLI). */
export async function ensureLetterReservationsHeaderRow(): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) throw new Error("Google Sheets is not configured.");

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = reservationsTabName();
  await ensureSpreadsheetTab(sheets, sheetId, tab);
  await ensureLetterReservationsHeaderRowFor(sheets, sheetId, tab);
}

export async function fetchAllReservationsFromSheet(): Promise<SheetReservationRow[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) throw new Error("Google Sheets is not configured.");

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = reservationsTabName();
  await ensureSpreadsheetTab(sheets, sheetId, tab);
  await ensureLetterReservationsHeaderRowFor(sheets, sheetId, tab);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A2:H5000`,
  });
  const rows = res.data.values ?? [];
  const out: SheetReservationRow[] = [];
  for (const row of rows) {
    const id = String(row[0] ?? "").trim();
    const submissionId = String(row[1] ?? "").trim();
    const letter = String(row[2] ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 1);
    const qty = Number(row[3]);
    const ws = String(row[4] ?? "").trim();
    const we = String(row[5] ?? "").trim();
    const status = String(row[6] ?? "active").trim() || "active";
    if (!id || !submissionId || !letter) continue;
    const windowStart = new Date(ws);
    const windowEnd = new Date(we);
    if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) continue;
    if (!Number.isFinite(qty) || qty < 1) continue;
    out.push({
      id,
      submissionId,
      letter,
      quantityReserved: qty,
      windowStart,
      windowEnd,
      status,
    });
  }
  return out;
}

export async function appendReservationRows(rows: string[][]): Promise<void> {
  if (rows.length === 0) return;
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const auth = getJwtAuth();
  if (!sheetId || !auth) throw new Error("Google Sheets is not configured.");

  const sheets = google.sheets({ version: "v4", auth });
  await auth.authorize();
  const tab = reservationsTabName();
  await ensureSpreadsheetTab(sheets, sheetId, tab);
  await ensureLetterReservationsHeaderRowFor(sheets, sheetId, tab);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}
