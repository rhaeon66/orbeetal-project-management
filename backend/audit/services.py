from audit.models import AuditLog, json_safe


def write_audit(actor, action, instance, before=None, after=None):
    user = actor if getattr(actor, "is_authenticated", False) else None
    AuditLog.objects.create(
        actor=user,
        action=action,
        entity_type=instance._meta.label,
        entity_id=str(instance.pk),
        before=json_safe(before) if before is not None else None,
        after=json_safe(after) if after is not None else None,
    )
