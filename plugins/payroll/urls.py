"""
URL configuration for the Payroll plugin.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .viewsets import (
    WageAssignmentViewSet,
    PayrollRunViewSet,
    PayrollConfigurationViewSet,
    PayrollRuleSetViewSet,
    PayrollWorkCalendarViewSet,
)

router = DefaultRouter()
router.register(r'wages', WageAssignmentViewSet, basename='payroll-wage')
router.register(r'runs', PayrollRunViewSet, basename='payroll-run')
router.register(r'configuration', PayrollConfigurationViewSet, basename='payroll-configuration')
router.register(r'rule-sets', PayrollRuleSetViewSet, basename='payroll-ruleset')
router.register(r'work-calendar', PayrollWorkCalendarViewSet, basename='payroll-workcalendar')

urlpatterns = [
    path('', include(router.urls)),
]
