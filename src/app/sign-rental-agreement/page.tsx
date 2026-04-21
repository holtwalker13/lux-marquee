import { Suspense } from "react";
import { SignRentalAgreementClient } from "@/components/SignRentalAgreementClient";

export default function SignRentalAgreementPage() {
  return (
    <div className="relative min-h-screen flex-1 bg-[var(--cream)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
      >
        <div className="absolute -left-32 top-20 h-72 w-72 rounded-full bg-[var(--blush)] blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-[#fce4ec] blur-3xl" />
      </div>
      <Suspense
        fallback={
          <main className="relative mx-auto max-w-xl px-4 py-16 text-center text-[var(--cocoa-muted)]">
            Loading…
          </main>
        }
      >
        <SignRentalAgreementClient />
      </Suspense>
    </div>
  );
}
