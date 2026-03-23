# Product Requirements Document: Client Quote Questionnaire (Lux Marquee)

## 1. Problem statement

The business sells large light-up marquee letters. Clients need a **self-serve way** to describe their event, specify **exact lettering**, see a **credible price estimate** based on **per-character pricing**, and **submit a lead** that lands in a **contact submissions table** for follow-up—without back-and-forth DMs for basic info.

## 2. Personas

| Persona | Goal | Constraints |
|--------|------|----------------|
| **Client** (bride, new mom, party planner) | Get a quick estimate and request a quote | Mobile, low patience, non-technical |
| **Owner** (sign maker) | Accurate leads with lettering + date + contact | Needs tamper-resistant totals and structured data |

## 3. Goals and non-goals

**In scope (v1)**

- Shareable web flow: schedule → lettering → live estimate → contact + submit.
- Per-glyph prices from an authoritative store (database).
- Server-side recomputation of totals on submit.
- Light, modern, playful UI with strong typography.

**Out of scope (v1)**

- Owner admin UI for editing prices (use seed/migrations or direct DB).
- Payments, calendar conflict detection, automated email (can be added later).

## 4. User flow (wireframe-level)

1. **Schedule** — Event type + event date (+ optional notes).
2. **Lettering** — Text field: “What should the letters spell?” Examples: `3`, `SMITH`, `BABY GIRL`.
3. **Estimate** — Sticky/summary card: **estimated total** + expandable **per-character breakdown** (grouped counts × unit price).
4. **Contact** — Name, email, phone (optional), consent checkbox.
5. **Submit** — Success state with expectation-setting copy.

```text
┌─────────────────────────────────────┐
│  Hero + step indicator (1–3)        │
├─────────────────────────────────────┤
│  [ Event type ]  [ Event date ]     │
│  [ Lettering input            ]     │
│  ┌─────────────────────────────┐   │
│  │ Estimate: $XXX              │   │
│  │ [▼ Breakdown]               │   │
│  └─────────────────────────────┘   │
│  [ Name ] [ Email ] [ Phone ]       │
│  [x] I agree to be contacted        │
│  [ Submit request ]                 │
└─────────────────────────────────────┘
```

## 5. Business rules: lettering and pricing (glyph rules)

| Rule | Decision |
|------|-----------|
| **Normalization** | Unicode NFC; trim edges; **letters uppercased** for lookup; digits unchanged. |
| **Billable characters** | Each **non-space** character that exists in the **active price table**. |
| **Spaces** | **Not billed** (no physical letter). |
| **Allowed character set** | `A–Z`, `0–9`, space, `&`, `-`, `'` (apostrophe). Other characters **block submit** with a clear error. |
| **Unknown mapped character** | If a character is allowed by regex but missing from DB (misconfiguration), **block submit** and show configuration error. |
| **Max length** | **48** characters raw input (after trim). |
| **Total calculation** | `sum(priceCents[g])` for each billable glyph `g` in order; display grouped by glyph for readability. |

## 6. Data model

### `PriceGlyph`

| Column | Type | Notes |
|--------|------|--------|
| `glyph` | `String` (PK) | Single-character key after normalization (e.g. `A`, `3`, `&`). |
| `priceCents` | `Int` | USD cents. |
| `active` | `Boolean` | Inactive glyphs cannot be priced. |
| `updatedAt` | `DateTime` | Audit. |

### `ContactSubmission`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `String` (cuid) | Primary key. |
| `createdAt` | `DateTime` | Server time. |
| `contactName` | `String` | Required. |
| `contactEmail` | `String` | Required, valid email. |
| `contactPhone` | `String?` | Optional. |
| `eventType` | `String` | Enum-like: `wedding`, `baby_shower`, `birthday`, `other`. |
| `eventDate` | `DateTime` | Date at UTC midnight or local date string resolved server-side. |
| `letteringRaw` | `String` | As entered. |
| `letteringNormalized` | `String` | After normalization. |
| `estimatedTotalCents` | `Int` | **Server-computed** at submit. |
| `priceTableVersion` | `String` | Version string derived from pricing data (see API). |
| `consentAccepted` | `Boolean` | Must be true. |
| `status` | `String` | Default `new`. |
| `metadata` | `String?` | JSON string for future fields. |

## 7. API contract

### `GET /api/prices`

**Response 200**

```json
{
  "version": "string",
  "glyphs": {
    "A": 5200,
    "B": 5000
  }
}
```

- Only **active** glyphs; values are **USD cents**.

### `POST /api/submissions`

**Request** (`application/json`)

```json
{
  "contactName": "Jane Doe",
  "contactEmail": "jane@example.com",
  "contactPhone": "555-0100",
  "eventType": "wedding",
  "eventDate": "2026-06-15",
  "lettering": "LOVE",
  "notes": "Outdoor setup after 4pm",
  "consentAccepted": true,
  "website": ""
}
```

- `website` — **Honeypot**; must be empty.
- `eventDate` — ISO date `YYYY-MM-DD`.

**Response 201**

```json
{
  "id": "clxx…",
  "estimatedTotalCents": 20800,
  "estimatedTotalFormatted": "$208.00"
}
```

**Errors**

- `400` — validation (email, date, lettering, consent, honeypot, unknown characters).
- `500` — server/database failure.

**Server behavior**

1. Validate payload.
2. Normalize lettering; validate allowed charset and length.
3. Load active `PriceGlyph` rows; compute `version` string (deterministic).
4. Compute `estimatedTotalCents` from DB prices only.
5. Insert `ContactSubmission` with computed total and version.
6. Return `201` with id and formatted total.

## 8. UX copy (key strings)

- **Title**: “Plan your marquee letters”
- **Subtitle**: “Tell us about your celebration—we’ll follow up with a confirmed quote.”
- **Lettering label**: “What should the letters spell?”
- **Estimate disclaimer**: “This is an estimate. Taxes, delivery, or setup may apply. We’ll confirm your final quote by email.”
- **Success**: “You’re all set! We’ve received your request and will get back to you soon.”

## 9. Visual design

- **Tone**: Light, airy, **playful/cutesy**, modern; avoid clutter.
- **Palette**: Warm cream background, soft blush/coral accents, deep cocoa text.
- **Typography**: **Fraunces** (soft editorial display) for headings; **Nunito** (rounded, friendly) for UI body—loaded via `next/font/google`.
- **Components**: Rounded cards, soft shadows on the **estimate** card, clear step labels, large touch targets.

## 10. Acceptance criteria

- [ ] User can complete event type, date, lettering, contact, and consent without help.
- [ ] Estimate updates as lettering changes (from `GET /api/prices` data + client-side breakdown).
- [ ] Submitting sends `POST /api/submissions`; server **recomputes** total from DB; stored row matches server math.
- [ ] Invalid characters or over-length lettering cannot submit.
- [ ] Honeypot filled → request rejected.
- [ ] Layout and typography meet **§9** on mobile and desktop.

## 11. NFR

- Mobile-first; WCAG-minded contrast on light theme.
- Debounced estimate UI (~200ms) optional if input feels heavy.
- Rate limiting: recommended in production (not required for local dev).
