from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from audit.services import write_audit
from config.money import money
from finance.models import Payment, Settlement


def _payment_snapshot(payment):
    return {
        "id": payment.id,
        "amount": str(payment.amount),
        "status": payment.status,
        "reference_id": payment.reference_id,
        "rejection_reason": payment.rejection_reason,
    }


def _refresh_settlement(settlement):
    settlement.amount_paid = money(settlement.amount_paid)
    settlement.balance = money(settlement.amount_due - settlement.amount_paid)
    if settlement.balance < 0:
        raise ValidationError({"amount": "Approved payments exceed the amount due."})
    if settlement.balance == 0:
        settlement.status = Settlement.Status.PAID
    elif settlement.amount_paid > 0:
        settlement.status = Settlement.Status.PARTIAL
    else:
        settlement.status = Settlement.Status.UNPAID
    settlement.save(update_fields=["amount_paid", "balance", "status", "updated_at"])


def dues_through_today(settlement):
    today = timezone.localdate()
    report = settlement.report
    return (
        Settlement.objects.filter(
            report__user_id=report.user_id,
            report__device_id=report.device_id,
            balance__gt=0,
        )
        .filter(Q(report__year__lt=today.year) | Q(report__year=today.year, report__month__lte=today.month))
        .order_by("report__year", "report__month", "id")
    )


def combined_room(settlement):
    dues = dues_through_today(settlement)
    total = money(sum((row.balance for row in dues), Decimal("0")))
    pending = Payment.objects.filter(settlement__in=dues, status=Payment.Status.PENDING).aggregate(total=Sum("amount"))["total"]
    return money(total - money(pending or 0))


@transaction.atomic
def create_payment(settlement, user, amount, paid_on, method, reference_id, proof):
    if settlement.report.user_id != user.id and not user.is_admin:
        raise ValidationError({"detail": "You can only pay your own settlements."})
    locked = Settlement.objects.select_for_update().get(pk=settlement.pk)
    amount = money(amount)
    if amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    room = combined_room(locked)
    if room <= 0:
        raise ValidationError({"detail": "This settlement is already paid."})
    if amount > room:
        raise ValidationError({"amount": f"Amount exceeds the remaining balance of {room}."})
    payment = Payment.objects.create(
        settlement=locked,
        user=locked.report.user,
        amount=amount,
        paid_on=paid_on,
        method=method,
        reference_id=reference_id,
        proof=proof,
        status=Payment.Status.PENDING,
    )
    write_audit(user, "payment.submitted", payment, after=_payment_snapshot(payment))
    return payment


@transaction.atomic
def review_payment(payment, actor, decision, reason=""):
    if decision not in (Payment.Status.APPROVED, Payment.Status.REJECTED):
        raise ValidationError({"status": "Choose approved or rejected."})
    locked_payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if locked_payment.status != Payment.Status.PENDING:
        raise ValidationError({"detail": "Only pending payments can be reviewed."})
    before = _payment_snapshot(locked_payment)
    settlement = Settlement.objects.select_for_update().get(pk=locked_payment.settlement_id)
    if decision == Payment.Status.REJECTED:
        if not str(reason).strip():
            raise ValidationError({"rejection_reason": "A rejection reason is required."})
        locked_payment.status = Payment.Status.REJECTED
        locked_payment.rejection_reason = reason.strip()
    else:
        remaining = money(locked_payment.amount)
        for item in dues_through_today(settlement):
            target = Settlement.objects.select_for_update().get(pk=item.pk)
            if target.balance <= 0 or remaining <= 0:
                continue
            take = remaining if remaining <= target.balance else target.balance
            target.amount_paid = money(target.amount_paid + take)
            _refresh_settlement(target)
            remaining = money(remaining - take)
        if remaining > 0:
            raise ValidationError({"amount": "This payment is larger than the remaining balance."})
        locked_payment.status = Payment.Status.APPROVED
        locked_payment.rejection_reason = ""
    locked_payment.reviewed_by = actor
    locked_payment.reviewed_at = timezone.now()
    locked_payment.save(
        update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at"]
    )
    write_audit(
        actor,
        "payment.approved" if decision == Payment.Status.APPROVED else "payment.rejected",
        locked_payment,
        before=before,
        after=_payment_snapshot(locked_payment),
    )
    return locked_payment
