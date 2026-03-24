import { NextResponse } from "next/server";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";
import { requireAdminSession } from "@/lib/admin-request";
import { listSubmissionsApiJson } from "@/lib/submissions-sheets-store";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets is not configured.", submissions: [] },
      { status: 503 },
    );
  }

  try {
    const submissions = await listSubmissionsApiJson();
    return NextResponse.json({ submissions });
  } catch (e) {
    console.error("[admin/submissions GET]", e);
    const body: {
      error: string;
      submissions: never[];
      details?: string;
    } = { error: "Failed to load submissions", submissions: [] };
    if (process.env.NODE_ENV !== "production") {
      body.details = e instanceof Error ? e.message : String(e);
    }
    return NextResponse.json(body, { status: 500 });
  }
}
