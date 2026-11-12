from datetime import date, datetime
from io import StringIO
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase

from apps.reports.models import AuditLog
from apps.users.models import ApprovalPeriodClose, ApprovalPeriodCloseMember
from apps.users.services.approval_periods import (
    auto_finalize_approval_periods,
    finalize_period,
)

TIRANE = ZoneInfo('Europe/Tirane')
SEPTEMBER = date(2026, 9, 1)
BEFORE_CUTOFF = datetime(2026, 10, 4, 23, 59, tzinfo=TIRANE)
AT_CUTOFF = datetime(2026, 10, 5, 0, 0, tzinfo=TIRANE)


class AutoFinalizeApprovalPeriodsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.lead = User.objects.create_user('lead', password='x')
        cls.lead.profile.is_albanian_tl_role = True
        cls.lead.profile.save(update_fields=['is_albanian_tl_role'])
        cls.closed = User.objects.create_user('closed', password='x')
        cls.open_a = User.objects.create_user('open_a', password='x')
        cls.open_b = User.objects.create_user('open_b', password='x')
        cls.inactive = User.objects.create_user('inactive', password='x', is_active=False)
        cls.root = User.objects.create_superuser('root', password='x')
        for member in (cls.closed, cls.open_a):
            member.profile.albanian_tl = cls.lead
            member.profile.save(update_fields=['albanian_tl'])

    def _member_ids(self, period=SEPTEMBER):
        return set(
            ApprovalPeriodCloseMember.objects.filter(close__boundary__period=period)
            .values_list('user_id', flat=True)
        )

    def test_noop_before_the_cutoff(self):
        self.assertEqual(auto_finalize_approval_periods(SEPTEMBER, now=BEFORE_CUTOFF), (None, 0))
        self.assertFalse(ApprovalPeriodClose.objects.exists())

    def test_closes_everyone_not_yet_closed_at_the_cutoff(self):
        finalize_period(self.lead, SEPTEMBER)  # closes lead + closed + open_a
        close, count = auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)

        self.assertEqual(count, 1)  # only open_b; the TL close is untouched
        self.assertIn(self.open_b.id, self._member_ids())
        self.assertEqual(close.scope_type, 'auto_cutoff')
        self.assertEqual(close.scope_key, 'system:auto-cutoff:2026-09-01')
        self.assertIsNone(close.closed_by)
        self.assertEqual(
            ApprovalPeriodCloseMember.objects.filter(user=self.open_a).count(), 1,
            'a user a TL already closed must not be closed twice',
        )

    def test_inactive_users_and_superusers_are_not_swept(self):
        auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)
        ids = self._member_ids()
        self.assertNotIn(self.inactive.id, ids)
        self.assertNotIn(self.root.id, ids)

    def test_repeat_is_idempotent_and_picks_up_latecomers(self):
        auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)
        self.assertEqual(auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)[1], 0)

        late = User.objects.create_user('late', password='x')
        close, count = auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)
        self.assertEqual(count, 1)
        self.assertIn(late.id, self._member_ids())
        self.assertEqual(ApprovalPeriodClose.objects.filter(scope_type='auto_cutoff').count(), 1)

    def test_user_ids_limits_the_sweep(self):
        _, count = auto_finalize_approval_periods(
            SEPTEMBER, now=AT_CUTOFF, user_ids=[self.open_a.id, self.inactive.id],
        )
        self.assertEqual(count, 2)
        self.assertEqual(self._member_ids(), {self.open_a.id, self.inactive.id})

    def test_member_keeps_the_source_team_label(self):
        from apps.users.models import Team, TeamMembership

        team = Team.objects.create(name='Ops', code='OPS')
        TeamMembership.objects.create(user_profile=self.open_a.profile, team=team, is_primary_team=True)
        auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)
        member = ApprovalPeriodCloseMember.objects.get(user=self.open_a)
        self.assertEqual((member.source_team_id, member.source_team_code), (team.id, 'OPS'))

    def test_writes_an_audit_row_only_when_someone_was_closed(self):
        auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)
        audit = AuditLog.objects.get(model_name='approvalperiodclose')
        self.assertIsNone(audit.user)
        self.assertEqual(audit.new_values['operation'], 'approval_period_auto_finalize')

        auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)
        self.assertEqual(AuditLog.objects.filter(model_name='approvalperiodclose').count(), 1)

    def test_audit_failure_does_not_poison_the_surrounding_transaction(self):
        from unittest import mock

        with mock.patch.object(AuditLog.objects, 'create', side_effect=RuntimeError('boom')):
            _, count = auto_finalize_approval_periods(SEPTEMBER, now=AT_CUTOFF)
        self.assertGreater(count, 0)
        self.assertTrue(ApprovalPeriodCloseMember.objects.filter(user=self.open_b).exists())

    def test_management_command_closes_the_given_month(self):
        out = StringIO()
        call_command('auto_finalize_approval_periods', '--period', '2026-09-01', stdout=out)
        self.assertIn('2026-09', out.getvalue())
        self.assertIn(self.open_b.id, self._member_ids())
