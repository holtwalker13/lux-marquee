# Lux Marquee

Client quote form, Prisma database, optional **Google Sheets** logging for non-final requests, and an **`/admin`** queue with deposits (Venmo link), booking confirmation, **letter reservations** (±12h around event time), and optional **Resend** calendar emails.

## Setup

```bash
cp .env.example .env
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

- Public form: [http://localhost:3000](http://localhost:3000)
- Admin: [http://localhost:3000/admin/login](http://localhost:3000/admin/login) — default passcode **`123456`** in development if `ADMIN_PASSCODE` is unset; set `ADMIN_JWT_SECRET` (16+ chars) for cookie signing (required in production builds).

## Google Sheets

1. Create a spreadsheet. Add a service account from Google Cloud (Sheets API enabled) and share the doc with the service account email as **Editor**.
2. Set `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` in `.env` (use `\n` for newlines in the key when pasting into Netlify).
3. **Tab `SubmitRequests`** (or override with `GOOGLE_SHEET_PENDING_TAB`): optional **row 1** headers (append still works without them). Each new public submission appends one row with: created ISO, DB id, pipeline status, name, email, phone, event type, event date, local time, event start UTC, full address line, lettering, est. total, indoor/outdoor, outside-radius flag, miles, proposed total, Venmo handle.
4. **Tab `Inventory`** (or `GOOGLE_SHEET_INVENTORY_TAB`): column **A** = letter (`A`–`Z`), column **B** = `total_quantity`, from **row 2** down. In **Admin → Sync inventory from Google Sheet**, values are upserted into the database for availability math.

If Sheets env vars are missing, the app still runs; rows are not appended.

## Admin pipeline

| Status | Meaning |
|--------|---------|
| `pending_request` | New public submission (not finalized) |
| `deposit_requested` | Admin sent $100 deposit link (opens Venmo) |
| `deposit_paid` | You marked deposit received |
| `booked` | Confirmed: **LetterReservation** rows created, ±12h window per letter |

**Venmo:** there is no official API to “request” money; the button opens a **charge URL** for **$100** so the client can pay the saved `@handle`.

**Calendar:** set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `BUSINESS_OWNER_EMAIL` to email the same **.ics** to the client and owner. If Resend is not configured, the API still returns an **.ics** string so you can download it from the browser alert flow.

## Netlify + GitHub

- `netlify.toml` runs `prisma generate` then `next build` and uses `@netlify/plugin-nextjs`.
- **SQLite does not persist** on Netlify’s serverless filesystem. Point `DATABASE_URL` at a hosted DB (e.g. [Turso](https://turso.tech/) for SQLite, or Postgres + `provider` change), run migrations/seed there, and set the same env vars in the Netlify UI.
- Add all variables from `.env.example` that you use in production.

## Letter inventory logic

- Only **A–Z** in the normalized phrase consume physical letters (digits/symbols are ignored for stock).
- Each **booked** submission creates `LetterReservation` rows with a **blocking window** of **event start ± 12 hours** (see `RESERVATION_HALF_SPAN_HOURS` in [`src/lib/event-datetime.ts`](src/lib/event-datetime.ts)).
- Availability = `totalQuantity` (from Sheet sync + DB, or DB seed) minus overlapping **active** reservations.

## Docs

- [docs/PRD.md](docs/PRD.md)
- [docs/API.md](docs/API.md)
- [docs/UI.md](docs/UI.md)

## Stack

Next.js 16, Tailwind v4, Prisma 6, Luxon (time zones), `googleapis`, `jose` (admin JWT cookie), `ics` + optional `resend`.

Nominatim geocoding: set `NOMINATIM_USER_AGENT` when going to production traffic.
