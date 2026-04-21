/**
 * Writes mock A–Z inventory to the Google Sheet "Inventory" tab (header + 26 rows).
 * Run: npm run seed:inventory-sheet
 */
import { config } from "dotenv";
import { google } from "googleapis";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

const LETTER_STOCK: [string, number][] = [
  ["A", 8],
  ["B", 3],
  ["C", 4],
  ["D", 4],
  ["E", 12],
  ["F", 3],
  ["G", 3],
  ["H", 5],
  ["I", 7],
  ["J", 1],
  ["K", 2],
  ["L", 6],
  ["M", 4],
  ["N", 7],
  ["O", 10],
  ["P", 3],
  ["Q", 1],
  ["R", 7],
  ["S", 6],
  ["T", 8],
  ["U", 4],
  ["V", 2],
  ["W", 3],
  ["X", 1],
  ["Y", 3],
  ["Z", 1],
  ["&", 2],
  ["THE", 2],
];

function tabName(): string {
  return process.env.GOOGLE_SHEET_INVENTORY_TAB?.trim() || "Inventory";
}

async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!sheetId || !email || !rawKey) {
    console.error("Missing GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, or GOOGLE_PRIVATE_KEY");
    process.exit(1);
  }

  const key = rawKey.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  await auth.authorize();

  const values: (string | number)[][] = [
    ["letter", "total_quantity"],
    ...LETTER_STOCK.map(([l, q]) => [l, q]),
  ];

  const sheets = google.sheets({ version: "v4", auth });
  const range = `${tabName()}!A1:B${values.length}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  console.log(`OK: Wrote ${values.length - 1} letters + header to "${tabName()}" (${range}).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
