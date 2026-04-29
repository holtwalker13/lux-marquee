import { Resend } from "resend";
import type { RentalAgreementSignatureV1 } from "@/lib/rental-agreement-metadata";
import { buildRentalAgreementPdfBuffer } from "@/lib/rental-agreement-pdf";

export async function sendSignedRentalAgreementEmails(params: {
  clientEmail: string;
  clientName: string;
  signature: RentalAgreementSignatureV1;
  /** Same-origin URL to download the signed PDF while the signing token remains valid. */
  signedPdfDownloadUrl?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const owner = process.env.BUSINESS_OWNER_EMAIL?.trim();
  if (!key || !from || !owner) {
    return {
      sent: false,
      reason:
        "Email not configured. Add RESEND_API_KEY, RESEND_FROM_EMAIL, and BUSINESS_OWNER_EMAIL to send copies automatically.",
    };
  }

  const pdfBuffer = await buildRentalAgreementPdfBuffer({
    snap: params.signature.snapshot,
    signature: params.signature,
    title: "Signed rental agreement — Lux Marquee",
  });
  const filename = `lux-marquee-rental-agreement-${params.signature.signedAtUtc.slice(0, 10)}.pdf`;
  const attachment = {
    filename,
    content: pdfBuffer.toString("base64"),
  };

  const linkText = params.signedPdfDownloadUrl
    ? `\n\nDownload your signed PDF (same link as when you signed, while it stays valid):\n${params.signedPdfDownloadUrl}\n`
    : "";

  const linkHtml = params.signedPdfDownloadUrl
    ? `<p>Download your signed PDF anytime while your signing link is valid: <a href="${escapeAttr(
        params.signedPdfDownloadUrl,
      )}">open signed agreement (PDF)</a></p>`
    : "";

  const resend = new Resend(key);
  const subject = "Signed copy — Lux Marquee rental agreement";
  const text = `Hi ${params.clientName},\n\nAttached is a PDF copy of the rental agreement you signed electronically.${linkText}\n— Lux Marquee`;

  const [toClient, toOwner] = await Promise.all([
    resend.emails.send({
      from,
      to: params.clientEmail,
      subject,
      text,
      html: `<p>Hi ${escapeEmailHtml(params.clientName)},</p><p>Attached is a <strong>PDF</strong> copy of the rental agreement you signed electronically.</p>${linkHtml}<p>— Lux Marquee</p>`,
      attachments: [attachment],
    }),
    resend.emails.send({
      from,
      to: owner,
      subject: `Signed rental agreement — ${params.clientEmail}`,
      text: `Client ${params.clientName} (${params.clientEmail}) signed the rental agreement.${linkText}`,
      html: `<p>Client <strong>${escapeEmailHtml(params.clientName)}</strong> (${escapeEmailHtml(
        params.clientEmail,
      )}) signed the rental agreement.</p>${linkHtml}`,
      attachments: [attachment],
    }),
  ]);

  if (toClient.error || toOwner.error) {
    return {
      sent: false,
      reason: [toClient.error?.message, toOwner.error?.message].filter(Boolean).join(" "),
    };
  }
  return { sent: true };
}

function escapeEmailHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
