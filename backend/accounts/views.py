from decimal import Decimal

from django.db.models import DecimalField, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from accounts.models import User
from accounts.permissions import IsAdmin
from accounts.serializers import EmailTokenObtainPairSerializer, UserSerializer, UserWriteSerializer
from audit.services import write_audit
from devices.models import Device, DeviceAssignment
from finance.models import Payment, Settlement
from reports.models import MonthlyReport


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    queryset = User.objects.all().order_by("-date_joined")
    search_fields = ["email", "name"]
    ordering_fields = ["name", "email", "date_joined"]
    filterset_fields = ["role", "is_active"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action in ("create", "partial_update"):
            return UserWriteSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        write_audit(self.request.user, "user.created", user, after=UserSerializer(user).data)

    def perform_update(self, serializer):
        before = UserSerializer(serializer.instance).data
        user = serializer.save()
        write_audit(self.request.user, "user.updated", user, before=before, after=UserSerializer(user).data)


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.is_admin:
            return Response(self._admin_payload())
        return Response(self._user_payload(request.user))

    def _admin_payload(self):
        today = timezone.localdate()
        submitted_ids = MonthlyReport.objects.filter(
            status=MonthlyReport.Status.SUBMITTED, year=today.year, month=today.month
        ).values_list("device_id", flat=True)
        pending_reports = (
            DeviceAssignment.objects.filter(ended_at__isnull=True)
            .exclude(device_id__in=submitted_ids)
            .count()
        )
        money_field = DecimalField(max_digits=14, decimal_places=2)
        settlements = Settlement.objects.aggregate(
            revenue=Coalesce(Sum("base_amount"), Decimal("0"), output_field=money_field),
            company_revenue=Coalesce(Sum("company_share"), Decimal("0"), output_field=money_field),
        )
        return {
            "role": "admin",
            "total_users": User.objects.filter(role=User.Role.USER).count(),
            "total_devices": Device.objects.count(),
            "active_assignments": DeviceAssignment.objects.filter(ended_at__isnull=True).count(),
            "revenue": settlements["revenue"],
            "company_revenue": settlements["company_revenue"],
            "pending_reports": pending_reports,
            "pending_payments": Payment.objects.filter(status=Payment.Status.PENDING).count(),
            "recent_payments": [],
        }

    def _user_payload(self, user):
        today = timezone.localdate()
        month_settlements = Settlement.objects.filter(
            report__user=user, report__year=today.year, report__month=today.month
        )
        money_field = DecimalField(max_digits=14, decimal_places=2)
        month_revenue = month_settlements.aggregate(
            total=Coalesce(Sum("base_amount"), Decimal("0"), output_field=money_field)
        )["total"]
        due = Settlement.objects.filter(report__user=user).aggregate(
            total=Coalesce(Sum("balance"), Decimal("0"), output_field=money_field)
        )["total"]
        return {
            "role": "user",
            "assigned_devices": DeviceAssignment.objects.filter(user=user, ended_at__isnull=True).count(),
            "monthly_revenue": month_revenue,
            "amount_due": due,
            "pending_payments": Payment.objects.filter(user=user, status=Payment.Status.PENDING).count(),
            "device_count_history": Device.objects.filter(assignments__user=user).distinct().count(),
        }
