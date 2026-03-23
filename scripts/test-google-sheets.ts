/**
 * Verifies Google Sheets credentials: read Inventory tab, append one test row to SubmitRequests.
 * Run: npm run test:sheets
 * Does not print secrets.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

function googleEnvStatus(): void {
  const keys = [
    "GOOGLE_SHEET_ID",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
  ] as const;
  for (const k of keys) {
    const v = process.env[k];
    console.error(`  ${k}: ${v && String(v).length > 0 ? "set" : "MISSING"}`);
  }
}

async function main() {
  const {
    isGoogleSheetsConfigured,
    fetchLetterInventoryFromSheet,
    appendPendingSubmissionRow,
  } = await import("../src/lib/google-sheets");

  if (!isGoogleSheetsConfigured()) {
    console.error(
      "FAIL: Google Sheets env not complete. Expected all of the following:",
    );
    googleEnvStatus();
    console.error(
      "\nIf GOOGLE_PRIVATE_KEY is multiline, use ONE line in .env in double quotes, with \\n where line breaks go, e.g.:",
    );
    console.error(
      '  GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"',
    );
    process.exit(1);
  }

  console.log("OK: Google Sheets env vars present.");

  try {
    const inv = await fetchLetterInventoryFromSheet();
    console.log(
      "OK: Read Inventory tab —",
      inv ? `${inv.size} letter row(s) parsed` : "no rows (empty tab is fine)",
    );
  } catch (e) {
    console.error(
      "FAIL: Could not read Inventory tab —",
      e instanceof Error ? e.message : e,
    );
    console.error(
      "Hint: Tab name must match GOOGLE_SHEET_INVENTORY_TAB (default Inventory). Share the sheet with the service account email as Editor.",
    );
    process.exit(2);
  }

  const testId = `TEST-${Date.now()}`;
  try {
    await appendPendingSubmissionRow([
      new Date().toISOString(),
      testId,
      "pending_request",
      "Sheets connectivity test",
      "test@example.com",
      "",
      "test",
      new Date().toISOString().slice(0, 10),
      "12:00",
      "",
      "Automated test row — safe to delete",
      "TEST",
      "$0.00",
      "indoor",
      "no",
      "",
      "",
      "",
    ]);
    console.log(
      "OK: Appended test row to SubmitRequests — id:",
      testId,
      "(you can delete that row in the sheet)",
    );
  } catch (e) {
    console.error(
      "FAIL: Could not append to SubmitRequests —",
      e instanceof Error ? e.message : e,
    );
    console.error(
      "Hint: Tab name must match GOOGLE_SHEET_PENDING_TAB (default SubmitRequests). Sheet must be shared with the service account as Editor.",
    );
    process.exit(3);
  }

  console.log("\nAll checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
