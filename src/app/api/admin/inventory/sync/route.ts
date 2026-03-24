import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import { fetchLetterInventoryFromSheet, isGoogleSheetsConfigured } from "@/lib/google-sheets";

/**
 * Inventory is always read live from the Google Sheet. This endpoint only
 * verifies the tab is readable (optional admin “ping”).
 */
export async function POST() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets is not configured." },
      { status: 400 },
    );
  }

  const map = await fetchLetterInventoryFromSheet();
  if (!map || map.size === 0) {
    return NextResponse.json(
      { error: "No rows read from the Inventory tab (expect letter, qty in columns A–B from row 2)." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    count: map.size,
    message: "Inventory is read directly from the Inventory tab on each request.",
  });
}
