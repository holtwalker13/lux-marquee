import type { RentalAgreementSignatureV1, RentalAgreementSnapshotV1 } from "@/lib/rental-agreement-metadata";
import { snapshotFeeLabel } from "@/lib/rental-agreement-metadata";
import { formatUsd } from "@/lib/pricing";

const LESSOR_LEGAL_NAME = "Lux Marquee Rentals, LLC";
const LESSOR_EMAIL = "luxmarqueerentals@yahoo.com";
const LESSOR_SHORT = "Lux Marquee Rentals, LLC";

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

function addOneCalendarDayIso(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatTime12h(hm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return hm.trim();
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return hm.trim();
  h = Math.min(23, Math.max(0, h));
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minStr = min === 0 ? "" : `:${String(min).padStart(2, "0")}`;
  return `${hour12}${minStr} ${ampm}`;
}

function marqueeQuantity(snap: RentalAgreementSnapshotV1): number {
  return snap.lettering.replace(/\s+/g, "").length || 0;
}

/** Inline SVGs (currentColor) — work in app + downloaded HTML. */
const ICON_CALENDAR = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg></span>`;

const ICON_SPARKLES = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 10.09 8.81a2 2 0 0 1-1.28 1.28L3 12l5.81 1.91a2 2 0 0 1 1.28 1.28L12 21l1.91-5.81a2 2 0 0 1 1.28-1.28L21 12l-5.81-1.91a2 2 0 0 1-1.28-1.28L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg></span>`;

const ICON_BANKNOTE = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg></span>`;

const ICON_TRUCK = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span>`;

const ICON_SHIELD = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 6a1 1 0 0 1 1 1z"/></svg></span>`;

const ICON_FILE = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg></span>`;

const ICON_BOOK_OPEN = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></span>`;

const ICON_PEN = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19h7"/><path d="M18 2 4 16l-2 6 6-2L22 6l-4-4Z"/><path d="m9 15 3 3"/></svg></span>`;

const ICON_CLOUD = `<span class="agreement-doc__icon-wrap" aria-hidden="true"><svg class="agreement-doc__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></span>`;

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
.agreement-doc__subtitle { margin: 0 0 0.35rem; font-size: 0.95rem; color: var(--agreement-heading, #3d2f2f); }
.agreement-doc__meta { margin: 0 0 1rem; font-size: 0.9rem; color: var(--agreement-text, #3d2f2f); }
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

export function buildRentalAgreementBodyHtml(
  snap: RentalAgreementSnapshotV1,
  signature: Pick<RentalAgreementSignatureV1, "typedFullName" | "signedAtUtc"> | null,
): string {
  const feeLine = snapshotFeeLabel(snap);
  const qty = marqueeQuantity(snap);
  const endDateIso = addOneCalendarDayIso(snap.eventDateIso);
  const signedBlock = signature
    ? `<div class="agreement-doc__signed"><p class="agreement-doc__p"><strong>Signed electronically</strong> on ${escapeHtml(
        new Date(signature.signedAtUtc).toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "UTC",
        }),
      )} UTC as <em>${escapeHtml(signature.typedFullName)}</em>.</p></div>`
    : "";

  const notesSection = snap.notes
    ? `<section class="agreement-doc__section">${sectionHead(ICON_FILE, "Special notes (booking)")}<p class="agreement-doc__p">${escapeHtml(snap.notes)}</p></section>`
    : "";

  const setupIncluded = snap.addressSummary.trim().toUpperCase() !== "LOCAL PICKUP";

  return `<div class="agreement-doc">
<h1 class="agreement-doc__title">Rental Agreement</h1>
<p class="agreement-doc__subtitle"><strong>${escapeHtml(LESSOR_LEGAL_NAME)}</strong></p>
<p class="agreement-doc__meta"><a href="mailto:${escapeHtml(LESSOR_EMAIL)}">${escapeHtml(LESSOR_EMAIL)}</a></p>

<p class="agreement-doc__lead">This Rental Agreement is entered into on <strong>${escapeHtml(
    formatDisplayDate(snap.eventDateIso),
  )}</strong> by and between ${escapeHtml(LESSOR_LEGAL_NAME)} (&ldquo;Lessor&rdquo;) and
<strong>${escapeHtml(snap.contactName)}</strong> (&ldquo;Lessee&rdquo;), at email ${escapeHtml(snap.contactEmail)}.</p>

<section class="agreement-doc__section">
${sectionHead(ICON_SPARKLES, "1. Rental items")}
<p class="agreement-doc__p">Lessor agrees to rent the following marquee items to Lessee:</p>
<ul class="agreement-doc__list">
  <li><strong>Description:</strong> ${escapeHtml(snap.lettering)}</li>
  <li><strong>Quantity:</strong> ${qty} (letter / number pieces as described)</li>
  <li><strong>Condition:</strong> All items are free of damage and in working order at time of delivery.</li>
</ul>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_CALENDAR, "2. Rental period")}
<ul class="agreement-doc__list">
  <li><strong>Start date:</strong> ${escapeHtml(formatDisplayDate(snap.eventDateIso))}</li>
  <li><strong>End date (typical return window):</strong> ${escapeHtml(formatDisplayDate(endDateIso))} — exact pickup/return may be adjusted in writing with Lessor.</li>
  <li><strong>Pickup / delivery time (local):</strong> ${escapeHtml(formatDisplayDate(snap.eventDateIso))} by ${escapeHtml(formatTime12h(snap.eventTimeLocal))}</li>
  <li><strong>Return / pickup time:</strong> Coordinated with Lessor (often the following calendar day by 3:00 pm local time unless arranged otherwise).</li>
</ul>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_BANKNOTE, "3. Rental fee &amp; payment")}
<ul class="agreement-doc__list">
  <li><strong>Total rental fee:</strong> ${escapeHtml(feeLine)}. A non-refundable deposit (commonly $100 toward the calendar hold) applies as stated in your quote or booking communications.</li>
  <li><strong>Final payment due:</strong> One week prior to the event unless otherwise agreed in writing.</li>
  <li><strong>Accepted payment methods:</strong> Cash, Venmo @luxmarquee, or check (as confirmed by Lessor).</li>
</ul>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_TRUCK, "4. Delivery &amp; setup")}
<ul class="agreement-doc__list">
  <li><strong>Delivery address / venue:</strong> ${escapeHtml(snap.addressSummary)}</li>
  <li><strong>Setup included:</strong> ${setupIncluded ? "Yes (per this booking and quote)" : "Pickup / client-arranged transport — confirm details with Lessor."}</li>
  <li><strong>Setup type:</strong> ${escapeHtml(snap.setupLabel)}</li>
</ul>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_SHIELD, "5. Damage, loss, or theft")}
<p class="agreement-doc__p">Lessee is responsible for any damage, loss, or theft of marquee items during the rental period.</p>
<ul class="agreement-doc__list">
  <li><strong>Replacement cost per letter/number:</strong> $350</li>
  <li><strong>Damage assessment:</strong> Conducted upon pickup/return.</li>
  <li>Letters cannot be moved after setup by ${escapeHtml(LESSOR_SHORT)}.</li>
  <li>Balloons may be attached using hooks on the back of letters; do not use tape on the painted portion of letters.</li>
  <li>Letters must be set up and left on the ground. Letters cannot be placed above doorways or in places that could fall. ${escapeHtml(
    LESSOR_SHORT,
  )} is not liable for any injury due to letters. Letters cannot be moved once set in place by ${escapeHtml(LESSOR_SHORT)}.</li>
</ul>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_BOOK_OPEN, "6. Cancellations &amp; refunds")}
<ul class="agreement-doc__list">
  <li>Cancellations made 45 days in advance receive a full refund (excluding deposit).</li>
  <li>No refunds for same-day cancellations or no-shows.</li>
</ul>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_BOOK_OPEN, "7. Limitation of liability")}
<p class="agreement-doc__p">Lessor is not liable for injury or damage arising from use of rental items. Lessee assumes full responsibility upon possession.</p>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_BOOK_OPEN, "8. Governing law")}
<p class="agreement-doc__p">This Agreement shall be governed by the laws of the State of Missouri.</p>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_BOOK_OPEN, "9. Entire agreement")}
<p class="agreement-doc__p">This document contains the full agreement between both parties. Any changes must be made in writing and signed by both parties.</p>
</section>

<section class="agreement-doc__section">
${sectionHead(ICON_CLOUD, "10. Weather policy")}
<p class="agreement-doc__p">For safety reasons and to prevent damage to rental items:</p>
<p class="agreement-doc__p agreement-doc__p--tight">If winds exceed 20 mph, or if there is active rain or a forecasted chance of rain, ${escapeHtml(
    LESSOR_SHORT,
  )} will not set up letters or numbers outdoors.</p>
<p class="agreement-doc__p agreement-doc__p--tight">In such cases, the client may:</p>
<ul class="agreement-doc__list">
  <li>Relocate the setup to a suitable indoor venue, or</li>
  <li>Reschedule the rental for a later date, subject to availability.</li>
</ul>
<p class="agreement-doc__p agreement-doc__p--tight">${escapeHtml(
    LESSOR_SHORT,
  )} reserves the right to make the final decision regarding weather-related setup restrictions. No refunds will be issued due to weather unless otherwise agreed in writing.</p>
</section>

${notesSection}

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
