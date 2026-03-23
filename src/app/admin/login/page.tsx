"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }
      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
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
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="sr-only">Passcode</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full rounded-2xl border border-[var(--blush)] px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
              placeholder="Passcode"
            />
          </label>
          {error && (
            <p className="text-sm font-medium text-red-800">{error}</p>
          )}
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
