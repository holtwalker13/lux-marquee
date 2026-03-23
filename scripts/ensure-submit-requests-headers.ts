/**
 * Writes row 1 headers on the SubmitRequests tab (if empty or data started on row 1).
 * Run: npm run sheets:headers
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { ensureSubmitRequestsHeaderRow, isGoogleSheetsConfigured } = await import(
    "../src/lib/google-sheets"
  );

  if (!isGoogleSheetsConfigured()) {
    console.error("Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in .env");
    process.exit(1);
  }

  await ensureSubmitRequestsHeaderRow();
  console.log("OK: SubmitRequests header row checked/updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
