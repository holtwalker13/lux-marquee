import {
  fetchLetterInventoryFromSheet,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets";

export async function loadLetterInventoryTotals(): Promise<Map<string, number>> {
  if (!isGoogleSheetsConfigured()) {
    throw new Error(
      "Google Sheets is not configured (GOOGLE_SHEET_ID, service account, private key).",
    );
  }
  const fromSheet = await fetchLetterInventoryFromSheet();
  if (!fromSheet || fromSheet.size === 0) {
    throw new Error(
      "No letter inventory rows in the Inventory tab (columns A–B from row 2).",
    );
  }
  return fromSheet;
}
