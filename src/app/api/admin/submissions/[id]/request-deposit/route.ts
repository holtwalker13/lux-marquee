import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import {
  buildVenmoDepositUrl,
  depositAmountDollars,
} from "@/lib/venmo-deposit";
import { isPayByCheckVenmoHandle } from "@/lib/payment-preference";
import {
  findSubmissionById,
  sheetSubmissionToApiJson,
  updateSubmission,
} from "@/lib/submissions-sheets-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const sub = await findSubmissionById(id);
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

  const payByCheck = isPayByCheckVenmoHandle(handle);

  if (
    sub.pipelineStatus === "booked" ||
    sub.pipelineStatus === "cancelled" ||
    sub.pipelineStatus === "deposit_paid"
  ) {
    return NextResponse.json(
      { error: "Deposit request is only for new or awaiting-deposit jobs." },
      { status: 400 },
    );
  }

  const note = `Marquee deposit (${sub.letteringRaw.slice(0, 80)})`;
  const venmoUrl = payByCheck ? null : buildVenmoDepositUrl(handle, note);

  const updated = await updateSubmission(id, (p) => ({
    ...p,
    pipelineStatus: "deposit_requested",
    depositRequestedAt: new Date(),
  }));

  if (!updated) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    submission: sheetSubmissionToApiJson(updated),
    venmoUrl,
    payByCheck,
    depositAmountDollars: depositAmountDollars(),
  });
}
