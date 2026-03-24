/**
 * Writes Prices tab (header + default glyph rows if empty) and LetterReservations row 1 headers.
 * Run: npm run sheets:populate
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { ensurePricesSheetSeeded, ensureLetterReservationsHeaderRow, isGoogleSheetsConfigured } =
    await import("../src/lib/google-sheets");
  const { getDefaultPriceGlyphRows } = await import("../src/lib/default-price-glyphs");

  if (!isGoogleSheetsConfigured()) {
    console.error("Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in .env");
    process.exit(1);
  }

  await ensurePricesSheetSeeded(getDefaultPriceGlyphRows());
  console.log("OK: Prices tab — header set; default rows added if the tab had no data below row 1.");

  await ensureLetterReservationsHeaderRow();
  console.log("OK: LetterReservations tab — row 1 headers set. (Data rows appear when you confirm bookings.)");

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
