import os
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand

from accounts.models import User
from finance.models import CommissionRule
from reports.models import ReportField


class Command(BaseCommand):
    help = "Create the default admin, report fields, and commission rule."

    def handle(self, *args, **options):
        email = os.environ.get("DJANGO_ADMIN_EMAIL", "admin@example.com")
        password = os.environ.get("DJANGO_ADMIN_PASSWORD", "admin12345")
        name = os.environ.get("DJANGO_ADMIN_NAME", "System Admin")
        admin, created = User.objects.get_or_create(
            email=email,
            defaults={"name": name, "role": User.Role.ADMIN, "is_staff": True, "is_superuser": True},
        )
        if created:
            admin.set_password(password)
            admin.save()
            self.stdout.write(self.style.SUCCESS(f"Created admin {email}"))
        else:
            self.stdout.write(f"Admin {email} already exists")

        income, _ = ReportField.objects.get_or_create(
            key="income",
            defaults={
                "label": "Income",
                "field_type": ReportField.FieldType.CURRENCY,
                "is_required": True,
                "sort_order": 1,
            },
        )
        cost, _ = ReportField.objects.get_or_create(
            key="cost",
            defaults={
                "label": "Cost",
                "field_type": ReportField.FieldType.CURRENCY,
                "is_required": True,
                "sort_order": 2,
            },
        )
        revenue, _ = ReportField.objects.get_or_create(
            key="revenue",
            defaults={
                "label": "Revenue",
                "field_type": ReportField.FieldType.CURRENCY,
                "is_calculated": True,
                "formula": "income - cost",
                "sort_order": 3,
            },
        )
        if not CommissionRule.objects.filter(is_active=True).exists():
            CommissionRule.objects.create(
                name="Company share",
                percentage=Decimal("10.00"),
                base_field=revenue,
                effective_from=date(2020, 1, 1),
                is_active=True,
            )
            self.stdout.write(self.style.SUCCESS("Created default commission rule"))
        self.stdout.write(self.style.SUCCESS(f"Fields ready: {income.key}, {cost.key}, {revenue.key}"))
