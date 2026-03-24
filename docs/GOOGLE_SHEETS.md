# Google Sheets — system of record

The app **does not use a SQL database**. All persistent data lives in one spreadsheet (`GOOGLE_SHEET_ID`) accessed with a **service account** (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`). Share the doc with that account as **Editor**.

| Tab | Env override | Purpose |
|-----|----------------|---------|
| **SubmitRequests** | `GOOGLE_SHEET_PENDING_TAB` | Quote rows + full admin pipeline fields (columns A–AF). |
| **Inventory** | `GOOGLE_SHEET_INVENTORY_TAB` | Physical stock: A=letter, B=qty, from row 2. |
| **Prices** | `GOOGLE_SHEET_PRICES_TAB` | Per-glyph pricing; auto-created + seeded with defaults if empty. |
| **LetterReservations** | `GOOGLE_SHEET_RESERVATIONS_TAB` | One row per letter hold when a job is **booked**; auto-created if missing. |

Helpers:

- `npm run sheets:headers` — ensure **SubmitRequests** row 1 has the full header set.
- `npm run sheets:populate` — set **Prices** header + default price rows (if tab has no data rows) and **LetterReservations** row 1 headers.
- `npm run test:sheets` — verify read Inventory + append test row (safe to delete).

---

## Tab: `SubmitRequests`

### Row 1 headers (exact labels, columns A–AF)

| Col | Header |
|-----|--------|
| A | Submitted at (UTC) |
| B | Submission ID |
| C | Pipeline status |
| D | Contact name |
| E | Email |
| F | Phone |
| G | Event type |
| H | Event date |
| I | Event time (local) |
| J | Event start (UTC) |
| K | Event address |
| L | Lettering |
| M | Estimated total |
| N | Setup |
| O | Outside radius |
| P | Distance (mi) |
| Q | Proposed total |
| R | Client Venmo |
| S | Address line 1 |
| T | Address line 2 |
| U | City |
| V | State |
| W | ZIP |
| X | Lat |
| Y | Lng |
| Z | Lettering normalized |
| AA | Price table version |
| AB | Consent accepted |
| AC | Deposit requested (ISO) |
| AD | Deposit paid (ISO) |
| AE | Booking confirmed (ISO) |
| AF | Metadata (JSON) |

**Legacy rows** with only columns A–R still load; structured address and pipeline timestamps may be inferred or left empty until the next admin save.

**Updates:** when you change pipeline status, Venmo, proposed amount, etc., the app **rewrites that row** by submission ID (column B).

---

## Tab: `Inventory`

- Row 1: optional header; data from **row 2**.
- **A** = single letter A–Z, **B** = non-negative integer quantity.

---

## Tab: `Prices`

Row 1: `glyph` | `price_cents` | `active`  

Row 2+: e.g. `A`, `5500`, `yes`

If the tab has **no data rows**, the app appends the built-in default price table once.

---

## Tab: `LetterReservations`

Row 1: `reservation_id` | `submission_id` | `letter` | `quantity_reserved` | `window_start_utc` | `window_end_utc` | `status` | `created_at`

Appended when **Confirm booking** succeeds. Used with **Inventory** for availability checks.

---

## Limits

- Google Sheets API quotas apply; the admin queue is sized for a small studio (hundreds of rows).
- Concurrent edits from two admins can race; last write to a row wins.
