import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import { loadLetterInventoryTotals } from "@/lib/inventory-provider";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const totals = await loadLetterInventoryTotals();
    const letters = [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, totalQuantity]) => ({ letter, totalQuantity }));

    return NextResponse.json({
      letters,
      source: "google_sheet",
    });
  } catch (e) {
    console.error("[admin/inventory GET]", e);
    const body: {
      error: string;
      letters: never[];
      source: string;
      details?: string;
    } = {
      error: e instanceof Error ? e.message : "Failed to load inventory",
      letters: [],
      source: isGoogleSheetsConfigured() ? "google_sheet" : "unconfigured",
    };
    if (process.env.NODE_ENV !== "production") {
      body.details = e instanceof Error ? e.message : String(e);
    }
    return NextResponse.json(body, { status: 500 });
  }
}
