from datetime import date
import io
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.utils import timezone
from django.urls import set_urlconf
from django.urls.resolvers import _get_cached_resolver, get_ns_resolver
from importlib import reload
from plugins.analytics.models import AnalyticsSnapshot, AnalyticsMetric, AnalyticsConfiguration
from plugins.analytics.plugin import AnalyticsPlugin
from plugins.analytics.reports import AnalyticsReportGenerator
from plugins.analytics.viewsets import AnalyticsMetricViewSet
from apps.overtime.models import OvertimeLog, Client as OvertimeClient
from apps.leave_management.models import LeaveRequest
from core.plugins.registry import plugin_registry
from apps.plugins import urls as plugins_urls
from config import urls as root_urls


def _ensure_analytics_urls():
    """Activate analytics plugin and reload URLconf so tests can reach its endpoints."""
    plugin_registry.activate_plugin('analytics')
    reload(plugins_urls)
    reload(root_urls)
    _get_cached_resolver.cache_clear()
    get_ns_resolver.cache_clear()
    set_urlconf(None)


class AnalyticsPluginTestCase(TestCase):
    def setUp(self):
        self.plugin = AnalyticsPlugin()

    def test_plugin_metadata(self):
        """Test plugin metadata."""
        self.assertEqual(self.plugin.name, 'analytics')
        self.assertEqual(self.plugin.version, '1.0.0')
        self.assertIn('Analytics', self.plugin.verbose_name)

    def test_plugin_config_schema(self):
        """Test plugin configuration schema."""
        schema = self.plugin.get_config_schema()
        self.assertIn('snapshot_frequency', schema)
        self.assertIn('retention_days', schema)
        self.assertIn('enable_metrics', schema)

    def test_plugin_config_validation(self):
        """Test plugin configuration validation."""
        # Valid config
        valid_config = {'retention_days': 90}
        self.assertTrue(self.plugin.validate_config(valid_config))

        # Invalid config
        invalid_config = {'retention_days': -1}
        with self.assertRaises(ValueError):
            self.plugin.validate_config(invalid_config)


class AnalyticsSnapshotTestCase(TestCase):
    def setUp(self):
        self.snapshot = AnalyticsSnapshot.objects.create(
            snapshot_type='daily',
            snapshot_date=timezone.now().date(),
            leave_approved_count=10,
            leave_pending_count=5,
            leave_rejected_count=2,
            leave_total_days=50,
            overtime_approved_hours=20,
            overtime_pending_hours=5,
            standby_scheduled_count=3,
            standby_completed_count=2,
        )

    def test_snapshot_creation(self):
        """Test snapshot creation."""
        self.assertEqual(self.snapshot.snapshot_type, 'daily')
        self.assertEqual(self.snapshot.leave_approved_count, 10)

    def test_snapshot_str(self):
        """Test snapshot string representation."""
        self.assertIn('Daily', str(self.snapshot))


class AnalyticsMetricTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.metric = AnalyticsMetric.objects.create(
            metric_type='leave_approval_rate',
            user=self.user,
            value=85.5,
            label='Approval Rate',
            metadata={'period': 'monthly'}
        )

    def test_metric_creation(self):
        """Test metric creation."""
        self.assertEqual(self.metric.metric_type, 'leave_approval_rate')
        self.assertEqual(self.metric.value, 85.5)
        self.assertEqual(self.metric.user, self.user)

    def test_metric_str(self):
        """Test metric string representation."""
        self.assertIn('85.5', str(self.metric))


class AnalyticsIntegrationTestCase(TestCase):
    def setUp(self):
        _ensure_analytics_urls()
        self.client = Client()
        self.user = User.objects.create_superuser(
            username='admin',
            email='admin@example.com',
            password='password123'
        )
        self.client.force_login(self.user)
        self.overtime_client = OvertimeClient.objects.create(
            name='Test Client',
            code='TEST'
        )

    def test_metrics_endpoint_with_no_data(self):
        """Test metrics endpoint returns zeros when no data exists."""
        response = self.client.get('/api/plugins/analytics/metrics/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['total_snapshots'], 0)
        # Check that metrics have values
        for metric in data['metrics']:
            self.assertIn('value', metric)
            self.assertIn('change', metric)

    def test_metrics_endpoint_with_data(self):
        """Test metrics endpoint calculates correctly with sample data."""
        # Create sample overtime logs
        OvertimeLog.objects.create(
            user=self.user,
            client=self.overtime_client,
            date=timezone.now().date(),
            hours=8,
            status='approved',
        )
        response = self.client.get('/api/plugins/analytics/metrics/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Find the "Overtime Hours" metric.
        overtime_metric = next(
            (m for m in data['metrics'] if m.get('name') == 'Overtime Hours'), None
        )
        self.assertIsNotNone(overtime_metric)
        self.assertGreater(overtime_metric['value'], 0)

    def test_metrics_endpoint_returns_all_snapshots_in_range(self):
        """Metrics endpoint must return every snapshot in the period, not a capped subset."""
        from datetime import timedelta
        from plugins.analytics.models import AnalyticsSnapshot
        base = timezone.now().date()
        # Create 15 daily snapshots (more than the old [:10] cap) within the
        # default 30-day month window.
        for i in range(15):
            AnalyticsSnapshot.objects.create(
                snapshot_type='daily',
                snapshot_date=base - timedelta(days=i),
                leave_approved_count=1,
                overtime_approved_hours=1,
                standby_completed_count=1,
            )
        response = self.client.get('/api/plugins/analytics/metrics/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['total_snapshots'], 15)
        self.assertEqual(len(data['recent_snapshots']), 15)
        # Newest first (table order); frontend chart reverses to chronological.
        self.assertEqual(data['recent_snapshots'][0]['timestamp'][:10], base.isoformat())

    def test_trends_endpoint_returns_aggregated_data(self):
        """Trends endpoint aggregates OT/standby/leave by day for month period."""
        from datetime import timedelta
        from apps.standby.models import StandbyLog
        from apps.leave_management.models import LeaveRequest
        today = timezone.now().date()
        # Create overtime logs on 3 different days
        for i in range(3):
            OvertimeLog.objects.create(
                user=self.user,
                client=self.overtime_client,
                date=today - timedelta(days=i),
                hours=8,
                status='approved',
            )
        # Create a standby log
        StandbyLog.objects.create(
            user=self.user,
            date=today,
            hours=4,
            status='approved',
        )
        # Create leave requests with different statuses.
        # Use a guaranteed weekday for both to avoid "Leave must include at
        # least one business day" validation errors when the test runs on a
        # weekend. Both must start on the same day so the trends endpoint
        # groups them together (count=2).
        weekday = today
        while weekday.weekday() >= 5:  # 5=Saturday, 6=Sunday
            weekday += timedelta(days=1)
        LeaveRequest.objects.create(
            user=self.user,
            request_type='vacation',
            start_date=weekday,
            end_date=weekday + timedelta(days=2),
            status='approved',
        )
        LeaveRequest.objects.create(
            user=self.user,
            request_type='sick',
            start_date=weekday,
            end_date=weekday,
            status='pending',
        )
        response = self.client.get('/api/plugins/analytics/metrics/trends/?period=month')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('overtime', data)
        self.assertIn('standby', data)
        self.assertIn('leave', data)
        self.assertIn('user_activity', data)
        self.assertGreater(len(data['overtime']), 0)
        self.assertEqual(data['overtime'][0]['hours'], 8.0)
        self.assertGreater(len(data['standby']), 0)
        self.assertEqual(data['standby'][0]['hours'], 4.0)
        self.assertGreater(len(data['leave']), 0)
        self.assertEqual(data['leave'][0]['count'], 2)
        self.assertEqual(data['leave'][0]['approved'], 1)
        self.assertEqual(data['leave'][0]['pending'], 1)
        self.assertEqual(data['leave'][0]['rejected'], 0)

    def test_trends_endpoint_year_uses_monthly_truncation(self):
        """Trends endpoint with year period aggregates by month, not day."""
        from datetime import timedelta
        today = timezone.now().date()
        # Create logs 100 days apart (different months)
        OvertimeLog.objects.create(
            user=self.user, client=self.overtime_client,
            date=today, hours=10, status='approved',
        )
        OvertimeLog.objects.create(
            user=self.user, client=self.overtime_client,
            date=today - timedelta(days=100), hours=20, status='approved',
        )
        response = self.client.get('/api/plugins/analytics/metrics/trends/?period=year')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Monthly truncation should produce at most 12 buckets, not 365
        self.assertLessEqual(len(data['overtime']), 12)
        # Both months should appear
        self.assertGreaterEqual(len(data['overtime']), 2)

    def test_trends_endpoint_respects_category_filter(self):
        """Trends endpoint respects category filter — excluded categories return empty arrays."""
        from apps.standby.models import StandbyLog
        today = timezone.now().date()
        OvertimeLog.objects.create(
            user=self.user, client=self.overtime_client,
            date=today, hours=8, status='approved',
        )
        StandbyLog.objects.create(
            user=self.user, date=today, hours=4, status='approved',
        )
        # Filter to overtime only — standby should be empty
        response = self.client.get('/api/plugins/analytics/metrics/trends/?period=month&category=overtime')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data['overtime']), 0)
        self.assertEqual(len(data['standby']), 0)
        self.assertEqual(len(data['leave']), 0)

    def test_trends_endpoint_filters_hours_by_work_date(self):
        """OT trends include records by work date, not submission timestamp."""
        from datetime import timedelta

        work_date = timezone.now().date() - timedelta(days=10)
        OvertimeLog.objects.create(
            user=self.user,
            client=self.overtime_client,
            date=work_date,
            hours=6,
            status='approved',
        )
        response = self.client.get(
            '/api/plugins/analytics/metrics/trends/',
            {'date_from': work_date.isoformat(), 'date_to': work_date.isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['overtime']), 1)
        self.assertEqual(data['overtime'][0]['date'], work_date.isoformat())
        self.assertEqual(data['overtime'][0]['hours'], 6.0)

    def test_trends_endpoint_empty_data(self):
        """Trends endpoint returns empty arrays (not 404) when no OT/standby/leave data exists."""
        response = self.client.get('/api/plugins/analytics/metrics/trends/?period=month')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['overtime'], [])
        self.assertEqual(data['standby'], [])
        self.assertEqual(data['leave'], [])
        # user_activity may contain the test superuser (date_joined in current period)
        self.assertIsInstance(data['user_activity'], list)

    def test_summary_endpoint_decimal_handling(self):
        """Test summary endpoint handles Decimal fields correctly."""
        # Create sample data to trigger Decimal aggregation
        OvertimeLog.objects.create(
            user=self.user,
            client=self.overtime_client,
            date=timezone.now().date(),
            hours=5.5,
            status='approved',
        )
        response = self.client.get('/api/plugins/analytics/metrics/summary/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Verify numeric fields are numbers, not strings
        self.assertIsInstance(data['total_hours'], (int, float))
        self.assertIsInstance(data['overtime_hours'], (int, float))
        self.assertEqual(data['total_hours'], 5.5)

    def test_export_endpoint_access(self):
        """Test export endpoint security and basic functionality."""
        response = self.client.get('/api/plugins/analytics/metrics/export/?export_format=csv')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Content-Type'), 'text/csv')
        self.assertIn('attachment', response.get('Content-Disposition', ''))


class AnalyticsLeaveDaysBusinessDaysTests(TestCase):
    """Daily summary Leave Days must count business days spanned, not requests.

    Regression: ``_daily_summary_rows`` used ``Count('id')`` grouped by
    ``created_at``, so a 5-day leave request contributed 1 to its creation
    date and 0 to every other day. Must use business days spanning each date.
    """

    def test_five_day_leave_contributes_one_per_business_day(self):
        user = User.objects.create_user(username='leave-emp', password='testpass')
        # Mon 2026-07-06 .. Fri 2026-07-10: 5 business days
        LeaveRequest.objects.create(
            user=user,
            request_type='vacation',
            start_date=date(2026, 7, 6),
            end_date=date(2026, 7, 10),
            status='approved',
            reason='week',
        )
        rows = AnalyticsReportGenerator._daily_summary_rows(
            start_date=date(2026, 7, 6),
            end_date=date(2026, 7, 10),
            leave_data=LeaveRequest.objects.all(),
            overtime_data=OvertimeLog.objects.none(),
            standby_data=OvertimeLog.objects.none(),
            include_leave=True,
            include_overtime=False,
            include_standby=False,
        )
        for row in rows:
            self.assertEqual(row['Leave Days'], 1, row)
        self.assertEqual(len(rows), 5)

    def test_weekend_spanning_leave_excludes_weekends(self):
        user = User.objects.create_user(username='leave-emp2', password='testpass')
        # Fri 2026-07-10 .. Mon 2026-07-13: 2 business days (Fri, Mon)
        LeaveRequest.objects.create(
            user=user,
            request_type='vacation',
            start_date=date(2026, 7, 10),
            end_date=date(2026, 7, 13),
            status='approved',
            reason='weekend-span',
        )
        rows = AnalyticsReportGenerator._daily_summary_rows(
            start_date=date(2026, 7, 10),
            end_date=date(2026, 7, 13),
            leave_data=LeaveRequest.objects.all(),
            overtime_data=OvertimeLog.objects.none(),
            standby_data=OvertimeLog.objects.none(),
            include_leave=True,
            include_overtime=False,
            include_standby=False,
        )
        by_date = {r['Date']: r['Leave Days'] for r in rows}
        self.assertEqual(by_date[date(2026, 7, 10)], 1)  # Fri
        self.assertEqual(by_date[date(2026, 7, 11)], 0)  # Sat
        self.assertEqual(by_date[date(2026, 7, 12)], 0)  # Sun
        self.assertEqual(by_date[date(2026, 7, 13)], 1)  # Mon

    def test_overtime_hours_aggregated_by_work_date_not_created_at(self):
        """OT/Standby daily summary must group by the ``date`` field (work
        date), not ``created_at`` (submission timestamp).

        Regression: ``_daily_summary_rows`` used ``TruncDate('created_at')``,
        so a log submitted today for yesterday's work appeared under today
        instead of yesterday.
        """
        from apps.standby.models import StandbyLog
        user = User.objects.create_user(username='ot-emp', password='testpass')
        client = OvertimeClient.objects.create(name='OT Client')
        # Work date is 2026-07-06; record is created "now" (different date).
        OvertimeLog.objects.create(
            user=user, client=client,
            date=date(2026, 7, 6), hours=5, status='approved',
        )
        StandbyLog.objects.create(
            user=user, date=date(2026, 7, 6), hours=3, status='approved',
        )
        rows = AnalyticsReportGenerator._daily_summary_rows(
            start_date=date(2026, 7, 6),
            end_date=date(2026, 7, 6),
            leave_data=LeaveRequest.objects.none(),
            overtime_data=OvertimeLog.objects.filter(user=user),
            standby_data=StandbyLog.objects.filter(user=user),
            include_leave=False,
            include_overtime=True,
            include_standby=True,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['Date'], date(2026, 7, 6))
        self.assertEqual(float(rows[0]['OT Hours']), 5.0)
        self.assertEqual(float(rows[0]['Standby Hours']), 3.0)


class AnalyticsUserBreakdownTests(TestCase):
    """User Breakdown + Raw Records sheets — per-user aggregated and
    per-record detail for actionable insight."""

    def setUp(self):
        from apps.standby.models import StandbyLog
        from apps.users.models.core import UserProfile, Team
        self.user1 = User.objects.create_user(
            username='alpha-emp', password='testpass',
            first_name='Alpha', last_name='Employee',
        )
        self.user2 = User.objects.create_user(
            username='beta-emp', password='testpass',
            first_name='Beta', last_name='Employee',
        )
        self.team = Team.objects.create(name='Alpha Team', code='ALPHA')
        UserProfile.objects.filter(user=self.user1).update_or_create(
            user=self.user1,
        )
        profile1 = self.user1.profile
        profile1.teams.add(self.team)
        self.client_obj = OvertimeClient.objects.create(name='Client A', code='CA')
        # Overtime: user1 gets 8h approved, user2 gets 4h approved
        OvertimeLog.objects.create(
            user=self.user1, client=self.client_obj,
            date=date(2026, 7, 6), hours=8, status='approved',
        )
        OvertimeLog.objects.create(
            user=self.user2, client=self.client_obj,
            date=date(2026, 7, 7), hours=4, status='approved',
        )
        # Standby: user1 gets 3h
        StandbyLog.objects.create(
            user=self.user1, date=date(2026, 7, 6), hours=3, status='approved',
        )
        # Leave: user2 takes 3 business days (Mon-Wed)
        LeaveRequest.objects.create(
            user=self.user2, request_type='vacation',
            start_date=date(2026, 7, 6), end_date=date(2026, 7, 8),
            status='approved', reason='summer',
        )

    def test_user_summary_aggregates_per_user(self):
        """User Summary sheet has one row per user with OT/standby/leave aggregated."""
        from apps.standby.models import StandbyLog
        rows = AnalyticsReportGenerator._user_summary_rows(
            leave_data=LeaveRequest.objects.all(),
            overtime_data=OvertimeLog.objects.all(),
            standby_data=StandbyLog.objects.all(),
            include_leave=True, include_overtime=True, include_standby=True,
        )
        by_user = {r['Username']: r for r in rows}
        self.assertIn('alpha-emp', by_user)
        self.assertIn('beta-emp', by_user)
        # User1: 8h OT + 3h standby, 0 leave
        self.assertEqual(float(by_user['alpha-emp']['OT Hours']), 8.0)
        self.assertEqual(float(by_user['alpha-emp']['Standby Hours']), 3.0)
        self.assertEqual(by_user['alpha-emp']['Leave Count'], 0)
        self.assertEqual(by_user['alpha-emp']['Leave Days'], 0)
        # User2: 4h OT, 1 leave request = 3 business days (Mon-Wed)
        self.assertEqual(float(by_user['beta-emp']['OT Hours']), 4.0)
        self.assertEqual(by_user['beta-emp']['Leave Count'], 1)
        self.assertEqual(by_user['beta-emp']['Leave Days'], 3)
        # User1 has team name resolved
        self.assertEqual(by_user['alpha-emp']['Team'], 'Alpha Team')
        # Display name falls back to full name
        self.assertEqual(by_user['alpha-emp']['User'], 'Alpha Employee')

    def test_user_summary_respects_category_filter(self):
        """When categories are excluded, those fields stay zero."""
        from apps.standby.models import StandbyLog
        rows = AnalyticsReportGenerator._user_summary_rows(
            leave_data=LeaveRequest.objects.none(),
            overtime_data=OvertimeLog.objects.all(),
            standby_data=StandbyLog.objects.none(),
            include_leave=False, include_overtime=True, include_standby=False,
        )
        by_user = {r['Username']: r for r in rows}
        # OT still counted, standby/leave zero
        self.assertEqual(float(by_user['alpha-emp']['OT Hours']), 8.0)
        self.assertEqual(float(by_user['alpha-emp']['Standby Hours']), 0.0)
        self.assertEqual(by_user['alpha-emp']['Leave Count'], 0)

    def test_raw_records_has_every_record(self):
        """Raw Records sheet has one row per OT/standby/leave record."""
        from apps.standby.models import StandbyLog
        rows = AnalyticsReportGenerator._raw_records_rows(
            leave_data=LeaveRequest.objects.all(),
            overtime_data=OvertimeLog.objects.all(),
            standby_data=StandbyLog.objects.all(),
            include_leave=True, include_overtime=True, include_standby=True,
        )
        # 2 OT + 1 standby + 1 leave = 4 rows
        self.assertEqual(len(rows), 4)
        categories = {r['Category'] for r in rows}
        self.assertEqual(categories, {'Overtime', 'Standby', 'Leave'})
        # Check OT record has client + work date
        ot_rows = [r for r in rows if r['Category'] == 'Overtime']
        self.assertEqual(len(ot_rows), 2)
        # Both OT records have the client name
        for ot in ot_rows:
            self.assertEqual(ot['Client'], 'Client A')
        # Find the user1 record (8h on 2026-07-06)
        alpha_ot = next(r for r in ot_rows if r['Username'] == 'alpha-emp')
        self.assertEqual(alpha_ot['Date'], date(2026, 7, 6))
        self.assertEqual(float(alpha_ot['Hours']), 8.0)
        # Check leave record has business days
        leave_rows = [r for r in rows if r['Category'] == 'Leave']
        self.assertEqual(len(leave_rows), 1)
        self.assertEqual(leave_rows[0]['Leave Days'], 3)
        self.assertEqual(leave_rows[0]['Hours'], '')

    def test_excel_export_contains_user_breakdown_sheet(self):
        """Excel export includes the User Breakdown sheet."""
        import openpyxl
        data = AnalyticsReportGenerator.generate_excel_report(
            period='custom', date_from='2026-07-01', date_to='2026-07-31',
        )
        wb = openpyxl.load_workbook(io.BytesIO(data))
        self.assertIn('User Breakdown', wb.sheetnames)
        self.assertIn('Raw Records', wb.sheetnames)
        self.assertIn('Daily Summary', wb.sheetnames)
        # User Breakdown has data
        ws = wb['User Breakdown']
        # Header row + at least 2 user rows
        self.assertGreater(ws.max_row, 2)
        headers = [cell.value for cell in ws[1]]
        self.assertIn('User', headers)
        self.assertIn('OT Hours', headers)
        self.assertIn('Leave Days', headers)

    def test_csv_export_is_user_breakdown(self):
        """CSV export produces the User Breakdown (not daily summary)."""
        import csv as csv_mod
        data = AnalyticsReportGenerator.generate_csv_report(
            period='custom', date_from='2026-07-01', date_to='2026-07-31',
        )
        reader = csv_mod.DictReader(io.StringIO(data))
        rows = list(reader)
        self.assertGreater(len(rows), 0)
        self.assertIn('User', rows[0])
        self.assertIn('OT Hours', rows[0])
        self.assertIn('Leave Days', rows[0])
        # Should NOT have 'Date' as first column (that's daily summary)
        self.assertNotIn('Date', rows[0])


class AnalyticsInsightsTests(TestCase):
    """Automated insights engine — trend detection, concentration, backlog."""

    def setUp(self):
        self.user1 = User.objects.create_user(
            username='insight-emp1', password='testpass',
            first_name='Insight', last_name='One',
        )
        self.user2 = User.objects.create_user(
            username='insight-emp2', password='testpass',
            first_name='Insight', last_name='Two',
        )
        self.client_obj = OvertimeClient.objects.create(name='Insight Client', code='IC')

    def test_trend_up_detected_when_ot_increases(self):
        """Insights engine detects a >15% increase in overtime."""
        from plugins.analytics.insights import generate_insights
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        # Previous period: 4h OT
        OvertimeLog.objects.create(
            user=self.user1, client=self.client_obj,
            date=(now - timedelta(days=35)).date(), hours=4, status='approved',
        )
        # Current period: 20h OT (5x increase)
        OvertimeLog.objects.create(
            user=self.user1, client=self.client_obj,
            date=now.date(), hours=20, status='approved',
        )
        start = now - timedelta(days=30)
        from django.db.models import Q
        ot_filters = Q(date__gte=start.date(), date__lte=now.date())
        insights = generate_insights(
            start, now, Q(), ot_filters, Q(), []
        )
        trend_insights = [i for i in insights if i['type'] == 'trend_up']
        self.assertTrue(trend_insights, 'expected at least one trend_up insight')
        self.assertIn('Overtime', trend_insights[0]['title'])
        self.assertGreater(trend_insights[0]['change'], 15)

    def test_concentration_detected_when_one_user_dominates(self):
        """Insights engine flags when one user has >40% of overtime."""
        from plugins.analytics.insights import generate_insights
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        start = now - timedelta(days=30)
        # User1: 20h (split across 3 days, max 24h/day), User2: 4h → user1 has 83% share
        for i in range(3):
            OvertimeLog.objects.create(
                user=self.user1, client=self.client_obj,
                date=(now - timedelta(days=i)).date(), hours=8, status='approved',
            )
        OvertimeLog.objects.create(
            user=self.user2, client=self.client_obj,
            date=now.date(), hours=4, status='approved',
        )
        from django.db.models import Q
        ot_filters = Q(date__gte=start.date(), date__lte=now.date())
        insights = generate_insights(
            start, now, Q(), ot_filters, Q(), []
        )
        conc = [i for i in insights if i['type'] == 'concentration']
        self.assertTrue(conc, 'expected concentration insight')
        self.assertIn('Insight One', conc[0]['title'])
        self.assertEqual(conc[0]['severity'], 'warning')

    def test_backlog_detected_when_many_pending(self):
        """Insights engine flags 5+ pending leave requests."""
        from plugins.analytics.insights import generate_insights
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        start = now - timedelta(days=30)
        # Create 6 pending leave requests on business days (Mon-Fri)
        # Start from next Monday to avoid weekend validation errors
        today = now.date()
        days_to_monday = (7 - today.weekday()) % 7
        base = today + timedelta(days=days_to_monday)
        for i in range(6):
            d = base + timedelta(days=i * 7)  # one per week, all business days
            LeaveRequest.objects.create(
                user=self.user1, request_type='vacation',
                start_date=d, end_date=d,
                status='pending', reason=f'pending {i}',
            )
        from django.db.models import Q
        # Use a slightly future end date so the just-created records' auto_now_add
        # created_at falls within the filter range.
        leave_filters = Q(created_at__gte=start, created_at__lte=timezone.now())
        insights = generate_insights(
            start, timezone.now(), leave_filters, Q(), Q(), []
        )
        backlog = [i for i in insights if i['type'] == 'backlog']
        self.assertTrue(backlog, 'expected backlog insight')
        self.assertIn('6', backlog[0]['title'])

    def test_no_insights_when_no_data(self):
        """Insights engine returns empty list when no data exists."""
        from plugins.analytics.insights import generate_insights
        from django.utils import timezone
        from datetime import timedelta
        now = timezone.now()
        start = now - timedelta(days=30)
        from django.db.models import Q
        insights = generate_insights(
            start, now, Q(), Q(), Q(), []
        )
        self.assertEqual(insights, [])

    def test_insights_endpoint_returns_list(self):
        """The /insights/ endpoint returns a list of insight objects."""
        _ensure_analytics_urls()
        client = Client()
        user = User.objects.create_superuser(
            username='insight-admin', email='ia@test.com', password='testpass123'
        )
        client.force_login(user)
        OvertimeLog.objects.create(
            user=user, client=OvertimeClient.objects.create(name='EP', code='EP'),
            date=timezone.now().date(), hours=10, status='approved',
        )
        response = client.get('/api/plugins/analytics/metrics/insights/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)


class AnalyticsExcelChartsTests(TestCase):
    """Excel export includes a Charts sheet with native openpyxl charts."""

    def setUp(self):
        self.user1 = User.objects.create_user(
            username='chart-emp1', password='testpass',
            first_name='Chart', last_name='One',
        )
        self.user2 = User.objects.create_user(
            username='chart-emp2', password='testpass',
            first_name='Chart', last_name='Two',
        )
        self.client_obj = OvertimeClient.objects.create(name='Chart Client', code='CC')
        # Create data across multiple days for the line chart
        from datetime import timedelta
        from django.utils import timezone
        from apps.standby.models import StandbyLog
        today = timezone.now().date()
        for i in range(5):
            OvertimeLog.objects.create(
                user=self.user1, client=self.client_obj,
                date=today - timedelta(days=i), hours=8, status='approved',
            )
            OvertimeLog.objects.create(
                user=self.user2, client=self.client_obj,
                date=today - timedelta(days=i), hours=4, status='approved',
            )
            # Add standby data so the pie chart has 2+ categories
            StandbyLog.objects.create(
                user=self.user1, date=today - timedelta(days=i),
                hours=4, status='approved',
            )

    def test_excel_contains_charts_sheet(self):
        """Excel export has a 'Charts' sheet."""
        import openpyxl
        data = AnalyticsReportGenerator.generate_excel_report(
            period='month',
        )
        wb = openpyxl.load_workbook(io.BytesIO(data))
        self.assertIn('Charts', wb.sheetnames)

    def test_charts_sheet_has_line_chart(self):
        """The Charts sheet contains at least one line chart (daily trend)."""
        import openpyxl
        data = AnalyticsReportGenerator.generate_excel_report(
            period='month',
        )
        wb = openpyxl.load_workbook(io.BytesIO(data))
        ws = wb['Charts']
        # openpyxl stores charts in _charts attribute
        self.assertTrue(hasattr(ws, '_charts'))
        self.assertGreater(len(ws._charts), 0)
        # At least one should be a LineChart
        from openpyxl.chart import LineChart
        line_charts = [c for c in ws._charts if isinstance(c, LineChart)]
        self.assertTrue(line_charts, 'expected at least one LineChart')

    def test_charts_sheet_has_bar_chart(self):
        """The Charts sheet contains a bar chart (user breakdown)."""
        import openpyxl
        data = AnalyticsReportGenerator.generate_excel_report(
            period='month',
        )
        wb = openpyxl.load_workbook(io.BytesIO(data))
        ws = wb['Charts']
        from openpyxl.chart import BarChart
        bar_charts = [c for c in ws._charts if isinstance(c, BarChart)]
        self.assertTrue(bar_charts, 'expected at least one BarChart')

    def test_charts_sheet_has_pie_chart(self):
        """The Charts sheet contains a pie chart (category distribution)."""
        import openpyxl
        data = AnalyticsReportGenerator.generate_excel_report(
            period='month',
        )
        wb = openpyxl.load_workbook(io.BytesIO(data))
        ws = wb['Charts']
        from openpyxl.chart import PieChart
        pie_charts = [c for c in ws._charts if isinstance(c, PieChart)]
        self.assertTrue(pie_charts, 'expected at least one PieChart')


class ConfigurableThresholdsTest(TestCase):
    """Tests for configurable insight thresholds (Feature 1)."""

    def setUp(self):
        self.user1 = User.objects.create_user(
            username='thresh-emp1', password='testpass',
            first_name='Thresh', last_name='One',
        )
        self.client_obj = OvertimeClient.objects.create(name='Thresh Client', code='TC')
        # Clear any existing config
        AnalyticsConfiguration.objects.all().delete()

    def tearDown(self):
        AnalyticsConfiguration.objects.all().delete()

    def test_custom_trend_threshold_suppresses_small_change(self):
        """A high trend threshold (50%) suppresses a 25% change insight."""
        from plugins.analytics.insights import generate_insights
        from django.utils import timezone
        from datetime import timedelta
        AnalyticsConfiguration.objects.create(
            trend_threshold=0.50,  # 50% — higher than the 25% change
        )
        now = timezone.now()
        OvertimeLog.objects.create(
            user=self.user1, client=self.client_obj,
            date=(now - timedelta(days=35)).date(), hours=8, status='approved',
        )
        OvertimeLog.objects.create(
            user=self.user1, client=self.client_obj,
            date=now.date(), hours=10, status='approved',  # 25% increase
        )
        start = now - timedelta(days=30)
        from django.db.models import Q
        ot_filters = Q(date__gte=start.date(), date__lte=now.date())
        insights = generate_insights(start, now, Q(), ot_filters, Q(), [])
        trend = [i for i in insights if i['type'] == 'trend_up']
        self.assertEqual(trend, [], '25% change should be suppressed with 50% threshold')

    def test_default_thresholds_used_when_no_config(self):
        """Defaults are used when no AnalyticsConfiguration exists."""
        from plugins.analytics.insights import _get_thresholds
        thresholds = _get_thresholds()
        self.assertAlmostEqual(thresholds['trend'], 0.15)
        self.assertAlmostEqual(thresholds['concentration'], 0.40)
        self.assertEqual(thresholds['backlog'], 5)

    def test_config_serializer_includes_threshold_fields(self):
        """The serializer exposes all threshold fields."""
        config = AnalyticsConfiguration.objects.create(
            trend_threshold=0.25,
            concentration_threshold=0.50,
            spike_threshold=3.0,
            backlog_threshold=10,
            status_bottleneck_threshold=0.40,
        )
        from plugins.analytics.serializers import AnalyticsConfigurationSerializer
        data = AnalyticsConfigurationSerializer(config).data
        self.assertEqual(data['trend_threshold'], 0.25)
        self.assertEqual(data['concentration_threshold'], 0.50)
        self.assertEqual(data['spike_threshold'], 3.0)
        self.assertEqual(data['backlog_threshold'], 10)
        self.assertEqual(data['status_bottleneck_threshold'], 0.40)


class ExportJobTest(TestCase):
    """Tests for background export jobs (Feature 3)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='export-user', password='testpass', is_staff=True,
        )

    def test_export_job_model_defaults(self):
        """ExportJob has correct default."""
        from plugins.analytics.models import ExportJob
        job = ExportJob.objects.create(
            report_format='excel',
            filter_params={'period': 'month'},
            created_by=self.user,
        )
        self.assertEqual(job.status, 'pending')
        self.assertEqual(job.report_format, 'excel')
        self.assertEqual(job.filter_params['period'], 'month')
        self.assertFalse(job.is_ready)
        self.assertEqual(job.file_size_bytes, 0)

    def test_export_job_status_endpoint(self):
        """The status endpoint returns job state."""
        from plugins.analytics.models import ExportJob
        job = ExportJob.objects.create(
            report_format='csv',
            filter_params={'period': 'week'},
            created_by=self.user,
        )
        client = Client()
        client.force_login(self.user)
        response = client.get(f'/api/plugins/analytics/metrics/export-jobs/{job.id}/status/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(response.data['format'], 'csv')


class AnalyticsMetricQueryCountTests(TestCase):
    """Regression: AnalyticsMetricViewSet.retrieve() must not N+1 on
    user/team. AnalyticsMetricSerializer reads user.get_full_name and
    team.name - without select_related, each field access is an extra
    query."""

    def setUp(self):
        from rest_framework.test import APIRequestFactory
        from apps.users.models.core import Team

        self.admin = User.objects.create_superuser(
            username='admin_metric_qc', email='admin_qc@example.com', password='password123'
        )
        self.metric_user = User.objects.create_user(
            username='metric_user', password='password123'
        )
        self.team = Team.objects.create(name='QC Team', code='qc-team')
        self.metric = AnalyticsMetric.objects.create(
            metric_type='leave_approval_rate',
            user=self.metric_user,
            team=self.team,
            value=42.0,
            label='QC Metric',
        )
        self.factory = APIRequestFactory()

    def test_retrieve_query_count_does_not_include_extra_lookups(self):
        from rest_framework.test import force_authenticate

        request = self.factory.get(f'/api/plugins/analytics/metrics/{self.metric.id}/')
        force_authenticate(request, user=self.admin)

        # Budget: 1 query for the metric row (joined to user + team via
        # select_related). A regression to `.objects.all()` would add 2
        # more queries (one for user, one for team).
        with self.assertNumQueries(1):
            response = AnalyticsMetricViewSet.as_view({'get': 'retrieve'})(
                request, pk=self.metric.id
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user_name'], self.metric_user.get_full_name() or '')
        self.assertEqual(response.data['team_name'], self.team.name)
