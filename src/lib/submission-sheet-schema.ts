import { formatUsd, normalizeLettering } from "@/lib/pricing";
import { parseMoneyToCents } from "@/lib/money-parse";

/** Canonical SubmitRequests columns (row 1). Same order as sheet values. */
export const SUBMIT_REQUEST_HEADERS = [
  "Submitted at (UTC)",
  "Submission ID",
  "Pipeline status",
  "Contact name",
  "Email",
  "Phone",
  "Event type",
  "Event date",
  "Event time (local)",
  "Event start (UTC)",
  "Event address",
  "Lettering",
  "Notes",
  "Estimated total",
  "Setup",
  "Outside radius",
  "Distance (mi)",
  "Proposed total",
  "Client Venmo",
  "Address line 1",
  "Address line 2",
  "City",
  "State",
  "ZIP",
  "Lat",
  "Lng",
  "Lettering normalized",
  "Price table version",
  "Consent accepted",
  "Deposit requested (ISO)",
  "Deposit paid (ISO)",
  "Booking confirmed (ISO)",
  "Metadata (JSON)",
] as const;

export const SUBMIT_REQUEST_COL_COUNT = SUBMIT_REQUEST_HEADERS.length;

export type SheetSubmission = {
  id: string;
  createdAt: Date;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  eventType: string;
  eventDate: Date;
  eventTimeLocal: string;
  eventStartAt: Date | null;
  eventAddressLine1: string;
  eventAddressLine2: string | null;
  eventCity: string;
  eventState: string;
  eventPostalCode: string;
  eventLat: number | null;
  eventLng: number | null;
  distanceMilesFromBase: number | null;
  outsideServiceRadius: boolean;
  setupOutdoor: boolean;
  letteringRaw: string;
  notes: string | null;
  letteringNormalized: string;
  estimatedTotalCents: number;
  priceTableVersion: string;
  consentAccepted: boolean;
  pipelineStatus: string;
  proposedAmountCents: number | null;
  venmoHandle: string | null;
  depositRequestedAt: Date | null;
  depositPaidAt: Date | null;
  bookingConfirmedAt: Date | null;
  metadata: string | null;
};

function cell(row: string[], i: number): string {
  return row[i] != null ? String(row[i]).trim() : "";
}

function parseIsoDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEventDateCell(s: string): Date {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00.000Z` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function parseBool(s: string, fallback: boolean): boolean {
  const t = s.toLowerCase();
  if (t === "yes" || t === "true" || t === "1") return true;
  if (t === "no" || t === "false" || t === "0") return false;
  return fallback;
}

function looksLikeSetupToken(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "indoor" || t === "outdoor";
}

function extractLegacyNotesFromMetadata(metadata: string): string | null {
  if (!metadata.trim()) return null;
  try {
    const parsed = JSON.parse(metadata) as { notes?: unknown };
    if (typeof parsed.notes === "string" && parsed.notes.trim()) {
      return parsed.notes.trim();
    }
  } catch {
    // ignore invalid legacy metadata
  }
  return null;
}

/** Parse a data row (may be legacy 18-column). */
export function parseSubmissionRow(row: string[]): SheetSubmission | null {
  const id = cell(row, 1);
  if (!id) return null;

  const eventTimeLocal = cell(row, 8) || "12:00";
  const displayAddr = cell(row, 10);
  const line1 = cell(row, 18) || displayAddr.split(" · ")[0] || displayAddr;
  const line2Raw = cell(row, 19);
  const city = cell(row, 20);
  const state = cell(row, 21);
  const zip = cell(row, 22);

  const usesDedicatedNotesCol = looksLikeSetupToken(cell(row, 14));
  const notesCell = usesDedicatedNotesCol ? cell(row, 12) : "";
  const estimatedCol = usesDedicatedNotesCol ? 13 : 12;
  const setupCol = usesDedicatedNotesCol ? 14 : 13;
  const outsideCol = usesDedicatedNotesCol ? 15 : 14;
  const distanceCol = usesDedicatedNotesCol ? 16 : 15;
  const proposedCol = usesDedicatedNotesCol ? 17 : 16;
  const venmoCol = usesDedicatedNotesCol ? 18 : 17;
  const line1Col = usesDedicatedNotesCol ? 19 : 18;
  const line2Col = usesDedicatedNotesCol ? 20 : 19;
  const cityCol = usesDedicatedNotesCol ? 21 : 20;
  const stateCol = usesDedicatedNotesCol ? 22 : 21;
  const zipCol = usesDedicatedNotesCol ? 23 : 22;
  const latCol = usesDedicatedNotesCol ? 24 : 23;
  const lngCol = usesDedicatedNotesCol ? 25 : 24;
  const letteringNormCol = usesDedicatedNotesCol ? 26 : 25;
  const priceVersionCol = usesDedicatedNotesCol ? 27 : 26;
  const consentCol = usesDedicatedNotesCol ? 28 : 27;
  const depRequestedCol = usesDedicatedNotesCol ? 29 : 28;
  const depPaidCol = usesDedicatedNotesCol ? 30 : 29;
  const bookingCol = usesDedicatedNotesCol ? 31 : 30;
  const metadataCol = usesDedicatedNotesCol ? 32 : 31;
  const lat = (() => {
    const latStr = cell(row, latCol);
    return latStr ? Number(latStr) : null;
  })();
  const lng = (() => {
    const lngStr = cell(row, lngCol);
    return lngStr ? Number(lngStr) : null;
  })();

  const estCents =
    parseMoneyToCents(cell(row, estimatedCol)) ??
    (Number.isFinite(Number(cell(row, estimatedCol)))
      ? Math.round(Number(cell(row, estimatedCol)) * 100)
      : 0);
  const proposedCents = parseMoneyToCents(cell(row, proposedCol));

  const letteringNorm = cell(row, letteringNormCol) || normalizeLettering(cell(row, 11));

  const created = parseIsoDate(cell(row, 0)) ?? new Date();
  const eventStartAt = parseIsoDate(cell(row, 9));

  const metadataValue = cell(row, metadataCol) || null;
  return {
    id,
    createdAt: created,
    contactName: cell(row, 3),
    contactEmail: cell(row, 4),
    contactPhone: cell(row, 5) || null,
    eventType: cell(row, 6),
    eventDate: parseEventDateCell(cell(row, 7)),
    eventTimeLocal,
    eventStartAt,
    eventAddressLine1: cell(row, line1Col) || line1,
    eventAddressLine2: cell(row, line2Col) || line2Raw || null,
    eventCity: cell(row, cityCol) || city,
    eventState: cell(row, stateCol) || state,
    eventPostalCode: cell(row, zipCol) || zip,
    eventLat: Number.isFinite(lat!) ? lat : null,
    eventLng: Number.isFinite(lng!) ? lng : null,
    distanceMilesFromBase: (() => {
      const d = Number(cell(row, distanceCol));
      return Number.isFinite(d) ? d : null;
    })(),
    outsideServiceRadius: parseBool(cell(row, outsideCol), false),
    setupOutdoor: cell(row, setupCol).toLowerCase() === "outdoor",
    letteringRaw: cell(row, 11),
    notes: notesCell || extractLegacyNotesFromMetadata(metadataValue ?? "") || null,
    letteringNormalized: letteringNorm,
    estimatedTotalCents: estCents,
    priceTableVersion: cell(row, priceVersionCol) || "sheet",
    consentAccepted: parseBool(cell(row, consentCol), true),
    pipelineStatus: cell(row, 2) || "pending_request",
    proposedAmountCents: proposedCents,
    venmoHandle: cell(row, venmoCol) || null,
    depositRequestedAt: parseIsoDate(cell(row, depRequestedCol)),
    depositPaidAt: parseIsoDate(cell(row, depPaidCol)),
    bookingConfirmedAt: parseIsoDate(cell(row, bookingCol)),
    metadata: metadataValue,
  };
}

export function sheetSubmissionToRowValues(sub: SheetSubmission): string[] {
  const displayAddr = [
    sub.eventAddressLine1,
    sub.eventAddressLine2,
    [sub.eventCity, sub.eventState, sub.eventPostalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  const row: string[] = new Array(SUBMIT_REQUEST_COL_COUNT).fill("");
  const set = (i: number, v: string | number | boolean) => {
    row[i] = v === "" || v == null ? "" : String(v);
  };

  set(0, sub.createdAt.toISOString());
  set(1, sub.id);
  set(2, sub.pipelineStatus);
  set(3, sub.contactName);
  set(4, sub.contactEmail);
  set(5, sub.contactPhone ?? "");
  set(6, sub.eventType);
  set(7, sub.eventDate.toISOString().slice(0, 10));
  set(8, sub.eventTimeLocal);
  set(9, sub.eventStartAt?.toISOString() ?? "");
  set(10, displayAddr);
  set(11, sub.letteringRaw);
  set(12, sub.notes ?? "");
  set(13, formatUsd(sub.estimatedTotalCents));
  set(14, sub.setupOutdoor ? "outdoor" : "indoor");
  set(15, sub.outsideServiceRadius ? "yes" : "no");
  set(16, sub.distanceMilesFromBase ?? "");
  set(
    17,
    sub.proposedAmountCents != null && sub.proposedAmountCents > 0
      ? formatUsd(sub.proposedAmountCents)
      : "",
  );
  set(18, sub.venmoHandle ?? "");
  set(19, sub.eventAddressLine1);
  set(20, sub.eventAddressLine2 ?? "");
  set(21, sub.eventCity);
  set(22, sub.eventState);
  set(23, sub.eventPostalCode);
  set(24, sub.eventLat ?? "");
  set(25, sub.eventLng ?? "");
  set(26, sub.letteringNormalized);
  set(27, sub.priceTableVersion);
  set(28, sub.consentAccepted ? "yes" : "no");
  set(29, sub.depositRequestedAt?.toISOString() ?? "");
  set(30, sub.depositPaidAt?.toISOString() ?? "");
  set(31, sub.bookingConfirmedAt?.toISOString() ?? "");
  set(32, sub.metadata ?? "");

  return row;
}

/** JSON shape expected by AdminDashboard + PATCH handlers. */
export function sheetSubmissionToApiJson(sub: SheetSubmission) {
  return {
    id: sub.id,
    createdAt: sub.createdAt.toISOString(),
    pipelineStatus: sub.pipelineStatus,
    contactName: sub.contactName,
    contactEmail: sub.contactEmail,
    contactPhone: sub.contactPhone,
    eventType: sub.eventType,
    eventDate: sub.eventDate.toISOString(),
    eventTimeLocal: sub.eventTimeLocal,
    eventStartAt: sub.eventStartAt?.toISOString() ?? null,
    eventAddressLine1: sub.eventAddressLine1,
    eventCity: sub.eventCity,
    eventState: sub.eventState,
    eventPostalCode: sub.eventPostalCode,
    letteringRaw: sub.letteringRaw,
    notes: sub.notes,
    letteringNormalized: sub.letteringNormalized,
    setupOutdoor: sub.setupOutdoor,
    outsideServiceRadius: sub.outsideServiceRadius,
    distanceMilesFromBase: sub.distanceMilesFromBase,
    proposedAmountCents: sub.proposedAmountCents,
    venmoHandle: sub.venmoHandle,
    depositRequestedAt: sub.depositRequestedAt?.toISOString() ?? null,
    depositPaidAt: sub.depositPaidAt?.toISOString() ?? null,
    bookingConfirmedAt: sub.bookingConfirmedAt?.toISOString() ?? null,
    metadata: sub.metadata,
  };
}
