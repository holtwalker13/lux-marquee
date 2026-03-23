# API reference

See [README.md](../README.md) for env vars and Sheets setup.

## Public

- `POST /api/submissions` — quote request; optional append to Google Sheet tab `SubmitRequests`.
- `POST /api/location-preview` — address → distance from Jackson, MO.
- `GET /api/prices` — glyph prices (internal/future use).

## Admin (cookie session after `POST /api/admin/login`)

- `POST /api/admin/login` — body `{ "passcode" }`.
- `POST /api/admin/logout`.
- `GET /api/admin/submissions` — queue.
- `PATCH /api/admin/submissions/[id]` — `{ proposedAmountDollars?, venmoHandle? }`.
- `POST /api/admin/submissions/[id]/request-deposit` — sets `deposit_requested`, returns `venmoUrl`.
- `POST /api/admin/submissions/[id]/mark-deposit-paid` — `deposit_paid`.
- `POST /api/admin/submissions/[id]/confirm-booking` — `booked` + reservations; optional Resend emails + `ics` in JSON if email skipped.
- `GET /api/admin/inventory` — letter totals (Sheet-backed when configured).
- `POST /api/admin/inventory/sync` — upsert DB from Sheet `Inventory` tab.
- `GET /api/admin/availability?phrase=&date=&time=` — A–Z overlap check.
