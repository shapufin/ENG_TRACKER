"""Cadence reminders (due today, overdue), the cancelled-slot wording and the
partnership backfill command."""
from datetime import date, timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from plugins.notifications.models import Notification

from . import signals
from .models import EPRCycle, EPRStageRecord, HbprGovernanceEvidence
from .reminders import process_cadence_reminders
from .testing import make_user as _make_user


class _Base(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        signals.connect()

    def setUp(self):
        for code in ('hbpr', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.hbpr = _make_user('hbpr_rem')
        assign_role(self.hbpr, 'hbpr')
        self.tl = _make_user('tl_rem')
        assign_role(self.tl, 'albanian_tl')
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl, cadence='weekly',
            effective_from=date(2020, 1, 1))
        self.today = date(2026, 6, 10)

    def _slot(self, days_ago, **extra):
        with self.captureOnCommitCallbacks(execute=True):
            return HbprGovernanceEvidence.objects.create(
                assignment=self.assignment, kind='cadence_meeting',
                occurred_on=self.today - timedelta(days=days_ago),
                recorded_by=self.tl, **extra)

    def _titles(self, user):
        return list(Notification.objects.filter(user=user).values_list('title', flat=True))

    def _reminders(self, user):
        return [t for t in self._titles(user) if 'due' in t.lower() or 'overdue' in t.lower()]


class CancelledWordingTests(_Base):
    def test_cancelled_slot_is_announced_as_cancelled(self):
        self._slot(0, status='cancelled', cancel_reason='HBPR on leave')
        self.assertEqual(self._titles(self.hbpr), ['A partnership meeting was cancelled'])
        # Generic copy: the reason never rides in a push or lock-screen preview.
        message = Notification.objects.get(user=self.hbpr).message
        self.assertNotIn('HBPR on leave', message)


class ReminderTests(_Base):
    def test_due_today_reminds_the_line_manager_once(self):
        self._slot(7)  # weekly: due exactly today
        self.assertEqual(process_cadence_reminders(self.today), 1)
        self.assertEqual(self._reminders(self.tl), ['Partnership meeting due today'])
        self.assertEqual(self._reminders(self.hbpr), [])
        self.assertEqual(process_cadence_reminders(self.today), 1)  # idempotent re-run
        self.assertEqual(len(self._reminders(self.tl)), 1)

    def test_overdue_tells_both_once_per_due_date(self):
        self._slot(20)  # due 13 days ago
        process_cadence_reminders(self.today)
        self.assertEqual(self._reminders(self.tl), ['Partnership meeting overdue'])
        self.assertEqual(self._reminders(self.hbpr), ['Partnership meeting overdue'])
        process_cadence_reminders(self.today + timedelta(days=1))
        self.assertEqual(len(self._reminders(self.tl)), 1)

    def test_on_track_and_ended_assignments_are_silent(self):
        self._slot(2)  # due in 5 days
        process_cadence_reminders(self.today)
        self.assertEqual(self._reminders(self.tl), [])
        HbprGovernanceEvidence.objects.all().delete()
        self._slot(20)
        self.assignment.effective_to = self.today - timedelta(days=1)
        self.assignment.save()
        process_cadence_reminders(self.today)
        self.assertEqual(self._reminders(self.tl), [])

    def test_a_holiday_slot_is_not_due_until_it_moves(self):
        from apps.dashboard.models.calendar import PublicHoliday
        self._slot(7)
        PublicHoliday.objects.create(name='H', date=self.today, country_code='AL', is_global=True)
        process_cadence_reminders(self.today)
        self.assertEqual(self._reminders(self.tl), [])


class BackfillTests(_Base):
    def _stage(self, stage, hbpr_present=True):
        member = _make_user(f'emp_bf_{stage}')
        member.profile.albanian_tl = self.tl
        member.profile.save()
        cycle = EPRCycle.objects.create(user=member, year=2026, **{f'{stage}_completed_at': timezone.now()})
        EPRStageRecord.objects.create(
            cycle=cycle, stage=stage, summary='x', recorded_by=self.tl, hbpr_present=hbpr_present)

    def test_backfill_creates_missing_rows_only_for_attended_stages(self):
        self._stage('mid_year')
        self._stage('final_review', hbpr_present=False)
        out = StringIO()
        call_command('backfill_hbpr_epr_evidence', stdout=out)
        kinds = set(HbprGovernanceEvidence.objects.values_list('kind', flat=True))
        self.assertEqual(kinds, {'epr_mid_year'})
        call_command('backfill_hbpr_epr_evidence', stdout=out)  # idempotent
        self.assertEqual(HbprGovernanceEvidence.objects.count(), 1)

    def test_dry_run_writes_nothing(self):
        self._stage('mid_year')
        call_command('backfill_hbpr_epr_evidence', '--dry-run', stdout=StringIO())
        self.assertEqual(HbprGovernanceEvidence.objects.count(), 0)
