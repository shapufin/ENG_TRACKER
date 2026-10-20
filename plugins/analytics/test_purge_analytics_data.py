"""data_retention_days (AnalyticsConfiguration) must actually be enforceable."""

from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from core.utils.timezone_local import business_today
from plugins.analytics.models import AnalyticsConfiguration, AnalyticsMetric, AnalyticsSnapshot


class PurgeAnalyticsDataTests(TestCase):
    def _data(self, age_days):
        AnalyticsSnapshot.objects.create(
            snapshot_type='daily', snapshot_date=business_today() - timedelta(days=age_days),
        )
        metric = AnalyticsMetric.objects.create(
            metric_type='team_performance', value=Decimal('1.00'), label=f'{age_days}d',
        )
        AnalyticsMetric.objects.filter(pk=metric.pk).update(
            recorded_at=timezone.now() - timedelta(days=age_days)
        )

    def test_purges_only_data_older_than_the_configured_retention(self):
        AnalyticsConfiguration.objects.update_or_create(pk=1, defaults={'data_retention_days': 30})
        self._data(10)
        self._data(45)
        call_command('purge_analytics_data', stdout=StringIO())
        self.assertEqual(AnalyticsSnapshot.objects.count(), 1)
        self.assertEqual(list(AnalyticsMetric.objects.values_list('label', flat=True)), ['10d'])

    def test_defaults_to_365_days_without_a_configuration_row(self):
        self._data(200)
        self._data(400)
        call_command('purge_analytics_data', stdout=StringIO())
        self.assertEqual(AnalyticsSnapshot.objects.count(), 1)
        self.assertEqual(list(AnalyticsMetric.objects.values_list('label', flat=True)), ['200d'])

    def test_days_option_overrides_the_configuration(self):
        AnalyticsConfiguration.objects.update_or_create(pk=1, defaults={'data_retention_days': 365})
        self._data(10)
        call_command('purge_analytics_data', '--days', '5', stdout=StringIO())
        self.assertEqual(AnalyticsSnapshot.objects.count(), 0)


class PurgeAnalyticsQueryBudgetTests(TestCase):
    """P-pass: the purge deletes in bulk (queries do not grow with rows)."""

    _data = PurgeAnalyticsDataTests._data

    def _purge_queries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx:
            call_command('purge_analytics_data', '--days', '30', stdout=StringIO())
        return len(ctx.captured_queries)

    def test_purge_query_count_does_not_grow_with_rows(self):
        for age in (100, 101):
            self._data(age)
        few = self._purge_queries()
        for age in range(102, 132):
            self._data(age)
        many = self._purge_queries()
        self.assertEqual(AnalyticsSnapshot.objects.count(), 0)
        self.assertEqual(few, many, f'{few} queries (2 rows) vs {many} (30 rows)')
