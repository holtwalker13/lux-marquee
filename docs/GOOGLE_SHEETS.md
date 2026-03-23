# Google Sheets integration

The app can log each **new public form submission** to a spreadsheet and read **letter inventory** for admin availability. Configure `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` in `.env`, and share the spreadsheet with the service account as **Editor**.

See [README.md](../README.md) for env setup.

- **Headers only:** `npm run sheets:headers`
- **Append every DB submission** (e.g. after seeding mocks): `npm run sheets:push-submissions` — re-run appends **duplicate** rows unless you clear data below row 1 first.

---

## Tab: `SubmitRequests`

Default tab name: **`SubmitRequests`**. Override with `GOOGLE_SHEET_PENDING_TAB`.

### When rows are written

Only **`POST /api/submissions`** (public quote form) triggers an append. Admin edits and pipeline changes **do not** sync to this tab automatically.

### Row 1 headers

The app writes these **exact** labels to **row 1** (columns **A–R**) the first time it appends, or when row 1 is empty. If data already started on row 1 (e.g. an ISO timestamp in **A1**), the app **inserts a row above** and puts headers on the new row 1.

Use this table to match your sheet or to build a template in Google Sheets:

| Column | Header label (exact) |
|--------|----------------------|
| **A** | Submitted at (UTC) |
| **B** | Submission ID |
| **C** | Pipeline status |
| **D** | Contact name |
| **E** | Email |
| **F** | Phone |
| **G** | Event type |
| **H** | Event date |
| **I** | Event time (local) |
| **J** | Event start (UTC) |
| **K** | Event address |
| **L** | Lettering |
| **M** | Estimated total |
| **N** | Setup |
| **O** | Outside radius |
| **P** | Distance (mi) |
| **Q** | Proposed total |
| **R** | Client Venmo |

### What each column contains

| Header | Description |
|--------|-------------|
| **Submitted at (UTC)** | ISO timestamp when the request was created in the app. |
| **Submission ID** | Prisma `ContactSubmission.id` (e.g. cuid). |
| **Pipeline status** | At submit time, usually `pending_request`. Later stages (`deposit_requested`, `deposit_paid`, `booked`) are **not** auto-updated in the sheet. |
| **Contact name** | From the form. |
| **Email** | From the form. |
| **Phone** | From the form (may be empty). |
| **Event type** | `wedding`, `baby_shower`, `birthday`, or `other`. |
| **Event date** | `YYYY-MM-DD` (calendar date in the app’s model). |
| **Event time (local)** | `HH:mm` in `EVENT_TIMEZONE` (default `America/Chicago`). |
| **Event start (UTC)** | Canonical instant used for reservations, ISO UTC (may be empty if missing). |
| **Event address** | Single line: street · city, ST ZIP (geocoded submission). |
| **Lettering** | Raw phrase from the form. |
| **Estimated total** | Dollar string from server recomputed pricing at submit (e.g. `$265.00`). |
| **Setup** | `outdoor` or `indoor`. |
| **Outside radius** | `yes` or `no` vs service radius from Jackson, MO. |
| **Distance (mi)** | Miles from base (number or empty). |
| **Proposed total** | Empty at submit. Admin sets **proposed total** in `/admin` (your quoted job price); it is **not** written back to the sheet by the app today. |
| **Client Venmo** | Empty at submit. Filled when admin saves the client’s `@handle` in the app; **not** written back to the sheet automatically. |

### Admin: **Proposed total** (queue vs sheet)

- **Proposed total** is your **full-job quote** in dollars, stored in the database for that submission.
- It is **separate** from **Estimated total** (the automatic total at form submit).
- The **$100 deposit** is fixed. The admin UI uses **proposed total − $100** as the **remainder** for optional “Open Venmo for remainder” links.
- **Booking** is confirmed after **deposit paid**, not after the full proposed total is collected.
- The SubmitRequests row is a **snapshot at submit time** for proposed/Venmo columns unless you add a future sync.

---

## Tab: `Inventory`

Default tab: **`Inventory`** (`GOOGLE_SHEET_INVENTORY_TAB`).

- **Column A:** letter `A`–`Z`
- **Column B:** total quantity for that letter  
- **Row 1:** optional header; data is read from **row 2** downward.

Use **Admin → Sync inventory from Google Sheet** to upsert counts into the database for availability checks.
