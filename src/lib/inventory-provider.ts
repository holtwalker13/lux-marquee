import type { PrismaClient } from "@prisma/client";
import {
  fetchLetterInventoryFromSheet,
  isGoogleSheetsConfigured,
} from "@/lib/google-sheets";

export async function loadLetterInventoryTotals(
  prisma: PrismaClient,
): Promise<Map<string, number>> {
  if (isGoogleSheetsConfigured()) {
    try {
      const fromSheet = await fetchLetterInventoryFromSheet();
      if (fromSheet && fromSheet.size > 0) return fromSheet;
    } catch (e) {
      console.error("[inventory] Google Sheet read failed, using database.", e);
    }
  }

  const rows = await prisma.letterInventory.findMany({
    select: { letter: true, totalQuantity: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.letter, r.totalQuantity);
  return map;
}
