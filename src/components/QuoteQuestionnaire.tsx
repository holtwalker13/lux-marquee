"use client";

import {
  LETTERING_MAX_LENGTH,
  normalizeLettering,
  validateLetteringNormalized,
} from "@/lib/pricing";
import { useEffect, useMemo, useState } from "react";

const EVENT_OPTIONS: { value: string; label: string; emoji: string }[] = [
  { value: "wedding", label: "Wedding", emoji: "💒" },
  { value: "baby_shower", label: "Baby shower", emoji: "🍼" },
  { value: "birthday", label: "Birthday", emoji: "🎂" },
  { value: "other", label: "Something else", emoji: "✨" },
];

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

type LocationPreview =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      distanceMiles: number;
      outsideServiceRadius: boolean;
      serviceRadiusMiles: number;
      baseLabel: string;
      matchedLabel: string;
    }
  | { status: "error"; message: string };

export function QuoteQuestionnaire() {
  const [eventType, setEventType] = useState("wedding");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("17:00");
  const [eventAddressLine1, setEventAddressLine1] = useState("");
  const [eventAddressLine2, setEventAddressLine2] = useState("");
  const [eventCity, setEventCity] = useState("");
  const [eventState, setEventState] = useState("");
  const [eventPostalCode, setEventPostalCode] = useState("");
  const [setupOutdoor, setSetupOutdoor] = useState(false);
  const [notes, setNotes] = useState("");
  const [lettering, setLettering] = useState("");
  const debouncedLettering = useDebouncedValue(lettering, 200);

  const addressKey = useMemo(
    () =>
      JSON.stringify({
        l1: eventAddressLine1.trim(),
        l2: eventAddressLine2.trim(),
        city: eventCity.trim(),
        state: eventState.trim().toUpperCase(),
        zip: eventPostalCode.trim(),
      }),
    [
      eventAddressLine1,
      eventAddressLine2,
      eventCity,
      eventState,
      eventPostalCode,
    ],
  );
  const debouncedAddressKey = useDebouncedValue(addressKey, 650);

  const [locationPreview, setLocationPreview] = useState<LocationPreview>({
    status: "idle",
  });

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string } | null>(null);

  const normalizedPreview = useMemo(
    () => normalizeLettering(debouncedLettering),
    [debouncedLettering],
  );

  const letteringValidation = useMemo(
    () => validateLetteringNormalized(normalizedPreview),
    [normalizedPreview],
  );

  const letteringFormatOk = letteringValidation === true;

  const letteringHint = useMemo(() => {
    if (normalizedPreview.length === 0) {
      return {
        tone: "muted" as const,
        text: "Add your letters above and we’ll put together a quote for you.",
      };
    }
    if (letteringValidation !== true) {
      return { tone: "error" as const, text: letteringValidation.message };
    }
    return {
      tone: "ok" as const,
      text: "Looking good! We’ll email you with a custom quote for this wording.",
    };
  }, [normalizedPreview.length, letteringValidation]);

  const addressComplete = useMemo(() => {
    const st = eventState.trim().toUpperCase();
    return (
      Boolean(eventAddressLine1.trim()) &&
      Boolean(eventCity.trim()) &&
      st.length === 2 &&
      Boolean(eventPostalCode.trim())
    );
  }, [
    eventAddressLine1,
    eventCity,
    eventState,
    eventPostalCode,
  ]);

  useEffect(() => {
    let parts: {
      l1: string;
      l2: string;
      city: string;
      state: string;
      zip: string;
    };
    try {
      parts = JSON.parse(debouncedAddressKey) as typeof parts;
    } catch {
      setLocationPreview({ status: "idle" });
      return;
    }

    const l1 = parts.l1?.trim() ?? "";
    const l2 = parts.l2?.trim() ?? "";
    const city = parts.city?.trim() ?? "";
    const state = parts.state?.trim().toUpperCase() ?? "";
    const zip = parts.zip?.trim() ?? "";

    if (!l1 || !city || state.length !== 2 || !zip) {
      setLocationPreview({ status: "idle" });
      return;
    }

    let cancelled = false;
    setLocationPreview({ status: "loading" });

    (async () => {
      try {
        const res = await fetch("/api/location-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            line1: l1,
            line2: l2 || undefined,
            city,
            state,
            postalCode: zip,
            website: "",
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          distanceMiles?: number;
          outsideServiceRadius?: boolean;
          serviceRadiusMiles?: number;
          baseLabel?: string;
          matchedLabel?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setLocationPreview({
            status: "error",
            message: data.error ?? "Could not verify address.",
          });
          return;
        }
        if (
          data.distanceMiles == null ||
          data.outsideServiceRadius == null ||
          data.serviceRadiusMiles == null ||
          !data.baseLabel ||
          !data.matchedLabel
        ) {
          setLocationPreview({
            status: "error",
            message: "Unexpected response. Try again.",
          });
          return;
        }
        setLocationPreview({
          status: "ok",
          distanceMiles: data.distanceMiles,
          outsideServiceRadius: data.outsideServiceRadius,
          serviceRadiusMiles: data.serviceRadiusMiles,
          baseLabel: data.baseLabel,
          matchedLabel: data.matchedLabel,
        });
      } catch {
        if (!cancelled) {
          setLocationPreview({
            status: "error",
            message: "Network error checking the address.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedAddressKey]);

  const { hasSchedule, hasLettering } = useMemo(() => {
    const hasSchedule = Boolean(eventDate) && addressComplete;
    const hasLettering = letteringFormatOk;
    return { hasSchedule, hasLettering };
  }, [eventDate, addressComplete, letteringFormatOk]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (honeypot.trim() !== "") return;
    if (!consent) {
      setFormError("Please agree to be contacted about your quote.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          contactName,
          contactEmail,
          contactPhone,
          eventType,
          eventDate,
          eventTime,
          eventAddressLine1,
          eventAddressLine2,
          eventCity,
          eventState: eventState.trim().toUpperCase().slice(0, 2),
          eventPostalCode,
          setupOutdoor,
          lettering,
          notes,
          consentAccepted: consent,
          website: honeypot,
        }),
      });
      const raw = await res.text();
      let data: {
        error?: string;
        details?: string;
        estimatedTotalFormatted?: string;
        id?: string;
      } = {};
      if (raw.trim()) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          setFormError(
            "The server returned an unexpected response. Check the terminal running the app.",
          );
          return;
        }
      }
      if (!res.ok) {
        const base = data.error ?? "Something went wrong.";
        const extra =
          process.env.NODE_ENV === "development" &&
          typeof data.details === "string" &&
          data.details.trim()
            ? `\n\n${data.details.trim()}`
            : "";
        setFormError(base + extra);
        return;
      }
      if (data.id) {
        setSuccess({ id: data.id });
      }
    } catch {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-10 text-center shadow-lg shadow-[#c4a59a]/15">
        <p className="font-[family-name:var(--font-display)] text-3xl font-medium text-[var(--cocoa)]">
          You’re all set!
        </p>
        <p className="mt-4 text-lg text-[var(--cocoa-muted)]">
          We’ve received your request. We’ll get back to you soon with a
          personalized quote by email.
        </p>
        <p className="mt-6 text-sm text-[var(--cocoa-muted)]">
          Reference: <code className="rounded bg-[var(--cream)] px-2 py-0.5">{success.id}</code>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-2xl space-y-10 pb-16"
      noValidate
    >
      <header className="text-center">
        <p className="font-[family-name:var(--font-display)] text-4xl font-medium tracking-tight text-[var(--cocoa)] sm:text-5xl">
          Plan your marquee letters
        </p>
        <p className="mx-auto mt-3 max-w-md text-lg text-[var(--cocoa-muted)]">
          Tell us about your celebration—we’ll follow up with a quote.
        </p>
      </header>

      <ol className="flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
        <StepPill n={1} label="Event" active={!hasSchedule} done={hasSchedule} />
        <span className="text-[var(--cocoa-muted)]">·</span>
        <StepPill n={2} label="Lettering" active={hasSchedule && !hasLettering} done={hasLettering} />
        <span className="text-[var(--cocoa-muted)]">·</span>
        <StepPill n={3} label="Contact" active={hasSchedule && hasLettering} done={false} />
      </ol>

      {/* Honeypot */}
      <div
        className="pointer-events-none absolute -left-[9999px] top-0 opacity-0"
        aria-hidden="true"
      >
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <section className="rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-6 shadow-md shadow-[#c4a59a]/10 sm:p-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--cocoa)]">
          Your event
        </h2>
        <p className="mt-1 text-[var(--cocoa-muted)]">
          When’s the big day, and where should we deliver &amp; set up? We measure
          distance from Jackson, MO to plan travel.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="mb-3 block text-sm font-semibold text-[var(--cocoa)]">
              What are we celebrating?
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EVENT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 px-2 py-3 text-center transition hover:border-[var(--coral)] ${
                    eventType === opt.value
                      ? "border-[var(--coral)] bg-[var(--blush)]"
                      : "border-transparent bg-[var(--cream)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="eventType"
                    value={opt.value}
                    checked={eventType === opt.value}
                    onChange={() => setEventType(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-2xl" aria-hidden>
                    {opt.emoji}
                  </span>
                  <span className="mt-1 text-sm font-semibold text-[var(--cocoa)]">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[var(--cocoa)]">
                Event date
              </span>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[var(--cocoa)]">
                Event time
              </span>
              <input
                type="time"
                required
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
              />
            </label>
          </div>

          <div className="sm:col-span-2">
            <span className="mb-3 block text-sm font-semibold text-[var(--cocoa)]">
              Event venue address
            </span>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                  Street address
                </span>
                <input
                  required
                  value={eventAddressLine1}
                  onChange={(e) => setEventAddressLine1(e.target.value)}
                  autoComplete="street-address"
                  placeholder="123 Main St"
                  className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                  Apt / suite <span className="font-normal normal-case">(optional)</span>
                </span>
                <input
                  value={eventAddressLine2}
                  onChange={(e) => setEventAddressLine2(e.target.value)}
                  autoComplete="address-line2"
                  placeholder="Suite 4B"
                  className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                  City
                </span>
                <input
                  required
                  value={eventCity}
                  onChange={(e) => setEventCity(e.target.value)}
                  autoComplete="address-level2"
                  className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                    State
                  </span>
                  <input
                    required
                    value={eventState}
                    onChange={(e) =>
                      setEventState(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))
                    }
                    autoComplete="address-level1"
                    inputMode="text"
                    maxLength={2}
                    placeholder="MO"
                    className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 uppercase text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--cocoa-muted)]">
                    ZIP
                  </span>
                  <input
                    required
                    value={eventPostalCode}
                    onChange={(e) => setEventPostalCode(e.target.value)}
                    autoComplete="postal-code"
                    inputMode="numeric"
                    placeholder="63755"
                    className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="sm:col-span-2">
            <span className="mb-3 block text-sm font-semibold text-[var(--cocoa)]">
              Setup location
            </span>
            <p className="mb-3 text-sm text-[var(--cocoa-muted)]">
              Outdoor installs usually need extra labor and weather planning—we’ll
              factor that into your quote.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={!setupOutdoor}
                onClick={() => setSetupOutdoor(false)}
                className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition ${
                  !setupOutdoor
                    ? "border-[var(--coral)] bg-[var(--blush)] text-[var(--cocoa)]"
                    : "border-transparent bg-[var(--cream)] text-[var(--cocoa-muted)] hover:border-[var(--blush)]"
                }`}
              >
                Indoor
              </button>
              <button
                type="button"
                aria-pressed={setupOutdoor}
                onClick={() => setSetupOutdoor(true)}
                className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition ${
                  setupOutdoor
                    ? "border-[var(--coral)] bg-[var(--blush)] text-[var(--cocoa)]"
                    : "border-transparent bg-[var(--cream)] text-[var(--cocoa-muted)] hover:border-[var(--blush)]"
                }`}
              >
                Outdoor
              </button>
            </div>
          </div>

          {addressComplete && (
            <div
              className="rounded-2xl border border-[var(--blush)] bg-[var(--cream)] px-4 py-3 text-sm sm:col-span-2"
              aria-live="polite"
            >
              {locationPreview.status === "loading" && (
                <p className="text-[var(--cocoa-muted)]">Checking address…</p>
              )}
              {locationPreview.status === "idle" && (
                <p className="text-[var(--cocoa-muted)]">
                  Enter a full address and we’ll confirm distance from our base.
                </p>
              )}
              {locationPreview.status === "error" && (
                <p className="font-medium text-red-800">{locationPreview.message}</p>
              )}
              {locationPreview.status === "ok" && (
                <div className="space-y-2 text-[var(--cocoa)]">
                  <p>
                    <span className="font-semibold">About {locationPreview.distanceMiles} mi</span>{" "}
                    from {locationPreview.baseLabel}
                    {locationPreview.outsideServiceRadius ? (
                      <span className="text-[var(--cocoa-muted)]">
                        {" "}
                        — outside our usual {locationPreview.serviceRadiusMiles}-mile radius, so
                        travel may add to your quote.
                      </span>
                    ) : (
                      <span className="text-[var(--cocoa-muted)]">
                        {" "}
                        — within our usual {locationPreview.serviceRadiusMiles}-mile radius.
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--cocoa-muted)]">
                    Matched: {locationPreview.matchedLabel}
                  </p>
                </div>
              )}
            </div>
          )}

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-[var(--cocoa)]">
              Notes <span className="font-normal text-[var(--cocoa-muted)]">(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Venue, theme colors, setup time…"
              className="w-full resize-y rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-6 shadow-md shadow-[#c4a59a]/10 sm:p-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--cocoa)]">
          What should the letters spell?
        </h2>
        <p className="mt-1 text-[var(--cocoa-muted)]">
          Examples: <span className="font-medium text-[var(--cocoa)]">3</span>,{" "}
          <span className="font-medium text-[var(--cocoa)]">LOVE</span>,{" "}
          <span className="font-medium text-[var(--cocoa)]">BABY GIRL</span> — use
          spaces between words if you like.
        </p>
        <label className="mt-6 block">
          <span className="sr-only">Lettering</span>
          <input
            type="text"
            value={lettering}
            onChange={(e) => setLettering(e.target.value)}
            maxLength={LETTERING_MAX_LENGTH}
            placeholder="Type your letters…"
            className="w-full rounded-2xl border-2 border-dashed border-[var(--blush)] bg-white px-4 py-4 font-[family-name:var(--font-display)] text-2xl tracking-wide text-[var(--cocoa)] outline-none ring-[var(--coral)] placeholder:text-[var(--cocoa-muted)] focus:border-[var(--coral)] focus:ring-2 sm:text-3xl"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="mt-2 block text-right text-xs text-[var(--cocoa-muted)]">
            {lettering.length}/{LETTERING_MAX_LENGTH}
          </span>
        </label>

        <div className="mt-6 rounded-3xl bg-gradient-to-br from-[var(--blush)] to-[#fce8e0] p-6 shadow-lg shadow-[#e8a89a]/25">
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--cocoa-muted)]">
            Your quote
          </p>
          <p
            className={`mt-3 text-lg leading-relaxed ${
              letteringHint.tone === "error"
                ? "font-medium text-red-800"
                : letteringHint.tone === "ok"
                  ? "text-[var(--cocoa)]"
                  : "text-[var(--cocoa-muted)]"
            }`}
          >
            {letteringHint.text}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--cocoa-muted)]">
            We’ll review what you’ve entered and get back to you with pricing.
            Nothing here is final until you hear from us.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--blush)] bg-[var(--card)] p-6 shadow-md shadow-[#c4a59a]/10 sm:p-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--cocoa)]">
          How can we reach you?
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-[var(--cocoa)]">
              Name
            </span>
            <input
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-[var(--cocoa)]">
              Email
            </span>
            <input
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-[var(--cocoa)]">
              Phone <span className="font-normal text-[var(--cocoa-muted)]">(optional)</span>
            </span>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full rounded-2xl border border-[var(--blush)] bg-white px-4 py-3 text-[var(--cocoa)] outline-none ring-[var(--coral)] focus:ring-2"
            />
          </label>
          <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 size-5 rounded border-[var(--blush)] text-[var(--coral)] focus:ring-[var(--coral)]"
            />
            <span className="text-sm text-[var(--cocoa-muted)]">
              I agree to be contacted about my quote and understand pricing isn’t
              final until the studio confirms.
            </span>
          </label>
        </div>

        {formError && (
          <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            !letteringFormatOk ||
            !eventDate ||
            !addressComplete ||
            !consent
          }
          className="mt-8 w-full rounded-2xl bg-[var(--coral)] py-4 text-lg font-bold text-white shadow-lg shadow-[#e07a6e]/35 transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Submit request"}
        </button>
      </section>
    </form>
  );
}

function StepPill({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-full px-4 py-2 ${
        done
          ? "bg-[var(--blush)] text-[var(--cocoa)]"
          : active
            ? "bg-[var(--coral)] text-white"
            : "bg-[var(--cream)] text-[var(--cocoa-muted)]"
      }`}
    >
      <span
        className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-white text-[var(--coral)]" : active ? "bg-white/25" : "bg-white"
        }`}
      >
        {done ? "✓" : n}
      </span>
      {label}
    </li>
  );
}
