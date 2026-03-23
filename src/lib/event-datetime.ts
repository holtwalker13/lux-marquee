import { DateTime } from "luxon";

export function getEventTimezone(): string {
  return process.env.EVENT_TIMEZONE?.trim() || "America/Chicago";
}

/** Parse YYYY-MM-DD + HH:mm in EVENT_TIMEZONE → UTC Date. */
export function parseEventStartUtc(
  dateStr: string,
  timeStr: string,
): { ok: true; utc: Date } | { ok: false; message: string } {
  const zone = getEventTimezone();
  const t = timeStr.trim();
  if (!/^\d{2}:\d{2}$/.test(t)) {
    return { ok: false, message: "Pick a valid event time (hour and minute)." };
  }
  const dt = DateTime.fromISO(`${dateStr}T${t}`, { zone });
  if (!dt.isValid) {
    return { ok: false, message: "Could not read event date and time together." };
  }
  return { ok: true, utc: dt.toUTC().toJSDate() };
}

/** ±hours around event instant (inclusive blocking window for overlap checks). */
export function reservationWindowAroundEvent(
  eventStartUtc: Date,
  halfSpanHours: number,
): { windowStart: Date; windowEnd: Date } {
  const ms = halfSpanHours * 60 * 60 * 1000;
  const t = eventStartUtc.getTime();
  return {
    windowStart: new Date(t - ms),
    windowEnd: new Date(t + ms),
  };
}

export const RESERVATION_HALF_SPAN_HOURS = 12;
