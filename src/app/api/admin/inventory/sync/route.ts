import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-request";
import { fetchLetterInventoryFromSheet, isGoogleSheetsConfigured } from "@/lib/google-sheets";

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

  for (const [letter, totalQuantity] of map.entries()) {
    await prisma.letterInventory.upsert({
      where: { letter },
      create: { letter, totalQuantity },
      update: { totalQuantity },
    });
  }

  return NextResponse.json({ ok: true, count: map.size });
}
