from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from audit.services import write_audit
from devices.models import Device, DeviceAssignment
from devices.serializers import AssignmentSerializer, DeviceSerializer
from devices.services import assign_device, end_assignment


class DeviceViewSet(viewsets.ModelViewSet):
    serializer_class = DeviceSerializer
    search_fields = ["name", "device_code", "serial_number", "brand", "category", "model"]
    filterset_fields = ["status", "category", "current_user"]
    ordering_fields = ["name", "device_code", "created_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = Device.objects.select_related("current_user")
        user = self.request.user
        if user.is_admin:
            return qs
        return qs.filter(Q(assignments__user=user)).distinct()

    def perform_create(self, serializer):
        device = serializer.save()
        write_audit(self.request.user, "device.created", device, after=DeviceSerializer(device).data)

    def perform_update(self, serializer):
        before = DeviceSerializer(serializer.instance).data
        device = serializer.save()
        if device.status in (Device.Status.RETIRED, Device.Status.MAINTENANCE):
            open_assignment = device.assignments.filter(ended_at__isnull=True).first()
            if open_assignment:
                end_assignment(open_assignment, self.request.user)
                device.refresh_from_db()
                if serializer.validated_data.get("status") == Device.Status.MAINTENANCE:
                    device.status = Device.Status.MAINTENANCE
                    device.save(update_fields=["status", "updated_at"])
                elif serializer.validated_data.get("status") == Device.Status.RETIRED:
                    device.status = Device.Status.RETIRED
                    device.save(update_fields=["status", "updated_at"])
        write_audit(
            self.request.user,
            "device.updated",
            device,
            before=before,
            after=DeviceSerializer(device).data,
        )

    def destroy(self, request, *args, **kwargs):
        device = self.get_object()
        if device.reports.exists():
            return Response(
                {"detail": "Devices with reports cannot be deleted. Retire the device instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        write_audit(request.user, "device.deleted", device, before=DeviceSerializer(device).data)
        return super().destroy(request, *args, **kwargs)


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer
    filterset_fields = ["device", "user"]
    search_fields = ["device__name", "device__serial_number", "user__name", "user__email"]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = DeviceAssignment.objects.select_related("device", "user", "assigned_by")
        if self.request.user.is_admin:
            active = self.request.query_params.get("active")
            if active == "true":
                qs = qs.filter(ended_at__isnull=True)
            elif active == "false":
                qs = qs.filter(ended_at__isnull=False)
            return qs
        return qs.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device = serializer.validated_data["device"]
        user = serializer.validated_data["user"]
        notes = serializer.validated_data.get("notes", "")
        assignment = assign_device(device, user, request.user, notes)
        return Response(self.get_serializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsAdmin])
    def close(self, request, pk=None):
        assignment = self.get_object()
        assignment = end_assignment(assignment, request.user)
        return Response(self.get_serializer(assignment).data)
