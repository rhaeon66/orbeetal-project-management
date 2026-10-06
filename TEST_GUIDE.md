# Test guide

Manual checks for the device rental app. Run them against a local `make up` session.

- App: http://localhost:3434
- API: http://localhost:8484/api/v1/
- Admin: `admin@example.com` / `admin12345`

The first open of a page after startup, or the first open after a code change, can take a few seconds. The shell shows “Loading account…” until the session check returns, and the Next.js dev server compiles that route the first time. The next open of the same page should be quick. A page that stays blank after it has already been opened once is a failure.

## Setup

1. From the project root, run `make up`.
2. Wait until http://localhost:3434 and http://localhost:8484/api/v1/ both answer.
3. Run the API tests with the database settings from `.env`. `make up` serves PostgreSQL on the `POSTGRES_PORT` in that file (5435 in the example). Django does not read `.env` by itself, and the default port 5432 is a different server.

```bash
set -a
. ./.env
set +a
cd backend && .venv/bin/python manage.py test
```

If `DJANGO_ADMIN_NAME` contains a space, quote it in `.env` before sourcing the file, or export `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` yourself.

Pass: the command finishes with `OK` and no failures. The suite creates and destroys its own test database.

## Auth

Use a private window or sign out between accounts.

### Valid admin login

1. Open http://localhost:3434/login.
2. Sign in as `admin@example.com` / `admin12345`.

Pass: the admin dashboard opens and the sidebar lists Dashboard, Devices, Assignments, Reports, Settlements, Payments, Users, Report fields, Commission rules, and Audit log.

### Wrong password

1. Sign out.
2. Sign in as `admin@example.com` with password `wrong-password`.

Pass: the form stays on Sign in and shows an error. The dashboard does not open.

### Signed out

1. Sign out.
2. Open http://localhost:3434/dashboard directly.

Pass: the app sends you to `/login`.

## Admin setup

Stay signed in as the admin. Sample records below keep the later checks predictable. If those emails or the device code already exist, add a suffix and use the new values in the later cases.

### Dashboard

1. Open Dashboard.

Pass: the page title is “Admin dashboard” and it shows Users, Devices, Active assignments, Pending reports, Revenue, Company revenue, and Pending payments.

### Create a user

1. Open Users.
2. Add a user: name `Guide Renter`, email `guide.renter@example.com`, password `renter12345`, role User, Active.
3. Add a second user: name `Guide Other`, email `guide.other@example.com`, password `renter12345`, role User, Active.

Pass: both names appear in the table with role user and status active.

### Create a device

1. Open Devices.
2. Add a device: device code `TG-001`, name `Guide Printer`, category `Printer`, brand `Canon`, model `LBP`, serial number `SN-TG-001`, status Available.

Pass: `TG-001` appears as available and the current user is empty.

### Assign the device

1. Open Assignments.
2. Assign `TG-001 · Guide Printer` to `Guide Renter`. Notes: `Guide test`.

Pass: a row shows Guide Printer, Guide Renter, and no end date. On Devices, `TG-001` is assigned to Guide Renter.

### Report fields

1. Open Report fields.

Pass: the list includes `income`, `cost`, and a calculated `revenue` field whose formula is `income - cost`.

### Commission rule

1. Open Commission rules.

Pass: an active rule uses 10% and the revenue field. The page says the percentage is stored on each settlement when the report is submitted.

## Renter month

### Save the month

1. Sign out and sign in as `guide.renter@example.com` / `renter12345`.
2. On the dashboard, confirm the borrowed device is Guide Printer, `TG-001`.
3. In Costs, set the first row to description `Paper`, quantity `1`, amount `2000`. Click outside the row so it saves.
4. In Income, set the first row to description `Copies`, quantity `1`, amount `3000`. Click outside the row so it saves.

Pass: Total Cost is `৳2,000.00`, Total Income is `৳3,000.00`, Revenue is `৳1,000.00`, and Payable to Company is `৳100.00`. Reloading the dashboard keeps those lines.

### Payment and details

1. Open Payment.
2. Open Details.

Pass: Payment shows Guide Printer for the current month and an amount due of `৳100.00`, with status Pending and a payment form. Details shows Guide Printer, `TG-001`, a borrowed date, and “Still borrowed”.

## Payment

Partial amounts are entered on Submit payment (`/payments/new`). The renter Payment page then shows the review state. Use a small PNG or PDF as proof.

### Partial payment

1. Still signed in as Guide Renter, open http://localhost:3434/payments/new.
2. Select the Guide Printer settlement for the current month. The form should say partial payments are allowed and the remaining balance is `৳100.00`.
3. Amount `40`, method Bank transfer, reference `TG-PART`, and attach a proof file.
4. Submit for review.
5. Open Payment.

Pass: the payment is accepted and Payment shows status Under Review. The payment form is hidden while that payment is in review.

### More than the balance

1. Open http://localhost:3434/payments/new again.
2. Select the same settlement and submit amount `500` with reference `TG-OVER` and a proof file.

Pass: the form shows an error that the amount exceeds the remaining balance. No new payment is created for `TG-OVER`.

### Second payment to reject

1. On the same form, submit amount `20`, reference `TG-REJ`, and a proof file.

Pass: the payment is accepted. The remaining room after the `৳40.00` payment still in review is `৳60.00`, so `৳20.00` fits.

## Admin review

Sign out and sign in as the admin.

### Reports, settlements, and audit

1. Open Reports and search `Guide Printer`.
2. Open that report.
3. Open Settlements and search `Guide Renter`.
4. Open Audit log and search `payment`.

Pass: the report is submitted and shows income `৳3,000.00`, cost `৳2,000.00`, and revenue `৳1,000.00`. The settlement base is `৳1,000.00`, company share is 10% · `৳100.00`, due is `৳100.00`, paid is `৳0.00`, and balance is `৳100.00` while both payments are still pending. The audit log has payment submission events.

### Approve one payment

1. Open Payments.
2. Approve the pending row for reference `TG-PART` (`৳40.00`).
3. Open Settlements and find Guide Renter again.

Pass: `TG-PART` is approved. The settlement paid amount is `৳40.00`, the balance is `৳60.00`, and the status is partial.

### Reject the other payment

1. Open Payments.
2. On the pending `TG-REJ` row, enter `Unreadable proof` and reject it.
3. Open Settlements again.

Pass: `TG-REJ` is rejected and the reason is visible. Paid stays `৳40.00` and the balance stays `৳60.00`.

## Guards

### Renter navigation

1. Sign in as `guide.renter@example.com` / `renter12345`.

Pass: the header shows Dashboard, Payment, and Details only. Users, Report fields, Commission rules, and Audit log are not in the navigation.

### Another user cannot see the report

1. Sign in as `guide.other@example.com` / `renter12345`.
2. Open http://localhost:3434/reports.
3. Open the Guide Renter report URL from the admin session, if you still have it. Otherwise open http://localhost:3434/reports/1 and any other report id you saw as admin.

Pass: the report list does not include Guide Printer or Guide Renter. Opening that report directly shows an error, not the other user’s figures.

## Results

Run on 6 October 2026 against the local app at http://localhost:3434.

| Case | Result |
| --- | --- |
| API tests | Pass. 8 tests, `OK`, about 9 seconds. Load `.env` first. Without it, Django tries port 5432 and the run stops before any test. |
| Valid admin login | Pass. Admin dashboard and the full sidebar. |
| Wrong password | Pass. Stays on Sign in. Message: “No active account found with the given credentials.” |
| Signed out | Pass. `/dashboard` returns to `/login`. |
| Dashboard | Pass. “Admin dashboard” and all seven figures. |
| Create a user | Pass. Guide Renter and Guide Other are active users. |
| Create a device | Pass. `TG-001` is available and has no current user. |
| Assign the device | Pass. Guide Printer is assigned to Guide Renter with no end date (the Ended column shows Assigned). Devices then lists Guide Renter. |
| Report fields | Pass. `income`, `cost`, and calculated `revenue` with formula `income - cost`. |
| Commission rule | Pass. Company share, 10.00%, base Revenue, active from 2020-01-01. |
| Save the month | Pass. After leaving the cost and income fields, reload keeps Paper `৳2,000.00`, Copies `৳3,000.00`, revenue `৳1,000.00`, and payable `৳100.00`. |
| Payment and details | Pass. Payment shows Guide Printer, `৳100.00`, Pending, and the form. Details shows `TG-001`, borrowed 10/6/2026, still borrowed. |
| Partial payment | Pass. `TG-PART` for `৳40.00` is accepted. Payment then shows Under Review and hides the form. |
| More than the balance | Pass. `৳500.00` is refused: “Amount exceeds the remaining balance of 60.00.” `TG-OVER` is not created. The form still prints “Remaining balance ৳100.00” because that figure does not subtract the payment already in review. |
| Second payment to reject | Pass. `TG-REJ` for `৳20.00` is accepted and stays pending. |
| Reports, settlements, and audit | Pass. Report 3 is submitted with income `৳3,000.00`, cost `৳2,000.00`, and revenue `৳1,000.00`. Settlement is base `৳1,000.00`, 10% · `৳100.00`, paid `৳0.00`, balance `৳100.00`, unpaid. Audit log has `payment.submitted` for both Guide Renter payments. |
| Approve one payment | Pass. `TG-PART` becomes approved. Settlement paid is `৳40.00`, balance `৳60.00`, status partial. |
| Reject the other payment | Pass. `TG-REJ` is rejected with “Unreadable proof”. Paid stays `৳40.00` and balance stays `৳60.00`. |
| Renter navigation | Pass. Guide Renter and Guide Other see Dashboard, Payment, and Details only. |
| Another user cannot see the report | Pass. Guide Other’s report list is empty. `/reports/3` shows “No MonthlyReport matches the given query.” |

Slow loads: every full open of a page starts on “Loading account…”. After a route has already been compiled, the next check shows the page content within the same second. No page stayed blank after it had already been opened. The first compile of a route is the multi-second pause described above.

Two extra observations:

- Right after submitting a payment, the renter payments page briefly shows the admin table (heading “Payments” and the status filter) before it switches to the renter view.
- The seeded admin’s name is stored with quotation marks, so the header and user table show `"System Admin"`.
