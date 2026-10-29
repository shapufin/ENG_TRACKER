"""Editing an approved record puts it back to pending: the approver must be
told it needs re-approval, and the author must not get an "is now pending"
warning about their own edit."""
import datetime
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team, TeamMembership

from .models import Notification

User = get_user_model()


@patch('plugins.notifications.signals.send_push_notification')
class ResubmissionNotificationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='emp', password='x')
        self.tl = User.objects.create_user(username='tl', password='x')
        team = Team.objects.create(name='Ops', code='OPS', team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.user.profile, team=team)
        self.client_obj = Client.objects.create(name='Acme')

    def _approved_overtime(self):
        log = OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date='2026-08-03', hours=2.0,
            start_time=datetime.time(18, 0), end_time=datetime.time(20, 0),
            description='x',
        )
        log.status = 'approved'
        log.save()
        Notification.objects.all().delete()
        return log

    def test_overtime_reopened_alerts_leader_not_author(self, _push):
        log = self._approved_overtime()
        log.status = 'pending'
        log.save()
        self.assertTrue(Notification.objects.filter(
            user=self.tl, title='Action Required: Overtime Log Resubmitted',
        ).exists())
        self.assertFalse(Notification.objects.filter(user=self.user).exists())

    def test_overtime_rejection_still_notifies_author(self, _push):
        log = self._approved_overtime()
        log.status = 'rejected'
        log.save()
        self.assertTrue(Notification.objects.filter(
            user=self.user, title='Overtime Log Updated').exists())
        self.assertFalse(Notification.objects.filter(user=self.tl).exists())

    def test_standby_reopened_alerts_leader_not_author(self, _push):
        log = StandbyLog.objects.create(
            user=self.user, date='2026-08-03', start_time=datetime.time(18, 0),
            end_time=datetime.time(20, 0), description='x',
        )
        log.status = 'approved'
        log.save()
        Notification.objects.all().delete()
        log.status = 'pending'
        log.save()
        self.assertTrue(Notification.objects.filter(
            user=self.tl, title='Action Required: Standby Log Resubmitted',
        ).exists())
        self.assertFalse(Notification.objects.filter(user=self.user).exists())


@patch('plugins.notifications.signals.send_push_notification')
class PendingDeletionNotificationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='emp', password='x')
        self.tl = User.objects.create_user(username='tl', password='x')
        team = Team.objects.create(name='Ops', code='OPS', team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.user.profile, team=team)

    def _overtime(self, status):
        log = OvertimeLog.objects.create(
            user=self.user, client=Client.objects.get_or_create(name='Acme')[0],
            date='2026-08-03', hours=2.0, start_time=datetime.time(18, 0),
            end_time=datetime.time(20, 0), description='x',
        )
        if status != 'pending':
            log.status = status
            log.save()
        Notification.objects.all().delete()
        return log

    def test_deleting_pending_overtime_alerts_leader(self, _push):
        self._overtime('pending').delete()
        self.assertTrue(Notification.objects.filter(
            user=self.tl, title='Overtime Log Deleted').exists())

    def test_deleting_decided_overtime_is_silent(self, _push):
        self._overtime('approved').delete()
        self.assertFalse(Notification.objects.filter(user=self.tl).exists())

    def test_deleting_pending_standby_alerts_leader(self, _push):
        log = StandbyLog.objects.create(
            user=self.user, date='2026-08-03', start_time=datetime.time(18, 0),
            end_time=datetime.time(20, 0), description='x',
        )
        Notification.objects.all().delete()
        log.delete()
        self.assertTrue(Notification.objects.filter(
            user=self.tl, title='Standby Log Deleted').exists())

    def test_skip_flag_silences_deletion(self, _push):
        log = self._overtime('pending')
        log._skip_notifications = True
        log.delete()
        self.assertFalse(Notification.objects.filter(user=self.tl).exists())

    def test_single_delete_endpoint_alerts_leader_bulk_does_not(self, _push):
        from rest_framework.test import APIClient
        api = APIClient()
        api.force_authenticate(self.user)
        single = self._overtime('pending')
        self.assertEqual(api.delete(f'/api/overtime/logs/{single.id}/?ignore_date_filter=true').status_code, 204)
        self.assertEqual(Notification.objects.filter(user=self.tl).count(), 1)
        Notification.objects.all().delete()
        bulk = self._overtime('pending')
        response = api.post('/api/overtime/logs/bulk_delete/', {'ids': [bulk.id]}, format='json')
        self.assertEqual(response.data['deleted_count'], 1)
        self.assertFalse(Notification.objects.filter(user=self.tl).exists())
