from django.urls import path

from routing.views import GeocodeView, HealthView, PlanView, ReverseGeocodeView

urlpatterns = [
    path("plan", PlanView.as_view(), name="plan"),
    path("geocode", GeocodeView.as_view(), name="geocode"),
    path("reverse", ReverseGeocodeView.as_view(), name="reverse"),
    path("health", HealthView.as_view(), name="health"),
]
