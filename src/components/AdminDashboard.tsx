"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

function downloadIcs(content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "marquee-booking.ics";
  a.click();
  URL.revokeObjectURL(url);
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

  const load = useCallback(async () => {
    const [sRes, iRes] = await Promise.all([
      fetch("/api/admin/submissions"),
      fetch("/api/admin/inventory"),
    ]);
    if (sRes.status === 401 || iRes.status === 401) {
      router.push("/admin/login");
      return;
    }
    const sData = (await sRes.json()) as { submissions?: Submission[] };
    const iData = (await iRes.json()) as {
      letters?: InvLetter[];
      source?: string;
    };
    setSubmissions(sData.submissions ?? []);
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
    setLoading(false);
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
    const res = await fetch(`/api/admin/submissions/${id}/request-deposit`, {
      method: "POST",
    });
    const data = (await res.json()) as { error?: string; venmoUrl?: string };
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

  if (loading) {
    return <p className="text-[var(--cocoa-muted)]">Loading…</p>;
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

      <section className="space-y-6">
        <h2 className="font-semibold text-[var(--cocoa)]">Submitted requests</h2>
        {submissions.map((sub) => (
          <article
            key={sub.id}
            className="rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-[var(--cocoa-muted)]">
                  {sub.id}
                </p>
                <p className="text-lg font-semibold text-[var(--cocoa)]">
                  {sub.contactName} · {sub.contactEmail}
                </p>
                <p className="text-sm text-[var(--cocoa-muted)]">
                  {sub.eventType} · {sub.eventDate.slice(0, 10)} @{" "}
                  {sub.eventTimeLocal} · {sub.letteringRaw}
                </p>
                <p className="text-xs text-[var(--cocoa-muted)]">
                  {sub.eventAddressLine1}, {sub.eventCity}, {sub.eventState}{" "}
                  {sub.eventPostalCode}
                  {sub.setupOutdoor ? " · outdoor setup" : " · indoor"}
                </p>
              </div>
              <span className="rounded-full bg-[var(--blush)] px-3 py-1 text-xs font-bold uppercase text-[var(--cocoa)]">
                {sub.pipelineStatus.replace(/_/g, " ")}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold text-[var(--cocoa)]">
                  Proposed total ($)
                </span>
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
                  className="mt-1 w-full rounded-xl border border-[var(--blush)] px-3 py-2"
                  placeholder="0.00"
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-[var(--cocoa)]">
                  Venmo @handle
                </span>
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
                  className="mt-1 w-full rounded-xl border border-[var(--blush)] px-3 py-2"
                  placeholder="YourStudioName"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveDraft(sub.id)}
                className="rounded-xl border border-[var(--blush)] px-3 py-2 text-sm font-semibold"
              >
                Save quote & Venmo
              </button>
              <button
                type="button"
                onClick={() => void requestDeposit(sub.id)}
                disabled={
                  sub.pipelineStatus === "booked" ||
                  sub.pipelineStatus === "cancelled"
                }
                className="rounded-xl bg-[#008cff] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Send $100 deposit request (opens Venmo)
              </button>
              <button
                type="button"
                onClick={() => void markDepositPaid(sub.id)}
                disabled={sub.pipelineStatus !== "deposit_requested"}
                className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Mark deposit paid
              </button>
              <button
                type="button"
                onClick={() => void confirmBooking(sub.id)}
                disabled={sub.pipelineStatus !== "deposit_paid"}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Confirm booking + calendar
              </button>
            </div>
          </article>
        ))}
        {submissions.length === 0 && (
          <p className="text-[var(--cocoa-muted)]">No submissions yet.</p>
        )}
      </section>
    </div>
  );
}
