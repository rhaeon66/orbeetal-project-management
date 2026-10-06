from rest_framework.routers import DefaultRouter

from finance.views import CommissionRuleViewSet, PaymentViewSet, SettlementViewSet

router = DefaultRouter()
router.register("commission-rules", CommissionRuleViewSet, basename="commission-rule")
router.register("settlements", SettlementViewSet, basename="settlement")
router.register("payments", PaymentViewSet, basename="payment")

urlpatterns = router.urls
