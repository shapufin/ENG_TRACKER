"""M2 + L6 (audit 2026-11-16): scheduled analytics reports must actually run, once, on schedule."""
from datetime import datetime, timedelta, timezone as dt_tz
from unittest import mock

from django.core import mail
from django.test import TestCase
from django.utils import module_loading, timezone

from plugins.analytics.models import ScheduledReport
from plugins.analytics.plugin import AnalyticsPlugin
from plugins.analytics.scheduled_reports import next_run_after, run_due_reports

NOW = datetime(2026, 12, 1, 8, 0, tzinfo=dt_tz.utc)


def _report(**over):
    fields = dict(
        name='Weekly hours', recipients=['a@example.com'], report_format='csv',
        schedule_type='weekly', is_active=True, next_run_at=NOW - timedelta(minutes=5),
    )
    fields.update(over)
    return ScheduledReport.objects.create(**fields)


class RunDueReportsTests(TestCase):
    def test_a_due_report_is_sent_once_across_two_ticks(self):
        report = _report()

        self.assertEqual(run_due_reports(now=NOW), 1)
        self.assertEqual(run_due_reports(now=NOW + timedelta(minutes=1)), 0)

        self.assertEqual(len(mail.outbox), 1)
        report.refresh_from_db()
        self.assertEqual(report.last_run_at, NOW)
        self.assertEqual(report.next_run_at, NOW + timedelta(weeks=1))

    def test_a_report_that_was_never_scheduled_is_due(self):
        _report(next_run_at=None)
        self.assertEqual(run_due_reports(now=NOW), 1)

    def test_not_yet_due_inactive_and_recipientless_reports_are_left_alone(self):
        _report(name='later', next_run_at=NOW + timedelta(hours=1))
        _report(name='off', is_active=False)
        _report(name='nobody', recipients=[])

        self.assertEqual(run_due_reports(now=NOW), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_failure_neither_advances_the_schedule_nor_stops_the_other_reports(self):
        bad = _report(name='bad')
        good = _report(name='good')
        real = mail.EmailMessage.send

        def flaky(message, *args, **kwargs):
            if 'bad' in message.subject:
                raise OSError('smtp down')
            return real(message, *args, **kwargs)

        with mock.patch.object(mail.EmailMessage, 'send', flaky):
            self.assertEqual(run_due_reports(now=NOW), 1)

        bad.refresh_from_db()
        good.refresh_from_db()
        self.assertEqual(bad.next_run_at, NOW - timedelta(minutes=5))
        self.assertIsNone(bad.last_run_at)
        self.assertEqual(good.last_run_at, NOW)


class NextRunAfterTests(TestCase):
    def test_daily_and_weekly(self):
        self.assertEqual(next_run_after('daily', NOW), NOW + timedelta(days=1))
        self.assertEqual(next_run_after('weekly', NOW), NOW + timedelta(weeks=1))

    def test_monthly_is_the_same_day_next_month_not_plus_30_days(self):
        self.assertEqual(next_run_after('monthly', NOW), datetime(2027, 1, 1, 8, 0, tzinfo=dt_tz.utc))
        self.assertEqual(
            next_run_after('monthly', datetime(2026, 12, 31, 8, tzinfo=dt_tz.utc)),
            datetime(2027, 1, 31, 8, tzinfo=dt_tz.utc),
        )

    def test_monthly_clamps_to_the_last_day_of_a_shorter_month(self):
        self.assertEqual(
            next_run_after('monthly', datetime(2027, 1, 31, 8, tzinfo=dt_tz.utc)),
            datetime(2027, 2, 28, 8, tzinfo=dt_tz.utc),
        )


class SchedulerWiringTests(TestCase):
    def test_the_plugin_declares_an_importable_hourly_job(self):
        jobs = AnalyticsPlugin().get_scheduled_jobs()
        name, interval, target = next(j for j in jobs if j[0] == 'reports')
        self.assertLessEqual(interval, 3600)
        self.assertTrue(callable(module_loading.import_string(target)))
        self.assertTrue(timezone.is_aware(NOW))
