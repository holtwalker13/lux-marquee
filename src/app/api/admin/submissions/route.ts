import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-request";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const submissions = await prisma.contactSubmission.findMany({
      orderBy: { createdAt: "desc" },
      take: 400,
    });

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
