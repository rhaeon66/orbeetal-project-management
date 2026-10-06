from rest_framework import viewsets

from accounts.permissions import IsAdmin
from audit.models import AuditLog
from audit.serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("actor")
    filterset_fields = ["action", "entity_type"]
    search_fields = ["action", "entity_type", "entity_id", "actor__email", "actor__name"]
    ordering_fields = ["created_at"]
