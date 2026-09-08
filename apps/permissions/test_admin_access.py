from django.contrib import admin
from django.contrib.auth.models import User
from django.test import RequestFactory, TestCase

from apps.leave_management.admin import GlobalSettingsAdmin, LeaveBalanceAdmin, LeaveRequestAdmin
from apps.leave_management.models import GlobalSettings, LeaveBalance, LeaveRequest
from apps.standby.admin import StandbyLogAdmin, StandbyPatternAdmin
from apps.standby.models import StandbyLog, StandbyPattern
from plugins.analytics.admin import (
    AnalyticsConfigurationAdmin,
    AnalyticsMetricAdmin,
    AnalyticsSnapshotAdmin,
    ReportTemplateAdmin,
    ScheduledReportAdmin,
)
from plugins.analytics.models import (
    AnalyticsConfiguration,
    AnalyticsMetric,
    AnalyticsSnapshot,
    ReportTemplate as AnalyticsReportTemplate,
    ScheduledReport,
)
from plugins.audit_log.admin import AuditLogAdmin, AuditLogFilterAdmin
from plugins.audit_log.models import AuditLog, AuditLogFilter
from plugins.control_room.admin import ControlRoomAccessAdmin, ControlRoomTeamScopeAdmin
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope


class SuperuserOnlyAdminTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.staff = User.objects.create_user('admin-staff', is_staff=True)
        self.superuser = User.objects.create_superuser(
            'admin-superuser', password='testpass'
        )

    def request_for(self, user):
        request = self.factory.get('/admin/')
        request.user = user
        return request

    def admin_instances(self):
        definitions = [
            (GlobalSettings, GlobalSettingsAdmin),
            (LeaveBalance, LeaveBalanceAdmin),
            (LeaveRequest, LeaveRequestAdmin),
            (StandbyPattern, StandbyPatternAdmin),
            (StandbyLog, StandbyLogAdmin),
            (AnalyticsSnapshot, AnalyticsSnapshotAdmin),
            (AnalyticsMetric, AnalyticsMetricAdmin),
            (AnalyticsConfiguration, AnalyticsConfigurationAdmin),
            (ScheduledReport, ScheduledReportAdmin),
            (AnalyticsReportTemplate, ReportTemplateAdmin),
            (AuditLog, AuditLogAdmin),
            (AuditLogFilter, AuditLogFilterAdmin),
            (ControlRoomAccess, ControlRoomAccessAdmin),
            (ControlRoomTeamScope, ControlRoomTeamScopeAdmin),
        ]
        return [admin_class(model, admin.site) for model, admin_class in definitions]

    def test_non_superusers_have_no_sensitive_admin_permissions(self):
        request = self.request_for(self.staff)
        for model_admin in self.admin_instances():
            with self.subTest(model=model_admin.model.__name__):
                self.assertFalse(model_admin.has_module_permission(request))
                self.assertFalse(model_admin.has_view_permission(request))
                self.assertFalse(model_admin.has_add_permission(request))
                self.assertFalse(model_admin.has_change_permission(request))
                self.assertFalse(model_admin.has_delete_permission(request))

    def test_superusers_retain_sensitive_admin_permissions(self):
        request = self.request_for(self.superuser)
        for model_admin in self.admin_instances():
            with self.subTest(model=model_admin.model.__name__):
                self.assertTrue(model_admin.has_module_permission(request))
                self.assertTrue(model_admin.has_view_permission(request))
                self.assertTrue(model_admin.has_add_permission(request))
                self.assertTrue(model_admin.has_change_permission(request))
                # LeaveRequest deletion is intentionally disabled for all
                # admin users so domain cleanup stays in the API/viewset path.
                expected_delete = model_admin.model.__name__ != 'LeaveRequest'
                self.assertEqual(
                    model_admin.has_delete_permission(request),
                    expected_delete,
                )
