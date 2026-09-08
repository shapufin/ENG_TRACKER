"""
Reports app URL configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import (
    ReportTemplateViewSet, GeneratedReportViewSet,
    SummaryReportView, DetailedReportView, ExportExcelView,
    AuditLogViewSet, InsightsView, TopTeamLeadersView,
    ExportOTStandbyView, ExportLeaveView,
)

router = DefaultRouter()
router.register(r'templates', ReportTemplateViewSet, basename='reporttemplate')
router.register(r'generated', GeneratedReportViewSet, basename='generatedreport')
router.register(r'audit-logs', AuditLogViewSet, basename='auditlog')

urlpatterns = [
    path('', include(router.urls)),
    path('summary/', SummaryReportView.as_view(), name='report-summary'),
    path('detailed/', DetailedReportView.as_view(), name='report-detailed'),
    path('export-excel/', ExportExcelView.as_view(), name='report-export-excel'),
    path('export-ot-standby/', ExportOTStandbyView.as_view(), name='report-export-ot-standby'),
    path('export-leave/', ExportLeaveView.as_view(), name='report-export-leave'),
    path('insights/', InsightsView.as_view(), name='report-insights'),
    path('top-team-leaders/', TopTeamLeadersView.as_view(), name='report-top-team-leaders'),
]
