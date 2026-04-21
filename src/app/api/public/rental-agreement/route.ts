import { NextResponse } from "next/server";
import { verifyRentalAgreementJwt } from "@/lib/agreement-sign-token";
import { buildRentalAgreementBodyHtml } from "@/lib/rental-agreement-html";
import {
  buildRentalAgreementSnapshot,
  getRentalAgreementSignature,
} from "@/lib/rental-agreement-metadata";
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
  const snap = signed?.snapshot ?? buildRentalAgreementSnapshot(sub);
  const agreementBodyHtml = buildRentalAgreementBodyHtml(
    snap,
    signed
      ? { typedFullName: signed.typedFullName, signedAtUtc: signed.signedAtUtc }
      : null,
  );

  return NextResponse.json({
    submissionId: sub.id,
    contactName: sub.contactName,
    alreadySigned: Boolean(signed),
    signedAtUtc: signed?.signedAtUtc ?? null,
    agreementBodyHtml,
    totalFeeLabel: snap.totalFeeIsQuote ? "quoted total" : "estimated total",
  });
}
