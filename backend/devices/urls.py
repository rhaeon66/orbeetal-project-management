from rest_framework.routers import DefaultRouter

from devices.views import AssignmentViewSet, DeviceViewSet

router = DefaultRouter()
router.register("devices", DeviceViewSet, basename="device")
router.register("assignments", AssignmentViewSet, basename="assignment")

urlpatterns = router.urls
