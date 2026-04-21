"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      contactName: string;
      alreadySigned: boolean;
      signedAtUtc: string | null;
      agreementBodyHtml: string;
      totalFeeLabel: string;
    }
  | { status: "error"; message: string };

export function SignRentalAgreementClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [load, setLoad] = useState<LoadState>(() =>
    !token
      ? { status: "error", message: "This page needs a valid link from Lux Marquee." }
      : { status: "loading" },
  );
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<{
    signedAtUtc: string;
    emailSent?: boolean;
    emailNote?: string;
  } | null>(null);

  const fetchAgreement = useCallback(async () => {
    if (!token) {
      setLoad({ status: "error", message: "This page needs a valid link from Lux Marquee." });
      return;
    }
    setLoad({ status: "loading" });
    try {
      const res = await fetch(`/api/public/rental-agreement?token=${encodeURIComponent(token)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        contactName?: string;
        alreadySigned?: boolean;
        signedAtUtc?: string | null;
        agreementBodyHtml?: string;
        totalFeeLabel?: string;
      };
      if (!res.ok) {
        setLoad({ status: "error", message: data.error || "Could not load this agreement." });
        return;
      }
      setLoad({
        status: "ready",
        contactName: String(data.contactName ?? ""),
        alreadySigned: Boolean(data.alreadySigned),
        signedAtUtc: data.signedAtUtc ?? null,
        agreementBodyHtml: String(data.agreementBodyHtml ?? ""),
        totalFeeLabel: String(data.totalFeeLabel ?? ""),
      });
    } catch {
      setLoad({ status: "error", message: "Network error. Try again." });
    }
  }, [token]);

  useEffect(() => {
    void fetchAgreement();
  }, [fetchAgreement]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/rental-agreement/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          typedFullName: typedName,
          agreedToElectronicSignature: agreed,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        alreadySigned?: boolean;
        signedAtUtc?: string;
        emailSent?: boolean;
        emailNote?: string;
      };
      if (!res.ok) {
        setSubmitError(data.error || "Could not submit.");
        return;
      }
      const at = data.signedAtUtc ?? new Date().toISOString();
      setSubmitOk({
        signedAtUtc: at,
        emailSent: data.emailSent,
        emailNote: data.emailNote,
      });
      await fetchAgreement();
    } finally {
      setSubmitting(false);
    }
  }

  if (load.status === "loading") {
    return (
      <main className="relative mx-auto max-w-xl px-4 py-16 text-center text-[var(--cocoa-muted)]">
        Loading agreement…
      </main>
    );
  }

  if (load.status === "error") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--cocoa)]">
          Agreement unavailable
        </h1>
        <p className="mt-2 text-sm text-[var(--cocoa-muted)]">{load.message}</p>
      </main>
    );
  }

  const downloadHref = `/api/public/rental-agreement/download?token=${encodeURIComponent(token)}`;
  const showForm = !load.alreadySigned && !submitOk;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 pb-20">
      <header className="mb-8 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--cocoa)]">
          Rental agreement
        </h1>
        <p className="mt-2 text-sm text-[var(--cocoa-muted)]">
          Fee basis: {load.totalFeeLabel}. Please read carefully before signing.
        </p>
      </header>

      <article
        className="rounded-2xl border border-[var(--blush)] bg-[var(--card)] p-6 pb-8 shadow-sm [&_.agreement-doc]:font-[family-name:var(--font-nunito)]"
        dangerouslySetInnerHTML={{ __html: load.agreementBodyHtml }}
      />

      {load.alreadySigned || submitOk ? (
        <section className="mt-8 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-emerald-950">
          <p className="font-semibold">You&apos;re all set — this agreement is on file.</p>
          <p className="text-sm">
            Signed{" "}
            {new Date((submitOk?.signedAtUtc ?? load.signedAtUtc)!).toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            })}
            .
          </p>
          <a
            href={downloadHref}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--coral)] px-4 py-2 text-sm font-bold text-white"
          >
            Download a copy (HTML)
          </a>
          {submitOk?.emailSent === false && submitOk.emailNote ? (
            <p className="text-xs text-emerald-900/80">{submitOk.emailNote}</p>
          ) : submitOk?.emailSent ? (
            <p className="text-xs text-emerald-900/80">A copy was sent to your email on file.</p>
          ) : null}
        </section>
      ) : null}

      {showForm ? (
        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-[var(--blush)] bg-white/90 p-5">
          <p className="text-sm text-[var(--cocoa)]">
            Type your full legal name exactly as we have it for this booking:{" "}
            <strong>{load.contactName}</strong>
          </p>
          <label className="block text-sm font-medium text-[var(--cocoa)]">
            Full legal name (electronic signature)
            <input
              type="text"
              name="typedFullName"
              autoComplete="name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--blush)] px-3 py-2 text-[var(--cocoa)]"
              placeholder={load.contactName}
              required
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--cocoa-muted)]">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1"
              required
            />
            <span>
              I agree that typing my name above constitutes my electronic signature and that this Agreement may be
              signed electronically. I agree to the terms above and I can access and keep a copy of this Agreement.
            </span>
          </label>
          {submitError ? <p className="text-sm text-rose-700">{submitError}</p> : null}
          <button
            type="submit"
            disabled={submitting || !agreed || !typedName.trim()}
            className="w-full rounded-2xl bg-[var(--cocoa)] py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Sign and submit"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
