import { NextResponse } from "next/server";
import { verifyRentalAgreementJwt } from "@/lib/agreement-sign-token";
import { buildRentalAgreementPdfBuffer } from "@/lib/rental-agreement-pdf";
import { getRentalAgreementSignature } from "@/lib/rental-agreement-metadata";
import { findSubmissionById } from "@/lib/submissions-sheets-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return NextResponse.json({ error: "Missing token." }, { status: 400 });
    }

    const submissionId = await verifyRentalAgreementJwt(token);
    if (!submissionId) {
      return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 });
    }

    const sub = await findSubmissionById(submissionId);
    if (!sub) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const signed = getRentalAgreementSignature(sub.metadata);
    if (!signed) {
      return NextResponse.json(
        { error: "This agreement has not been signed yet." },
        { status: 409 },
      );
    }

    const pdf = await buildRentalAgreementPdfBuffer({
      snap: signed.snapshot,
      signature: signed,
      title: "Lux Marquee — Signed rental agreement",
    });
    if (!pdf || pdf.length === 0) {
      throw new Error("PDF buffer is empty.");
    }

    const filename = `lux-marquee-rental-agreement-signed-${signed.signedAtUtc.slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[rental-agreement/download] failed", error);
    return NextResponse.json({ error: "Could not render PDF copy." }, { status: 500 });
  }
}
