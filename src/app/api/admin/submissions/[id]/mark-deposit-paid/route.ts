import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-request";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const sub = await prisma.contactSubmission.findUnique({ where: { id } });
  if (!sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (sub.pipelineStatus !== "deposit_requested") {
    return NextResponse.json(
      { error: "Mark deposit paid only after a deposit has been requested." },
      { status: 400 },
    );
  }

  const updated = await prisma.contactSubmission.update({
    where: { id },
    data: {
      pipelineStatus: "deposit_paid",
      depositPaidAt: new Date(),
    },
  });

  return NextResponse.json({ submission: updated });
}
