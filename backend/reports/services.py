from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from config.money import money
from devices.models import DeviceAssignment
from finance.models import CommissionRule, Settlement
from reports.formula import FormulaError, calculation_order, evaluate_formula
from reports.models import MonthlyReport, ReportField, ReportValue


def period_bounds(year, month):
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    return start, end


def overlapping_assignment(device, user, year, month):
    start, end = period_bounds(year, month)
    return (
        DeviceAssignment.objects.filter(device=device, user=user, started_at__date__lte=end)
        .filter(models_ended_or_open(start))
        .order_by("-started_at")
        .first()
    )


def models_ended_or_open(start):
    from django.db.models import Q

    return Q(ended_at__isnull=True) | Q(ended_at__date__gte=start)


def active_rule_for(year, month):
    start, end = period_bounds(year, month)
    return (
        CommissionRule.objects.filter(is_active=True, effective_from__lte=end)
        .filter(models_rule_open(start))
        .select_related("base_field")
        .order_by("-effective_from", "-id")
        .first()
    )


def models_rule_open(start):
    from django.db.models import Q

    return Q(effective_to__isnull=True) | Q(effective_to__gte=start)


def _store_value(report, field, raw):
    value, _created = ReportValue.objects.get_or_create(report=report, field=field)
    value.decimal_value = None
    value.text_value = ""
    value.date_value = None
    value.bool_value = None
    if field.field_type in ReportField.NUMERIC_TYPES:
        value.decimal_value = money(raw)
    elif field.field_type == ReportField.FieldType.TEXT:
        value.text_value = "" if raw is None else str(raw)
    elif field.field_type == ReportField.FieldType.DATE:
        value.date_value = raw
    elif field.field_type == ReportField.FieldType.BOOLEAN:
        value.bool_value = bool(raw)
    value.save()
    return value


def _parse_input(field, raw):
    if raw is None or raw == "":
        if field.is_required and not field.is_calculated:
            raise ValidationError({field.key: "This field is required."})
        if field.field_type in ReportField.NUMERIC_TYPES:
            return Decimal("0")
        if field.field_type == ReportField.FieldType.TEXT:
            return ""
        if field.field_type == ReportField.FieldType.BOOLEAN:
            return False
        return None
    if field.field_type in ReportField.NUMERIC_TYPES:
        try:
            return money(raw)
        except Exception as exc:
            raise ValidationError({field.key: "Enter a valid number."}) from exc
    if field.field_type == ReportField.FieldType.DATE:
        if hasattr(raw, "isoformat") and not isinstance(raw, str):
            return raw
        try:
            return date.fromisoformat(str(raw))
        except ValueError as exc:
            raise ValidationError({field.key: "Use an ISO date (YYYY-MM-DD)."}) from exc
    if field.field_type == ReportField.FieldType.BOOLEAN:
        if isinstance(raw, bool):
            return raw
        if str(raw).lower() in ("true", "1", "yes"):
            return True
        if str(raw).lower() in ("false", "0", "no"):
            return False
        raise ValidationError({field.key: "Enter true or false."})
    return str(raw)


def apply_field_values(report, payload):
    fields = list(ReportField.objects.filter(is_active=True))
    known = {field.key: field for field in fields}
    unknown = [key for key in payload.keys() if key not in known]
    if unknown:
        raise ValidationError({"values": f"Unknown fields: {', '.join(unknown)}."})

    variables = {}
    for field in fields:
        if field.is_calculated:
            continue
        raw = payload.get(field.key)
        parsed = _parse_input(field, raw)
        _store_value(report, field, parsed)
        if field.field_type in ReportField.NUMERIC_TYPES:
            variables[field.key] = parsed if parsed is not None else Decimal("0")

    try:
        ordered = calculation_order(fields)
    except FormulaError as exc:
        raise ValidationError({"formula": str(exc)}) from exc

    for field in ordered:
        try:
            result = evaluate_formula(field.formula, variables)
        except FormulaError as exc:
            raise ValidationError({field.key: str(exc)}) from exc
        _store_value(report, field, result)
        variables[field.key] = result
    return report


def value_snapshot(report):
    rows = []
    for value in report.values.select_related("field"):
        rows.append(
            {
                "key": value.field.key,
                "decimal": str(value.decimal_value) if value.decimal_value is not None else None,
                "text": value.text_value,
                "date": value.date_value.isoformat() if value.date_value else None,
                "bool": value.bool_value,
            }
        )
    return rows


@transaction.atomic
def save_draft(report, payload, actor):
    if report.status != MonthlyReport.Status.DRAFT:
        raise ValidationError({"detail": "Submitted reports cannot be edited."})
    before = value_snapshot(report)
    apply_field_values(report, payload)
    from audit.services import write_audit

    write_audit(actor, "report.updated", report, before={"values": before}, after={"values": value_snapshot(report)})
    return report


@transaction.atomic
def submit_report(report, actor):
    if report.status != MonthlyReport.Status.SUBMITTED:
        report.status = MonthlyReport.Status.SUBMITTED
        report.submitted_at = timezone.now()
        report.save(update_fields=["status", "submitted_at", "updated_at"])
    if hasattr(report, "settlement"):
        return report
    rule = active_rule_for(report.year, report.month)
    if rule is None:
        raise ValidationError({"detail": "No active commission rule covers this reporting period."})
    base_value = report.values.filter(field=rule.base_field).first()
    if base_value is None or base_value.decimal_value is None:
        raise ValidationError({"detail": f"The report is missing a value for {rule.base_field.label}."})
    base_amount = money(base_value.decimal_value)
    share = money(base_amount * rule.percentage / Decimal("100"))
    settlement = Settlement.objects.create(
        report=report,
        rule=rule,
        base_field_key=rule.base_field.key,
        base_amount=base_amount,
        percentage=rule.percentage,
        company_share=share,
        amount_due=share,
        amount_paid=money(0),
        balance=share,
        status=Settlement.Status.PAID if share == 0 else Settlement.Status.UNPAID,
    )
    from audit.services import write_audit

    write_audit(
        actor,
        "report.submitted",
        report,
        after={
            "settlement_id": settlement.id,
            "base_amount": str(base_amount),
            "percentage": str(rule.percentage),
            "amount_due": str(share),
        },
    )
    return report
