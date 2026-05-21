import {
  appendReservationRows,
  fetchAllReservationsFromSheet,
  type SheetReservationRow,
  updateReservationStatusesInSheet,
} from "@/lib/google-sheets";
import {
  RESERVATION_HALF_SPAN_HOURS,
  reservationWindowAroundEvent,
} from "@/lib/event-datetime";
import { letterCountsFromPhrase } from "@/lib/letter-demand";
import {
  isZeroOInterchangeable,
  O_GLYPH,
  resolveZeroOReservations,
  ZERO_GLYPH,
  zeroOIssueLabel,
} from "@/lib/zero-o-interchange";
import { randomUUID } from "crypto";

export type AvailabilityIssue = {
  letter: string;
  needed: number;
  available: number;
  inUse: number;
};

export const RESERVATION_STATUS_ACTIVE = "active";
export const RESERVATION_STATUS_RELEASED = "released";

/** One sheet read; marks expired rows released in memory and on the sheet. */
export async function loadReservationsWithExpiredReleased(): Promise<
  SheetReservationRow[]
> {
  const all = await fetchAllReservationsFromSheet();
  const now = new Date();
  const expired = all.filter(
    (r) =>
      r.status === RESERVATION_STATUS_ACTIVE && r.windowEnd.getTime() <= now.getTime(),
  );
  if (expired.length === 0) return all;
  await updateReservationStatusesInSheet(
    expired.map((r) => ({ reservationId: r.id, status: RESERVATION_STATUS_RELEASED })),
  );
  for (const r of expired) {
    r.status = RESERVATION_STATUS_RELEASED;
  }
  return all;
}

/** Returns letters to inventory after the rental window ends (reusable stock). */
export async function releaseExpiredReservations(): Promise<number> {
  const all = await fetchAllReservationsFromSheet();
  const now = new Date();
  const expired = all.filter(
    (r) =>
      r.status === RESERVATION_STATUS_ACTIVE && r.windowEnd.getTime() <= now.getTime(),
  );
  if (expired.length === 0) return 0;
  await updateReservationStatusesInSheet(
    expired.map((r) => ({ reservationId: r.id, status: RESERVATION_STATUS_RELEASED })),
  );
  return expired.length;
}

/** Frees reserved letters when a booking is cancelled before or after the event. */
export async function releaseReservationsForSubmission(submissionId: string): Promise<number> {
  const all = await fetchAllReservationsFromSheet();
  const active = all.filter(
    (r) =>
      r.submissionId === submissionId && r.status === RESERVATION_STATUS_ACTIVE,
  );
  if (active.length === 0) return 0;
  await updateReservationStatusesInSheet(
    active.map((r) => ({ reservationId: r.id, status: RESERVATION_STATUS_RELEASED })),
  );
  return active.length;
}

export class AvailabilityConflictError extends Error {
  constructor(public readonly issues: AvailabilityIssue[]) {
    super("Not enough letter inventory for this date/time window.");
    this.name = "AvailabilityConflictError";
  }
}

export function sumReservedInWindowFromList(
  all: SheetReservationRow[],
  letter: string,
  windowStart: Date,
  windowEnd: Date,
  excludeSubmissionId?: string,
): number {
  let sum = 0;
  for (const r of all) {
    if (r.status !== RESERVATION_STATUS_ACTIVE) continue;
    if (r.letter !== letter) continue;
    if (excludeSubmissionId && r.submissionId === excludeSubmissionId) continue;
    if (r.windowStart < windowEnd && r.windowEnd > windowStart) {
      sum += r.quantityReserved;
    }
  }
  return sum;
}

export async function sumReservedInWindow(
  letter: string,
  windowStart: Date,
  windowEnd: Date,
  excludeSubmissionId?: string,
): Promise<number> {
  const all = await fetchAllReservationsFromSheet();
  return sumReservedInWindowFromList(
    all,
    letter,
    windowStart,
    windowEnd,
    excludeSubmissionId,
  );
}

export async function checkLetterAvailability(
  normalizedLettering: string,
  eventStartUtc: Date,
  inventory: Map<string, number>,
  excludeSubmissionId?: string,
): Promise<{ ok: true } | { ok: false; issues: AvailabilityIssue[] }> {
  const all = await loadReservationsWithExpiredReleased();
  const { windowStart, windowEnd } = reservationWindowAroundEvent(
    eventStartUtc,
    RESERVATION_HALF_SPAN_HOURS,
  );
  const counts = letterCountsFromPhrase(normalizedLettering);
  const issues: AvailabilityIssue[] = [];

  const need0 = counts.get(ZERO_GLYPH) ?? 0;
  const needO = counts.get(O_GLYPH) ?? 0;
  const zeroOPoolNeed = need0 + needO;
  if (zeroOPoolNeed > 0) {
    const poolTotal =
      (inventory.get(ZERO_GLYPH) ?? 0) + (inventory.get(O_GLYPH) ?? 0);
    const inUse0 = sumReservedInWindowFromList(
      all,
      ZERO_GLYPH,
      windowStart,
      windowEnd,
      excludeSubmissionId,
    );
    const inUseO = sumReservedInWindowFromList(
      all,
      O_GLYPH,
      windowStart,
      windowEnd,
      excludeSubmissionId,
    );
    const poolAvailable = poolTotal - inUse0 - inUseO;
    if (zeroOPoolNeed > poolAvailable) {
      issues.push({
        letter: zeroOIssueLabel(need0, needO),
        needed: zeroOPoolNeed,
        available: Math.max(0, poolAvailable),
        inUse: inUse0 + inUseO,
      });
    }
  }

  for (const [letter, needed] of counts.entries()) {
    if (isZeroOInterchangeable(letter)) continue;
    const total = inventory.get(letter) ?? 0;
    const inUse = sumReservedInWindowFromList(
      all,
      letter,
      windowStart,
      windowEnd,
      excludeSubmissionId,
    );
    const available = total - inUse;
    if (needed > available) {
      issues.push({ letter, needed, available: Math.max(0, available), inUse });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true };
}

function pushReservationRow(
  rows: string[][],
  submissionId: string,
  letter: string,
  quantity: number,
  windowStart: Date,
  windowEnd: Date,
  now: string,
): void {
  if (quantity < 1) return;
  rows.push([
    randomUUID(),
    submissionId,
    letter,
    String(quantity),
    windowStart.toISOString(),
    windowEnd.toISOString(),
    RESERVATION_STATUS_ACTIVE,
    now,
  ]);
}

export async function createReservationsForSubmission(
  submissionId: string,
  normalizedLettering: string,
  eventStartUtc: Date,
  inventory: Map<string, number>,
  options?: { bookAnyway?: boolean },
): Promise<void> {
  const { windowStart, windowEnd } = reservationWindowAroundEvent(
    eventStartUtc,
    RESERVATION_HALF_SPAN_HOURS,
  );
  const bookAnyway = options?.bookAnyway === true;
  const all = bookAnyway ? null : await loadReservationsWithExpiredReleased();
  const counts = letterCountsFromPhrase(normalizedLettering);
  const now = new Date().toISOString();
  const rows: string[][] = [];

  const need0 = counts.get(ZERO_GLYPH) ?? 0;
  const needO = counts.get(O_GLYPH) ?? 0;
  if (need0 > 0 || needO > 0) {
    if (bookAnyway) {
      pushReservationRow(rows, submissionId, ZERO_GLYPH, need0, windowStart, windowEnd, now);
      pushReservationRow(rows, submissionId, O_GLYPH, needO, windowStart, windowEnd, now);
    } else {
      const inUse0 = sumReservedInWindowFromList(
        all!,
        ZERO_GLYPH,
        windowStart,
        windowEnd,
        submissionId,
      );
      const inUseO = sumReservedInWindowFromList(
        all!,
        O_GLYPH,
        windowStart,
        windowEnd,
        submissionId,
      );
      const avail0 = Math.max(0, (inventory.get(ZERO_GLYPH) ?? 0) - inUse0);
      const availO = Math.max(0, (inventory.get(O_GLYPH) ?? 0) - inUseO);
      const { reserve0, reserveO } = resolveZeroOReservations(need0, needO, avail0, availO);
      pushReservationRow(rows, submissionId, ZERO_GLYPH, reserve0, windowStart, windowEnd, now);
      pushReservationRow(rows, submissionId, O_GLYPH, reserveO, windowStart, windowEnd, now);
    }
  }

  for (const [letter, quantityReserved] of counts.entries()) {
    if (isZeroOInterchangeable(letter)) continue;
    pushReservationRow(
      rows,
      submissionId,
      letter,
      quantityReserved,
      windowStart,
      windowEnd,
      now,
    );
  }
  if (rows.length === 0) return;
  await appendReservationRows(rows);
}
