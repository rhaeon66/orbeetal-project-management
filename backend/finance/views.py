from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from audit.services import write_audit
from finance.models import CommissionRule, Payment, Settlement
from finance.serializers import CommissionRuleSerializer, PaymentSerializer, SettlementSerializer
from finance.services import create_payment, review_payment


class CommissionRuleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    serializer_class = CommissionRuleSerializer
    queryset = CommissionRule.objects.select_related("base_field")
    filterset_fields = ["is_active", "base_field"]
    search_fields = ["name"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        rule = serializer.save()
        write_audit(self.request.user, "rule.created", rule, after=CommissionRuleSerializer(rule).data)

    def perform_update(self, serializer):
        before = CommissionRuleSerializer(serializer.instance).data
        rule = serializer.save()
        write_audit(self.request.user, "rule.updated", rule, before=before, after=CommissionRuleSerializer(rule).data)


class SettlementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SettlementSerializer
    filterset_fields = ["status", "report"]
    search_fields = ["report__device__name", "report__user__name", "base_field_key"]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Settlement.objects.select_related("report__device", "report__user", "rule")
        if self.request.user.is_admin:
            return qs
        return qs.filter(report__user=self.request.user)


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_fields = ["status", "settlement", "method"]
    search_fields = ["reference_id", "user__name", "settlement__report__device__name"]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action in ("approve", "reject"):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Payment.objects.select_related(
            "user", "reviewed_by", "settlement__report__device", "settlement__report__user"
        )
        if self.request.user.is_admin:
            return qs
        return qs.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        settlement = data["settlement"]
        if not request.user.is_admin and settlement.report.user_id != request.user.id:
            return Response({"detail": "You can only pay your own settlements."}, status=status.HTTP_403_FORBIDDEN)
        payment = create_payment(
            settlement=settlement,
            user=request.user,
            amount=data["amount"],
            paid_on=data["paid_on"],
            method=data["method"],
            reference_id=data["reference_id"],
            proof=data["proof"],
        )
        return Response(self.get_serializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        payment = review_payment(self.get_object(), request.user, Payment.Status.APPROVED)
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        payment = review_payment(
            self.get_object(),
            request.user,
            Payment.Status.REJECTED,
            reason=request.data.get("rejection_reason", ""),
        )
        return Response(self.get_serializer(payment).data)
