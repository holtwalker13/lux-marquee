import {
  appendReservationRows,
  fetchAllReservationsFromSheet,
} from "@/lib/google-sheets";
import {
  RESERVATION_HALF_SPAN_HOURS,
  reservationWindowAroundEvent,
} from "@/lib/event-datetime";
import { letterCountsFromPhrase } from "@/lib/letter-demand";
import { randomUUID } from "crypto";

export type AvailabilityIssue = {
  letter: string;
  needed: number;
  available: number;
  inUse: number;
};

export class AvailabilityConflictError extends Error {
  constructor(public readonly issues: AvailabilityIssue[]) {
    super("Not enough letter inventory for this date/time window.");
    this.name = "AvailabilityConflictError";
  }
}

export async function sumReservedInWindow(
  letter: string,
  windowStart: Date,
  windowEnd: Date,
  excludeSubmissionId?: string,
): Promise<number> {
  const all = await fetchAllReservationsFromSheet();
  let sum = 0;
  for (const r of all) {
    if (r.status !== "active") continue;
    if (r.letter !== letter) continue;
    if (excludeSubmissionId && r.submissionId === excludeSubmissionId) continue;
    if (r.windowStart < windowEnd && r.windowEnd > windowStart) {
      sum += r.quantityReserved;
    }
  }
  return sum;
}

export async function checkLetterAvailability(
  normalizedLettering: string,
  eventStartUtc: Date,
  inventory: Map<string, number>,
  excludeSubmissionId?: string,
): Promise<{ ok: true } | { ok: false; issues: AvailabilityIssue[] }> {
  const { windowStart, windowEnd } = reservationWindowAroundEvent(
    eventStartUtc,
    RESERVATION_HALF_SPAN_HOURS,
  );
  const counts = letterCountsFromPhrase(normalizedLettering);
  const issues: AvailabilityIssue[] = [];

  for (const [letter, needed] of counts.entries()) {
    const total = inventory.get(letter) ?? 0;
    const inUse = await sumReservedInWindow(
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

export async function createReservationsForSubmission(
  submissionId: string,
  normalizedLettering: string,
  eventStartUtc: Date,
): Promise<void> {
  const { windowStart, windowEnd } = reservationWindowAroundEvent(
    eventStartUtc,
    RESERVATION_HALF_SPAN_HOURS,
  );
  const counts = letterCountsFromPhrase(normalizedLettering);
  const now = new Date().toISOString();
  const rows: string[][] = [];
  for (const [letter, quantityReserved] of counts.entries()) {
    rows.push([
      randomUUID(),
      submissionId,
      letter,
      String(quantityReserved),
      windowStart.toISOString(),
      windowEnd.toISOString(),
      "active",
      now,
    ]);
  }
  if (rows.length === 0) return;
  await appendReservationRows(rows);
}
