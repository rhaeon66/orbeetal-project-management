from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from devices.models import Device
from finance.models import CommissionRule, Payment, Settlement
from reports.formula import FormulaError, calculation_order, evaluate_formula
from reports.models import ReportField


class FormulaTests(APITestCase):
    def test_subtracts_income_and_cost(self):
        result = evaluate_formula("income - cost", {"income": "50000", "cost": "20000"})
        self.assertEqual(result, Decimal("30000.00"))

    def test_rejects_cycles(self):
        income = ReportField(key="income", field_type="currency", is_calculated=False)
        left = ReportField(key="left", field_type="currency", is_calculated=True, formula="right + 1")
        right = ReportField(key="right", field_type="currency", is_calculated=True, formula="left + 1")
        with self.assertRaises(FormulaError):
            calculation_order([income, left, right])


class RentalFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@example.com", name="Admin", password="admin12345", role=User.Role.ADMIN
        )
        self.user = User.objects.create_user(
            email="rakib@example.com", name="Rakib", password="user12345", role=User.Role.USER
        )
        self.other = User.objects.create_user(
            email="other@example.com", name="Other", password="user12345", role=User.Role.USER
        )
        self.income = ReportField.objects.create(
            key="income", label="Income", field_type=ReportField.FieldType.CURRENCY, is_required=True, sort_order=1
        )
        self.cost = ReportField.objects.create(
            key="cost", label="Cost", field_type=ReportField.FieldType.CURRENCY, is_required=True, sort_order=2
        )
        self.revenue = ReportField.objects.create(
            key="revenue",
            label="Revenue",
            field_type=ReportField.FieldType.CURRENCY,
            is_calculated=True,
            formula="income - cost",
            sort_order=3,
        )
        self.rule = CommissionRule.objects.create(
            name="Company share",
            percentage=Decimal("10.00"),
            base_field=self.revenue,
            effective_from=date(2020, 1, 1),
            is_active=True,
        )
        self.device = Device.objects.create(
            device_code="CP-102",
            name="Canon Printer",
            category="Printer",
            brand="Canon",
            model="CP-102",
            serial_number="SN-102",
        )

    def _login(self, email, password):
        response = self.client.post(
            reverse("login"), {"email": email, "password": password}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _assign(self):
        self._login("admin@example.com", "admin12345")
        response = self.client.post(
            "/api/v1/assignments/",
            {"device": self.device.id, "user": self.user.id, "notes": "Initial"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.data

    def _submit_report(self, income="50000", cost="20000", month=None):
        today = date.today()
        self._login("rakib@example.com", "user12345")
        response = self.client.post(
            "/api/v1/reports/",
            {
                "device": self.device.id,
                "year": today.year,
                "month": month or today.month,
                "notes": "January",
                "input_values": {"income": income, "cost": cost},
                "submit": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        revenue = next(row for row in response.data["values"] if row["key"] == "revenue")
        self.assertEqual(revenue["decimal_value"], "30000.00")
        return response.data

    def test_duplicate_month_is_rejected(self):
        self._assign()
        self._submit_report()
        response = self.client.post(
            "/api/v1/reports/",
            {
                "device": self.device.id,
                "year": date.today().year,
                "month": date.today().month,
                "input_values": {"income": "1", "cost": "0"},
                "submit": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_user_cannot_read_another_users_report(self):
        self._assign()
        report = self._submit_report()
        self._login("other@example.com", "user12345")
        response = self.client.get(f"/api/v1/reports/{report['id']}/")
        self.assertEqual(response.status_code, 404)
        listing = self.client.get("/api/v1/reports/")
        self.assertEqual(listing.data["count"], 0)

    def test_settlement_snapshot_ignores_later_rule_edits(self):
        self._assign()
        report = self._submit_report()
        settlement = Settlement.objects.get(report_id=report["id"])
        self.assertEqual(settlement.percentage, Decimal("10.00"))
        self.assertEqual(settlement.company_share, Decimal("3000.00"))
        self.assertEqual(settlement.amount_due, Decimal("3000.00"))
        self.rule.percentage = Decimal("25.00")
        self.rule.save(update_fields=["percentage"])
        settlement.refresh_from_db()
        self.assertEqual(settlement.percentage, Decimal("10.00"))
        self.assertEqual(settlement.company_share, Decimal("3000.00"))

    def test_partial_payment_and_overpayment(self):
        self._assign()
        report = self._submit_report()
        settlement = Settlement.objects.get(report_id=report["id"])
        self._login("rakib@example.com", "user12345")
        first = self._pay(settlement.id, "1000.00", "REF-1")
        self.assertEqual(first.status_code, 201, first.content)
        too_much = self._pay(settlement.id, "2500.00", "REF-2")
        self.assertEqual(too_much.status_code, 400)
        second = self._pay(settlement.id, "2000.00", "REF-3")
        self.assertEqual(second.status_code, 201, second.content)

        self._login("admin@example.com", "admin12345")
        approve = self.client.post(f"/api/v1/payments/{first.data['id']}/approve/", {}, format="json")
        self.assertEqual(approve.status_code, 200, approve.content)
        settlement.refresh_from_db()
        self.assertEqual(settlement.amount_paid, Decimal("1000.00"))
        self.assertEqual(settlement.balance, Decimal("2000.00"))
        self.assertEqual(settlement.status, Settlement.Status.PARTIAL)

        approve_rest = self.client.post(f"/api/v1/payments/{second.data['id']}/approve/", {}, format="json")
        self.assertEqual(approve_rest.status_code, 200, approve_rest.content)
        settlement.refresh_from_db()
        self.assertEqual(settlement.balance, Decimal("0.00"))
        self.assertEqual(settlement.status, Settlement.Status.PAID)

    def test_rejection_does_not_change_balance(self):
        self._assign()
        report = self._submit_report()
        settlement = Settlement.objects.get(report_id=report["id"])
        self._login("rakib@example.com", "user12345")
        payment = self._pay(settlement.id, "500.00", "REF-R")
        self._login("admin@example.com", "admin12345")
        missing_reason = self.client.post(f"/api/v1/payments/{payment.data['id']}/reject/", {}, format="json")
        self.assertEqual(missing_reason.status_code, 400)
        rejected = self.client.post(
            f"/api/v1/payments/{payment.data['id']}/reject/",
            {"rejection_reason": "Unreadable proof"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200, rejected.content)
        self.assertEqual(rejected.data["status"], Payment.Status.REJECTED)
        settlement.refresh_from_db()
        self.assertEqual(settlement.amount_paid, Decimal("0.00"))
        self.assertEqual(settlement.balance, Decimal("3000.00"))
        again = self.client.post(f"/api/v1/payments/{payment.data['id']}/approve/", {}, format="json")
        self.assertEqual(again.status_code, 400)

    def test_workspace_calculates_revenue_and_company_share(self):
        self._assign()
        self._login("rakib@example.com", "user12345")
        today = date.today()
        response = self.client.put(
            "/api/v1/workspace/",
            {
                "device": self.device.id,
                "year": today.year,
                "month": today.month,
                "costs": [
                    {"description": "Total Pages Bought", "quantity": "1000", "unit": "pages", "amount": "2000"},
                    {"description": "Total Ink Refilled", "quantity": "2", "unit": "times", "amount": "500"},
                ],
                "incomes": [
                    {"description": "Income by Page", "quantity": "500", "unit": "pages", "amount": "2000"},
                    {"description": "Soft Binding", "quantity": "20", "unit": "books", "amount": "1000"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["total_cost"], "2500.00")
        self.assertEqual(response.data["total_income"], "3000.00")
        self.assertEqual(response.data["revenue"], "500.00")
        self.assertEqual(response.data["company_percentage"], "10.00")
        self.assertEqual(response.data["amount_payable"], "50.00")
        self.assertEqual(response.data["payment"]["label"], "Pending")
        self._login("other@example.com", "user12345")
        hidden = self.client.get(f"/api/v1/workspace/?year={today.year}&month={today.month}&device={self.device.id}")
        self.assertEqual(hidden.status_code, 404)

    def _pay(self, settlement_id, amount, reference):
        proof = SimpleUploadedFile("proof.png", b"proof-bytes", content_type="image/png")
        return self.client.post(
            "/api/v1/payments/",
            {
                "settlement": settlement_id,
                "amount": amount,
                "paid_on": "2026-02-01",
                "method": "bank_transfer",
                "reference_id": reference,
                "proof": proof,
            },
            format="multipart",
        )
