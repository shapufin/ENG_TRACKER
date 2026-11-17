"""The analytics overview reports real figures and compares like with like (audit 2026-11-17 M6)."""
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from plugins.analytics.models import AnalyticsSnapshot

URL = '/api/plugins/analytics/metrics/'


class OverviewFigureTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(User.objects.create_user('ov_staff', password='x', is_staff=True))
        self.alice = User.objects.create_user('ov_alice', password='x')
        self.bob = User.objects.create_user('ov_bob', password='x')
        self.client_row = Client.objects.create(name='OV', code='OV')
        self.today = timezone.now().date()

    def log(self, user, days_ago, hours):
        OvertimeLog.objects.create(user=user, client=self.client_row, hours=hours,
                                   date=self.today - timedelta(days=days_ago), status='approved')

    def metric(self, data, name):
        return next(m for m in data['metrics'] if m['name'] == name)

    def test_the_previous_period_uses_the_same_user_filter(self):
        self.log(self.alice, 5, 10)
        self.log(self.alice, 40, 10)
        self.log(self.bob, 40, 15)
        self.log(self.bob, 41, 15)
        data = self.api.get(URL, {'users': self.alice.id}).json()
        overtime = self.metric(data, 'Overtime Hours')
        self.assertEqual((overtime['value'], overtime['change'], overtime['trend']), (10.0, 0.0, 'stable'))

    def test_snapshot_rows_carry_the_standby_count_never_an_invented_hour_figure(self):
        AnalyticsSnapshot.objects.create(
            snapshot_type='daily', snapshot_date=self.today, standby_completed_count=3)
        row = self.api.get(URL).json()['recent_snapshots'][0]
        self.assertEqual(row['standby_completed'], 3)
        self.assertNotIn('standby_hours', row)

    def test_rejected_hours_are_not_counted_without_a_status_filter(self):
        """The overview totals equal the source rows, with the export's status rule (money)."""
        from apps.standby.models import StandbyLog

        self.log(self.alice, 3, 2)                       # approved
        OvertimeLog.objects.create(user=self.alice, client=self.client_row, hours=5,
                                   date=self.today - timedelta(days=4), status='rejected')
        OvertimeLog.objects.create(user=self.bob, client=self.client_row, hours=1,
                                   date=self.today - timedelta(days=4), status='pending')
        StandbyLog.objects.create(user=self.alice, date=self.today - timedelta(days=2),
                                  hours=4, status='approved')
        StandbyLog.objects.create(user=self.bob, date=self.today - timedelta(days=2),
                                  hours=6, status='rejected')
        data = self.api.get(URL).json()
        self.assertEqual(self.metric(data, 'Overtime Hours')['value'], 3.0)   # 2 approved + 1 pending
        self.assertEqual(self.metric(data, 'Standby Hours')['value'], 4.0)
        rejected = self.api.get(URL, {'status': 'rejected'}).json()
        self.assertEqual(self.metric(rejected, 'Overtime Hours')['value'], 5.0)
