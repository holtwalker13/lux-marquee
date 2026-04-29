"use client";

import { FileText, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRentalAgreementSignature } from "@/lib/rental-agreement-metadata";

type Props = {
  submissionId: string;
  contactName: string;
  metadata: string | null;
  disabled?: boolean;
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* iOS / permission — try fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "2em";
    ta.style.height = "2em";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function RentalAgreementAdminPanel({
  submissionId,
  contactName,
  metadata,
  disabled,
}: Props) {
  const signed = getRentalAgreementSignature(metadata);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedOpen, setCopiedOpen] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function flashCopied() {
    setCopiedOpen(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => {
      setCopiedOpen(false);
      copiedTimer.current = null;
    }, 2200);
  }

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
      const ok = await copyTextToClipboard(url);
      if (ok) {
        flashCopied();
        setFeedback(null);
      } else {
        setFeedback(
          `Copy blocked on this device — select and copy this link manually:\n${url}`,
        );
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
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--blush)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--cocoa)]"
            >
              <FileText className="size-3.5" aria-hidden />
              Download PDF
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm text-[var(--cocoa-muted)]">
          <p>
            Client types their full name as on the request (<strong>{contactName}</strong>) to sign
            electronically.
          </p>
          <div className="relative inline-block">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void mintSigningLink()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--coral)]/50 bg-[var(--coral)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--cocoa)] disabled:opacity-50"
            >
              <Link2 className="size-3.5" aria-hidden />
              {busy ? "Creating…" : "Copy signing link"}
            </button>
            {copiedOpen ? (
              <span
                role="status"
                className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--cocoa)] px-2 py-1 text-[11px] font-semibold text-white shadow-md"
              >
                Copied
                <span
                  className="absolute left-1/2 top-full -ml-1 border-4 border-transparent border-t-[var(--cocoa)]"
                  aria-hidden
                />
              </span>
            ) : null}
          </div>
        </div>
      )}
      {feedback ? (
        <p className="mt-2 whitespace-pre-wrap break-all text-xs text-[var(--cocoa-muted)]">{feedback}</p>
      ) : null}
    </div>
  );
}
