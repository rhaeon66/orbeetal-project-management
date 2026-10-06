from django.db import models


class LedgerEntry(models.Model):
    class Kind(models.TextChoices):
        COST = "cost", "Cost"
        INCOME = "income", "Income"

    report = models.ForeignKey("reports.MonthlyReport", on_delete=models.CASCADE, related_name="entries")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    description = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=14, decimal_places=2)
    unit = models.CharField(max_length=50)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["kind", "sort_order", "id"]
