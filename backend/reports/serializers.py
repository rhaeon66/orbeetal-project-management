from rest_framework import serializers

from reports.formula import FormulaError, calculation_order, tokenize
from reports.models import KEY_PATTERN, MonthlyReport, ReportField, ReportValue


class ReportFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportField
        fields = [
            "id",
            "key",
            "label",
            "field_type",
            "is_required",
            "is_active",
            "sort_order",
            "is_calculated",
            "formula",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_key(self, value):
        if not KEY_PATTERN.match(value or ""):
            raise serializers.ValidationError("Use a lowercase key starting with a letter.")
        return value

    def validate(self, attrs):
        instance = self.instance
        is_calculated = attrs.get("is_calculated", getattr(instance, "is_calculated", False))
        field_type = attrs.get("field_type", getattr(instance, "field_type", None))
        formula = attrs.get("formula", getattr(instance, "formula", ""))
        if is_calculated:
            if field_type not in ReportField.NUMERIC_TYPES:
                raise serializers.ValidationError(
                    {"field_type": "Calculated fields must be currency, number, or percentage."}
                )
            if not str(formula).strip():
                raise serializers.ValidationError({"formula": "A formula is required for calculated fields."})
            try:
                tokenize(formula)
            except FormulaError as exc:
                raise serializers.ValidationError({"formula": str(exc)}) from exc
        elif formula:
            raise serializers.ValidationError({"formula": "Only calculated fields can have a formula."})
        return attrs

    def _check_cycles(self, field):
        fields = list(ReportField.objects.exclude(pk=field.pk))
        fields.append(field)
        try:
            calculation_order(fields)
        except FormulaError as exc:
            raise serializers.ValidationError({"formula": str(exc)}) from exc

    def create(self, validated_data):
        field = ReportField(**validated_data)
        if field.is_calculated:
            self._check_cycles(field)
        field.save()
        return field

    def update(self, instance, validated_data):
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if instance.is_calculated:
            self._check_cycles(instance)
        instance.save()
        return instance


class ReportValueSerializer(serializers.ModelSerializer):
    key = serializers.CharField(source="field.key", read_only=True)
    label = serializers.CharField(source="field.label", read_only=True)
    field_type = serializers.CharField(source="field.field_type", read_only=True)
    is_calculated = serializers.BooleanField(source="field.is_calculated", read_only=True)
    formula = serializers.CharField(source="field.formula", read_only=True)
    sort_order = serializers.IntegerField(source="field.sort_order", read_only=True)

    class Meta:
        model = ReportValue
        fields = [
            "id",
            "key",
            "label",
            "field_type",
            "is_calculated",
            "formula",
            "sort_order",
            "decimal_value",
            "text_value",
            "date_value",
            "bool_value",
        ]


class MonthlyReportSerializer(serializers.ModelSerializer):
    values = ReportValueSerializer(many=True, read_only=True)
    device_name = serializers.CharField(source="device.name", read_only=True)
    device_code = serializers.CharField(source="device.device_code", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)
    settlement_id = serializers.SerializerMethodField()
    input_values = serializers.DictField(write_only=True, required=False)
    submit = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = MonthlyReport
        fields = [
            "id",
            "device",
            "device_name",
            "device_code",
            "assignment",
            "user",
            "user_name",
            "year",
            "month",
            "status",
            "notes",
            "submitted_at",
            "created_at",
            "updated_at",
            "values",
            "settlement_id",
            "input_values",
            "submit",
        ]
        read_only_fields = [
            "id",
            "assignment",
            "user",
            "status",
            "submitted_at",
            "created_at",
            "updated_at",
        ]

    def get_settlement_id(self, obj):
        try:
            return obj.settlement.id
        except MonthlyReport.settlement.RelatedObjectDoesNotExist:
            return None
