import { Resend } from "resend";
import type { RentalAgreementSignatureV1 } from "@/lib/rental-agreement-metadata";
import { buildStandaloneAgreementHtml } from "@/lib/rental-agreement-html";

export async function sendSignedRentalAgreementEmails(params: {
  clientEmail: string;
  clientName: string;
  signature: RentalAgreementSignatureV1;
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

  const html = buildStandaloneAgreementHtml({
    snap: params.signature.snapshot,
    signature: params.signature,
    title: "Signed rental agreement — Lux Marquee",
  });
  const filename = `lux-marquee-rental-agreement-${params.signature.signedAtUtc.slice(0, 10)}.html`;
  const attachment = {
    filename,
    content: Buffer.from(html, "utf8").toString("base64"),
  };

  const resend = new Resend(key);
  const subject = "Signed copy — Lux Marquee rental agreement";
  const text = `Hi ${params.clientName},\n\nAttached is a copy of the rental agreement you signed electronically.\n\n— Lux Marquee`;

  const [toClient, toOwner] = await Promise.all([
    resend.emails.send({
      from,
      to: params.clientEmail,
      subject,
      text,
      html: `<p>Hi ${escapeEmailHtml(params.clientName)},</p><p>Attached is a copy of the rental agreement you signed electronically.</p><p>— Lux Marquee</p>`,
      attachments: [attachment],
    }),
    resend.emails.send({
      from,
      to: owner,
      subject: `Signed rental agreement — ${params.clientEmail}`,
      text: `Client ${params.clientName} (${params.clientEmail}) signed the rental agreement.`,
      html: `<p>Client <strong>${escapeEmailHtml(params.clientName)}</strong> (${escapeEmailHtml(
        params.clientEmail,
      )}) signed the rental agreement.</p>`,
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
