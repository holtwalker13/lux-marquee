import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-request";
import { buildVenmoDepositUrl, depositAmountDollars } from "@/lib/venmo-deposit";

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

  const handle = sub.venmoHandle?.trim();
  if (!handle) {
    return NextResponse.json(
      { error: "Save a Venmo @handle on this request first." },
      { status: 400 },
    );
  }

  if (sub.pipelineStatus === "booked" || sub.pipelineStatus === "cancelled") {
    return NextResponse.json({ error: "Invalid state for deposit request." }, { status: 400 });
  }

  const note = `Marquee deposit (${sub.letteringRaw.slice(0, 80)})`;
  const venmoUrl = buildVenmoDepositUrl(handle, note);

  const updated = await prisma.contactSubmission.update({
    where: { id },
    data: {
      pipelineStatus: "deposit_requested",
      depositRequestedAt: new Date(),
    },
  });

  return NextResponse.json({
    submission: updated,
    venmoUrl,
    depositAmountDollars: depositAmountDollars(),
  });
}
