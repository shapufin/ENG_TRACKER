"""HR month-closure notifications: audience, content, dedupe and handler."""
import datetime
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.permissions.services.role_service import assign_role
from apps.users.models import (
    ApprovalPeriodBoundary,
    ApprovalPeriodClose,
    ApprovalPeriodCloseMember,
)
from plugins.notifications import period_close_signals
from plugins.notifications.models import Notification
from plugins.notifications.types.hr_period import (
    HrPeriodReadyNotification,
    HrPeriodScopeClosedNotification,
)

User = get_user_model()


class HrPeriodNotificationTests(TestCase):
    def setUp(self):
        self.hr = User.objects.create_user('hr1', 'hr1@test.com', 'x')
        assign_role(self.hr, 'hr')
        self.flag_hr = User.objects.create_user('hr2', 'hr2@test.com', 'x')
        self.flag_hr.profile.is_hr_user = True
        self.flag_hr.profile.save(update_fields=['is_hr_user'])
        self.employee = User.objects.create_user('emp', 'emp@test.com', 'x')
        self.lm = User.objects.create_user('lm', 'lm@test.com', 'x')
        self.lm.first_name, self.lm.last_name = 'Lina', 'Manager'
        self.lm.save()
        boundary = ApprovalPeriodBoundary.objects.create(period=datetime.date(2026, 10, 1))
        self.close = ApprovalPeriodClose.objects.create(
            boundary=boundary,
            closed_at=timezone.make_aware(datetime.datetime(2026, 11, 2, 9, 0)),
            closed_by=self.lm,
        )
        ApprovalPeriodCloseMember.objects.create(close=self.close, user=self.employee)

    def test_recipients_are_hr_by_role_or_flag_only(self):
        users = set(HrPeriodScopeClosedNotification().recipients({'close': self.close}))
        self.assertEqual(users, {self.hr, self.flag_hr})

    def test_closer_who_is_hr_is_not_notified_of_own_close(self):
        self.close.closed_by = self.hr
        self.close.save()
        users = set(HrPeriodScopeClosedNotification().recipients({'close': self.close}))
        self.assertNotIn(self.hr, users)

    def test_scope_closed_message_names_closer_month_and_progress(self):
        ctx = {'close': self.close, 'progress': (3, 21)}
        n = HrPeriodScopeClosedNotification()
        self.assertIn('October 2026', n.title(ctx))
        msg = n.message(ctx)
        self.assertIn('Lina Manager', msg)
        self.assertIn('3 of 21', msg)

    def test_scope_closed_message_without_progress(self):
        msg = HrPeriodScopeClosedNotification().message({'close': self.close})
        self.assertIn('Lina Manager', msg)
        self.assertNotIn(' of ', msg)

    def test_dispatch_is_idempotent(self):
        ctx = {'close': self.close}
        HrPeriodScopeClosedNotification().dispatch(ctx)
        HrPeriodScopeClosedNotification().dispatch(ctx)
        self.assertEqual(
            Notification.objects.filter(
                user=self.hr, dedupe_key__startswith='hr-period-scope'
            ).count(),
            1,
        )

    def test_ready_notification_deduped_per_period(self):
        HrPeriodReadyNotification().dispatch({'close': self.close})
        HrPeriodReadyNotification().dispatch({'close': self.close})
        self.assertEqual(
            Notification.objects.filter(user=self.hr, dedupe_key__startswith='hr-period-ready').count(),
            1,
        )

    def _deliver(self, progress):
        with patch.object(period_close_signals, 'payroll_progress', return_value=progress):
            period_close_signals.deliver_close_notifications(self.close.pk)

    def test_handler_sends_scope_closed_only_while_users_remain(self):
        self._deliver({'closed': 3, 'total': 21, 'all_closed': False})
        self.assertTrue(Notification.objects.filter(
            user=self.hr, dedupe_key__startswith='hr-period-scope').exists())
        self.assertFalse(Notification.objects.filter(
            user=self.hr, dedupe_key__startswith='hr-period-ready').exists())

    def test_handler_sends_ready_when_everyone_is_closed(self):
        self._deliver({'closed': 21, 'total': 21, 'all_closed': True})
        self.assertTrue(Notification.objects.filter(
            user=self.hr, dedupe_key__startswith='hr-period-ready').exists())

    def test_handler_without_payroll_run_sends_scope_closed_only(self):
        self._deliver(None)
        self.assertTrue(Notification.objects.filter(
            user=self.hr, dedupe_key__startswith='hr-period-scope').exists())
        self.assertFalse(Notification.objects.filter(
            dedupe_key__startswith='hr-period-ready').exists())

    def test_system_auto_close_notifies_nobody(self):
        self.close.scope_type = 'auto_cutoff'
        self.close.closed_by = None
        self.close.save()
        self._deliver({'closed': 21, 'total': 21, 'all_closed': True})
        self.assertFalse(Notification.objects.filter(
            dedupe_key__startswith='hr-period').exists())
