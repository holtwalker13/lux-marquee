"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
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
type ActiveTab = "submitted" | "bookings";
type RequestStage = "new_inquiry" | "quote_sent" | "deposit_requested" | "deposit_received";
type BookingTaskKey = "calendarCreated" | "welcomeSent" | "contractSent" | "balancePaid";
type BookingTasks = Record<BookingTaskKey, boolean>;
type CancelIntent = { id: string; label: string } | null;
type ConfirmBookingIntent = { id: string; clientName: string } | null;

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

function Spinner({ className }: { className?: string }) {
  return <span className={`inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className ?? ""}`} />;
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
  if (sub.pipelineStatus === "booked" || sub.pipelineStatus === "cancelled") return null;
  if (sub.pipelineStatus === "deposit_paid") return "deposit_received";
  if (sub.pipelineStatus === "deposit_requested") return "deposit_requested";
  const proposed = proposedCentsForSub(sub, draftProposed);
  return proposed && proposed > 0 ? "quote_sent" : "new_inquiry";
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
  onChange,
}: {
  activeTab: ActiveTab;
  submittedCount: number;
  bookingCount: number;
  onChange: (tab: ActiveTab) => void;
}) {
  return (
    <div className="flex gap-2 rounded-xl border border-[var(--blush)] bg-[var(--card)] p-1">
      <button
        type="button"
        onClick={() => onChange("submitted")}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === "submitted" ? "bg-[var(--cocoa)] text-white" : "text-[var(--cocoa)]"}`}
      >
        Submitted Requests ({submittedCount})
      </button>
      <button
        type="button"
        onClick={() => onChange("bookings")}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === "bookings" ? "bg-[var(--cocoa)] text-white" : "text-[var(--cocoa)]"}`}
      >
        Bookings ({bookingCount})
      </button>
    </div>
  );
}

function PaymentSummary({
  proposedCents,
  stage,
  sub,
}: {
  proposedCents: number | null;
  stage: RequestStage;
  sub: Submission;
}) {
  const received = depositReceivedForRequest(sub, stage);
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Proposed total
        </p>
        <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--cocoa)]">
          {proposedCents != null ? `$${formatMoneyCents(proposedCents)}` : "—"}
        </p>
      </div>
      <div className="rounded-lg border border-[var(--blush)]/80 bg-white/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
          Deposit
        </p>
        <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--cocoa)]">
          {received ? (
            <>
              <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
              <span className="text-emerald-800">Received</span>
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
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-5 gap-1 text-[10px] font-semibold text-[var(--cocoa-muted)]">
        {steps.map((s) => (
          <div key={s.key} className="text-center">
            <div className="mx-auto mb-0.5 flex h-5 items-center justify-center">
              {s.done ? (
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              ) : (
                <span className="size-2 rounded-full bg-[var(--blush)]/80" aria-hidden />
              )}
            </div>
            <span className={s.done ? "text-emerald-900" : ""}>{s.label}</span>
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
  const [invSource, setInvSource] = useState<string>("");
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
      const ics = parsed.data.ics?.trim() || "";
      if (ics) {
        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        if (isMobileBrowser()) {
          window.location.assign(url);
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.download = "marquee-booking.ics";
          a.click();
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      showCardFeedback(
        id,
        ics
          ? "Booking confirmed. Calendar event file opened for iPhone/import."
          : "Booking confirmed.",
      );
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
  const bookings = useMemo(
    () => submissions.filter((s) => s.pipelineStatus === "booked"),
    [submissions],
  );

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
    <div className="space-y-8">
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

      <section className="rounded-2xl border border-[var(--blush)] bg-[var(--card)] p-4">
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
        <details className="mt-4 rounded-xl border border-[var(--blush)] bg-[var(--cream)]/30 p-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cocoa)] [&::-webkit-details-marker]:hidden">
            Inventory source details
          </summary>
          <p className="mt-2 text-xs text-[var(--cocoa-muted)]">
            Source: {invSource}. This section is secondary to the booking intake workflow.
          </p>
        </details>
      </section>

      <section className="space-y-4">
        <DashboardTabs
          activeTab={activeTab}
          submittedCount={submittedRequests.length}
          bookingCount={bookings.length}
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
                const remainder = proposed != null ? Math.max(0, proposed - DEPOSIT_CENTS) : null;
                const busy = actionBusy[sub.id];
                const locked = busy !== undefined;
                const phoneDisplay = formatUsPhoneDisplay(sub.contactPhone);
                const primary = (() => {
                  if (stage === "new_inquiry") return { label: "Set quote", fn: () => void saveDraft(sub.id), disabled: !draft.proposed.trim() };
                  if (stage === "quote_sent") return { label: "Request deposit", fn: () => void requestDeposit(sub), disabled: false };
                  if (stage === "deposit_requested") return { label: "Mark deposit received", fn: () => void markDepositPaid(sub.id), disabled: false };
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
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                            <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                          </span>
                        ) : null}
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Mail className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                          <span className="min-w-0 break-all text-[var(--cocoa)]">{sub.contactEmail}</span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <PaymentSummary proposedCents={proposed} stage={stage} sub={sub} />
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
                            <Spinner className="text-white" />
                            Working…
                          </span>
                        ) : (
                          primary.label
                        )}
                      </button>
                    </div>

                    <details className="mt-3 rounded-lg border border-[var(--blush)]/80 bg-white/70 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[var(--cocoa)]">Expanded details</summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs">
                          Proposed ($)
                          <input
                            value={draft.proposed}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [sub.id]: { proposed: e.target.value, venmo: d[sub.id]?.venmo ?? "" },
                              }))
                            }
                            onBlur={() => void saveDraft(sub.id)}
                            className="mt-1 w-full rounded-lg border border-[var(--blush)] px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="text-xs">
                          Venmo @
                          <input
                            value={draft.venmo}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [sub.id]: { proposed: d[sub.id]?.proposed ?? "", venmo: e.target.value },
                              }))
                            }
                            onBlur={() => void saveDraft(sub.id)}
                            className="mt-1 w-full rounded-lg border border-[var(--blush)] px-2 py-1.5 text-sm"
                          />
                        </label>
                        <p className="text-xs text-[var(--cocoa-muted)] sm:col-span-2">
                          Balance: {remainder != null ? `$${formatMoneyCents(remainder)}` : "—"} · Created{" "}
                          {formatTimeAgo(sub.createdAt)}
                        </p>
                        <p className="text-xs text-[var(--cocoa-muted)] sm:col-span-2">ID: {sub.id}</p>
                      </div>
                    </details>

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
        ) : (
          <div className="space-y-3">
            {bookings.length === 0 ? (
              <p className="text-sm text-[var(--cocoa-muted)]">No confirmed bookings yet.</p>
            ) : (
              bookings.map((sub) => {
                const draft = drafts[sub.id] ?? { proposed: "", venmo: "" };
                const proposed = proposedCentsForSub(sub, draft.proposed);
                const remainder = proposed != null ? Math.max(0, proposed - DEPOSIT_CENTS) : null;
                const tasks = parseBookingTasks(sub.metadata);
                const phoneDisplay = formatUsPhoneDisplay(sub.contactPhone);
                const depositPaid =
                  sub.pipelineStatus === "booked" ||
                  sub.pipelineStatus === "deposit_paid" ||
                  sub.depositPaidAt != null;
                const balanceClear = remainder == null || remainder <= 0 || tasks.balancePaid;
                const busy = actionBusy[sub.id];
                const locked = busy !== undefined;
                const nextTask: BookingTaskKey | null = !tasks.calendarCreated ? "calendarCreated" : !tasks.welcomeSent ? "welcomeSent" : !tasks.contractSent ? "contractSent" : remainder != null && remainder > 0 && !tasks.balancePaid ? "balancePaid" : null;
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
                  if (nextTask === "calendarCreated") return { label: "Create calendar event", fn: () => void updateBookingTask(sub.id, "calendarCreated", true), disabled: false };
                  if (nextTask === "contractSent") return { label: "Send contract", fn: () => void updateBookingTask(sub.id, "contractSent", true), disabled: false };
                  return { label: "Mark balance paid", fn: () => void updateBookingTask(sub.id, "balancePaid", true), disabled: false };
                })();
                const primaryIsComplete = nextAction.label === "Booking complete";
                return (
                  <article key={sub.id} className="rounded-xl border border-[var(--blush)] bg-[var(--card)] p-4">
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
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="size-4 shrink-0 text-[var(--cocoa-muted)]" aria-hidden />
                              <span className="font-mono text-[var(--cocoa)] tabular-nums">{phoneDisplay}</span>
                            </span>
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
                      <PaymentSummary proposedCents={proposed} stage="deposit_received" sub={sub} />
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
                            <Spinner className="text-white" />
                            Working…
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
    </div>
  );
}
