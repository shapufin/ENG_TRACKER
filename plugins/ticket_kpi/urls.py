"""
URL routing for the Ticket KPI plugin.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import (
    ExportProfileViewSet,
    TicketUploadViewSet,
    TicketKPIDashboardViewSet,
    TicketKPIReportViewSet,
    KPIEvidenceViewSet,
    TicketOvertimeLinkViewSet,
)

router = DefaultRouter()
router.register(r'profiles', ExportProfileViewSet, basename='ticket-kpi-profile')
router.register(r'upload', TicketUploadViewSet, basename='ticket-kpi-upload')
router.register(r'dashboard', TicketKPIDashboardViewSet, basename='ticket-kpi-dashboard')
router.register(r'reports', TicketKPIReportViewSet, basename='ticket-kpi-report')
router.register(r'evidence', KPIEvidenceViewSet, basename='ticket-kpi-evidence')
router.register(r'links', TicketOvertimeLinkViewSet, basename='ticket-kpi-link')

urlpatterns = [
    path('', include(router.urls)),
]
