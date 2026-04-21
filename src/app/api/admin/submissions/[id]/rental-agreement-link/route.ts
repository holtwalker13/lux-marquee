import { NextResponse } from "next/server";
import { signRentalAgreementJwt } from "@/lib/agreement-sign-token";
import { requireAdminSession } from "@/lib/admin-request";
import { absoluteUrl } from "@/lib/public-request-origin";
import { findSubmissionById } from "@/lib/submissions-sheets-store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const sub = await findSubmissionById(id);
  if (!sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const token = await signRentalAgreementJwt(sub.id);
  const url = absoluteUrl(req, `/sign-rental-agreement?token=${encodeURIComponent(token)}`);

  return NextResponse.json({
    url: url.toString(),
    submissionId: sub.id,
  });
}
