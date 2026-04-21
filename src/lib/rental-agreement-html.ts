import type { RentalAgreementSignatureV1, RentalAgreementSnapshotV1 } from "@/lib/rental-agreement-metadata";
import { snapshotFeeLabel } from "@/lib/rental-agreement-metadata";
import { formatUsd } from "@/lib/pricing";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDisplayDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Inline SVGs (currentColor) — work in app + downloaded HTML. */
const ICON_CALENDAR = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg></span>`;

const ICON_SPARKLES = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 10.09 8.81a2 2 0 0 1-1.28 1.28L3 12l5.81 1.91a2 2 0 0 1 1.28 1.28L12 21l1.91-5.81a2 2 0 0 1 1.28-1.28L21 12l-5.81-1.91a2 2 0 0 1-1.28-1.28L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg></span>`;

const ICON_BANKNOTE = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg></span>`;

const ICON_FILE = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg></span>`;

const ICON_BOOK_OPEN = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></span>`;

const ICON_PEN = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19h7"/><path d="M18 2 4 16l-2 6 6-2L22 6l-4-4Z"/><path d="m9 15 3 3"/></svg></span>`;

function sectionHead(iconHtml: string, title: string): string {
  return `<div class="agreement-doc__section-head">${iconHtml}<h2>${escapeHtml(title)}</h2></div>`;
}

/** Shared CSS for agreement body (app + standalone download). */
export const AGREEMENT_DOC_CSS = `
.agreement-doc { color: var(--agreement-text, #3d2f2f); line-height: 1.55; font-size: 0.95rem; }
.agreement-doc__title {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.35rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 0.75rem;
  color: var(--agreement-heading, #3d2f2f);
}
.agreement-doc__lead { margin: 0 0 0.5rem; max-width: 42rem; }
.agreement-doc__lead + .agreement-doc__lead { margin-top: 0.85rem; }
.agreement-doc__section {
  margin-top: 1.35rem; padding-top: 1.35rem;
  border-top: 1px solid var(--agreement-border, rgba(245, 212, 208, 0.9));
}
.agreement-doc__section:first-of-type { margin-top: 1rem; padding-top: 0; border-top: none; }
.agreement-doc__section-head {
  display: flex; align-items: center; gap: 0.65rem; margin: 0 0 0.85rem;
}
.agreement-doc__section-head h2 {
  margin: 0; font-size: 1.05rem; font-weight: 700;
  color: var(--agreement-heading, #3d2f2f);
}
.agreement-doc__icon-wrap { display: flex; flex-shrink: 0; color: var(--agreement-accent, #e07a6e); }
.agreement-doc__icon { display: block; }
.agreement-doc__list { list-style: none; margin: 0; padding: 0; }
.agreement-doc__list li { margin: 0.5rem 0; padding: 0; line-height: 1.5; }
.agreement-doc__list li:first-child { margin-top: 0; }
.agreement-doc__list li:last-child { margin-bottom: 0; }
.agreement-doc__p { margin: 0.65rem 0 0; max-width: 42rem; }
.agreement-doc__p:first-of-type { margin-top: 0; }
.agreement-doc__p--tight { margin-top: 0.45rem; }
.agreement-doc__p--spaced { margin-top: 1rem; }
.agreement-doc__signed { margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--agreement-border, rgba(245, 212, 208, 0.9)); }
`.trim();

/** Core rental terms (replace with counsel-reviewed text when ready). */
export function buildRentalAgreementBodyHtml(
  snap: RentalAgreementSnapshotV1,
  signature: Pick<RentalAgreementSignatureV1, "typedFullName" | "signedAtUtc"> | null,
): string {
  const feeLine = snapshotFeeLabel(snap);
  const signedBlock = signature
    ? `<div class="agreement-doc__signed"><p class="agreement-doc__p"><strong>Signed electronically</strong> on ${escapeHtml(
        new Date(signature.signedAtUtc).toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "UTC",
        }),
      )} UTC as <em>${escapeHtml(signature.typedFullName)}</em>.</p></div>`
    : "";

  const feeExpl = snap.totalFeeIsQuote
    ? "This amount reflects the written quote for this configuration."
    : "This amount reflects the estimate at the time of signing; Owner will confirm or update pricing before final payment.";

  const notesSection = snap.notes
    ? `<section class="agreement-doc__section">${sectionHead(ICON_FILE, "Special notes")}<p class="agreement-doc__p">${escapeHtml(snap.notes)}</p></section>`
    : "";

  return `<div class="agreement-doc">
<h1 class="agreement-doc__title">Marquee rental agreement</h1>
<p class="agreement-doc__lead">This Rental Agreement (&ldquo;Agreement&rdquo;) is between <strong>Lux Marquee</strong> (&ldquo;Owner&rdquo;) and
<strong>${escapeHtml(snap.contactName)}</strong> (&ldquo;Renter&rdquo;), email ${escapeHtml(snap.contactEmail)}.</p>

<section class="agreement-doc__section">
${sectionHead(ICON_CALENDAR, "Event")}
<ul class="agreement-doc__list">
  <li><strong>Event type:</strong> ${escapeHtml(snap.eventTypeLabel)}</li>
  <li><strong>Date:</strong> ${escapeHtml(formatDisplayDate(snap.eventDateIso))}</li>
  <li><strong>Arrival / display time (local):</strong> ${escapeHtml(snap.eventTimeLocal)}</li>
  <li><strong>Location:</strong> ${escapeHtml(snap.addressSummary)}</li>
  <li><strong>Setup:</strong> ${escapeHtml(snap.setupLabel)}</li>
</ul>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_SPARKLES, "Rental items")}
<p class="agreement-doc__p">Renter is renting the illuminated letter display described as: <strong>${escapeHtml(
    snap.lettering,
  )}</strong>.</p>
<p class="agreement-doc__p agreement-doc__p--tight">Rental is subject to inventory availability and to safe installation conditions at the venue.</p>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_BANKNOTE, "Fees")}
<p class="agreement-doc__p">Total rental fee for this booking: <strong>${escapeHtml(feeLine)}</strong>.</p>
<p class="agreement-doc__p agreement-doc__p--tight">${escapeHtml(feeExpl)}</p>
<p class="agreement-doc__p agreement-doc__p--tight">Deposit and balance terms follow separate communications and invoices.</p>
</section>

${notesSection}

<section class="agreement-doc__section">
${sectionHead(ICON_BOOK_OPEN, "General terms")}
<p class="agreement-doc__p">Renter will provide reasonable access and a safe area for delivery, setup, and pickup.</p>
<p class="agreement-doc__p">Renter is responsible for venue permissions and any location fees.</p>
<p class="agreement-doc__p">Owner may refuse service if conditions are unsafe or materially different from what was disclosed.</p>
<p class="agreement-doc__p">Cancellation and weather policies communicated by Owner apply.</p>
<p class="agreement-doc__p agreement-doc__p--spaced">This Agreement is governed by the laws applicable where Owner operates.</p>
<p class="agreement-doc__p">If any part of this Agreement is unenforceable, the remainder stays in effect.</p>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_PEN, "Electronic signature")}
<p class="agreement-doc__p">By typing your full legal name below and submitting this form, you agree that your typed name has the same legal effect as a handwritten signature for purposes of validity, enforceability, and admissibility.</p>
<p class="agreement-doc__p agreement-doc__p--tight">That includes, where applicable, the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and similar state laws (for example UETA).</p>
<p class="agreement-doc__p agreement-doc__p--spaced">You consent to conduct this transaction electronically. You confirm that you may access and retain a copy of this Agreement.</p>
</section>
${signedBlock}
</div>`.trim();
}

export function buildStandaloneAgreementHtml(params: {
  snap: RentalAgreementSnapshotV1;
  signature: RentalAgreementSignatureV1 | null;
  title?: string;
}): string {
  const { snap, signature, title = "Lux Marquee — Rental agreement" } = params;
  const body = buildRentalAgreementBodyHtml(
    snap,
    signature
      ? { typedFullName: signature.typedFullName, signedAtUtc: signature.signedAtUtc }
      : null,
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --agreement-text: #2f2525;
    --agreement-heading: #3d2f2f;
    --agreement-border: rgba(200, 160, 155, 0.55);
    --agreement-accent: #c45c52;
  }
  body { font-family: Georgia, "Times New Roman", serif; max-width: 40rem; margin: 2rem auto; padding: 0 1.25rem;
    color: var(--agreement-text); line-height: 1.5; }
  ${AGREEMENT_DOC_CSS}
  @media print { body { margin: 0; max-width: none; } .agreement-doc__section { break-inside: avoid; } }
</style>
</head>
<body>
${body}
${
  signature
    ? `<hr style="margin:2rem 0;border:none;border-top:1px solid #ccc"/>
       <p style="font-size:0.9rem;color:#555"><strong>Record:</strong> Typed name ${escapeHtml(
         signature.typedFullName,
       )} · Total recorded: ${escapeHtml(formatUsd(signature.snapshot.totalFeeCents))}</p>`
    : ""
}
</body>
</html>`;
}
