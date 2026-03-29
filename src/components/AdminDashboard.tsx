"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildVenmoChargeUrl,
  depositAmountDollars,
} from "@/lib/venmo-deposit";

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
  setupOutdoor: boolean;
  outsideServiceRadius: boolean;
  distanceMilesFromBase: number | null;
  proposedAmountCents: number | null;
  venmoHandle: string | null;
  depositRequestedAt: string | null;
  depositPaidAt: string | null;
  bookingConfirmedAt: string | null;
};

type InvLetter = { letter: string; totalQuantity: number };

function centsToDollars(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

const DEPOSIT_USD = depositAmountDollars();
const DEPOSIT_CENTS = DEPOSIT_USD * 100;

const PIPELINE_ORDER: Record<string, number> = {
  pending_request: 0,
  deposit_requested: 1,
  deposit_paid: 2,
  booked: 3,
  cancelled: 4,
};

/** Numeric rank from Google Sheet pipeline column (for workflow UI). */
function pipelineRankFromSheet(status: string): number {
  switch (status) {
    case "pending_request":
      return 0;
    case "deposit_requested":
      return 1;
    case "deposit_paid":
      return 2;
    case "booked":
      return 3;
    default:
      return 0;
  }
}

function sheetStepDone(rank: number, stepIndex: number): boolean {
  if (rank === 3 && stepIndex === 3) return true;
  return rank > stepIndex;
}

function sheetStepCurrent(rank: number, stepIndex: number): boolean {
  return rank === stepIndex;
}

/** Subtle pipeline pill: small tint + border (matches sheet column, not loud fills). */
function pipelineStatusBadgeClasses(status: string): string {
  switch (status) {
    case "booked":
      return "border border-emerald-200/90 bg-emerald-50/80 text-emerald-900";
    case "deposit_paid":
      return "border border-sky-200/90 bg-sky-50/70 text-sky-900";
    case "deposit_requested":
      return "border border-amber-200/90 bg-amber-50/70 text-amber-950";
    case "pending_request":
      return "border border-violet-200/90 bg-violet-50/70 text-violet-900";
    case "cancelled":
      return "border border-stone-300/80 bg-stone-100/90 text-stone-700";
    default:
      return "border border-[var(--blush)] bg-[var(--cream)] text-[var(--cocoa)]";
  }
}

/** Left accent per workflow step (rest of chip stays neutral). */
const WORKFLOW_STEP_LEFT: readonly string[] = [
  "border-l-violet-400",
  "border-l-amber-500",
  "border-l-sky-500",
  "border-l-emerald-500",
];

function sheetWorkflowStepLiClasses(
  stepIndex: number,
  done: boolean,
  current: boolean,
): string {
  const left = WORKFLOW_STEP_LEFT[stepIndex] ?? WORKFLOW_STEP_LEFT[0];
  const shell =
    "rounded-md border border-[var(--blush)]/90 bg-[var(--card)] px-2 py-1.5 pl-2.5 text-[11px] leading-snug sm:px-2.5 sm:py-2 sm:text-xs border-l-[3px]";
  if (done) {
    return `${shell} ${left} text-[var(--cocoa)]`;
  }
  if (current) {
    return `${shell} border-l-[var(--coral)] bg-[#fffaf8] font-medium text-[var(--cocoa)]`;
  }
  return `${shell} border-l-[var(--blush)] text-[var(--cocoa-muted)]`;
}

function downloadIcs(content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "marquee-booking.ics";
  a.click();
  URL.revokeObjectURL(url);
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function openVenmoUrl(url: string) {
  if (typeof window === "undefined") return;
  if (isMobileBrowser()) {
    // iOS/Android often block popup tabs for app handoff; same-tab navigation is more reliable.
    window.location.assign(url);
    return;
  }
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    alert("Popup blocked. We'll open Venmo in this tab instead.");
    window.location.assign(url);
  }
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

type BusyKey = "save" | "deposit" | "paid" | "book";

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`size-3.5 shrink-0 animate-spin ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-30"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function parseDraftDollarsToCents(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number.parseFloat(t.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function formatMoneyCents(cents: number): string {
  return (cents / 100).toFixed(2);
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

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
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

const DEFAULT_WELCOME_SMS_TEMPLATE =
  "Hi {{name}}! Thanks for choosing Lux Marquee Rentals. We received your request and will follow up shortly — reply here anytime.";

function welcomeSmsTemplate(): string {
  const t = process.env.NEXT_PUBLIC_ADMIN_WELCOME_SMS_TEMPLATE;
  return typeof t === "string" && t.trim() ? t.trim() : DEFAULT_WELCOME_SMS_TEMPLATE;
}

function interpolateWelcomeSms(template: string, sub: Submission): string {
  return template
    .replace(/\{\{name\}\}/gi, sub.contactName.trim() || "there")
    .replace(/\{\{eventDate\}\}/gi, formatEventDateLong(sub.eventDate))
    .replace(/\{\{time\}\}/gi, formatTime12h(sub.eventTimeLocal));
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

function smsWelcomeHref(e164NoPlusDigits: string, body: string): string {
  const num =
    e164NoPlusDigits.length === 11 && e164NoPlusDigits.startsWith("1")
      ? `+${e164NoPlusDigits}`
      : `+${e164NoPlusDigits}`;
  return `sms:${num}&body=${encodeURIComponent(body)}`;
}

function whatsAppWelcomeHref(e164NoPlusDigits: string, body: string): string {
  return `https://wa.me/${e164NoPlusDigits}?text=${encodeURIComponent(body)}`;
}

function openExternalMessagingHref(href: string) {
  if (typeof window === "undefined") return;
  if (isMobileBrowser()) {
    window.location.assign(href);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function businessMessengerPageUrl(): string | null {
  const h = process.env.NEXT_PUBLIC_BUSINESS_MESSENGER_MME?.trim();
  if (!h) return null;
  const slug = h.replace(/^@/, "").replace(/^\//, "");
  return slug ? `https://m.me/${encodeURIComponent(slug)}` : null;
}

function eventTypeLabel(raw: string): string {
  return raw.replace(/_/g, " ");
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconMapPin({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

function LetteringPerLetter({ text, compact }: { text: string; compact?: boolean }) {
  if (text.length === 0) {
    return (
      <span
        className={`font-[family-name:var(--font-display)] font-semibold text-[var(--cocoa-muted)] ${compact ? "text-lg" : "text-2xl"}`}
      >
        —
      </span>
    );
  }
  const cell = compact
    ? "min-h-[1.65rem] min-w-[1.35rem] px-1 py-0 text-lg"
    : "min-h-[2.25rem] min-w-[1.6rem] px-1.5 py-0.5 text-2xl";
  return (
    <>
      {[...text].map((ch, i) => (
        <span
          key={i}
          className={`inline-flex items-center justify-center rounded-md border border-dotted border-[var(--coral)]/85 bg-gradient-to-b from-white to-[#fff3ee] font-[family-name:var(--font-display)] font-semibold tracking-normal text-[var(--cocoa)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-[#f0d9d2]/60 ${cell}`}
          title={ch === " " ? "space" : ch}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </>
  );
}

function compactLocationLine(sub: Submission): string {
  if (sub.eventAddressLine1.trim().toUpperCase() === "LOCAL PICKUP") {
    return "Local pickup order";
  }
  const citySt = [sub.eventCity, sub.eventState].filter(Boolean).join(", ");
  const tail = sub.setupOutdoor ? "outdoor" : "indoor";
  return [citySt, sub.eventAddressLine1, tail].filter(Boolean).join(" · ");
}

function isPickupOrder(sub: Submission): boolean {
  return sub.eventAddressLine1.trim().toUpperCase() === "LOCAL PICKUP";
}

function ChevronDetails({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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

export function AdminDashboard() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [letters, setLetters] = useState<InvLetter[]>([]);
  const [invSource, setInvSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [checkPhrase, setCheckPhrase] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [checkTime, setCheckTime] = useState("17:00");
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { proposed: string; venmo: string }>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<Record<string, BusyKey>>({});
  const depositInFlight = useRef<Set<string>>(new Set());
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  /** When confirm-booking did not email, server returns .ics — offer a manual download (no alert/confirm). */
  const [icsFallbackById, setIcsFallbackById] = useState<Record<string, string>>({});
  const [invFeedback, setInvFeedback] = useState<string | null>(null);
  const [availChecking, setAvailChecking] = useState(false);
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

  const pageMessengerUrl = businessMessengerPageUrl();

  const welcomeClientSms = useCallback((sub: Submission) => {
    const digits = phoneDigitsForSmsWa(sub.contactPhone);
    if (!digits) {
      alert(
        "No usable phone number on this request. The client must submit one on the quote form.",
      );
      return;
    }
    const body = interpolateWelcomeSms(welcomeSmsTemplate(), sub);
    openExternalMessagingHref(smsWelcomeHref(digits, body));
  }, []);

  const welcomeClientWhatsApp = useCallback((sub: Submission) => {
    const digits = phoneDigitsForSmsWa(sub.contactPhone);
    if (!digits) {
      alert(
        "No usable phone number on this request. The client must submit one on the quote form.",
      );
      return;
    }
    const body = interpolateWelcomeSms(welcomeSmsTemplate(), sub);
    openExternalMessagingHref(whatsAppWelcomeHref(digits, body));
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
      setInvSource(iData.source ?? "");
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
    setInvSource(iParsed.data.source ?? "");
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

  async function runAvailabilityCheck() {
    setCheckResult(null);
    setAvailChecking(true);
    try {
      const params = new URLSearchParams({
        phrase: checkPhrase,
        date: checkDate,
        time: checkTime,
      });
      const res = await fetch(`/api/admin/availability?${params}`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        issues?: { letter: string; needed: number; available: number; inUse: number }[];
        normalized?: string;
      };
      if (!res.ok) {
        setCheckResult(data.error ?? "Check failed");
        return;
      }
      if (data.ok) {
        setCheckResult(`OK for “${data.normalized}” at ${checkDate} ${checkTime}.`);
      } else {
        setCheckResult(
          `Conflict: ${data.issues?.map((i) => `${i.letter} need ${i.needed}, have ${i.available} free (in use ${i.inUse})`).join("; ")}`,
        );
      }
    } finally {
      setAvailChecking(false);
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
    setActionBusy((b) => ({ ...b, [id]: "book" }));
    try {
      const res = await fetch(`/api/admin/submissions/${id}/confirm-booking`, {
        method: "POST",
      });
      const parsed = await parseJsonBody<{
        submission?: Submission;
        issues?: unknown;
        calendarEmailSent?: boolean;
        calendarEmailNote?: string;
        ics?: string;
      }>(res, "confirm booking");
      if (!parsed.ok) {
        alert(parsed.message);
        return;
      }
      const data = parsed.data;
      if (data.submission) {
        applyServerSubmission(data.submission);
      } else {
        void load({ silent: true });
      }
      if (data.calendarEmailNote === "Already booked.") {
        showCardFeedback(id, "Already booked.");
        return;
      }
      if (data.calendarEmailSent) {
        setIcsFallbackById((f) => {
          const n = { ...f };
          delete n[id];
          return n;
        });
        showCardFeedback(
          id,
          "Booked — letters held · calendar emailed to client and owner",
          5000,
        );
      } else if (data.ics) {
        const icsContent = data.ics;
        setIcsFallbackById((f) => ({ ...f, [id]: icsContent }));
        showCardFeedback(
          id,
          "Booked — letters held · set Resend env to email invites, or use Download calendar below",
          6000,
        );
      } else {
        setIcsFallbackById((f) => {
          const n = { ...f };
          delete n[id];
          return n;
        });
        showCardFeedback(
          id,
          `Booked — letters held · ${data.calendarEmailNote ?? "No calendar file returned."}`,
          5000,
        );
      }
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
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return <p className="text-[var(--cocoa-muted)]">Loading…</p>;
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
    <div className="space-y-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
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
          className="rounded-full border border-[var(--blush)] px-4 py-2 text-sm font-semibold text-[var(--cocoa)]"
        >
          Log out
        </button>
      </header>

      <section className="rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-6">
        <h2 className="font-semibold text-[var(--cocoa)]">Letter stock</h2>
        <p className="mt-1 text-xs text-[var(--cocoa-muted)]">
          Source: {invSource}. Edit counts in Google Sheet tab “Inventory” (A=letter,
          B=qty from row 2). Counts reload every time you open the dashboard.
        </p>
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
            <>
              <Spinner className="text-white" />
              <span className="animate-pulse">Verifying…</span>
            </>
          ) : (
            "Verify Inventory tab"
          )}
        </button>
        {invFeedback ? (
          <p className="mt-2 text-sm font-medium text-[var(--cocoa)]">{invFeedback}</p>
        ) : null}
        <details className="mt-4 rounded-2xl border border-[var(--blush)] bg-[var(--cream)]/30 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cocoa)] [&::-webkit-details-marker]:hidden">
            Availability check
          </summary>
          <p className="mt-2 text-xs text-[var(--cocoa-muted)]">
            A–Z only; uses ±12h window around event time (server EVENT_TIMEZONE,
            default America/Chicago).
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-[var(--cocoa-muted)]">
                Phrase
              </span>
              <input
                value={checkPhrase}
                onChange={(e) => setCheckPhrase(e.target.value)}
                className="mt-1 block rounded-xl border border-[var(--blush)] px-3 py-2"
                placeholder="LOVE"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[var(--cocoa-muted)]">
                Date
              </span>
              <input
                type="date"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                className="mt-1 block rounded-xl border border-[var(--blush)] px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[var(--cocoa-muted)]">
                Time
              </span>
              <input
                type="time"
                value={checkTime}
                onChange={(e) => setCheckTime(e.target.value)}
                className="mt-1 block rounded-xl border border-[var(--blush)] px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={availChecking}
              onClick={() => void runAvailabilityCheck()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cocoa)] px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {availChecking ? (
                <>
                  <Spinner className="text-white" />
                  <span className="animate-pulse">Checking…</span>
                </>
              ) : (
                "Check"
              )}
            </button>
          </div>
          {checkResult && (
            <p className="mt-3 text-sm text-[var(--cocoa)]">{checkResult}</p>
          )}
        </details>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-[var(--cocoa)]">Submitted requests</h2>
        </div>
        {submissions.map((sub) => {
          const draft = drafts[sub.id];
          const busy = actionBusy[sub.id];
          const cardLocked = busy !== undefined;
          const pickupOrder = isPickupOrder(sub);
          const sheetRank =
            sub.pipelineStatus === "cancelled"
              ? -1
              : pipelineRankFromSheet(sub.pipelineStatus);
          const proposedCents = proposedCentsForSub(sub, draft?.proposed ?? "");
          const remainderCents =
            proposedCents != null ? Math.max(0, proposedCents - DEPOSIT_CENTS) : null;
          const depositPaid =
            sub.depositPaidAt != null ||
            sub.pipelineStatus === "deposit_paid" ||
            sub.pipelineStatus === "booked";
          const depositAwaiting =
            !depositPaid &&
            (sub.pipelineStatus === "deposit_requested" || sub.depositRequestedAt != null);

          const quoteFieldsOnly = (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs sm:col-span-2">
                <span className="font-semibold text-[var(--cocoa)]">Proposed ($)</span>
                <input
                  value={drafts[sub.id]?.proposed ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [sub.id]: {
                        proposed: e.target.value,
                        venmo: d[sub.id]?.venmo ?? "",
                      },
                    }))
                  }
                  disabled={cardLocked}
                  className="mt-0.5 w-full rounded-lg border border-[var(--blush)] bg-white px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="0.00"
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="font-semibold text-[var(--cocoa)]">Venmo @</span>
                <input
                  value={drafts[sub.id]?.venmo ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [sub.id]: {
                        proposed: d[sub.id]?.proposed ?? "",
                        venmo: e.target.value,
                      },
                    }))
                  }
                  disabled={cardLocked}
                  className="mt-0.5 w-full rounded-lg border border-[var(--blush)] bg-white px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="handle"
                />
              </label>
            </div>
          );

          const canRequestDeposit =
            sub.pipelineStatus !== "booked" &&
            sub.pipelineStatus !== "cancelled" &&
            sub.pipelineStatus !== "deposit_paid";

          const canMarkPaid =
            sub.pipelineStatus !== "cancelled" && sub.pipelineStatus !== "booked";

          const canConfirmBooking =
            sub.pipelineStatus !== "cancelled" && sub.pipelineStatus !== "booked";

          const requestDepositCta = (
            <button
              type="button"
              onClick={() => void requestDeposit(sub)}
              disabled={cardLocked || !canRequestDeposit}
              className="inline-flex w-full min-h-[2.75rem] items-center justify-center gap-2 rounded-lg bg-[var(--cocoa)] px-3 py-2.5 text-center text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              title={`Saves total + handle to the sheet, opens Venmo for $${DEPOSIT_USD}`}
            >
              {busy === "deposit" ? (
                <>
                  <Spinner className="text-white" />
                  <span className="animate-pulse">Sending…</span>
                </>
              ) : (
                "Request deposit"
              )}
            </button>
          );

          const depositRequestBlock = (
            <div className="space-y-3">
              {quoteFieldsOnly}
              {requestDepositCta}
              <p className="text-[10px] leading-snug text-[var(--cocoa-muted)]">
                One step: saves the handle and quote to Google Sheets, opens Venmo for the $
                {DEPOSIT_USD} deposit, and marks the job as deposit requested.
              </p>
            </div>
          );

          const quoteDetailsEditor = (
            <div className="space-y-3">
              {quoteFieldsOnly}
              <button
                type="button"
                onClick={() => void saveDraft(sub.id)}
                disabled={cardLocked}
                className="rounded-lg border border-[var(--blush)] bg-white px-3 py-2 text-xs font-semibold text-[var(--cocoa)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "save" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner />
                    Saving…
                  </span>
                ) : (
                  "Save quote to sheet (no Venmo)"
                )}
              </button>
            </div>
          );

          const pricingStack = (
            <div className="space-y-3 rounded-lg border border-[var(--blush)]/90 bg-[var(--cream)]/30 p-3 sm:p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--cocoa)]">
                  Proposed total
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-[var(--cocoa)]">
                  {proposedCents != null ? (
                    <>${formatMoneyCents(proposedCents)}</>
                  ) : (
                    <span className="text-sm font-normal text-[var(--cocoa-muted)]">
                      Enter amount in details
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--blush)]/80 pt-3">
                <span className="text-sm font-semibold text-[var(--cocoa)]">
                  Deposit ({`$${DEPOSIT_USD}`})
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  {depositPaid ? (
                    <>
                      <span
                        className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white"
                        title="Deposit received"
                      >
                        ✓
                      </span>
                      <span className="text-sm text-emerald-900">Received</span>
                    </>
                  ) : depositAwaiting ? (
                    <>
                      <span
                        className="flex size-6 items-center justify-center rounded-full border border-amber-400 text-amber-800"
                        title="Awaiting client payment"
                      >
                        ○
                      </span>
                      <span className="text-sm text-amber-950">Awaiting payment</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="flex size-6 items-center justify-center rounded-full border border-[var(--blush)] text-[var(--cocoa-muted)]"
                        title="Deposit not requested"
                      >
                        —
                      </span>
                      <span className="text-sm text-[var(--cocoa-muted)]">Not requested</span>
                    </>
                  )}
                </span>
              </div>
              {proposedCents != null && (
                <div className="space-y-1 border-t border-[var(--blush)]/80 pt-3 font-mono text-sm tabular-nums text-[var(--cocoa)]">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--cocoa-muted)]">Proposed</span>
                    <span>${formatMoneyCents(proposedCents)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--cocoa-muted)]">− Deposit</span>
                    <span>− ${formatMoneyCents(DEPOSIT_CENTS)}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-dashed border-[var(--blush)] pt-2 text-base font-bold">
                    <span>Remainder (Venmo)</span>
                    <span className="text-[var(--coral)]">
                      ${formatMoneyCents(remainderCents ?? 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );

          const markPaidDoneInSheet = sub.pipelineStatus === "deposit_paid";
          const bookingDoneInSheet = sub.pipelineStatus === "booked";

          const actionGrid =
            bookingDoneInSheet ? (
              <div
                className="flex min-h-11 items-center gap-2.5 rounded-lg border border-emerald-200/90 bg-emerald-50/70 px-3 py-2.5 text-left text-sm font-semibold text-emerald-950"
                role="status"
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white"
                  aria-hidden
                >
                  ✓
                </span>
                <span className="min-w-0 leading-snug">
                  Booked in sheet{" "}
                  <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-emerald-900">
                    booked
                  </span>
                </span>
              </div>
            ) : markPaidDoneInSheet ? (
              <div className="space-y-2">
                <div
                  className="flex min-h-11 items-center gap-2.5 rounded-lg border border-emerald-200/90 bg-emerald-50/70 px-3 py-2.5 text-emerald-950"
                  role="status"
                  title="Pipeline status from your SubmitRequests sheet"
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white"
                    aria-hidden
                  >
                    ✓
                  </span>
                  <div className="min-w-0 text-left text-xs font-medium leading-snug sm:text-sm">
                    <span className="block text-emerald-950">Deposit paid — recorded</span>
                    <span className="mt-0.5 block font-mono text-[10px] font-normal uppercase tracking-wide text-emerald-800/85 sm:text-[11px]">
                      Sheet: deposit_paid
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void confirmBooking(sub.id)}
                  disabled={cardLocked || !canConfirmBooking}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--coral)] px-3 py-2.5 text-center text-sm font-bold text-white shadow-sm transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  title="Locks letters ±12h; emails .ics via Resend when env is set, else use Download calendar on the card. Confirm only when you are satisfied deposit is handled."
                >
                  {busy === "book" ? (
                    <>
                      <Spinner className="text-white" />
                      <span className="animate-pulse">Confirming…</span>
                    </>
                  ) : (
                    "Confirm booking"
                  )}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void markDepositPaid(sub.id)}
                  disabled={cardLocked || !canMarkPaid}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--blush)] bg-white px-2 py-2.5 text-center text-xs font-semibold leading-snug text-[var(--cocoa)] transition hover:bg-[var(--cream)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                  title="Manual step when you have the deposit in Venmo"
                >
                  {busy === "paid" ? (
                    <>
                      <Spinner className="text-[var(--cocoa)]" />
                      <span className="animate-pulse">Updating…</span>
                    </>
                  ) : (
                    "Mark as paid"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmBooking(sub.id)}
                  disabled={cardLocked || !canConfirmBooking}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[var(--coral)] px-2 py-2.5 text-center text-xs font-bold leading-snug text-white shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                  title="You can confirm before marking paid if you choose; locks letters ±12h when used."
                >
                  {busy === "book" ? (
                    <>
                      <Spinner className="text-[var(--coral)]" />
                      <span className="animate-pulse">Confirming…</span>
                    </>
                  ) : (
                    "Confirm booking"
                  )}
                </button>
              </div>
            );

          return (
            <article
              key={sub.id}
              className="rounded-xl border border-[var(--blush)]/90 bg-[var(--card)] p-3 sm:p-4"
            >
              <div className="flex gap-2 sm:gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <h3 className="text-base font-semibold leading-tight text-[var(--cocoa)]">
                      {sub.contactName}
                    </h3>
                    <div className="flex items-center gap-2">
                      {pickupOrder ? (
                        <span className="shrink-0 rounded-md border border-[var(--blush)] bg-[var(--cream)] px-2 py-0.5 text-[10px] font-semibold uppercase leading-none text-[var(--cocoa-muted)] sm:text-xs">
                          Pickup
                        </span>
                      ) : null}
                      <span className="text-[10px] font-medium text-[var(--cocoa-muted)] sm:text-xs">
                        {formatTimeAgo(sub.createdAt)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none sm:text-xs ${pipelineStatusBadgeClasses(sub.pipelineStatus)}`}
                      >
                        {sub.pipelineStatus.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs leading-snug text-[var(--cocoa-muted)]">
                    <span className="break-all">{sub.contactEmail}</span>
                    {sub.contactPhone?.trim() ? (
                      <span className="text-[var(--cocoa)]"> · {sub.contactPhone}</span>
                    ) : null}
                  </p>
                  {sub.pipelineStatus !== "cancelled" &&
                  phoneDigitsForSmsWa(sub.contactPhone) ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => welcomeClientSms(sub)}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--cocoa)] bg-[var(--cocoa)] px-3 py-1.5 text-center text-[11px] font-semibold text-white transition hover:brightness-110 active:scale-[0.99] sm:text-xs"
                          title="Opens SMS/Messages with a welcome note (sends from your phone)"
                        >
                          Text welcome
                        </button>
                        <button
                          type="button"
                          onClick={() => welcomeClientWhatsApp(sub)}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--blush)] bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-[var(--cocoa)] transition hover:bg-[var(--cream)] active:scale-[0.99] sm:text-xs"
                          title="Opens WhatsApp with the same prefilled message"
                        >
                          WhatsApp welcome
                        </button>
                        {pageMessengerUrl ? (
                          <a
                            href={pageMessengerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--blush)] bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-[var(--cocoa)] transition hover:bg-[var(--cream)] sm:text-xs"
                            title="Opens your Facebook Page Messenger inbox (not the client’s number)"
                          >
                            Page Messenger
                          </a>
                        ) : null}
                      </div>
                      <p className="text-[10px] leading-snug text-[var(--cocoa-muted)]">
                        Text/WhatsApp use the number on this request and open{" "}
                        <strong className="font-semibold text-[var(--cocoa)]">your</strong> phone’s
                        app with a prefilled message. Facebook Messenger cannot start a chat from a
                        phone number via a link—use Page Messenger for your business inbox, or text
                        the client.
                      </p>
                    </div>
                  ) : sub.pipelineStatus !== "cancelled" ? (
                    <p className="text-[10px] text-[var(--cocoa-muted)]">
                      Add a phone on the quote form to enable{" "}
                      <span className="font-medium text-[var(--cocoa)]">Text welcome</span> /{" "}
                      WhatsApp.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug text-[var(--cocoa)] sm:text-xs">
                    <span className="font-medium capitalize text-[var(--cocoa-muted)]">
                      {eventTypeLabel(sub.eventType)}
                    </span>
                    <span className="text-[var(--blush)]" aria-hidden>
                      ·
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <IconCalendar className="size-3.5 shrink-0 text-[var(--cocoa-muted)]" />
                      {formatEventDateLong(sub.eventDate)}
                    </span>
                    <span className="text-[var(--blush)]" aria-hidden>
                      ·
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <IconClock className="size-3.5 shrink-0 text-[var(--cocoa-muted)]" />
                      {formatTime12h(sub.eventTimeLocal)}
                    </span>
                  </div>
                  <p className="flex items-start gap-1 text-[11px] leading-snug text-[var(--cocoa-muted)] sm:text-xs">
                    <IconMapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--cocoa-muted)]" />
                    <span className="min-w-0">{compactLocationLine(sub)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-2.5 border-t border-[var(--blush)]/70 pt-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cocoa-muted)]">
                    Letters
                  </span>
                  <div
                    className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-[var(--blush)] bg-[var(--cream)]/50 px-2 py-1.5"
                    aria-label={`Lettering: ${sub.letteringRaw || "none"}`}
                  >
                    <LetteringPerLetter text={sub.letteringRaw} compact />
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-[var(--blush)]/90 bg-[var(--cream)]/35 p-3 sm:p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cocoa-muted)]">
                  Next step
                </p>
                <div className="mt-2 space-y-2.5">
                  {(sub.pipelineStatus === "pending_request" ||
                    sub.pipelineStatus === "deposit_requested") && (
                    <>
                      {sub.pipelineStatus === "deposit_requested" ? (
                        <p className="text-xs leading-snug text-[var(--cocoa-muted)]">
                          Waiting for ${DEPOSIT_USD} in Venmo.
                          {(drafts[sub.id]?.venmo ?? sub.venmoHandle ?? "").trim() ? (
                            <span className="mt-0.5 block font-mono text-sm text-[var(--cocoa)]">
                              @
                              {(drafts[sub.id]?.venmo ?? sub.venmoHandle ?? "")
                                .trim()
                                .replace(/^@/, "")}
                            </span>
                          ) : null}
                          You can tap Request deposit again to reopen Venmo.
                        </p>
                      ) : null}
                      {depositRequestBlock}
                    </>
                  )}
                  {sub.pipelineStatus === "deposit_paid" && (
                    <p className="text-xs leading-snug text-[var(--cocoa-muted)]">
                      Sheet status is{" "}
                      <span className="font-mono font-semibold text-[var(--cocoa)]">
                        deposit_paid
                      </span>
                      . When you are ready, use{" "}
                      <span className="font-semibold text-[var(--cocoa)]">Confirm booking</span>{" "}
                      below (writes letter holds + sets{" "}
                      <span className="font-mono text-[11px] text-[var(--cocoa)]">booked</span> in
                      the sheet).
                    </p>
                  )}
                  {sub.pipelineStatus === "booked" && (
                    <>
                      <p className="text-xs leading-snug text-[var(--cocoa-muted)]">
                        Booked — remainder via Venmo anytime.
                      </p>
                      {icsFallbackById[sub.id] ? (
                        <div className="space-y-2 rounded-lg border border-[var(--blush)] bg-[var(--card)] p-3">
                          <p className="text-[11px] leading-snug text-[var(--cocoa-muted)]">
                            Calendar invite was not emailed automatically. Add{" "}
                            <code className="rounded bg-white/80 px-1 text-[10px]">
                              RESEND_API_KEY
                            </code>
                            ,{" "}
                            <code className="rounded bg-white/80 px-1 text-[10px]">
                              RESEND_FROM_EMAIL
                            </code>
                            , and{" "}
                            <code className="rounded bg-white/80 px-1 text-[10px]">
                              BUSINESS_OWNER_EMAIL
                            </code>{" "}
                            to <code className="rounded bg-white/80 px-1 text-[10px]">.env</code>{" "}
                            (restart <code className="rounded bg-white/80 px-1 text-[10px]">npm run dev</code>
                            ) or Netlify env, then redeploy. Meanwhile you can download the same{" "}
                            <code className="rounded bg-white/80 px-1 text-[10px]">.ics</code> file
                            the emails would attach.
                          </p>
                          <button
                            type="button"
                            onClick={() => downloadIcs(icsFallbackById[sub.id])}
                            className="w-full rounded-lg bg-[var(--cocoa)] px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99] sm:w-auto"
                          >
                            Download calendar (.ics)
                          </button>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openVenmoRemainder(sub)}
                        disabled={
                          cardLocked || remainderCents == null || remainderCents <= 0
                        }
                        className="w-full rounded-lg border border-[var(--blush)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--cocoa)] transition hover:bg-[var(--cream)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                      >
                        {remainderCents != null && remainderCents > 0
                          ? `Send remainder ($${formatMoneyCents(remainderCents)})`
                          : `No remainder (total ≤ $${DEPOSIT_USD})`}
                      </button>
                    </>
                  )}
                  {sub.pipelineStatus === "cancelled" && (
                    <p className="text-xs text-[var(--cocoa-muted)]">
                      Cancelled — no further actions.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-2.5 space-y-2 rounded-lg border border-[var(--blush)]/90 bg-[var(--cream)]/25 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cocoa-muted)]">
                  Quick actions
                </p>
                {feedbackById[sub.id] ? (
                  <p className="text-center text-[11px] font-medium text-[var(--cocoa)] animate-pulse">
                    {feedbackById[sub.id]}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => openVenmoRemainder(sub)}
                  disabled={
                    cardLocked ||
                    sub.pipelineStatus === "cancelled" ||
                    remainderCents == null ||
                    remainderCents <= 0
                  }
                  className="w-full rounded-lg border border-[var(--cocoa)] bg-[var(--cocoa)] px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  title="Opens Venmo for the balance after the deposit"
                >
                  {remainderCents != null && remainderCents > 0
                    ? `Send remainder ($${formatMoneyCents(remainderCents)})`
                    : `Send remainder (set proposed total above $${DEPOSIT_USD})`}
                </button>
                {actionGrid}
              </div>

              <details className="group mt-3 overflow-hidden rounded-lg border border-[var(--blush)]/90 bg-[var(--card)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-[var(--cocoa)] sm:text-sm [&::-webkit-details-marker]:hidden">
                  <span>Event details, pricing &amp; all actions</span>
                  <ChevronDetails className="shrink-0 text-[var(--cocoa-muted)] transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-[var(--blush)] px-4 pb-4 pt-4">
                  <p className="font-mono text-xs text-[var(--cocoa-muted)]">{sub.id}</p>
                  <p className="text-sm capitalize text-[var(--cocoa-muted)]">
                    {pickupOrder ? "pickup order" : eventTypeLabel(sub.eventType)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa)]">
                    <span className="inline-flex items-center gap-1.5">
                      <IconCalendar className="shrink-0 text-[var(--cocoa-muted)]" />
                      {formatEventDateLong(sub.eventDate)}
                    </span>
                    <span className="text-[var(--cocoa-muted)]">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <IconClock className="shrink-0 text-[var(--cocoa-muted)]" />
                      {formatTime12h(sub.eventTimeLocal)}
                    </span>
                  </div>
                  <p className="flex items-start gap-2 text-sm text-[var(--cocoa-muted)]">
                    <IconMapPin className="mt-0.5 shrink-0 text-[var(--cocoa-muted)]" />
                    <span>
                      {pickupOrder ? (
                        "Local pickup order"
                      ) : (
                        <>
                          {sub.eventAddressLine1}, {sub.eventCity}, {sub.eventState}{" "}
                          {sub.eventPostalCode}
                          <span className="text-[var(--cocoa)]">
                            {sub.setupOutdoor ? " · Outdoor setup" : " · Indoor setup"}
                          </span>
                        </>
                      )}
                    </span>
                  </p>

                  <ol className="grid gap-1.5 text-xs sm:grid-cols-4 sm:gap-2">
                    {(
                      [
                        { step: 0 as const, n: "1.", text: "Quote + Venmo" },
                        {
                          step: 1 as const,
                          n: "2.",
                          text: `$${DEPOSIT_USD} link sent`,
                        },
                        { step: 2 as const, n: "3.", text: "Deposit received" },
                        { step: 3 as const, n: "4.", text: "Booked + holds" },
                      ] as const
                    ).map(({ step, n, text }) => {
                      if (sheetRank < 0) {
                        return (
                          <li
                            key={step}
                            className="rounded-md border border-stone-200/90 bg-stone-50/90 px-2 py-1.5 text-[11px] text-stone-600 sm:py-2 sm:text-xs"
                          >
                            <span className="font-semibold text-stone-700">{n}</span> {text}
                          </li>
                        );
                      }
                      const done = sheetStepDone(sheetRank, step);
                      const current = sheetStepCurrent(sheetRank, step);
                      return (
                        <li
                          key={step}
                          className={sheetWorkflowStepLiClasses(step, done, current)}
                          title="Colors match pipeline stages on SubmitRequests sheet"
                        >
                          <span className="font-bold">
                            {done ? "✓ " : ""}
                            {n}
                          </span>{" "}
                          {text}
                        </li>
                      );
                    })}
                  </ol>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                      Quote &amp; deposit math
                    </p>
                    <div className="mt-2">{pricingStack}</div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                      Edit proposed total &amp; Venmo
                    </p>
                    <div className="mt-2">{quoteDetailsEditor}</div>
                  </div>

                  <p className="text-xs text-[var(--cocoa-muted)]">
                    All major actions are available above in Quick actions.
                  </p>

                  {sub.pipelineStatus === "booked" && (
                    <p className="text-xs text-[var(--cocoa-muted)]">
                      Official booking: letters in this phrase are reserved for the event window
                      (±12h). Open the Availability check above to verify future requests.
                    </p>
                  )}
                </div>
              </details>
            </article>
          );
        })}
        {submissions.length === 0 && (
          <p className="text-[var(--cocoa-muted)]">No submissions yet.</p>
        )}
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--cocoa-muted)]">
          <strong className="text-[var(--cocoa)]">Workflow:</strong> (1) Enter{" "}
          <strong>proposed total</strong> and <strong>Venmo @</strong>, then tap{" "}
          <strong>Request deposit</strong>—that saves to the sheet and opens Venmo for $
          {DEPOSIT_USD}. (2) When you have the deposit, tap <strong>Mark as paid</strong>{" "}
          (available any time before booking). (3) When you are ready for official holds, tap{" "}
          <strong>Confirm booking</strong>. <strong>Send remainder</strong> uses proposed
          total − ${DEPOSIT_USD} and stays available <strong>any time</strong> (even after
          booking) until you cancel the job. (4) Confirm booking emails a calendar{" "}
          <strong>.ics</strong> to the client and <strong>BUSINESS_OWNER_EMAIL</strong> when{" "}
          <strong>Resend</strong> env vars are set (see
          <code className="mx-1 rounded bg-[var(--cream)] px-1 text-xs">.env.example</code>
          ); otherwise use <strong>Download calendar (.ics)</strong> on the card. Confirm also{" "}
          <strong>locks letters</strong> for this event: each A–Z in the phrase is
          reserved for <strong>12 hours before through 12 hours after</strong> the event
          time (overlap checks; sheet quantities are not reduced).
        </p>
      </section>
    </div>
  );
}
