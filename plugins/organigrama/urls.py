"""URL configuration for the Organigrama plugin."""
from django.urls import path
from rest_framework.routers import DefaultRouter
from .viewsets import OrganigramaViewSet, OrgChartViewSet

router = DefaultRouter()
router.register(r"charts", OrgChartViewSet, basename="orgchart")

urlpatterns = [
    path("tree/", OrganigramaViewSet.as_view()),
    path("subtree/", OrganigramaViewSet.as_view()),
] + list(router.urls)
