import { NextResponse } from "next/server";
import { verifyRentalAgreementJwt } from "@/lib/agreement-sign-token";
import { buildStandaloneAgreementHtml } from "@/lib/rental-agreement-html";
import { getRentalAgreementSignature } from "@/lib/rental-agreement-metadata";
import { findSubmissionById } from "@/lib/submissions-sheets-store";

export async function GET(req: Request) {
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

  const html = buildStandaloneAgreementHtml({
    snap: signed.snapshot,
    signature: signed,
    title: "Lux Marquee — Signed rental agreement",
  });

  const filename = `lux-marquee-rental-agreement-signed-${signed.signedAtUtc.slice(0, 10)}.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
