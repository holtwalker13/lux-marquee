import type { SheetSubmission } from "@/lib/submission-sheet-schema";
import { formatUsd } from "@/lib/pricing";

export const RENTAL_AGREEMENT_V1_KEY = "rentalAgreementV1" as const;

export type RentalAgreementSnapshotV1 = {
  version: 1;
  contactName: string;
  contactEmail: string;
  eventTypeLabel: string;
  eventDateIso: string;
  eventTimeLocal: string;
  addressSummary: string;
  lettering: string;
  setupLabel: string;
  totalFeeCents: number;
  totalFeeIsQuote: boolean;
  notes: string | null;
};

export type RentalAgreementSignatureV1 = {
  typedFullName: string;
  signedAtUtc: string;
  clientIp: string | null;
  userAgent: string | null;
  snapshot: RentalAgreementSnapshotV1;
};

function parseMetadataObject(raw: string | null): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function normalizePersonName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function namesMatchForSignature(
  typed: string,
  contactNameOnFile: string,
): boolean {
  return normalizePersonName(typed) === normalizePersonName(contactNameOnFile);
}

export function buildRentalAgreementSnapshot(sub: SheetSubmission): RentalAgreementSnapshotV1 {
  const proposed = sub.proposedAmountCents != null && sub.proposedAmountCents > 0;
  const totalFeeCents = proposed ? sub.proposedAmountCents! : sub.estimatedTotalCents;
  const eventTypeLabel = sub.eventType.replace(/_/g, " ");
  const addr = [
    sub.eventAddressLine1,
    sub.eventAddressLine2,
    [sub.eventCity, sub.eventState, sub.eventPostalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    version: 1,
    contactName: sub.contactName,
    contactEmail: sub.contactEmail,
    eventTypeLabel,
    eventDateIso: sub.eventDate.toISOString().slice(0, 10),
    eventTimeLocal: sub.eventTimeLocal,
    addressSummary: addr || "—",
    lettering: sub.letteringRaw.trim() || "—",
    setupLabel: sub.setupOutdoor ? "Outdoor setup" : "Indoor setup",
    totalFeeCents,
    totalFeeIsQuote: proposed,
    notes: sub.notes?.trim() ? sub.notes.trim() : null,
  };
}

export function getRentalAgreementSignature(metadata: string | null): RentalAgreementSignatureV1 | null {
  const o = parseMetadataObject(metadata);
  const v = o[RENTAL_AGREEMENT_V1_KEY];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const rec = v as Partial<RentalAgreementSignatureV1>;
  if (
    typeof rec.typedFullName !== "string" ||
    typeof rec.signedAtUtc !== "string" ||
    !rec.snapshot ||
    typeof rec.snapshot !== "object"
  ) {
    return null;
  }
  const snap = rec.snapshot as RentalAgreementSnapshotV1;
  if (snap.version !== 1 || typeof snap.totalFeeCents !== "number") return null;
  return {
    typedFullName: rec.typedFullName,
    signedAtUtc: rec.signedAtUtc,
    clientIp: typeof rec.clientIp === "string" ? rec.clientIp : null,
    userAgent: typeof rec.userAgent === "string" ? rec.userAgent : null,
    snapshot: snap,
  };
}

export function mergeRentalAgreementIntoMetadata(
  prevMetadata: string | null,
  signature: RentalAgreementSignatureV1,
): string {
  const base = parseMetadataObject(prevMetadata);
  return JSON.stringify({
    ...base,
    [RENTAL_AGREEMENT_V1_KEY]: signature,
  });
}

export function snapshotFeeLabel(s: RentalAgreementSnapshotV1): string {
  const amt = formatUsd(s.totalFeeCents);
  return s.totalFeeIsQuote ? `${amt} (quoted total)` : `${amt} (estimated total — final quote may differ)`;
}
