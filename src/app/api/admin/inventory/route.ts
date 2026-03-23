import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-request";
import { loadLetterInventoryTotals } from "@/lib/inventory-provider";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const totals = await loadLetterInventoryTotals(prisma);
  const letters = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, totalQuantity]) => ({ letter, totalQuantity }));

  return NextResponse.json({
    letters,
    source: isGoogleSheetsConfigured() ? "google_sheet_or_fallback" : "database",
  });
}
