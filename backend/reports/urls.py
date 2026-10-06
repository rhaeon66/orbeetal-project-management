from django.urls import path
from rest_framework.routers import DefaultRouter

from reports.views import MonthlyReportViewSet, ReportFieldViewSet, WorkspaceView

router = DefaultRouter()
router.register("report-fields", ReportFieldViewSet, basename="report-field")
router.register("reports", MonthlyReportViewSet, basename="report")

urlpatterns = [path("workspace/", WorkspaceView.as_view(), name="workspace"), *router.urls]
