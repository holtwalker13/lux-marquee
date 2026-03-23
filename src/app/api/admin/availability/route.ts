import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseEventStartUtc } from "@/lib/event-datetime";
import { normalizeLettering } from "@/lib/pricing";
import { checkLetterAvailability } from "@/lib/reservations";
import { loadLetterInventoryTotals } from "@/lib/inventory-provider";
import { requireAdminSession } from "@/lib/admin-request";

export async function GET(req: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const phrase = searchParams.get("phrase") ?? "";
  const date = searchParams.get("date") ?? "";
  const time = searchParams.get("time") ?? "12:00";

  const normalized = normalizeLettering(phrase);
  if (!normalized.length) {
    return NextResponse.json(
      { error: "Provide phrase= with lettering to check." },
      { status: 400 },
    );
  }

  const parsed = parseEventStartUtc(date, time);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  const inventory = await loadLetterInventoryTotals(prisma);
  const result = await checkLetterAvailability(
    prisma,
    normalized,
    parsed.utc,
    inventory,
  );

  if (result.ok) {
    return NextResponse.json({ ok: true, normalized });
  }
  return NextResponse.json({ ok: false, issues: result.issues, normalized });
}
