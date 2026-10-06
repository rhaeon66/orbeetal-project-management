from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from audit.services import write_audit
from devices.models import Device, DeviceAssignment


def _snapshot(assignment):
    return {
        "id": assignment.id,
        "device_id": assignment.device_id,
        "user_id": assignment.user_id,
        "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
        "ended_at": assignment.ended_at.isoformat() if assignment.ended_at else None,
        "notes": assignment.notes,
    }


@transaction.atomic
def assign_device(device, user, actor, notes=""):
    if user.role != user.Role.USER or not user.is_active:
        raise ValidationError({"user": "Choose an active rental user."})
    if device.status == Device.Status.RETIRED:
        raise ValidationError({"device": "Retired devices cannot be assigned."})

    open_assignment = (
        DeviceAssignment.objects.select_for_update()
        .filter(device=device, ended_at__isnull=True)
        .first()
    )
    if open_assignment and open_assignment.user_id == user.id:
        raise ValidationError({"user": "This device is already assigned to that user."})
    if open_assignment:
        before = _snapshot(open_assignment)
        open_assignment.ended_at = timezone.now()
        open_assignment.save(update_fields=["ended_at"])
        write_audit(actor, "assignment.ended", open_assignment, before=before, after=_snapshot(open_assignment))

    assignment = DeviceAssignment.objects.create(
        device=device, user=user, assigned_by=actor, notes=notes or ""
    )
    device.current_user = user
    device.status = Device.Status.ASSIGNED
    device.save(update_fields=["current_user", "status", "updated_at"])
    write_audit(actor, "assignment.created", assignment, after=_snapshot(assignment))
    return assignment


@transaction.atomic
def end_assignment(assignment, actor):
    if assignment.ended_at is not None:
        raise ValidationError({"detail": "This assignment is already closed."})
    before = _snapshot(assignment)
    assignment.ended_at = timezone.now()
    assignment.save(update_fields=["ended_at"])
    device = assignment.device
    device.current_user = None
    if device.status == Device.Status.ASSIGNED:
        device.status = Device.Status.AVAILABLE
    device.save(update_fields=["current_user", "status", "updated_at"])
    write_audit(actor, "assignment.ended", assignment, before=before, after=_snapshot(assignment))
    return assignment
