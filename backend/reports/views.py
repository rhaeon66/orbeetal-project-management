from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from audit.services import write_audit
from reports.models import MonthlyReport, ReportField
from reports.serializers import MonthlyReportSerializer, ReportFieldSerializer
from reports.services import apply_field_values, overlapping_assignment, save_draft, submit_report
from reports.workspace import build_workspace, devices_for_month, save_workspace


class ReportFieldViewSet(viewsets.ModelViewSet):
    serializer_class = ReportFieldSerializer
    queryset = ReportField.objects.all()
    search_fields = ["key", "label"]
    filterset_fields = ["field_type", "is_active", "is_calculated"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.is_admin:
            return qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        field = serializer.save()
        write_audit(self.request.user, "field.created", field, after=ReportFieldSerializer(field).data)

    def perform_update(self, serializer):
        before = ReportFieldSerializer(serializer.instance).data
        field = serializer.save()
        write_audit(self.request.user, "field.updated", field, before=before, after=ReportFieldSerializer(field).data)

    def destroy(self, request, *args, **kwargs):
        field = self.get_object()
        if field.values.exists() or field.commission_rules.exists():
            return Response(
                {"detail": "This field is in use. Deactivate it instead of deleting it."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        write_audit(request.user, "field.deleted", field, before=ReportFieldSerializer(field).data)
        return super().destroy(request, *args, **kwargs)


class MonthlyReportViewSet(viewsets.ModelViewSet):
    serializer_class = MonthlyReportSerializer
    filterset_fields = ["device", "year", "month", "status", "user"]
    search_fields = ["device__name", "device__serial_number", "device__device_code", "user__name"]
    ordering_fields = ["year", "month", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = MonthlyReport.objects.select_related("device", "user", "assignment", "settlement").prefetch_related(
            "values__field"
        )
        if self.request.user.is_admin:
            return qs
        return qs.filter(user=self.request.user)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        device = data["device"]
        year = data["year"]
        month = data["month"]
        if month < 1 or month > 12:
            return Response({"month": "Month must be between 1 and 12."}, status=status.HTTP_400_BAD_REQUEST)
        if MonthlyReport.objects.filter(device=device, year=year, month=month).exists():
            return Response(
                {"detail": "A report already exists for this device and month."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assignment = overlapping_assignment(device, request.user, year, month)
        if assignment is None:
            return Response(
                {"detail": "You do not have an assignment covering this device and month."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        report = MonthlyReport.objects.create(
            device=device,
            assignment=assignment,
            user=request.user,
            year=year,
            month=month,
            notes=data.get("notes", ""),
        )
        apply_field_values(report, data.get("input_values") or {})
        write_audit(request.user, "report.created", report, after={"year": year, "month": month, "device": device.id})
        if data.get("submit"):
            submit_report(report, request.user)
        report.refresh_from_db()
        return Response(self.get_serializer(report).data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        report = self.get_object()
        if report.user_id != request.user.id:
            return Response({"detail": "You can only edit your own reports."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(report, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "notes" in serializer.validated_data and report.status == MonthlyReport.Status.DRAFT:
            report.notes = serializer.validated_data["notes"]
            report.save(update_fields=["notes", "updated_at"])
        if "input_values" in serializer.validated_data:
            save_draft(report, serializer.validated_data["input_values"], request.user)
        if serializer.validated_data.get("submit"):
            if "input_values" not in serializer.validated_data:
                apply_field_values(report, {})
            submit_report(report, request.user)
        report.refresh_from_db()
        return Response(self.get_serializer(report).data)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        report = self.get_object()
        if report.user_id != request.user.id and not request.user.is_admin:
            return Response({"detail": "You cannot submit this report."}, status=status.HTTP_403_FORBIDDEN)
        submit_report(report, request.user)
        report.refresh_from_db()
        return Response(self.get_serializer(report).data)


class WorkspaceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        year, month = self._period(request)
        devices = devices_for_month(request.user, year, month)
        device = self._device(devices, request.query_params.get("device"))
        payload = build_workspace(request.user, device, year, month)
        payload["devices"] = [
            {"id": item.id, "name": item.name, "device_code": item.device_code, "brand": item.brand, "model": item.model} for item in devices
        ]
        return Response(payload)

    def put(self, request):
        year = int(request.data.get("year"))
        month = int(request.data.get("month"))
        devices = devices_for_month(request.user, year, month)
        device = self._device(devices, request.data.get("device"))
        if device is None:
            return Response({"detail": "No borrowed device for this month."}, status=status.HTTP_400_BAD_REQUEST)
        payload = save_workspace(
            request.user,
            device,
            year,
            month,
            request.data.get("costs") or [],
            request.data.get("incomes") or [],
        )
        payload["devices"] = [
            {"id": item.id, "name": item.name, "device_code": item.device_code, "brand": item.brand, "model": item.model} for item in devices
        ]
        return Response(payload)

    def _period(self, request):
        today = timezone.localdate()
        year = int(request.query_params.get("year") or today.year)
        month = int(request.query_params.get("month") or today.month)
        if month < 1 or month > 12:
            month = today.month
        return year, month

    def _device(self, devices, device_id):
        if device_id:
            return get_object_or_404(devices, pk=device_id)
        return devices.first()
