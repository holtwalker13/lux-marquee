import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
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
  const existing = await findSubmissionById(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (existing.pipelineStatus === "cancelled") {
    return NextResponse.json({ error: "This request is cancelled." }, { status: 400 });
  }

  if (existing.pipelineStatus === "deposit_paid" || existing.pipelineStatus === "booked") {
    const latest = await findSubmissionById(id);
    if (!latest) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ submission: sheetSubmissionToApiJson(latest) });
  }

  const updated = await updateSubmission(id, (p) => ({
    ...p,
    pipelineStatus: "deposit_paid",
    depositPaidAt: p.depositPaidAt ?? new Date(),
  }));

  if (!updated) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ submission: sheetSubmissionToApiJson(updated) });
}
