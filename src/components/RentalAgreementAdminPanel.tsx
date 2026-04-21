"use client";

import { FileText, Link2 } from "lucide-react";
import { useState } from "react";
import { getRentalAgreementSignature } from "@/lib/rental-agreement-metadata";

type Props = {
  submissionId: string;
  contactName: string;
  metadata: string | null;
  disabled?: boolean;
};

export function RentalAgreementAdminPanel({
  submissionId,
  contactName,
  metadata,
  disabled,
}: Props) {
  const signed = getRentalAgreementSignature(metadata);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function mintSigningLink() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/rental-agreement-link`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        setFeedback(data.error ?? "Could not create link.");
        return;
      }
      const url = String(data.url ?? "");
      if (!url) {
        setFeedback("No URL returned.");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setFeedback("Signing link copied to clipboard. Send it by text or email.");
      } catch {
        setFeedback(url);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--blush)] bg-white/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
        Rental agreement (e-sign)
      </p>
      {signed ? (
        <div className="mt-2 space-y-2 text-sm text-[var(--cocoa)]">
          <p>
            <span className="font-semibold text-emerald-800">Signed</span>{" "}
            {new Date(signed.signedAtUtc).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            as <em>{signed.typedFullName}</em>
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/admin/submissions/${submissionId}/rental-agreement-download`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--blush)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--cocoa)]"
            >
              <FileText className="size-3.5" aria-hidden />
              Download copy
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm text-[var(--cocoa-muted)]">
          <p>
            Client types their full name as on the request (<strong>{contactName}</strong>) to sign electronically.
          </p>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void mintSigningLink()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--coral)]/50 bg-[var(--coral)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--cocoa)] disabled:opacity-50"
          >
            <Link2 className="size-3.5" aria-hidden />
            {busy ? "Creating…" : "Copy signing link"}
          </button>
        </div>
      )}
      {feedback ? <p className="mt-2 text-xs text-[var(--cocoa-muted)]">{feedback}</p> : null}
    </div>
  );
}
