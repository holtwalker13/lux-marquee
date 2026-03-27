"use client";

import { useEffect, useState } from "react";

export default function AdminLoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState(false);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      setQueryError(p.get("error") === "1");
    } catch {
      setQueryError(false);
    }
  }, []);

  async function login() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }
      // Full navigation so the session cookie is always sent on the next request (some mobile
      // browsers are flaky with client-side router transitions right after Set-Cookie).
      window.location.assign("/admin/dashboard");
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void login();
  }

  function onPasscodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void login();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--cream)] px-4">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-8 shadow-lg">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--cocoa)]">
          Admin
        </h1>
        <p className="mt-2 text-sm text-[var(--cocoa-muted)]">
          Enter the studio passcode to manage requests.
        </p>
        <form action="/admin/login/submit" method="post" onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          {/* iOS often won’t fire form submit from the “Go” key on single-field forms; second field nudges it. */}
          <input
            type="text"
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute h-0 w-0 opacity-0"
            readOnly
            defaultValue=""
          />
          <label className="block">
            <span className="sr-only">Passcode</span>
            <input
              id="admin-passcode"
              name="passcode"
              type="text"
              enterKeyHint="go"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={onPasscodeKeyDown}
              className="w-full rounded-2xl border border-[var(--blush)] px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
              placeholder="Passcode"
            />
          </label>
          {error || queryError ? (
            <p className="text-sm font-medium text-red-800">
              {error ?? "Invalid passcode."}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[var(--coral)] py-3 font-bold text-white disabled:opacity-60"
          >
            {loading ? "…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
