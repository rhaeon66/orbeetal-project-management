from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from config.money import money
from devices.models import Device, DeviceAssignment
from finance.models import Payment, Settlement
from ledger.models import LedgerEntry
from reports.models import MonthlyReport
from reports.services import active_rule_for, apply_field_values, overlapping_assignment


def _entries(report, kind):
    if report is None:
        return []
    return [
        {
            "id": entry.id,
            "description": entry.description,
            "quantity": str(entry.quantity),
            "rate": entry.unit if entry.unit not in ("", None) else str(entry.amount),
            "amount": str(entry.amount),
        }
        for entry in report.entries.filter(kind=kind)
    ]


def _sum(report, kind):
    if report is None:
        return money(0)
    total = report.entries.filter(kind=kind).aggregate(total=Sum("amount"))["total"]
    return money(total or 0)


def _settlement(report):
    if report is None:
        return None
    try:
        return report.settlement
    except Settlement.DoesNotExist:
        return None


def payment_state(report):
    settlement = _settlement(report)
    if settlement is None:
        return {"code": "pending", "label": "Pending", "reason": "", "can_pay": False, "amount_due": "0.00"}
    pending = settlement.payments.filter(status=Payment.Status.PENDING).order_by("-id").first()
    if pending:
        return {
            "code": "under_review",
            "label": "Under Review",
            "reason": "",
            "can_pay": False,
            "amount_due": str(settlement.balance),
        }
    if settlement.balance <= 0:
        return {
            "code": "approved",
            "label": "Approved",
            "reason": "",
            "can_pay": False,
            "amount_due": "0.00",
        }
    latest = settlement.payments.order_by("-id").first()
    if latest and latest.status == Payment.Status.REJECTED:
        return {
            "code": "rejected",
            "label": "Rejected",
            "reason": latest.rejection_reason,
            "can_pay": True,
            "amount_due": str(settlement.balance),
        }
    return {
        "code": "pending",
        "label": "Pending",
        "reason": "",
        "can_pay": True,
        "amount_due": str(settlement.balance),
    }


def rental_period(user, device):
    if device is None:
        return None
    first = DeviceAssignment.objects.filter(user=user, device=device).order_by("started_at").first()
    if first is None:
        return None
    started = timezone.localtime(first.started_at)
    return {"year": started.year, "month": started.month}


def month_has_passed(year, month):
    today = timezone.localdate()
    return (year, month) < (today.year, today.month)


def carried_dues(user, device, year, month):
    if device is None:
        return []
    rows = (
        Settlement.objects.filter(report__user=user, report__device=device, balance__gt=0)
        .filter(Q(report__year__lt=year) | Q(report__year=year, report__month__lt=month))
        .select_related("report")
        .order_by("report__year", "report__month")
    )
    return [
        {
            "year": row.report.year,
            "month": row.report.month,
            "amount": str(row.balance),
            "settlement_id": row.id,
        }
        for row in rows
    ]


def month_is_locked(report, year=None, month=None):
    if year is not None and month is not None and month_has_passed(year, month):
        return True
    settlement = _settlement(report)
    if settlement is None:
        return False
    if settlement.amount_paid > 0:
        return True
    return settlement.payments.filter(status=Payment.Status.PENDING).exists()


def build_workspace(user, device, year, month):
    report = None
    if device is not None:
        report = (
            MonthlyReport.objects.filter(device=device, user=user, year=year, month=month)
            .prefetch_related("entries")
            .select_related("settlement")
            .first()
        )
    rule = active_rule_for(year, month)
    income = _sum(report, LedgerEntry.Kind.INCOME)
    cost = _sum(report, LedgerEntry.Kind.COST)
    revenue = money(income - cost)
    state = payment_state(report)
    settlement = _settlement(report)
    passed = month_has_passed(year, month)
    this_share = (
        settlement.balance
        if settlement is not None
        else money(max(revenue, 0) * (rule.percentage if rule else 0) / Decimal("100"))
    )
    carried = carried_dues(user, device, year, month)
    carried_total = money(sum(Decimal(item["amount"]) for item in carried))
    if passed:
        payable = this_share
        state["can_pay"] = False
    else:
        payable = money(this_share + carried_total)
        pending = Payment.objects.filter(
            status=Payment.Status.PENDING,
            settlement__report__user=user,
            settlement__report__device=device,
        ).filter(Q(settlement__report__year__lt=year) | Q(settlement__report__year=year, settlement__report__month__lte=month))
        state["can_pay"] = payable > 0 and not pending.exists()
        state["amount_due"] = str(payable)
    pay_settlement = settlement.id if settlement is not None else (carried[0]["settlement_id"] if carried and not passed else None)
    return {
        "device": None
        if device is None
        else {
            "id": device.id,
            "name": device.name,
            "device_code": device.device_code,
            "brand": device.brand,
            "model": device.model,
        },
        "year": year,
        "month": month,
        "costs": _entries(report, LedgerEntry.Kind.COST),
        "incomes": _entries(report, LedgerEntry.Kind.INCOME),
        "total_cost": str(cost),
        "total_income": str(income),
        "revenue": str(revenue),
        "company_percentage": str(rule.percentage) if rule else None,
        "amount_payable": str(payable),
        "this_month_due": str(this_share),
        "carried_dues": carried,
        "carried_total": str(carried_total),
        "month_passed": passed,
        "payment": state,
        "settlement_id": pay_settlement,
        "locked": month_is_locked(report, year, month),
        "report_id": report.id if report else None,
        "rental_start": rental_period(user, device),
    }


def _clean_rows(rows, label):
    cleaned = []
    for index, row in enumerate(rows or []):
        description = str(row.get("description", "")).strip()
        if not description:
            raise ValidationError({label: f"Row {index + 1} needs a description."})
        try:
            quantity = money(0 if row.get("quantity") in (None, "") else row.get("quantity"))
            if row.get("rate") not in (None, ""):
                rate = money(row.get("rate"))
                amount = money(quantity * rate)
                unit = str(rate)
            else:
                amount = money(0 if row.get("amount") in (None, "") else row.get("amount"))
                rate = money(amount / quantity) if quantity else amount
                unit = str(row.get("unit") or rate)
        except Exception as exc:
            raise ValidationError({label: f"Row {index + 1} has an invalid number."}) from exc
        if quantity < 0 or amount < 0:
            raise ValidationError({label: f"Row {index + 1} cannot be negative."})
        cleaned.append(
            {
                "description": description,
                "quantity": quantity,
                "unit": unit,
                "amount": amount,
                "sort_order": index,
            }
        )
    return cleaned


@transaction.atomic
def save_workspace(user, device, year, month, costs, incomes):
    if month_has_passed(year, month):
        raise ValidationError({"detail": "This month has passed and can no longer be edited."})
    assignment = overlapping_assignment(device, user, year, month)
    if assignment is None:
        raise ValidationError({"detail": "You do not have this device for the selected month."})
    report = MonthlyReport.objects.select_for_update().filter(device=device, year=year, month=month).first()
    if report and report.user_id != user.id:
        raise ValidationError({"detail": "This month belongs to another user."})
    if report and month_is_locked(report, year, month):
        raise ValidationError({"detail": "This month is locked while a payment is in review or already approved."})
    if report is None:
        report = MonthlyReport.objects.create(
            device=device,
            assignment=assignment,
            user=user,
            year=year,
            month=month,
            status=MonthlyReport.Status.SUBMITTED,
        )
    report.entries.all().delete()
    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(report=report, kind=LedgerEntry.Kind.COST, **row)
            for row in _clean_rows(costs, "costs")
        ]
        + [
            LedgerEntry(report=report, kind=LedgerEntry.Kind.INCOME, **row)
            for row in _clean_rows(incomes, "incomes")
        ]
    )
    income = _sum(report, LedgerEntry.Kind.INCOME)
    cost = _sum(report, LedgerEntry.Kind.COST)
    apply_field_values(report, {"income": income, "cost": cost})
    _sync_settlement(report)
    report.refresh_from_db()
    return build_workspace(user, device, year, month)


def _sync_settlement(report):
    rule = active_rule_for(report.year, report.month)
    if rule is None:
        raise ValidationError({"detail": "No active commission rule covers this month."})
    revenue_value = report.values.filter(field=rule.base_field).first()
    revenue = money(revenue_value.decimal_value if revenue_value and revenue_value.decimal_value is not None else 0)
    share = money(max(revenue, 0) * rule.percentage / Decimal("100"))
    settlement = Settlement.objects.filter(report=report).first()
    if settlement is None:
        Settlement.objects.create(
            report=report,
            rule=rule,
            base_field_key=rule.base_field.key,
            base_amount=revenue,
            percentage=rule.percentage,
            company_share=share,
            amount_due=share,
            amount_paid=money(0),
            balance=share,
            status=Settlement.Status.PAID if share == 0 else Settlement.Status.UNPAID,
        )
        return
    settlement.rule = rule
    settlement.base_field_key = rule.base_field.key
    settlement.base_amount = revenue
    settlement.percentage = rule.percentage
    settlement.company_share = share
    settlement.amount_due = share
    settlement.balance = money(share - settlement.amount_paid)
    if settlement.balance <= 0:
        settlement.status = Settlement.Status.PAID
    elif settlement.amount_paid > 0:
        settlement.status = Settlement.Status.PARTIAL
    else:
        settlement.status = Settlement.Status.UNPAID
    settlement.save()


def devices_for_month(user, year, month):
    from devices.models import DeviceAssignment
    from reports.services import models_ended_or_open, period_bounds

    start, end = period_bounds(year, month)
    assignments = DeviceAssignment.objects.filter(user=user, started_at__date__lte=end).filter(models_ended_or_open(start))
    return Device.objects.filter(assignments__in=assignments).distinct().order_by("name")
