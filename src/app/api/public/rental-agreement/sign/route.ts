import { NextResponse } from "next/server";
import { verifyRentalAgreementJwt } from "@/lib/agreement-sign-token";
import {
  buildRentalAgreementSnapshot,
  getRentalAgreementSignature,
  mergeRentalAgreementIntoMetadata,
  namesMatchForSignature,
  type RentalAgreementSignatureV1,
} from "@/lib/rental-agreement-metadata";
import { sendSignedRentalAgreementEmails } from "@/lib/send-rental-agreement-email";
import { findSubmissionById, updateSubmission } from "@/lib/submissions-sheets-store";
import { isGoogleSheetsConfigured } from "@/lib/google-sheets";

type Body = {
  token?: string;
  typedFullName?: string;
  agreedToElectronicSignature?: boolean;
};

export async function POST(req: Request) {
  if (!isGoogleSheetsConfigured()) {
    return NextResponse.json(
      { error: "Signing is temporarily unavailable." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const typedFullName = String(body.typedFullName ?? "").trim();
  const agreed = Boolean(body.agreedToElectronicSignature);

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }
  if (!typedFullName || typedFullName.length < 2) {
    return NextResponse.json({ error: "Enter your full legal name." }, { status: 400 });
  }
  if (!agreed) {
    return NextResponse.json(
      { error: "Confirm that you agree to sign electronically." },
      { status: 400 },
    );
  }

  const submissionId = await verifyRentalAgreementJwt(token);
  if (!submissionId) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 });
  }

  const sub = await findSubmissionById(submissionId);
  if (!sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const existing = getRentalAgreementSignature(sub.metadata);
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadySigned: true,
      signedAtUtc: existing.signedAtUtc,
    });
  }

  if (!namesMatchForSignature(typedFullName, sub.contactName)) {
    return NextResponse.json(
      {
        error:
          "The name you typed does not match the customer name on this request. Type your full name exactly as it appears on your booking.",
      },
      { status: 422 },
    );
  }

  const snapshot = buildRentalAgreementSnapshot(sub);
  const signedAtUtc = new Date().toISOString();
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const clientIp = fwd || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const record: RentalAgreementSignatureV1 = {
    typedFullName,
    signedAtUtc,
    clientIp,
    userAgent,
    snapshot,
  };

  const updated = await updateSubmission(sub.id, (prev) => ({
    ...prev,
    metadata: mergeRentalAgreementIntoMetadata(prev.metadata, record),
  }));

  if (!updated) {
    return NextResponse.json({ error: "Could not save signature." }, { status: 500 });
  }

  const emailResult = await sendSignedRentalAgreementEmails({
    clientEmail: sub.contactEmail,
    clientName: sub.contactName,
    signature: record,
  });

  return NextResponse.json({
    ok: true,
    alreadySigned: false,
    signedAtUtc,
    emailSent: emailResult.sent,
    emailNote: emailResult.reason,
  });
}
