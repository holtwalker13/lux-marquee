import { NextResponse } from "next/server";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { releaseExpiredReservations } from "@/lib/reservations";

/**
 * Optional scheduled job (e.g. Netlify cron) to return letters to inventory
 * after each event's reservation window ends. Protect with CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets is not configured." }, { status: 503 });
  }

  try {
    const released = await releaseExpiredReservations();
    return NextResponse.json({ ok: true, released });
  } catch (e) {
    console.error("[cron/release-reservations]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Release failed." },
      { status: 500 },
    );
  }
}
