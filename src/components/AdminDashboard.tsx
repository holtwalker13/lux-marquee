"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

function downloadIcs(content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "marquee-booking.ics";
  a.click();
  URL.revokeObjectURL(url);
}

function sortedSubmissions(list: Submission[]): Submission[] {
  return [...list].sort((a, b) => {
    const da = PIPELINE_ORDER[a.pipelineStatus] ?? 99;
    const db = PIPELINE_ORDER[b.pipelineStatus] ?? 99;
    if (da !== db) return da - db;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
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
  const citySt = [sub.eventCity, sub.eventState].filter(Boolean).join(", ");
  const tail = sub.setupOutdoor ? "outdoor" : "indoor";
  return [citySt, sub.eventAddressLine1, tail].filter(Boolean).join(" · ");
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

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
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
        setLoadError(sParsed.message);
        return;
      }
      if (!iParsed.ok) {
        setLoadError(iParsed.message);
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
      setLoadError(
        e instanceof Error ? e.message : "Something went wrong loading the admin data.",
      );
    } finally {
      setLoading(false);
    }
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
    try {
      const res = await fetch("/api/admin/inventory/sync", { method: "POST" });
      const data = (await res.json()) as { error?: string; count?: number };
      if (!res.ok) {
        alert(data.error ?? "Sync failed");
        return;
      }
      alert(`Synced ${data.count ?? 0} letters from Google Sheet into the database.`);
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function runAvailabilityCheck() {
    setCheckResult(null);
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
  }

  async function saveDraft(id: string) {
    const d = drafts[id];
    if (!d) return;
    const res = await fetch(`/api/admin/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposedAmountDollars: d.proposed || null,
        venmoHandle: d.venmo || null,
      }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      alert(err.error ?? "Save failed");
      return;
    }
    await load();
  }

  async function requestDeposit(id: string) {
    const d = drafts[id];
    const venmo = d?.venmo?.trim();
    if (!venmo) {
      alert(
        `Add the client's Venmo @handle in the field below, then try again. (We'll save your proposed $ and handle for you.)`,
      );
      return;
    }

    const patchRes = await fetch(`/api/admin/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposedAmountDollars: d?.proposed || null,
        venmoHandle: venmo,
      }),
    });
    if (!patchRes.ok) {
      const err = (await patchRes.json()) as { error?: string };
      alert(err.error ?? "Could not save quote / Venmo.");
      return;
    }

    const res = await fetch(`/api/admin/submissions/${id}/request-deposit`, {
      method: "POST",
    });
    const data = (await res.json()) as {
      error?: string;
      venmoUrl?: string;
      depositAmountDollars?: number;
    };
    if (!res.ok) {
      alert(data.error ?? "Failed");
      return;
    }
    if (data.venmoUrl) {
      window.open(data.venmoUrl, "_blank", "noopener,noreferrer");
    }
    await load();
  }

  async function markDepositPaid(id: string) {
    const res = await fetch(`/api/admin/submissions/${id}/mark-deposit-paid`, {
      method: "POST",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      alert(data.error ?? "Failed");
      return;
    }
    await load();
  }

  async function confirmBooking(id: string) {
    const res = await fetch(`/api/admin/submissions/${id}/confirm-booking`, {
      method: "POST",
    });
    const data = (await res.json()) as {
      error?: string;
      issues?: unknown;
      calendarEmailSent?: boolean;
      calendarEmailNote?: string;
      ics?: string;
    };
    if (!res.ok) {
      alert(
        `${data.error ?? "Failed"}${data.issues ? ` ${JSON.stringify(data.issues)}` : ""}`,
      );
      return;
    }
    const msg = data.calendarEmailSent
      ? "Booking confirmed. Calendar invites were emailed to the client and business owner."
      : `Booking confirmed. ${data.calendarEmailNote ?? "Add calendar manually if needed."}`;
    alert(msg);
    if (data.ics && !data.calendarEmailSent) {
      if (confirm("Download the .ics file to add to iPhone Calendar / Mail?")) {
        downloadIcs(data.ics);
      }
    }
    await load();
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
          B=qty from row 2), then sync.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {letters.map((l) => (
            <span
              key={l.letter}
              className="rounded-xl bg-[var(--cream)] px-3 py-1 font-mono text-sm text-[var(--cocoa)]"
            >
              {l.letter}:{l.totalQuantity}
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncInventory()}
          className="mt-4 rounded-2xl bg-[var(--coral)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync inventory from Google Sheet"}
        </button>
      </section>

      <section className="rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-6">
        <h2 className="font-semibold text-[var(--cocoa)]">Availability check</h2>
        <p className="mt-1 text-xs text-[var(--cocoa-muted)]">
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
            onClick={() => void runAvailabilityCheck()}
            className="rounded-xl bg-[var(--cocoa)] px-4 py-2 text-sm font-semibold text-white"
          >
            Check
          </button>
        </div>
        {checkResult && (
          <p className="mt-3 text-sm text-[var(--cocoa)]">{checkResult}</p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-[var(--cocoa)]">Submitted requests</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--cocoa-muted)]">
            <strong className="text-[var(--cocoa)]">Workflow:</strong> (1) Enter{" "}
            <strong>proposed total</strong> and the client&apos;s{" "}
            <strong>Venmo @handle</strong>. (2){" "}
            <strong>Send ${DEPOSIT_USD} deposit request</strong> opens Venmo with a
            charge link—the client completes payment there (Venmo has no API to auto-request
            money). <strong>Open Venmo for remainder</strong> uses proposed total − $
            {DEPOSIT_USD} and stays available <strong>any time</strong> (even after booking)
            until you cancel the job. (3) When you&apos;ve seen the ${DEPOSIT_USD} in Venmo,
            click <strong>Mark deposit paid</strong>. (4){" "}
            <strong>Confirm booking</strong> (after deposit) emails a calendar{" "}
            <strong>.ics</strong> to the client and <strong>BUSINESS_OWNER_EMAIL</strong>{" "}
            (set <strong>Resend</strong> in
            <code className="mx-1 rounded bg-[var(--cream)] px-1 text-xs">.env</code>
            ), and <strong>locks letters</strong> for this event: each A–Z in the phrase is
            reserved for <strong>12 hours before through 12 hours after</strong> the event
            time (overlap checks; sheet quantities are not reduced).
          </p>
        </div>
        {submissions.map((sub) => {
          const draft = drafts[sub.id];
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

          const quoteInputs = (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">
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
                  className="mt-0.5 w-full rounded-lg border border-[var(--blush)] bg-white px-2.5 py-1.5 text-sm"
                  placeholder="0.00"
                />
              </label>
              <label className="block text-xs">
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
                  className="mt-0.5 w-full rounded-lg border border-[var(--blush)] bg-white px-2.5 py-1.5 text-sm"
                  placeholder="handle"
                />
                <span className="mt-0.5 block text-[10px] leading-tight text-[var(--cocoa-muted)]">
                  Client handle for deposit + balance.
                </span>
              </label>
            </div>
          );

          const pricingStack = (
            <div className="space-y-3 rounded-2xl border border-[var(--blush)] bg-[var(--cream)]/40 p-4">
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
                        className="flex size-7 items-center justify-center rounded-full bg-emerald-500 text-white"
                        title="Deposit received"
                      >
                        ✓
                      </span>
                      <span className="text-emerald-800">Received</span>
                    </>
                  ) : depositAwaiting ? (
                    <>
                      <span
                        className="flex size-7 items-center justify-center rounded-full border-2 border-amber-500 text-amber-700"
                        title="Awaiting client payment"
                      >
                        ○
                      </span>
                      <span className="text-amber-900">Awaiting payment</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="flex size-7 items-center justify-center rounded-full border border-[var(--blush)] text-[var(--cocoa-muted)]"
                        title="Deposit not requested"
                      >
                        —
                      </span>
                      <span className="text-[var(--cocoa-muted)]">Not requested</span>
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

          const actionGrid = (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void saveDraft(sub.id)}
                className="rounded-xl border border-[var(--blush)] px-2 py-2.5 text-center text-xs font-semibold leading-snug sm:text-sm"
              >
                Save quote &amp; Venmo only
              </button>
              <button
                type="button"
                onClick={() => void requestDeposit(sub.id)}
                disabled={
                  sub.pipelineStatus === "booked" ||
                  sub.pipelineStatus === "cancelled"
                }
                className="rounded-xl bg-[#008cff] px-2 py-2.5 text-center text-xs font-bold leading-snug text-white disabled:opacity-40 sm:text-sm"
                title="Saves fields, then opens Venmo charge link"
              >
                Send ${DEPOSIT_USD} deposit (Venmo)
              </button>
              <button
                type="button"
                onClick={() => void markDepositPaid(sub.id)}
                disabled={sub.pipelineStatus !== "deposit_requested"}
                className="rounded-xl bg-amber-600 px-2 py-2.5 text-center text-xs font-bold leading-snug text-white disabled:opacity-40 sm:text-sm"
              >
                Mark deposit paid
              </button>
              <button
                type="button"
                onClick={() => void confirmBooking(sub.id)}
                disabled={sub.pipelineStatus !== "deposit_paid"}
                className="rounded-xl bg-emerald-600 px-2 py-2.5 text-center text-xs font-bold leading-snug text-white disabled:opacity-40 sm:text-sm"
                title="Creates letter holds ±12h; emails .ics if Resend is configured"
              >
                Confirm booking + calendar
              </button>
            </div>
          );

          return (
            <article
              key={sub.id}
              className="rounded-2xl border border-[var(--blush)] bg-[var(--card)] p-3 shadow-sm sm:p-4"
            >
              <div className="flex gap-2 sm:gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <h3 className="text-base font-semibold leading-tight text-[var(--cocoa)]">
                      {sub.contactName}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-none sm:text-xs ${
                        sub.pipelineStatus === "booked"
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-[var(--blush)] text-[var(--cocoa)]"
                      }`}
                    >
                      {sub.pipelineStatus.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs leading-snug text-[var(--cocoa-muted)]">
                    <span className="break-all">{sub.contactEmail}</span>
                    {sub.contactPhone?.trim() ? (
                      <span className="text-[var(--cocoa)]"> · {sub.contactPhone}</span>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug text-[var(--cocoa)] sm:text-xs">
                    <span className="font-medium capitalize text-[var(--cocoa-muted)]">
                      {eventTypeLabel(sub.eventType)}
                    </span>
                    <span className="text-[var(--blush)]" aria-hidden>
                      ·
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <IconCalendar className="size-3.5 shrink-0 text-[var(--coral)]" />
                      {formatEventDateLong(sub.eventDate)}
                    </span>
                    <span className="text-[var(--blush)]" aria-hidden>
                      ·
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <IconClock className="size-3.5 shrink-0 text-[var(--coral)]" />
                      {formatTime12h(sub.eventTimeLocal)}
                    </span>
                  </div>
                  <p className="flex items-start gap-1 text-[11px] leading-snug text-[var(--cocoa-muted)] sm:text-xs">
                    <IconMapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--coral)]" />
                    <span className="min-w-0">{compactLocationLine(sub)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-2.5 border-t border-[var(--blush)]/70 pt-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--cocoa-muted)]">
                    Letters
                  </span>
                  <div
                    className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border-2 border-[var(--coral)] bg-gradient-to-br from-[#fff8f6] to-[var(--cream)] px-2 py-1.5 shadow-inner shadow-[#e8d5cf]/50"
                    aria-label={`Lettering: ${sub.letteringRaw || "none"}`}
                  >
                    <LetteringPerLetter text={sub.letteringRaw} compact />
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border-2 border-[var(--coral)]/35 bg-gradient-to-br from-[#fffaf8] to-[var(--cream)]/90 p-3 sm:p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--coral)]">
                  Next step
                </p>
                <div className="mt-2 space-y-2.5">
                  {sub.pipelineStatus === "pending_request" && (
                    <>
                      {quoteInputs}
                      <button
                        type="button"
                        onClick={() => void requestDeposit(sub.id)}
                        className="w-full rounded-lg bg-[#008cff] px-3 py-2.5 text-center text-sm font-bold text-white shadow-sm shadow-[#008cff]/20 transition hover:brightness-105 sm:w-auto sm:min-w-[12rem]"
                        title="Saves fields, then opens Venmo charge link"
                      >
                        Send ${DEPOSIT_USD} deposit (opens Venmo)
                      </button>
                    </>
                  )}
                  {sub.pipelineStatus === "deposit_requested" && (
                    <>
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
                      </p>
                      <button
                        type="button"
                        onClick={() => void markDepositPaid(sub.id)}
                        className="w-full rounded-lg bg-amber-600 px-3 py-2.5 text-center text-sm font-bold text-white shadow-sm sm:w-auto sm:min-w-[12rem]"
                      >
                        Mark ${DEPOSIT_USD} deposit paid
                      </button>
                    </>
                  )}
                  {sub.pipelineStatus === "deposit_paid" && (
                    <button
                      type="button"
                      onClick={() => void confirmBooking(sub.id)}
                      className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-center text-sm font-bold text-white shadow-sm sm:w-auto sm:min-w-[14rem]"
                      title="Creates letter holds ±12h; emails .ics if Resend is configured"
                    >
                      Confirm booking + calendar invites
                    </button>
                  )}
                  {sub.pipelineStatus === "booked" && (
                    <>
                      <p className="text-xs leading-snug text-[var(--cocoa-muted)]">
                        Booked — remainder via Venmo anytime.
                      </p>
                      <button
                        type="button"
                        onClick={() => openVenmoRemainder(sub)}
                        disabled={remainderCents == null || remainderCents <= 0}
                        className="w-full rounded-lg border-2 border-[var(--coral)] bg-white px-3 py-2.5 text-sm font-bold text-[var(--coral)] transition hover:bg-[#fff8f6] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                      >
                        {remainderCents != null && remainderCents > 0
                          ? `Open Venmo for remainder ($${formatMoneyCents(remainderCents)})`
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

              <details className="group mt-3 overflow-hidden rounded-xl border border-[var(--blush)] bg-[var(--cream)]/25">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-[var(--cocoa)] sm:text-sm [&::-webkit-details-marker]:hidden">
                  <span>Event details, pricing &amp; all actions</span>
                  <ChevronDetails className="shrink-0 text-[var(--cocoa-muted)] transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-[var(--blush)] px-4 pb-4 pt-4">
                  <p className="font-mono text-xs text-[var(--cocoa-muted)]">{sub.id}</p>
                  <p className="text-sm capitalize text-[var(--cocoa-muted)]">
                    {eventTypeLabel(sub.eventType)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--cocoa)]">
                    <span className="inline-flex items-center gap-1.5">
                      <IconCalendar className="shrink-0 text-[var(--coral)]" />
                      {formatEventDateLong(sub.eventDate)}
                    </span>
                    <span className="text-[var(--cocoa-muted)]">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <IconClock className="shrink-0 text-[var(--coral)]" />
                      {formatTime12h(sub.eventTimeLocal)}
                    </span>
                  </div>
                  <p className="flex items-start gap-2 text-sm text-[var(--cocoa-muted)]">
                    <IconMapPin className="mt-0.5 shrink-0 text-[var(--coral)]" />
                    <span>
                      {sub.eventAddressLine1}, {sub.eventCity}, {sub.eventState}{" "}
                      {sub.eventPostalCode}
                      <span className="text-[var(--cocoa)]">
                        {sub.setupOutdoor ? " · Outdoor setup" : " · Indoor setup"}
                      </span>
                    </span>
                  </p>

                  <ol className="grid gap-2 text-xs text-[var(--cocoa-muted)] sm:grid-cols-4">
                    <li
                      className={`rounded-lg border px-2 py-2 ${
                        sub.pipelineStatus === "pending_request"
                          ? "border-[var(--coral)] bg-[#fff5f3]"
                          : "border-transparent bg-[var(--cream)]"
                      }`}
                    >
                      <span className="font-bold text-[var(--cocoa)]">1.</span> Quote + Venmo
                    </li>
                    <li
                      className={`rounded-lg border px-2 py-2 ${
                        sub.pipelineStatus === "deposit_requested"
                          ? "border-[var(--coral)] bg-[#fff5f3]"
                          : "border-transparent bg-[var(--cream)]"
                      }`}
                    >
                      <span className="font-bold text-[var(--cocoa)]">2.</span> ${DEPOSIT_USD}{" "}
                      link sent
                    </li>
                    <li
                      className={`rounded-lg border px-2 py-2 ${
                        sub.pipelineStatus === "deposit_paid"
                          ? "border-[var(--coral)] bg-[#fff5f3]"
                          : "border-transparent bg-[var(--cream)]"
                      }`}
                    >
                      <span className="font-bold text-[var(--cocoa)]">3.</span> Deposit received
                    </li>
                    <li
                      className={`rounded-lg border px-2 py-2 ${
                        sub.pipelineStatus === "booked"
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-transparent bg-[var(--cream)]"
                      }`}
                    >
                      <span className="font-bold text-[var(--cocoa)]">4.</span> Booked + holds
                    </li>
                  </ol>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                      Quote &amp; deposit math
                    </p>
                    <div className="mt-2">{pricingStack}</div>
                  </div>

                  {sub.pipelineStatus !== "pending_request" ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                        Edit proposed total &amp; Venmo
                      </p>
                      <div className="mt-2">{quoteInputs}</div>
                    </div>
                  ) : null}

                  <div>
                    <button
                      type="button"
                      onClick={() => openVenmoRemainder(sub)}
                      disabled={
                        sub.pipelineStatus === "cancelled" ||
                        remainderCents == null ||
                        remainderCents <= 0
                      }
                      className="w-full rounded-xl border-2 border-[var(--coral)] bg-white px-3 py-2.5 text-sm font-bold text-[var(--coral)] shadow-sm transition hover:bg-[#fff8f6] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                      title="Opens Venmo for the balance after the deposit"
                    >
                      {remainderCents != null && remainderCents > 0
                        ? `Open Venmo for remainder ($${formatMoneyCents(remainderCents)})`
                        : `Open Venmo for remainder (proposed total must exceed $${DEPOSIT_USD})`}
                    </button>
                  </div>

                  {actionGrid}

                  {sub.pipelineStatus === "booked" && (
                    <p className="text-xs text-emerald-800">
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
      </section>
    </div>
  );
}
