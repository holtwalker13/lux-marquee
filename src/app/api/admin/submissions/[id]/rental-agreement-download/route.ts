import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import { buildStandaloneAgreementHtml } from "@/lib/rental-agreement-html";
import {
  buildRentalAgreementSnapshot,
  getRentalAgreementSignature,
} from "@/lib/rental-agreement-metadata";
import { findSubmissionById } from "@/lib/submissions-sheets-store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const sub = await findSubmissionById(id);
  if (!sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const signed = getRentalAgreementSignature(sub.metadata);
  const snap = signed?.snapshot ?? buildRentalAgreementSnapshot(sub);
  const html = buildStandaloneAgreementHtml({
    snap,
    signature: signed,
    title: "Lux Marquee — Rental agreement",
  });

  const stamp = signed?.signedAtUtc.slice(0, 10) ?? "draft";
  const filename = `lux-marquee-rental-agreement-${id.slice(0, 8)}-${stamp}.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
