from rest_framework import serializers

from finance.models import CommissionRule, Payment, Settlement


class CommissionRuleSerializer(serializers.ModelSerializer):
    base_field_key = serializers.CharField(source="base_field.key", read_only=True)
    base_field_label = serializers.CharField(source="base_field.label", read_only=True)

    class Meta:
        model = CommissionRule
        fields = [
            "id",
            "name",
            "percentage",
            "base_field",
            "base_field_key",
            "base_field_label",
            "effective_from",
            "effective_to",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_percentage(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Percentage must be between 0 and 100.")
        return value

    def validate(self, attrs):
        start = attrs.get("effective_from", getattr(self.instance, "effective_from", None))
        end = attrs.get("effective_to", getattr(self.instance, "effective_to", None))
        field = attrs.get("base_field", getattr(self.instance, "base_field", None))
        if end and start and end < start:
            raise serializers.ValidationError({"effective_to": "End date must be on or after the start date."})
        if field and field.field_type not in field.NUMERIC_TYPES:
            raise serializers.ValidationError({"base_field": "Choose a currency, number, or percentage field."})
        return attrs


class SettlementSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source="report.device.name", read_only=True)
    device_code = serializers.CharField(source="report.device.device_code", read_only=True)
    user_name = serializers.CharField(source="report.user.name", read_only=True)
    user_id = serializers.IntegerField(source="report.user_id", read_only=True)
    year = serializers.IntegerField(source="report.year", read_only=True)
    month = serializers.IntegerField(source="report.month", read_only=True)
    report_status = serializers.CharField(source="report.status", read_only=True)

    class Meta:
        model = Settlement
        fields = [
            "id",
            "report",
            "device_name",
            "device_code",
            "user_name",
            "user_id",
            "year",
            "month",
            "report_status",
            "rule",
            "base_field_key",
            "base_amount",
            "percentage",
            "company_share",
            "amount_due",
            "amount_paid",
            "balance",
            "status",
            "created_at",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    proof_url = serializers.SerializerMethodField()
    user_name = serializers.CharField(source="user.name", read_only=True)
    device_name = serializers.CharField(source="settlement.report.device.name", read_only=True)
    period_year = serializers.IntegerField(source="settlement.report.year", read_only=True)
    period_month = serializers.IntegerField(source="settlement.report.month", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.name", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = [
            "id",
            "settlement",
            "user",
            "user_name",
            "device_name",
            "period_year",
            "period_month",
            "amount",
            "paid_on",
            "method",
            "reference_id",
            "proof",
            "proof_url",
            "status",
            "rejection_reason",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "status",
            "rejection_reason",
            "reviewed_by",
            "reviewed_at",
            "created_at",
            "proof_url",
        ]

    def get_proof_url(self, obj):
        if not obj.proof:
            return None
        return obj.proof.url

    def validate_proof(self, upload):
        name = (upload.name or "").lower()
        if not name.endswith((".pdf", ".jpg", ".jpeg", ".png")):
            raise serializers.ValidationError("Upload a PDF, JPG, or PNG file.")
        if upload.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Proof files must be 5 MB or smaller.")
        return upload

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
