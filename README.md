# Device Rental Management
App: http://localhost:3434
API: http://localhost:8484/api/v1/

Next.js frontend, Django REST backend, and PostgreSQL. Admins configure report fields and the company commission percentage. Users submit monthly device reports, and the backend calculates figures, creates a settlement, and tracks partial payments through approval.

## Run

```bash
make up
```

The first run creates a local PostgreSQL database in `.pgdata` and starts the API and the web app. Ctrl+C stops all three.

- App: http://localhost:3434
- API: http://localhost:8484/api/v1/
- Default admin: `admin@example.com` / `admin12345`

`POSTGRES_PORT` in `.env` must match the local PostgreSQL port. Change `DJANGO_ADMIN_EMAIL` and `DJANGO_ADMIN_PASSWORD` before using this outside a local machine.

## Flow

1. Admin creates a user, a device, and an assignment.
2. The user submits one report per device per month. Calculated fields such as `income - cost` are computed on the server.
3. Submitting the report snapshots the active commission rule into a settlement.
4. The user submits a payment with proof. Partial amounts are allowed.
5. Admin approves or rejects the payment. Approval updates the settlement balance.

## Tests

Step-by-step checks for sign-in, setup, the renter month, payments, and permissions are in [TEST_GUIDE.md](TEST_GUIDE.md). Load `.env` first so the tests use the same database port as `make up`.

```bash
set -a && . ./.env && set +a
cd backend && .venv/bin/python manage.py test
```
