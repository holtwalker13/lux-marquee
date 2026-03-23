import { QuoteQuestionnaire } from "@/components/QuoteQuestionnaire";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
      >
        <div className="absolute -left-32 top-20 h-72 w-72 rounded-full bg-[var(--blush)] blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-[#fce4ec] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#fff0e6] blur-3xl" />
      </div>
      <main className="relative flex flex-1 flex-col px-4 pt-12 sm:px-6 sm:pt-16">
        <QuoteQuestionnaire />
      </main>
      <footer className="relative py-8 text-center text-sm text-[var(--cocoa-muted)]">
        Lux Marquee · Light-up letters for your sweetest moments
      </footer>
    </div>
  );
}
