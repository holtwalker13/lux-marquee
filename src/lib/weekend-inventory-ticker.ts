import { DateTime } from "luxon";
import { getEventTimezone } from "@/lib/event-datetime";
import type { SheetReservationRow } from "@/lib/google-sheets";

/** Show the weekend inventory strip on Fri–Sun (event timezone). */
export function isWeekendTickerDay(nowMs: number = Date.now()): boolean {
  const z = getEventTimezone();
  const wd = DateTime.fromMillis(nowMs, { zone: z }).weekday;
  return wd === 5 || wd === 6 || wd === 7;
}

/**
 * The Fri–Sun window used for the ticker: current weekend in the event zone
 * (Mon–Thu uses the upcoming Fri–Sun; Fri–Sun uses the Fri–Sun that contains today).
 */
export function getTickerFriSunUtcRange(nowMs: number = Date.now()): { startUtc: Date; endUtc: Date } {
  const z = getEventTimezone();
  let d = DateTime.fromMillis(nowMs, { zone: z }).startOf("day");
  const w = d.weekday;
  if (w < 5) d = d.plus({ days: 5 - w });
  else if (w === 6) d = d.minus({ days: 1 });
  else if (w === 7) d = d.minus({ days: 2 });
  const friStart = d.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
  const sunEnd = friStart.plus({ days: 2 }).endOf("day");
  return { startUtc: friStart.toUTC().toJSDate(), endUtc: sunEnd.toUTC().toJSDate() };
}

function formatGlyphLabel(glyph: string): string {
  if (glyph === "&") return "&";
  return glyph;
}

function formatGlyphList(glyphs: string[]): string {
  const labels = glyphs.map(formatGlyphLabel);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatWeekendRangeLabel(startUtc: Date, endUtc: Date): string {
  const z = getEventTimezone();
  const a = DateTime.fromJSDate(startUtc, { zone: "utc" }).setZone(z);
  const b = DateTime.fromJSDate(endUtc, { zone: "utc" }).setZone(z);
  return `${a.toFormat("ccc LLL d")}–${b.toFormat("ccc LLL d")}`;
}

/** Max total reserved quantity overlapping instant `t` for this letter. */
export function peakConcurrentReservedAtInstant(
  reservations: SheetReservationRow[],
  letter: string,
  instant: Date,
): number {
  let sum = 0;
  for (const r of reservations) {
    if (r.status !== "active") continue;
    if (r.letter !== letter) continue;
    if (r.windowStart < instant && r.windowEnd > instant) {
      sum += r.quantityReserved;
    }
  }
  return sum;
}

export function peakConcurrentReservedInRange(
  reservations: SheetReservationRow[],
  letter: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): number {
  const t0 = rangeStartUtc.getTime();
  const t1 = rangeEndUtc.getTime();
  const span = Math.max(1, t1 - t0);
  const step = Math.min(60 * 60 * 1000, Math.max(15 * 60 * 1000, Math.floor(span / 64)));
  let peak = 0;
  for (let t = t0; t <= t1; t += step) {
    const inst = new Date(t);
    peak = Math.max(peak, peakConcurrentReservedAtInstant(reservations, letter, inst));
  }
  const tail = new Date(t1);
  peak = Math.max(peak, peakConcurrentReservedAtInstant(reservations, letter, tail));
  return peak;
}

export function buildWeekendInventoryTickerMessage(
  inventory: Map<string, number>,
  reservations: SheetReservationRow[],
  nowMs: number = Date.now(),
): string | null {
  if (!isWeekendTickerDay(nowMs)) return null;
  const { startUtc, endUtc } = getTickerFriSunUtcRange(nowMs);
  const rangeLabel = formatWeekendRangeLabel(startUtc, endUtc);

  const scarce: string[] = [];
  for (const [letter, total] of [...inventory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (total <= 0) continue;
    const peak = peakConcurrentReservedInRange(reservations, letter, startUtc, endUtc);
    if (peak >= total) scarce.push(letter);
  }

  if (scarce.length === 0) {
    return `Weekend letter watch (${rangeLabel}): every tracked unit still has spare capacity for new bookings.`;
  }
  const list = formatGlyphList(scarce);
  const verb = scarce.length === 1 ? "is" : "are";
  const tail =
    scarce.length === 1
      ? "no spare stock for new bookings that need it."
      : "no spare stock for new bookings that need those units.";
  return `Weekend letter watch (${rangeLabel}): ${list} ${verb} fully reserved — ${tail}`;
}
