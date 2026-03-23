import type { PrismaClient } from "@prisma/client";
import {
  RESERVATION_HALF_SPAN_HOURS,
  reservationWindowAroundEvent,
} from "@/lib/event-datetime";
import { letterCountsFromPhrase } from "@/lib/letter-demand";

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
  prisma: PrismaClient,
  letter: string,
  windowStart: Date,
  windowEnd: Date,
  excludeSubmissionId?: string,
): Promise<number> {
  const rows = await prisma.letterReservation.findMany({
    where: {
      letter,
      status: "active",
      windowStart: { lt: windowEnd },
      windowEnd: { gt: windowStart },
      ...(excludeSubmissionId
        ? { submissionId: { not: excludeSubmissionId } }
        : {}),
    },
    select: { quantityReserved: true },
  });
  return rows.reduce((s, r) => s + r.quantityReserved, 0);
}

export async function checkLetterAvailability(
  prisma: PrismaClient,
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
      prisma,
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
  prisma: PrismaClient,
  submissionId: string,
  normalizedLettering: string,
  eventStartUtc: Date,
): Promise<void> {
  const { windowStart, windowEnd } = reservationWindowAroundEvent(
    eventStartUtc,
    RESERVATION_HALF_SPAN_HOURS,
  );
  const counts = letterCountsFromPhrase(normalizedLettering);
  const data = [...counts.entries()].map(([letter, quantityReserved]) => ({
    submissionId,
    letter,
    quantityReserved,
    windowStart,
    windowEnd,
    status: "active",
  }));
  if (data.length === 0) return;
  await prisma.letterReservation.createMany({ data });
}
