"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  List,
  Mail,
  MapPin,
  MessageSquare,
  PanelsTopLeft,
  Pencil,
  Trash2,
} from "lucide-react";
import { buildVenmoChargeUrl, depositAmountDollars } from "@/lib/venmo-deposit";

type Submission = {
  id: string;
  createdAt: string;
  pipelineStatus: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  eventType: string;
  eventDate: string;
  eventTimeLocal: string;
  eventStartAt: string | null;
  eventAddressLine1: string;
  eventCity: string;
  eventState: string;
  eventPostalCode: string;
  letteringRaw: string;
  letteringNormalized: string;
  notes: string | null;
  metadata: string | null;
  setupOutdoor: boolean;
  proposedAmountCents: number | null;
  venmoHandle: string | null;
  depositRequestedAt: string | null;
  depositPaidAt: string | null;
  bookingConfirmedAt: string | null;
};
type InvLetter = { letter: string; totalQuantity: number };
type BusyKey = "save" | "deposit" | "paid" | "book" | "task";
type ActiveTab = "submitted" | "bookings" | "archive";
type RequestStage = "new_inquiry" | "quote_sent" | "deposit_requested" | "deposit_received";
type BookingTaskKey = "calendarCreated" | "welcomeSent" | "contractSent" | "balancePaid";
type BookingTasks = Record<BookingTaskKey, boolean>;
type CancelIntent = { id: string; label: string } | null;
type ConfirmBookingIntent = { id: string; clientName: string } | null;
type ConfirmBookingSuccess = {
  id: string;
  clientName: string;
  eventDate: string;
  eventTime: string;
  location: string;
  lettering: string;
  googleCalendarUrl: string;
} | null;

const DEPOSIT_USD = depositAmountDollars();
const DEPOSIT_CENTS = DEPOSIT_USD * 100;
const EMPTY_TASKS: BookingTasks = {
  calendarCreated: false,
  welcomeSent: false,
  contractSent: false,
  balancePaid: false,
};
const PIPELINE_ORDER: Record<string, number> = {
  pending_request: 0,
  deposit_requested: 1,
  deposit_paid: 2,
  booked: 3,
  cancelled: 4,
};

function LoadingPulse({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium">
      <span className="relative inline-flex items-center">
        <Calendar className="size-4 text-white/95" aria-hidden />
        <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-white/20" />
      </span>
      <span>{label}</span>
      <span className="inline-flex gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
      </span>
    </span>
  );
}

function parseDraftDollarsToCents(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number.parseFloat(t.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function proposedCentsForSub(sub: Submission, draftProposed: string): number | null {
  return parseDraftDollarsToCents(draftProposed) ?? sub.proposedAmountCents;
}

function formatEventDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime12h(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let h = Number(m[1]);
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ap}`;
}

function splitContactName(fullName: string): { first: string; rest: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Client", rest: "" };
  if (parts.length === 1) return { first: parts[0]!, rest: "" };
  return { first: parts[0]!, rest: parts.slice(1).join(" ") };
}

function formatUsPhoneDisplay(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return raw.trim();
}

/** Digits only for sms:/wa.me (US 10-digit → leading country code 1). */
function phoneDigitsForSmsWa(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith("1")) return d;
  if (d.length >= 10) return d;
  return null;
}

function smsDraftUrl(raw: string | null | undefined, contactName?: string): string | null {
  const digits = phoneDigitsForSmsWa(raw);
  if (!digits) return null;
  const firstName = splitContactName(contactName ?? "").first;
  const body = encodeURIComponent(`Hey ${firstName}`);
  return `sms:+${digits}&body=${body}`;
}

function centsToDollars(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
function formatMoneyCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
function eventTypeLabel(raw: string): string {
  return raw.replace(/_/g, " ");
}
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
function openVenmoUrl(url: string) {
  if (typeof window === "undefined") return;
  if (isMobileBrowser()) return void window.location.assign(url);
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) window.location.assign(url);
}

function compactLocationLine(sub: Submission): string {
  const citySt = [sub.eventCity, sub.eventState].filter(Boolean).join(", ");
  return [citySt, sub.eventAddressLine1].filter(Boolean).join(" · ");
}

function toGoogleCalendarDate(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl(sub: Submission): string {
  const fallbackStart = new Date(`${sub.eventDate.slice(0, 10)}T12:00:00.000Z`);
  const start = sub.eventStartAt ? new Date(sub.eventStartAt) : fallbackStart;
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const title = `Lux Marquee Booking: ${sub.contactName}`;
  const details = `Letters: ${sub.letteringRaw || "N/A"}\nClient: ${sub.contactName}\nPhone: ${sub.contactPhone ?? "N/A"}\nEmail: ${sub.contactEmail}`;
  const location = [sub.eventAddressLine1, sub.eventCity, sub.eventState, sub.eventPostalCode]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toGoogleCalendarDate(start.toISOString())}/${toGoogleCalendarDate(end.toISOString())}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
function sortedSubmissions(list: Submission[]): Submission[] {
  return [...list].sort((a, b) => {
    const da = PIPELINE_ORDER[a.pipelineStatus] ?? 99;
    const db = PIPELINE_ORDER[b.pipelineStatus] ?? 99;
    if (da !== db) return da - db;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
function replaceSubmissionInList(list: Submission[], next: Submission): Submission[] {
  return sortedSubmissions(list.map((s) => (s.id === next.id ? next : s)));
}
function parseBookingTasks(metadataRaw: string | null): BookingTasks {
  if (!metadataRaw?.trim()) return EMPTY_TASKS;
  try {
    const parsed = JSON.parse(metadataRaw) as { bookingTasks?: Partial<BookingTasks> };
    return {
      calendarCreated: Boolean(parsed.bookingTasks?.calendarCreated),
      welcomeSent: Boolean(parsed.bookingTasks?.welcomeSent),
      contractSent: Boolean(parsed.bookingTasks?.contractSent),
      balancePaid: Boolean(parsed.bookingTasks?.balancePaid),
    };
  } catch {
    return EMPTY_TASKS;
  }
}
function requestStage(sub: Submission, draftProposed: string): RequestStage | null {
  if (
    sub.pipelineStatus === "booked" ||
    sub.pipelineStatus === "cancelled" ||
    sub.pipelineStatus === "archived" ||
    sub.pipelineStatus === "completed"
  ) {
    return null;
  }
  if (sub.pipelineStatus === "deposit_paid") return "deposit_received";
  if (sub.pipelineStatus === "deposit_requested") return "deposit_requested";
  const proposed = proposedCentsForSub(sub, draftProposed);
  return proposed && proposed > 0 ? "quote_sent" : "new_inquiry";
}

function eventStartForSubmission(sub: Submission): Date | null {
  if (sub.eventStartAt) {
    const d = new Date(sub.eventStartAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(sub.eventDate);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function isFullyPaid(sub: Submission): boolean {
  const tasks = parseBookingTasks(sub.metadata);
  const depositPaid =
    sub.pipelineStatus === "booked" ||
    sub.pipelineStatus === "deposit_paid" ||
    sub.depositPaidAt != null;
  const proposed = sub.proposedAmountCents;
  const balanceClear =
    proposed == null ? tasks.balancePaid : Math.max(0, proposed - DEPOSIT_CENTS) <= 0 || tasks.balancePaid;
  return depositPaid && balanceClear;
}

function shouldAutoArchiveBooking(sub: Submission): boolean {
  if (sub.pipelineStatus !== "booked") return false;
  if (!isFullyPaid(sub)) return false;
  const start = eventStartForSubmission(sub);
  if (!start) return false;
  const elapsedMs = Date.now() - start.getTime();
  return elapsedMs >= 48 * 60 * 60 * 1000;
}

function depositReceivedForRequest(sub: Submission, stage: RequestStage): boolean {
  return (
    stage === "deposit_received" ||
    sub.depositPaidAt != null ||
    sub.pipelineStatus === "deposit_paid" ||
    sub.pipelineStatus === "booked"
  );
}

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

async function parseJsonBody<T>(res: Response, label: string): Promise<ParseResult<T>> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      ok: false,
      message: `${label} returned an empty body (HTTP ${res.status}). Check the terminal running \`next dev\` for server errors.`,
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as T & { error?: string; details?: string };
  } catch {
    return {
      ok: false,
      message: `${label} returned non-JSON (HTTP ${res.status}). The route may have crashed or returned an HTML error page.`,
    };
  }
  const obj = data as T & { error?: string; details?: string };
  if (!res.ok) {
    const msg =
      typeof obj.error === "string" && obj.error.trim()
        ? obj.error
        : `${label} failed (HTTP ${res.status}).`;
    const details =
      typeof obj.details === "string" && obj.details.trim() ? obj.details.trim() : "";
    return {
      ok: false,
      message: details ? `${msg}\n\n${details}` : msg,
    };
  }
  return { ok: true, data: obj as T };
}

function DashboardTabs({
  activeTab,
  submittedCount,
  bookingCount,
  archiveCount,
  onChange,
}: {
  activeTab: ActiveTab;
  submittedCount: number;
  bookingCount: number;
  archiveCount: number;
  onChange: (tab: ActiveTab) => void;
}) {
  return (
    <div className="flex gap-2 rounded-xl border border-[var(--blush)] bg-[var(--card)] p-1">
      <button
        type="button"
        onClick={() => onChange("submitted")}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === "submitted" ? "bg-[var(--cocoa)] text-white" : "text-[var(--cocoa)]"}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>Requests</span>
          <span
            className={`font-mono tabular-nums ${
              activeTab === "submitted"
                ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[var(--cream)]/90"
                : "rounded-full bg-[var(--coral)]/10 px-1.5 py-0.5 text-[var(--coral)]"
            }`}
          >
            {submittedCount}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("bookings")}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === "bookings" ? "bg-[var(--cocoa)] text-white" : "text-[var(--cocoa)]"}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>Bookings</span>
          <span
            className={`font-mono tabular-nums ${
              activeTab === "bookings"
                ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[var(--cream)]/90"
                : "rounded-full bg-[var(--coral)]/10 px-1.5 py-0.5 text-[var(--coral)]"
            }`}
          >
            {bookingCount}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("archive")}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === "archive" ? "bg-[var(--cocoa)] text-white" : "text-[var(--cocoa)]"}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span>Archive</span>
          <span
            className={`font-mono tabular-nums ${
              activeTab === "archive"
                ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[var(--cream)]/90"
                : "rounded-full bg-[var(--coral)]/10 px-1.5 py-0.5 text-[var(--coral)]"
            }`}
          >
            {archiveCount}
          </span>
        </span>
      </button>
    </div>
  );
}

function SubmittedPaymentSummary({
  proposedCents,
  stage,
  sub,
  proposedDraft,
  venmoDraft,
  isEditingProposed,
  onProposedDraftChange,
  onToggleEditProposed,
  onSaveProposed,
  onVenmoDraftChange,
  onSaveVenmo,
  disabled,
}: {
  proposedCents: number | null;
  stage: RequestStage;
  sub: Submission;
  proposedDraft: string;
  venmoDraft: string;
  isEditingProposed: boolean;
  onProposedDraftChange: (value: string) => void;
  onToggleEditProposed: () => void;
  onSaveProposed: () => void;
  onVenmoDraftChange: (value: string) => void;
  onSaveVenmo: () => void;
  disabled: boolean;
}) {
  const received = depositReceivedForRequest(sub, stage);
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Proposed total
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {isEditingProposed ? (
            <input
              value={proposedDraft}
              onChange={(e) => onProposedDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveProposed();
                }
              }}
              className="w-full rounded-md border border-[var(--blush)] bg-white px-2 py-1 font-mono text-sm font-semibold tabular-nums text-[var(--cocoa)]"
              placeholder="0.00"
              disabled={disabled}
              autoFocus
            />
          ) : (
            <p className="min-h-8 pt-1 font-mono text-sm font-semibold tabular-nums text-[var(--cocoa)]">
              {proposedCents != null ? `$${formatMoneyCents(proposedCents)}` : "—"}
            </p>
          )}
          <button
            type="button"
            onClick={isEditingProposed ? onSaveProposed : onToggleEditProposed}
            disabled={disabled}
            className="rounded-md border border-[var(--blush)] p-1 text-[var(--cocoa)] disabled:opacity-50"
            aria-label={isEditingProposed ? "Save proposed total" : "Edit proposed total"}
            title={isEditingProposed ? "Save proposed total" : "Edit proposed total"}
          >
            {isEditingProposed ? <Check className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Deposit
        </p>
        <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--cocoa)]">
          {received ? (
            <>
              <BadgeCheck className="size-4 text-[var(--coral)]" aria-hidden />
              <span className="text-[var(--cocoa)]">Received</span>
            </>
          ) : stage === "deposit_requested" ? (
            <span className="text-amber-950">Awaiting</span>
          ) : (
            <span className="text-[var(--cocoa-muted)]">Not requested</span>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Balance
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--cocoa)]">
          {proposedCents != null ? `$${formatMoneyCents(Math.max(0, proposedCents - DEPOSIT_CENTS))}` : "—"}
        </p>
      </div>
      <label className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
        Venmo @
        <input
          value={venmoDraft}
          onChange={(e) => onVenmoDraftChange(e.target.value)}
          onBlur={onSaveVenmo}
          className="mt-1 w-full rounded-md border border-[var(--blush)] bg-white px-2 py-1 text-sm font-semibold normal-case tracking-normal text-[var(--cocoa)]"
          placeholder="@client"
          disabled={disabled}
        />
      </label>
    </div>
  );
}

function BookingEditablePaymentSummary({
  proposedCents,
  sub,
  proposedDraft,
  isEditingProposed,
  onProposedDraftChange,
  onToggleEditProposed,
  onSaveProposed,
  disabled,
}: {
  proposedCents: number | null;
  sub: Submission;
  proposedDraft: string;
  isEditingProposed: boolean;
  onProposedDraftChange: (value: string) => void;
  onToggleEditProposed: () => void;
  onSaveProposed: () => void;
  disabled: boolean;
}) {
  const received = depositReceivedForRequest(sub, "deposit_received");
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Proposed total
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {isEditingProposed ? (
            <input
              value={proposedDraft}
              onChange={(e) => onProposedDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveProposed();
                }
              }}
              className="w-full rounded-md border border-[var(--blush)] bg-white px-2 py-1 font-mono text-sm font-semibold tabular-nums text-[var(--cocoa)]"
              placeholder="0.00"
              disabled={disabled}
              autoFocus
            />
          ) : (
            <p className="min-h-8 pt-1 font-mono text-sm font-semibold tabular-nums text-[var(--cocoa)]">
              {proposedCents != null ? `$${formatMoneyCents(proposedCents)}` : "—"}
            </p>
          )}
          <button
            type="button"
            onClick={isEditingProposed ? onSaveProposed : onToggleEditProposed}
            disabled={disabled}
            className="rounded-md border border-[var(--blush)] p-1 text-[var(--cocoa)] disabled:opacity-50"
            aria-label={isEditingProposed ? "Save proposed total" : "Edit proposed total"}
            title={isEditingProposed ? "Save proposed total" : "Edit proposed total"}
          >
            {isEditingProposed ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Pencil className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Deposit
        </p>
        <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--cocoa)]">
          {received ? (
            <>
              <BadgeCheck className="size-4 text-[var(--coral)]" aria-hidden />
              <span className="text-[var(--cocoa)]">Received</span>
            </>
          ) : (
            <span className="text-[var(--cocoa-muted)]">Not received</span>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Balance
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--cocoa)]">
          {proposedCents != null ? `$${formatMoneyCents(Math.max(0, proposedCents - DEPOSIT_CENTS))}` : "—"}
        </p>
      </div>
    </div>
  );
}

function NotesBlock({ notes }: { notes: string | null }) {
  if (!notes?.trim()) {
    return <p className="text-xs text-[var(--cocoa-muted)]">No notes</p>;
  }
  return <p className="whitespace-pre-wrap text-sm leading-snug text-[var(--cocoa)]">{notes.trim()}</p>;
}

function LetteringTiles({ text }: { text: string }) {
  const raw = text.trim();
  if (!raw) {
    return (
      <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-dotted border-[var(--coral)]/70 bg-gradient-to-b from-white to-[#fff3ee] px-2 py-1">
        <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--cocoa-muted)]">
          —
        </span>
      </div>
    );
  }

  const upper = raw.toUpperCase();
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-[var(--coral)]/40 bg-gradient-to-b from-white to-[#fff3ee] px-2 py-1">
      {[...upper].map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className="inline-flex min-w-[1.35rem] items-center justify-center rounded-md border border-dotted border-[var(--coral)]/85 bg-white/70 px-1 py-0 font-[family-name:var(--font-display)] text-lg font-semibold tracking-normal text-[var(--cocoa)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
          title={ch === " " ? "space" : ch}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </div>
  );
}

function ClientHeading({
  name,
  phrase,
  eventType,
}: {
  name: string;
  phrase: string;
  eventType: string;
}) {
  const { first, rest } = splitContactName(name);
  const phraseText = phrase.trim();
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-base font-semibold text-[var(--cocoa)]">
          <span className="font-[family-name:var(--font-display)]">{first}</span>
          {rest ? <span className="font-medium"> {rest}</span> : null}
        </span>
        {phraseText ? (
          <>
            <span className="text-[var(--cocoa-muted)]" aria-hidden>
              |
            </span>
            <LetteringTiles text={phraseText} />
          </>
        ) : null}
      </div>
      <p className="text-xs font-semibold capitalize tracking-wide text-[var(--cocoa-muted)]">
        {eventTypeLabel(eventType)}
      </p>
    </div>
  );
}

function BookingTasksChecklist({
  tasks,
  onToggle,
}: {
  tasks: BookingTasks;
  onToggle: (key: BookingTaskKey, value: boolean) => void;
}) {
  return (
    <div className="mt-2 grid gap-2 text-sm">
      {(["calendarCreated", "welcomeSent", "contractSent", "balancePaid"] as BookingTaskKey[]).map(
        (key) => (
          <label key={key} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={tasks[key]}
              onChange={(e) => onToggle(key, e.target.checked)}
            />
            <span>
              {key === "calendarCreated"
                ? "Calendar event created"
                : key === "welcomeSent"
                  ? "Welcome message sent"
                  : key === "contractSent"
                    ? "Contract sent"
                    : "Balance paid"}
            </span>
          </label>
        ),
      )}
    </div>
  );
}

function BookingProgressBar({
  calendarDone,
  welcomeDone,
  contractDone,
  depositPaid,
  balanceClear,
}: {
  calendarDone: boolean;
  welcomeDone: boolean;
  contractDone: boolean;
  depositPaid: boolean;
  balanceClear: boolean;
}) {
  const steps = [
    { key: "calendar", label: "Calendar", done: calendarDone },
    { key: "welcome", label: "Welcome", done: welcomeDone },
    { key: "contract", label: "Contract", done: contractDone },
    { key: "deposit", label: "Deposit", done: depositPaid },
    { key: "balance", label: "Balance", done: balanceClear },
  ] as const;
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Progress
        </p>
        <p className="text-xs font-semibold text-[var(--cocoa)]">
          {doneCount}/{steps.length}
        </p>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--cream)] ring-1 ring-[var(--blush)]/70">
        <div
          className="h-full rounded-full bg-[var(--coral)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-5 gap-1 text-[10px] font-semibold text-[var(--cocoa-muted)]">
        {steps.map((s) => (
          <div key={s.key} className="text-center">
            <div className="mx-auto mb-0.5 flex h-5 items-center justify-center">
              {s.done ? (
                <CheckCircle2 className="size-4 text-[var(--coral)]" aria-hidden />
              ) : (
                <span className="size-2 rounded-full bg-[var(--blush)]/80" aria-hidden />
              )}
            </div>
            <span className={s.done ? "text-[var(--cocoa)]" : ""}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("submitted");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [letters, setLetters] = useState<InvLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [drafts, setDrafts] = useState<
    Record<string, { proposed: string; venmo: string }>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<Record<string, BusyKey>>({});
  const depositInFlight = useRef<Set<string>>(new Set());
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  const [invFeedback, setInvFeedback] = useState<string | null>(null);
  const [cancelIntent, setCancelIntent] = useState<CancelIntent>(null);
  const [confirmBookingIntent, setConfirmBookingIntent] =
    useState<ConfirmBookingIntent>(null);
  const [confirmBookingSuccess, setConfirmBookingSuccess] =
    useState<ConfirmBookingSuccess>(null);
  const [editingProposedById, setEditingProposedById] = useState<Record<string, boolean>>({});
  const [bookingsView, setBookingsView] = useState<"list" | "calendar">("list");
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [collapsedBookingIds, setCollapsedBookingIds] = useState<Record<string, boolean>>({});
  const feedbackTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const showCardFeedback = useCallback(
    (id: string, msg: string, durationMs = 2500) => {
      const prev = feedbackTimers.current[id];
      if (prev) clearTimeout(prev);
      setFeedbackById((f) => ({ ...f, [id]: msg }));
      feedbackTimers.current[id] = setTimeout(() => {
        setFeedbackById((f) => {
          const n = { ...f };
          delete n[id];
          return n;
        });
        delete feedbackTimers.current[id];
      }, durationMs);
    },
    [],
  );

  useEffect(() => {
    const timersRef = feedbackTimers;
    return () => {
      const pending = timersRef.current;
      for (const t of Object.values(pending)) clearTimeout(t);
    };
  }, []);

  const applyServerSubmission = useCallback((updated: Submission) => {
    setSubmissions((prev) => replaceSubmissionInList(prev, updated));
    setDrafts((d) => ({
      ...d,
      [updated.id]: {
        proposed: centsToDollars(updated.proposedAmountCents),
        venmo: updated.venmoHandle ?? "",
      },
    }));
  }, []);

  const welcomeClientSms = useCallback((sub: Submission) => {
    const digits = phoneDigitsForSmsWa(sub.contactPhone);
    if (!digits) return false;
    const body = `Hi ${sub.contactName || "there"}! Thanks for booking Lux Marquee Rentals. Looking forward to ${formatEventDateLong(sub.eventDate)} at ${formatTime12h(sub.eventTimeLocal)}.`;
    window.open(`sms:+${digits}&body=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
    return true;
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoadError(null);
      setLoading(true);
    }
    try {
      const [sRes, iRes] = await Promise.all([
        fetch("/api/admin/submissions", { credentials: "same-origin" }),
        fetch("/api/admin/inventory", { credentials: "same-origin" }),
      ]);

      if (sRes.status === 401 || iRes.status === 401) {
        router.push("/admin/login");
        return;
      }

      const sParsed = await parseJsonBody<{
        submissions?: Submission[];
        error?: string;
      }>(sRes, "submissions");
      const iParsed = await parseJsonBody<{
        letters?: InvLetter[];
        source?: string;
        error?: string;
      }>(iRes, "inventory");

      if (!sParsed.ok) {
        if (!silent) setLoadError(sParsed.message);
        return;
      }
      if (!iParsed.ok) {
        if (!silent) setLoadError(iParsed.message);
        return;
      }

      const sData = sParsed.data;
      const iData = iParsed.data;

      setSubmissions(sortedSubmissions(sData.submissions ?? []));
      setLetters(iData.letters ?? []);
      const nextDrafts: Record<string, { proposed: string; venmo: string }> = {};
      for (const sub of sData.submissions ?? []) {
        nextDrafts[sub.id] = {
          proposed: centsToDollars(sub.proposedAmountCents),
          venmo: sub.venmoHandle ?? "",
        };
      }
      setDrafts(nextDrafts);
    } catch (e) {
      if (!silent) {
        setLoadError(
          e instanceof Error ? e.message : "Something went wrong loading the admin data.",
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [router]);

  const refreshInventory = useCallback(async (): Promise<boolean> => {
    const iRes = await fetch("/api/admin/inventory", { credentials: "same-origin" });
    if (iRes.status === 401) {
      router.push("/admin/login");
      return false;
    }
    const iParsed = await parseJsonBody<{ letters?: InvLetter[]; source?: string }>(
      iRes,
      "inventory",
    );
    if (!iParsed.ok) {
      alert(iParsed.message);
      return false;
    }
    setLetters(iParsed.data.letters ?? []);
    return true;
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function syncInventory() {
    setSyncing(true);
    setInvFeedback(null);
    try {
      const res = await fetch("/api/admin/inventory/sync", { method: "POST" });
      const parsed = await parseJsonBody<{
        error?: string;
        count?: number;
        message?: string;
      }>(res, "inventory sync");
      if (!parsed.ok) {
        alert(parsed.message);
        return;
      }
      const data = parsed.data;
      const ok = await refreshInventory();
      if (!ok) return;
      const msg =
        data.message ??
        `Inventory tab OK — ${data.count ?? 0} letter row(s) readable.`;
      setInvFeedback(msg);
      window.setTimeout(() => setInvFeedback(null), 4000);
    } finally {
      setSyncing(false);
    }
  }

  async function saveDraft(id: string) {
    const d = drafts[id];
    if (!d) return;
    setActionBusy((b) => ({ ...b, [id]: "save" }));
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedAmountDollars: d.proposed || null,
          venmoHandle: d.venmo || null,
        }),
      });
      const parsed = await parseJsonBody<{ submission?: Submission }>(res, "save");
      if (!parsed.ok) {
        alert(parsed.message);
        return;
      }
      if (parsed.data.submission) {
        applyServerSubmission(parsed.data.submission);
      } else {
        void load({ silent: true });
      }
      showCardFeedback(id, "Saved to Google Sheet");
    } finally {
      setActionBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }

  async function requestDeposit(sub: Submission) {
    const id = sub.id;
    if (depositInFlight.current.has(id)) return;
    depositInFlight.current.add(id);
    const d = drafts[id];
    const venmo = d?.venmo?.trim();
    if (!venmo) {
      alert(
        `Add the client's Venmo @handle in the field below, then try again. (We'll save your proposed $ and handle for you.)`,
      );
      depositInFlight.current.delete(id);
      return;
    }
    setActionBusy((b) => ({ ...b, [id]: "deposit" }));
    try {
      const upfrontVenmoUrl = buildVenmoChargeUrl(
        venmo,
        DEPOSIT_USD,
        `Marquee deposit (${sub.letteringRaw.slice(0, 60)})`,
      );

      const patchRes = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedAmountDollars: d?.proposed || null,
          venmoHandle: venmo,
        }),
      });
      const patchParsed = await parseJsonBody<{ submission?: Submission }>(
        patchRes,
        "quote",
      );
      if (!patchParsed.ok) {
        alert(patchParsed.message);
        return;
      }
      if (patchParsed.data.submission) {
        applyServerSubmission(patchParsed.data.submission);
      }

      const res = await fetch(`/api/admin/submissions/${id}/request-deposit`, {
        method: "POST",
      });
      const depositParsed = await parseJsonBody<{
        submission?: Submission;
        venmoUrl?: string;
        depositAmountDollars?: number;
      }>(res, "deposit request");
      if (!depositParsed.ok) {
        alert(depositParsed.message);
        return;
      }
      if (depositParsed.data.submission) {
        applyServerSubmission(depositParsed.data.submission);
      }
      const venmoUrl = depositParsed.data.venmoUrl || upfrontVenmoUrl;
      openVenmoUrl(venmoUrl);
      showCardFeedback(id, "Deposit requested — sheet updated (Venmo opened)");
    } finally {
      depositInFlight.current.delete(id);
      setActionBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }

  async function markDepositPaid(id: string) {
    setActionBusy((b) => ({ ...b, [id]: "paid" }));
    try {
      const res = await fetch(`/api/admin/submissions/${id}/mark-deposit-paid`, {
        method: "POST",
      });
      const parsed = await parseJsonBody<{ submission?: Submission }>(res, "mark paid");
      if (!parsed.ok) {
        alert(parsed.message);
        return;
      }
      if (parsed.data.submission) {
        applyServerSubmission(parsed.data.submission);
      } else {
        void load({ silent: true });
      }
      showCardFeedback(id, "Marked paid — sheet updated");
    } finally {
      setActionBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }

  async function confirmBooking(id: string) {
    const preConfirmSub = submissions.find((s) => s.id === id) ?? null;
    setActionBusy((b) => ({ ...b, [id]: "book" }));
    try {
      const res = await fetch(`/api/admin/submissions/${id}/confirm-booking`, {
        method: "POST",
      });
      const parsed = await parseJsonBody<{
        submission?: Submission;
        calendarEmailSent?: boolean;
        calendarEmailNote?: string;
        ics?: string;
      }>(res, "confirm booking");
      if (!parsed.ok) {
        alert(parsed.message);
        return;
      }
      if (parsed.data.submission) {
        applyServerSubmission(parsed.data.submission);
      } else {
        void load({ silent: true });
      }
      const confirmed = parsed.data.submission ?? preConfirmSub;
      if (confirmed) {
        setConfirmBookingSuccess({
          id: confirmed.id,
          clientName: confirmed.contactName,
          eventDate: formatEventDateLong(confirmed.eventDate),
          eventTime: formatTime12h(confirmed.eventTimeLocal),
          location: compactLocationLine(confirmed),
          lettering: confirmed.letteringRaw.trim().toUpperCase(),
          googleCalendarUrl: buildGoogleCalendarUrl(confirmed),
        });
      }
      showCardFeedback(id, "Booking confirmed.");
    } finally {
      setActionBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }

  function openVenmoRemainder(sub: Submission) {
    const d = drafts[sub.id];
    const venmo = d?.venmo?.trim();
    if (!venmo) {
      alert("Add the client's Venmo @handle first.");
      return;
    }
    const proposed = proposedCentsForSub(sub, d?.proposed ?? "");
    if (proposed == null) {
      alert("Enter a proposed total so we can calculate the remainder.");
      return;
    }
    const remainder = Math.max(0, proposed - DEPOSIT_CENTS);
    if (remainder <= 0) {
      alert(
        `No balance after the $${DEPOSIT_USD} deposit — proposed total must be more than $${DEPOSIT_USD}.`,
      );
      return;
    }
    const url = buildVenmoChargeUrl(
      venmo,
      remainder / 100,
      `Marquee balance (${sub.letteringRaw.slice(0, 60)})`,
    );
    openVenmoUrl(url);
  }

  async function updateBookingTask(id: string, key: BookingTaskKey, value: boolean) {
    setActionBusy((b) => ({ ...b, [id]: "task" }));
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingTasks: { [key]: value } }),
      });
      const parsed = await parseJsonBody<{ submission?: Submission }>(res, "save task");
      if (!parsed.ok) return void alert(parsed.message);
      if (parsed.data.submission) applyServerSubmission(parsed.data.submission);
      showCardFeedback(id, "Task updated");
    } finally {
      setActionBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }

  async function updatePipelineStatus(
    id: string,
    pipelineStatus:
      | "pending_request"
      | "deposit_requested"
      | "deposit_paid"
      | "booked"
      | "cancelled"
      | "archived",
  ) {
    setActionBusy((b) => ({ ...b, [id]: "task" }));
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStatus }),
      });
      const parsed = await parseJsonBody<{ submission?: Submission }>(
        res,
        "update status",
      );
      if (!parsed.ok) return void alert(parsed.message);
      if (parsed.data.submission) applyServerSubmission(parsed.data.submission);
      showCardFeedback(
        id,
        pipelineStatus === "cancelled" ? "Request removed from active queue" : "Status updated",
      );
    } finally {
      setActionBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
    }
  }

  const submittedRequests = useMemo(
    () => submissions.filter((s) => requestStage(s, drafts[s.id]?.proposed ?? "") != null),
    [submissions, drafts],
  );
  const bookings = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    return submissions
      .filter((s) => s.pipelineStatus === "booked" && !shouldAutoArchiveBooking(s))
      .sort((a, b) => {
        const aStart = eventStartForSubmission(a);
        const bStart = eventStartForSubmission(b);
        const aMs = aStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bMs = bStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const aUpcoming = aMs >= todayMs;
        const bUpcoming = bMs >= todayMs;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        return aMs - bMs;
      });
  }, [submissions]);
  const archiveBookings = useMemo(() => {
    return submissions.filter(
      (s) => s.pipelineStatus === "archived" || shouldAutoArchiveBooking(s),
    );
  }, [submissions]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--blush)] bg-[var(--card)] p-6">
        <p className="inline-flex items-center rounded-xl bg-[var(--coral)] px-3 py-2 text-white">
          <LoadingPulse label="Loading booking data" />
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-lg space-y-4 rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--cocoa)]">
          Couldn&apos;t load admin data
        </h1>
        <p className="whitespace-pre-wrap text-sm text-[var(--cocoa-muted)]">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-2xl bg-[var(--coral)] px-4 py-2 text-sm font-bold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--cocoa)]">
            Admin queue
          </h1>
          <p className="text-sm text-[var(--cocoa-muted)]">
            Pipeline, deposits, and letter holds (±12h around event time).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="ml-auto rounded-full border border-[var(--blush)] px-4 py-2 text-sm font-semibold text-[var(--cocoa)]"
        >
          Log out
        </button>
      </header>

      <section className="rounded-2xl border border-[var(--blush)] bg-[var(--card)] p-4">
        <h2 className="font-semibold text-[var(--cocoa)]">Letter stock</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {letters.map((l) => (
            <span
              key={l.letter}
              className="inline-flex items-end gap-1 rounded-xl bg-[var(--cream)] px-3 py-1.5"
            >
              <span className="font-[family-name:var(--font-display)] text-lg font-bold leading-none text-[var(--cocoa)]">
                {l.letter}
              </span>
              <span className="text-xs font-medium text-[var(--cocoa-muted)]">
                {l.totalQuantity}
              </span>
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncInventory()}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--coral)] px-4 py-2 text-sm font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncing ? (
            <LoadingPulse label="Verifying" />
          ) : (
            "Verify Inventory tab"
          )}
        </button>
        {invFeedback ? (
          <p className="mt-2 text-sm font-medium text-[var(--cocoa)]">{invFeedback}</p>
        ) : null}
      </section>

      <section className="space-y-4">
        <DashboardTabs
          activeTab={activeTab}
          submittedCount={submittedRequests.length}
          bookingCount={bookings.length}
          archiveCount={archiveBookings.length}
          onChange={setActiveTab}
        />

        {activeTab === "submitted" ? (
          <div className="space-y-3">
            {submittedRequests.length === 0 ? (
              <p className="text-sm text-[var(--cocoa-muted)]">No submitted requests in pre-booking stages.</p>
            ) : (
              submittedRequests.map((sub) => {
                const draft = drafts[sub.id] ?? { proposed: "", venmo: "" };
                const stage = requestStage(sub, draft.proposed);
                if (!stage) return null;
                const proposed = proposedCentsForSub(sub, draft.proposed);
                const busy = actionBusy[sub.id];
                const locked = busy !== undefined;
                const isEditingProposed = Boolean(editingProposedById[sub.id]);
                const phoneDisplay = formatUsPhoneDisplay(sub.contactPhone);
                const smsUrl = smsDraftUrl(sub.contactPhone, sub.contactName);
                const primary = (() => {
                  if (stage === "new_inquiry") return { label: "Set quote", fn: () => void saveDraft(sub.id), disabled: !draft.proposed.trim() };
                  if (stage === "quote_sent") return { label: "Request deposit", fn: () => void requestDeposit(sub), disabled: false };
                  if (stage === "deposit_requested") return { label: "Mark Deposit Received", fn: () => void markDepositPaid(sub.id), disabled: false };
                  return {
                    label: "Confirm booking",
                    fn: () =>
                      setConfirmBookingIntent({
                        id: sub.id,
                        clientName: sub.contactName,
                      }),
                    disabled: false,
                  };
                })();
                const primaryIsConfirm = primary.label === "Confirm booking";
                return (
                  <article key={sub.id} className="rounded-xl border border-[var(--blush)] bg-[var(--card)] p-4">
                    <div className="space-y-2">
                      <ClientHeading
                        name={sub.contactName}
                        phrase={sub.letteringRaw}
                        eventType={sub.eventType}
                      />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                          <span>{formatEventDateLong(sub.eventDate)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                          <span>{formatTime12h(sub.eventTimeLocal)}</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-start gap-2 text-sm text-[var(--cocoa-muted)]">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                        <span className="min-w-0 text-[var(--cocoa)]">{compactLocationLine(sub)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa-muted)]">
                        {phoneDisplay ? (
                          smsUrl ? (
                            <a
                              href={smsUrl}
                              className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-[var(--blush)]/40"
                              title="Open text message draft"
                            >
                              <MessageSquare className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                              <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <MessageSquare className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                              <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                            </span>
                          )
                        ) : null}
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Mail className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                          <span className="min-w-0 break-all text-[var(--cocoa)]">{sub.contactEmail}</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <SubmittedPaymentSummary
                        proposedCents={proposed}
                        stage={stage}
                        sub={sub}
                        proposedDraft={draft.proposed}
                        venmoDraft={draft.venmo}
                        isEditingProposed={isEditingProposed}
                        onProposedDraftChange={(value) =>
                          setDrafts((d) => ({
                            ...d,
                            [sub.id]: { proposed: value, venmo: d[sub.id]?.venmo ?? "" },
                          }))
                        }
                        onToggleEditProposed={() =>
                          setEditingProposedById((prev) => ({ ...prev, [sub.id]: true }))
                        }
                        onSaveProposed={() => {
                          setEditingProposedById((prev) => ({ ...prev, [sub.id]: false }));
                          void saveDraft(sub.id);
                        }}
                        onVenmoDraftChange={(value) =>
                          setDrafts((d) => ({
                            ...d,
                            [sub.id]: { proposed: d[sub.id]?.proposed ?? "", venmo: value },
                          }))
                        }
                        onSaveVenmo={() => void saveDraft(sub.id)}
                        disabled={locked}
                      />
                    </div>

                    <div className="mt-3 rounded-lg border border-[var(--blush)] bg-[var(--cream)]/40 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                        Notes
                      </p>
                      <div className="mt-1">
                        <NotesBlock notes={sub.notes} />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={primary.fn}
                        disabled={
                          locked ||
                          primary.disabled ||
                          (stage === "deposit_received" && sub.pipelineStatus !== "deposit_paid")
                        }
                        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
                          primaryIsConfirm ? "bg-[var(--coral)]" : "bg-[var(--cocoa)]"
                        }`}
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-2">
                            <LoadingPulse label="Working" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            {primary.label === "Mark Deposit Received" ? (
                              <BadgeCheck className="size-4" aria-hidden />
                            ) : null}
                            <span>{primary.label}</span>
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="mt-3 flex justify-end border-t border-[var(--blush)]/70 pt-3">
                      <button
                        type="button"
                        onClick={() => setCancelIntent({ id: sub.id, label: "remove this request" })}
                        disabled={locked}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                        title="Remove request"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Remove request
                      </button>
                    </div>
                    {feedbackById[sub.id] ? <p className="mt-2 text-xs text-[var(--cocoa-muted)]">{feedbackById[sub.id]}</p> : null}
                  </article>
                );
              })
            )}
          </div>
        ) : activeTab === "bookings" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--blush)] bg-[var(--card)]/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                Booking view
              </p>
              <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--blush)] bg-white/70 p-1">
                <button
                  type="button"
                  onClick={() => setBookingsView("list")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                    bookingsView === "list"
                      ? "bg-[var(--cocoa)] text-white"
                      : "text-[var(--cocoa)]"
                  }`}
                  title="Expanded list view"
                >
                  <List className="size-3.5" aria-hidden />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setBookingsView("calendar")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                    bookingsView === "calendar"
                      ? "bg-[var(--cocoa)] text-white"
                      : "text-[var(--cocoa)]"
                  }`}
                  title="Grid calendar-style view"
                >
                  <CalendarDays className="size-3.5" aria-hidden />
                  Grid
                </button>
              </div>
            </div>
            {bookings.length === 0 ? (
              <p className="text-sm text-[var(--cocoa-muted)]">No confirmed bookings yet.</p>
            ) : (
              <div className={bookingsView === "calendar" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
                {bookings.map((sub, idx) => {
                  const draft = drafts[sub.id] ?? { proposed: "", venmo: "" };
                  const proposed = proposedCentsForSub(sub, draft.proposed);
                  const remainder = proposed != null ? Math.max(0, proposed - DEPOSIT_CENTS) : null;
                  const tasks = parseBookingTasks(sub.metadata);
                  const isEditingProposed = Boolean(editingProposedById[sub.id]);
                  const phoneDisplay = formatUsPhoneDisplay(sub.contactPhone);
                  const smsUrl = smsDraftUrl(sub.contactPhone, sub.contactName);
                  const depositPaid =
                    sub.pipelineStatus === "booked" ||
                    sub.pipelineStatus === "deposit_paid" ||
                    sub.depositPaidAt != null;
                  const balanceClear = remainder == null || remainder <= 0 || tasks.balancePaid;
                  const busy = actionBusy[sub.id];
                  const locked = busy !== undefined;
                  const isExpanded =
                    bookingsView === "list"
                      ? !collapsedBookingIds[sub.id]
                      : expandedBookingId === sub.id;
                  const eventDate = new Date(sub.eventDate);
                  const day = Number.isNaN(eventDate.getTime())
                    ? "--"
                    : eventDate.toLocaleDateString("en-US", { day: "2-digit" });
                  const month = Number.isNaN(eventDate.getTime())
                    ? "Date"
                    : eventDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
                  const monthGroupLabel = Number.isNaN(eventDate.getTime())
                    ? "Unknown month"
                    : eventDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  const prevDate = idx > 0 ? new Date(bookings[idx - 1]!.eventDate) : null;
                  const prevMonthGroupLabel =
                    prevDate && !Number.isNaN(prevDate.getTime())
                      ? prevDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
                      : "Unknown month";
                  const showMonthBreak =
                    bookingsView === "calendar" && (idx === 0 || monthGroupLabel !== prevMonthGroupLabel);
                  const nextTask: BookingTaskKey | null = !tasks.calendarCreated
                    ? "calendarCreated"
                    : !tasks.welcomeSent
                      ? "welcomeSent"
                      : !tasks.contractSent
                        ? "contractSent"
                        : remainder != null && remainder > 0 && !tasks.balancePaid
                          ? "balancePaid"
                          : null;
                  const nextAction = (() => {
                    if (!nextTask) return { label: "Booking complete", fn: () => undefined, disabled: true };
                    if (nextTask === "welcomeSent") {
                      return {
                        label: "Send welcome message",
                        fn: () => {
                          if (!welcomeClientSms(sub)) return alert("No usable phone number on this booking.");
                          void updateBookingTask(sub.id, "welcomeSent", true);
                        },
                        disabled: false,
                      };
                    }
                    if (nextTask === "calendarCreated") {
                      return {
                        label: "Create calendar event",
                        fn: () => void updateBookingTask(sub.id, "calendarCreated", true),
                        disabled: false,
                      };
                    }
                    if (nextTask === "contractSent") {
                      return {
                        label: "Send contract",
                        fn: () => void updateBookingTask(sub.id, "contractSent", true),
                        disabled: false,
                      };
                    }
                    return {
                      label: "Mark balance paid",
                      fn: () => void updateBookingTask(sub.id, "balancePaid", true),
                      disabled: false,
                    };
                  })();
                  const primaryIsComplete = nextAction.label === "Booking complete";

                  if (!isExpanded) {
                    return (
                      <Fragment key={sub.id}>
                        {showMonthBreak ? (
                          <div className="sm:col-span-2 lg:col-span-3 border-b border-[var(--blush)]/70 pb-1 pt-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                              {monthGroupLabel}
                            </p>
                          </div>
                        ) : null}
                      <article
                        className="cursor-pointer rounded-xl border border-[var(--blush)] bg-[var(--card)] p-4 text-left transition hover:bg-white/80"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (bookingsView === "list") {
                            setCollapsedBookingIds((prev) => ({ ...prev, [sub.id]: false }));
                            return;
                          }
                          setExpandedBookingId(sub.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          if (bookingsView === "list") {
                            setCollapsedBookingIds((prev) => ({ ...prev, [sub.id]: false }));
                            return;
                          }
                          setExpandedBookingId(sub.id);
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex min-w-[4.25rem] flex-col items-center justify-center rounded-lg border border-[var(--coral)]/40 bg-[var(--coral)]/10 px-2 py-2">
                            <span className="text-[10px] font-bold tracking-widest text-[var(--coral)]">
                              {month}
                            </span>
                            <span className="font-[family-name:var(--font-display)] text-3xl leading-none text-[var(--cocoa)]">
                              {day}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="truncate text-sm font-semibold text-[var(--cocoa)]">
                              {sub.contactName}
                            </p>
                            <p className="truncate font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--cocoa)]">
                              {sub.letteringRaw.trim().toUpperCase() || "—"}
                            </p>
                            <p className="inline-flex items-center gap-1.5 text-xs text-[var(--cocoa-muted)]">
                              <Clock className="size-3.5" aria-hidden />
                              {formatEventDateLong(sub.eventDate)} · {formatTime12h(sub.eventTimeLocal)}
                            </p>
                          </div>
                          <span className="rounded-full border border-[var(--blush)] bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                            Upcoming
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          {smsUrl ? (
                            <a
                              href={smsUrl}
                              onClick={(e) => e.stopPropagation()}
                              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                                bookingsView === "calendar"
                                  ? "bg-[var(--coral)] text-white"
                                  : "rounded-lg border border-[var(--blush)] text-[var(--cocoa)]"
                              }`}
                              title="Open text message draft"
                            >
                              <MessageSquare className="size-3.5" aria-hidden />
                              {bookingsView === "calendar" ? null : <span className="ml-1">Message</span>}
                            </a>
                          ) : null}
                        </div>
                      </article>
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={sub.id}>
                      {showMonthBreak ? (
                        <div className="sm:col-span-2 lg:col-span-3 border-b border-[var(--blush)]/70 pb-1 pt-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                            {monthGroupLabel}
                          </p>
                        </div>
                      ) : null}
                      <article
                        className={`rounded-xl border border-[var(--blush)] bg-[var(--card)] p-4 ${
                          bookingsView === "calendar" ? "sm:col-span-2 lg:col-span-3" : ""
                        }`}
                      >
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (bookingsView === "list") {
                              setCollapsedBookingIds((prev) => ({ ...prev, [sub.id]: true }));
                              return;
                            }
                            setExpandedBookingId(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--blush)] px-2.5 py-1 text-xs font-semibold text-[var(--cocoa)]"
                        >
                          <PanelsTopLeft className="size-3.5" aria-hidden />
                          Collapse
                        </button>
                      </div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <ClientHeading
                            name={sub.contactName}
                            phrase={sub.letteringRaw}
                            eventType={sub.eventType}
                          />
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa-muted)]">
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                              <span>{formatEventDateLong(sub.eventDate)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                              <span>{formatTime12h(sub.eventTimeLocal)}</span>
                            </span>
                          </div>
                          <div className="flex flex-wrap items-start gap-2 text-sm text-[var(--cocoa-muted)]">
                            <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                            <span className="min-w-0 text-[var(--cocoa)]">{compactLocationLine(sub)}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa-muted)]">
                            {phoneDisplay ? (
                              smsUrl ? (
                                <a
                                  href={smsUrl}
                                  className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-[var(--blush)]/40"
                                  title="Open text message draft"
                                >
                                  <MessageSquare className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                                  <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <MessageSquare className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                                  <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                                </span>
                              )
                            ) : null}
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Mail className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                              <span className="min-w-0 break-all text-[var(--cocoa)]">{sub.contactEmail}</span>
                            </span>
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                          <CheckCircle2 className="size-4 text-emerald-700" aria-hidden />
                          Booked
                        </div>
                      </div>

                      <div className="mt-3">
                        <BookingEditablePaymentSummary
                          proposedCents={proposed}
                          sub={sub}
                          proposedDraft={draft.proposed}
                          isEditingProposed={isEditingProposed}
                          onProposedDraftChange={(value) =>
                            setDrafts((d) => ({
                              ...d,
                              [sub.id]: {
                                proposed: value,
                                venmo: d[sub.id]?.venmo ?? "",
                              },
                            }))
                          }
                          onToggleEditProposed={() =>
                            setEditingProposedById((prev) => ({ ...prev, [sub.id]: true }))
                          }
                          onSaveProposed={() => {
                            setEditingProposedById((prev) => ({ ...prev, [sub.id]: false }));
                            void saveDraft(sub.id);
                          }}
                          disabled={locked}
                        />
                      </div>

                      <div className="mt-3">
                        <BookingProgressBar
                          calendarDone={tasks.calendarCreated}
                          welcomeDone={tasks.welcomeSent}
                          contractDone={tasks.contractSent}
                          depositPaid={depositPaid}
                          balanceClear={balanceClear}
                        />
                      </div>

                      <div className="mt-3 rounded-lg border border-[var(--blush)] bg-[var(--cream)]/40 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                          Notes
                        </p>
                        <div className="mt-1">
                          <NotesBlock notes={sub.notes} />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={nextAction.fn}
                          disabled={locked || nextAction.disabled}
                          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
                            primaryIsComplete ? "bg-[var(--cocoa)]" : "bg-[var(--coral)]"
                          }`}
                        >
                          {busy ? (
                            <span className="inline-flex items-center gap-2">
                              <LoadingPulse label="Working" />
                            </span>
                          ) : (
                            nextAction.label
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openVenmoRemainder(sub)}
                          disabled={locked || !remainder || remainder <= 0}
                          className="rounded-lg border border-[var(--blush)] px-3 py-2 text-xs font-semibold text-[var(--cocoa)]"
                        >
                          Send balance link
                        </button>
                      </div>

                      <details className="mt-3 rounded-lg border border-[var(--blush)]/80 bg-white/70 p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-[var(--cocoa)]">Adjust checklist</summary>
                        <BookingTasksChecklist
                          tasks={tasks}
                          onToggle={(k, value) => void updateBookingTask(sub.id, k, value)}
                        />
                      </details>

                      <div className="mt-3 flex justify-end border-t border-[var(--blush)]/70 pt-3">
                        <button
                          type="button"
                          onClick={() => setCancelIntent({ id: sub.id, label: "cancel this booking" })}
                          disabled={locked}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                          title="Cancel booking"
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Cancel booking
                        </button>
                      </div>
                      {feedbackById[sub.id] ? <p className="mt-2 text-xs text-[var(--cocoa-muted)]">{feedbackById[sub.id]}</p> : null}
                      </article>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {archiveBookings.length === 0 ? (
              <p className="text-sm text-[var(--cocoa-muted)]">
                No archived bookings yet. Bookings auto-archive 48 hours after event start once fully paid.
              </p>
            ) : (
              archiveBookings.map((sub) => {
                const phoneDisplay = formatUsPhoneDisplay(sub.contactPhone);
                const smsUrl = smsDraftUrl(sub.contactPhone, sub.contactName);
                const start = eventStartForSubmission(sub);
                return (
                  <article
                    key={sub.id}
                    className="rounded-xl border border-[var(--blush)] bg-[var(--card)] p-4 opacity-95"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <ClientHeading
                          name={sub.contactName}
                          phrase={sub.letteringRaw}
                          eventType={sub.eventType}
                        />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa-muted)]">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                            <span>{formatEventDateLong(sub.eventDate)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                            <span>{formatTime12h(sub.eventTimeLocal)}</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap items-start gap-2 text-sm text-[var(--cocoa-muted)]">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                          <span className="min-w-0 text-[var(--cocoa)]">{compactLocationLine(sub)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa-muted)]">
                          {phoneDisplay ? (
                            smsUrl ? (
                              <a
                                href={smsUrl}
                                className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-[var(--blush)]/40"
                                title="Open text message draft"
                              >
                                <MessageSquare className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                                <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <MessageSquare className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                                <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                              </span>
                            )
                          ) : null}
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Mail className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                            <span className="min-w-0 break-all text-[var(--cocoa)]">{sub.contactEmail}</span>
                          </span>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                        <CheckCircle2 className="size-4 text-stone-600" aria-hidden />
                        Archived
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-[var(--cocoa-muted)]">
                      {start ? `Archived after ${formatEventDateLong(start.toISOString())} event window.` : "Archived booking."}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>

      {cancelIntent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--blush)] bg-[var(--card)] p-4 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--cocoa)]">Are you sure?</h3>
            <p className="mt-2 text-sm text-[var(--cocoa-muted)]">
              This will {cancelIntent.label} and remove it from the active dashboard tabs.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelIntent(null)}
                className="rounded-lg border border-[var(--blush)] px-3 py-2 text-sm font-semibold text-[var(--cocoa)]"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = cancelIntent;
                  setCancelIntent(null);
                  void updatePipelineStatus(target.id, "cancelled");
                }}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Yes, remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmBookingIntent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--blush)] bg-[var(--card)] p-4 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--cocoa)]">Confirm booking?</h3>
            <p className="mt-2 text-sm text-[var(--cocoa-muted)]">
              This will mark{" "}
              <span className="font-semibold text-[var(--cocoa)]">
                {confirmBookingIntent.clientName}
              </span>{" "}
              as booked and try to automatically open an iPhone-compatible calendar event.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBookingIntent(null)}
                className="rounded-lg border border-[var(--blush)] px-3 py-2 text-sm font-semibold text-[var(--cocoa)]"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmBookingIntent;
                  setConfirmBookingIntent(null);
                  void confirmBooking(target.id);
                }}
                className="rounded-lg bg-[var(--coral)] px-3 py-2 text-sm font-bold text-white"
              >
                Yes, confirm booking
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmBookingSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--blush)] bg-[var(--card)] p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <Calendar className="mt-1 size-8 text-[var(--coral)]" aria-hidden />
              <div>
                <h3 className="text-lg font-semibold text-[var(--cocoa)]">
                  Success, booking is confirmed.
                </h3>
                <p className="mt-1 text-sm text-[var(--cocoa-muted)]">
                  This event is moved into your Bookings tab. Thank you.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-lg border border-[var(--blush)] bg-[var(--cream)]/35 p-3">
              <p className="text-sm font-semibold text-[var(--cocoa)]">
                {confirmBookingSuccess.clientName}
              </p>
              <p className="inline-flex items-center gap-1.5 text-sm text-[var(--cocoa-muted)]">
                <Calendar className="size-4" aria-hidden />
                {confirmBookingSuccess.eventDate}
              </p>
              <p className="inline-flex items-center gap-1.5 text-sm text-[var(--cocoa-muted)]">
                <Clock className="size-4" aria-hidden />
                {confirmBookingSuccess.eventTime}
              </p>
              <p className="inline-flex items-start gap-1.5 text-sm text-[var(--cocoa-muted)]">
                <MapPin className="mt-0.5 size-4" aria-hidden />
                <span>{confirmBookingSuccess.location}</span>
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                Letters reserved
              </p>
              <LetteringTiles text={confirmBookingSuccess.lettering} />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBookingSuccess(null)}
                className="rounded-lg border border-[var(--blush)] px-3 py-2 text-sm font-semibold text-[var(--cocoa)]"
              >
                Close
              </button>
              <a
                href={confirmBookingSuccess.googleCalendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--coral)] px-3 py-2 text-sm font-bold text-white"
              >
                Add this event to your Google Calendar
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
