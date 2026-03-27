# Lux Marquee

Client quote form and **`/admin`** queue powered entirely by **Google Sheets** (submissions, per-glyph prices, letter inventory, and booking **letter reservations**). Optional **Resend** for calendar `.ics` emails.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Fill in **Google Sheets** env vars (see below). Without them, the public form returns an error when saving.

- Public form: [http://localhost:3000](http://localhost:3000)
- Admin: [http://localhost:3000/admin/login](http://localhost:3000/admin/login) — default passcode **`rekab`** in development if `ADMIN_PASSCODE` is unset; set `ADMIN_JWT_SECRET` (16+ chars) for cookie signing (required in production).

## Google Sheets

Full reference: **[docs/GOOGLE_SHEETS.md](docs/GOOGLE_SHEETS.md)** — tab layouts, **SubmitRequests** columns (A–AF), **Prices**, **LetterReservations**, **Inventory**.

1. Create a spreadsheet. Enable **Google Sheets API** in Google Cloud; create a **service account** and share the spreadsheet with its email as **Editor**.
2. Set `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` in `.env` (use `\n` for newlines in the key on Netlify).
3. Tabs:
   - **`SubmitRequests`** — every quote and admin pipeline updates live in this tab (extended header row is written/updated automatically).
   - **`Inventory`** — A = letter, B = qty from row 2 (you usually create this yourself).
   - **`Prices`** — created if missing; default glyph prices are seeded when the tab is empty.
   - **`LetterReservations`** — created if missing; rows are appended when a booking is confirmed.

Optional UX upgrade: set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to enable Google Places autocomplete suggestions on the public form street-address field.

Run `npm run sheets:headers` to force-check the SubmitRequests header row. `npm run sheets:populate` fills **Prices** (defaults if empty) and **LetterReservations** headers. `npm run test:sheets` verifies credentials.

## Admin pipeline

| Status | Meaning |
|--------|---------|
| `pending_request` | New public submission |
| `deposit_requested` | Admin sent $100 deposit link (Venmo) |
| `deposit_paid` | Deposit marked received |
| `booked` | Confirmed: reservation rows in **LetterReservations** tab, ±12h window per letter |

**Venmo:** opens a **charge URL** for **$100** using the saved `@handle`.

**Calendar:** set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `BUSINESS_OWNER_EMAIL` to email the **.ics** to client and owner. If Resend is not configured, the API still returns **.ics** in JSON for download.

## Netlify

- `netlify.toml` runs `npm run build` and `@netlify/plugin-nextjs`.
- **No database** — only Google Sheets + env vars from `.env.example`.

## Letter inventory

- Only **A–Z** in the normalized phrase consume physical letters.
- Each **booked** submission appends **LetterReservations** rows with a **blocking window** of **event start ± 12 hours** (`RESERVATION_HALF_SPAN_HOURS` in [`src/lib/event-datetime.ts`](src/lib/event-datetime.ts)).
- Availability = **Inventory** tab counts minus overlapping **active** reservations (read from the sheet).

## Docs

- [docs/PRD.md](docs/PRD.md)
- [docs/API.md](docs/API.md)
- [docs/UI.md](docs/UI.md)
- [docs/GOOGLE_SHEETS.md](docs/GOOGLE_SHEETS.md)

## Stack

Next.js 16, Tailwind v4, Luxon, `googleapis`, `jose`, `ics`, optional `resend`.

Nominatim: set `NOMINATIM_USER_AGENT` for production traffic.
