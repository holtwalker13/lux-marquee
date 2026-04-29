import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-request";
import { buildRentalAgreementPdfBuffer } from "@/lib/rental-agreement-pdf";
import {
  buildRentalAgreementSnapshot,
  getRentalAgreementSignature,
} from "@/lib/rental-agreement-metadata";
import { findSubmissionById } from "@/lib/submissions-sheets-store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
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
    const pdf = await buildRentalAgreementPdfBuffer({
      snap,
      signature: signed,
      title: "Lux Marquee — Rental agreement",
    });
    if (!pdf || pdf.length === 0) {
      throw new Error("PDF buffer is empty.");
    }

    const stamp = signed?.signedAtUtc.slice(0, 10) ?? "draft";
    const filename = `lux-marquee-rental-agreement-${id.slice(0, 8)}-${stamp}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin/rental-agreement-download] failed", error);
    return NextResponse.json({ error: "Could not render PDF copy." }, { status: 500 });
  }
}
