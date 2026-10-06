import re

from django.db import models

KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class ReportField(models.Model):
    class FieldType(models.TextChoices):
        CURRENCY = "currency", "Currency"
        NUMBER = "number", "Number"
        PERCENTAGE = "percentage", "Percentage"
        TEXT = "text", "Text"
        DATE = "date", "Date"
        BOOLEAN = "boolean", "Boolean"

    NUMERIC_TYPES = {FieldType.CURRENCY, FieldType.NUMBER, FieldType.PERCENTAGE}

    key = models.SlugField(max_length=50, unique=True)
    label = models.CharField(max_length=120)
    field_type = models.CharField(max_length=20, choices=FieldType.choices)
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_calculated = models.BooleanField(default=False)
    formula = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "label"]

    def __str__(self):
        return self.label

    def clean(self):
        from django.core.exceptions import ValidationError

        if not KEY_PATTERN.match(self.key or ""):
            raise ValidationError({"key": "Use a lowercase key starting with a letter."})
        if self.is_calculated:
            if self.field_type not in self.NUMERIC_TYPES:
                raise ValidationError({"field_type": "Calculated fields must be currency, number, or percentage."})
            if not self.formula.strip():
                raise ValidationError({"formula": "A formula is required for calculated fields."})
        elif self.formula:
            raise ValidationError({"formula": "Only calculated fields can have a formula."})


class MonthlyReport(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"

    device = models.ForeignKey("devices.Device", on_delete=models.PROTECT, related_name="reports")
    assignment = models.ForeignKey(
        "devices.DeviceAssignment", on_delete=models.PROTECT, related_name="reports"
    )
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="reports")
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "-month", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["device", "year", "month"], name="unique_device_month_report"),
            models.CheckConstraint(condition=models.Q(month__gte=1, month__lte=12), name="report_month_range"),
        ]

    def __str__(self):
        return f"{self.device} {self.year}-{self.month:02d}"


class ReportValue(models.Model):
    report = models.ForeignKey(MonthlyReport, on_delete=models.CASCADE, related_name="values")
    field = models.ForeignKey(ReportField, on_delete=models.PROTECT, related_name="values")
    decimal_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    text_value = models.TextField(blank=True)
    date_value = models.DateField(null=True, blank=True)
    bool_value = models.BooleanField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["report", "field"], name="unique_report_field_value"),
        ]
