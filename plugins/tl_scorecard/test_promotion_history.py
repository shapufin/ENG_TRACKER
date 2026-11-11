"""Audit: what promoting an employee to Line Manager does to history (tests only).

Promotion goes through the admin path (``PATCH users/users/<id>/update_user/``, i.e.
``update_user`` -> ``user_creation._sync_roles``). These tests PIN the observed behaviour;
where it differs from what one might expect they say so in the test name and comment.

Facts pinned here:
- the employee's own rows (leave, overtime, standby, PIP, absence, EPR, promotion flag) are untouched;
- the old Line Manager's and the Manager's frozen ``ScorecardMonthSnapshot`` and the engagement
  ``TLApprovalMetric`` rows are untouched;
- no leader-keyed row exists for the user before promotion;
- the new Line Manager's scorecard is computed live from the CURRENT roster, with no promotion date;
- the old Line Manager's live reach no longer contains the promoted user (``albanian_tl`` link cleared).
"""
from datetime import date, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core.management import call_command
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import assign_role
from apps.standby.models import StandbyLog
from apps.users.models import Team, UserProfile
from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.services import compute_tl_metric

from .models import Absence, EPRCycle, PIPRecord, PromotionFlag, ScorecardMonthSnapshot
from .scope import scoreable_member_ids
from .services import build_scorecard
from .snapshots import freeze_scorecard_months
from .testing import make_user
from .viewsets import AbsenceViewSet, EPRCycleViewSet, PIPRecordViewSet, PromotionFlagViewSet

TIRANE = ZoneInfo('Europe/Tirane')
SEPT = date(2026, 9, 1)  # frozen at 2026-10-10 00:00 Europe/Tirane
AFTER_SEPT_FREEZE = datetime(2026, 10, 12, 12, tzinfo=TIRANE)
NOV = date(2026, 11, 1)  # still open (freezes 2026-12-10)
NOW = datetime(2026, 11, 12, 12, tzinfo=TIRANE)


def _snapshot_state():
    return {
        s.leader_id: (s.month, sorted(s.member_ids), s.payload, s.computed_at)
        for s in ScorecardMonthSnapshot.objects.all()
    }


def _metric_state():
    return list(TLApprovalMetric.objects.order_by('pk').values())


class PromotionHistoryTests(APITestCase):
    def setUp(self):
        for target in ('core.utils.metrics_freeze.business_tz', 'plugins.tl_scorecard.snapshots.business_tz'):
            patcher = patch(target, return_value=TIRANE)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.factory = APIRequestFactory()
        for code in ('employee', 'italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        call_command('seed_plugin_permissions')

        self.admin = User.objects.create_superuser(username='ph_admin', password='x', email='a@a.a')
        self.manager = make_user('ph_manager')
        assign_role(self.manager, 'italian_tl')
        self.old_lm = make_user('ph_old_lm')
        assign_role(self.old_lm, 'albanian_tl')
        self.old_lm.profile.italian_tl = self.manager
        self.old_lm.profile.save()

        self.team = Team.objects.create(name='PH Team', code='PHT', team_leader=self.old_lm)
        self.emp = make_user('ph_emp')
        self.other = make_user('ph_other')
        for member in (self.emp, self.other):
            member.profile.albanian_tl = self.old_lm
            member.profile.italian_tl = self.manager
            member.profile.save()
            member.profile.teams.add(self.team)

        self._employee_era_rows()
        with patch('django.utils.timezone.now', return_value=AFTER_SEPT_FREEZE):
            freeze_scorecard_months(now=AFTER_SEPT_FREEZE, month=SEPT)
            compute_tl_metric(self.old_lm, self.team, SEPT)

    def _employee_era_rows(self):
        sept_ts = datetime(2026, 9, 10, 9, tzinfo=TIRANE)
        LeaveRequest.objects.create(
            user=self.emp, request_type='vacation', start_date=date(2026, 9, 14), end_date=date(2026, 9, 15),
            days_counted=2, status='approved', approved_by=self.old_lm, approved_at=sept_ts,
            submitted_at=sept_ts,
        )
        client = Client.objects.create(name='PH Client', code='PHC')
        OvertimeLog.objects.create(
            user=self.emp, client=client, date=date(2026, 9, 12), hours=2, status='approved',
            approved_by=self.old_lm, approved_at=sept_ts,
        )
        StandbyLog.objects.create(
            user=self.emp, date=date(2026, 9, 13), hours=4, status='approved',
            approved_by=self.old_lm, approved_at=sept_ts,
        )
        self.pip = PIPRecord.objects.create(
            employee=self.emp, tl=self.old_lm, start_date=date(2026, 9, 1), status='active',
        )
        self.absence = Absence.objects.create(
            employee=self.emp, flagged_by=self.old_lm, absence_date=date(2026, 9, 3),
        )
        self.epr = EPRCycle.objects.create(user=self.emp, year=2026)
        self.flag = PromotionFlag.objects.create(
            employee=self.emp, nominated_by=self.old_lm, nominated_on=date(2026, 9, 2),
        )

    def _employee_rows(self):
        return {
            'leave': list(LeaveRequest.objects.filter(user=self.emp).values()),
            'overtime': list(OvertimeLog.objects.filter(user=self.emp).values()),
            'standby': list(StandbyLog.objects.filter(user=self.emp).values()),
            'pip': list(PIPRecord.objects.filter(employee=self.emp).values()),
            'absence': list(Absence.objects.filter(employee=self.emp).values()),
            'epr': list(EPRCycle.objects.filter(user=self.emp).values()),
            'flag': list(PromotionFlag.objects.filter(employee=self.emp).values()),
        }

    def _promote(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            f'/api/users/users/{self.emp.id}/update_user/',
            {'roles': ['employee', 'albanian_tl']}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        return User.objects.select_related('profile').get(pk=self.emp.pk)

    def _visible_to(self, viewset, user):
        request = self.factory.get('/x/')
        force_authenticate(request, user=user)
        resp = viewset.as_view({'get': 'list'})(request)
        self.assertEqual(resp.status_code, 200, getattr(resp, 'data', None))
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        return {row['id'] for row in rows}

    # (a) the employee's own rows
    def test_employee_era_rows_are_unchanged_and_still_owned_by_the_employee(self):
        before = self._employee_rows()
        self.assertTrue(all(before.values()), 'fixture must create a row of every kind')
        self._promote()
        self.assertEqual(self._employee_rows(), before)
        # The author columns still name the OLD Line Manager (history is not re-pointed).
        self.assertEqual(PIPRecord.objects.get(pk=self.pip.pk).tl_id, self.old_lm.id)
        self.assertEqual(Absence.objects.get(pk=self.absence.pk).flagged_by_id, self.old_lm.id)

    # (b) frozen history of the leaders above the employee
    def test_old_lm_and_manager_frozen_snapshots_and_engagement_metrics_are_unchanged(self):
        with patch('django.utils.timezone.now', return_value=AFTER_SEPT_FREEZE):
            freeze_scorecard_months(now=AFTER_SEPT_FREEZE, month=SEPT)
        snapshots_before, metrics_before = _snapshot_state(), _metric_state()
        self.assertIn(self.old_lm.id, snapshots_before)
        self.assertIn(self.emp.id, snapshots_before[self.old_lm.id][1])  # frozen roster includes the employee
        self.assertTrue(metrics_before)
        self.assertEqual(metrics_before[0]['team_size'], 2)  # the employee was in the engagement roster
        self.assertGreaterEqual(snapshots_before[self.old_lm.id][3], AFTER_SEPT_FREEZE)

        self._promote()
        with patch('django.utils.timezone.now', return_value=NOW):
            freeze_scorecard_months(now=NOW, month=SEPT)  # idempotent re-run of the job

        self.assertEqual(_snapshot_state().get(self.old_lm.id), snapshots_before[self.old_lm.id])
        if self.manager.id in snapshots_before:
            self.assertEqual(_snapshot_state()[self.manager.id], snapshots_before[self.manager.id])
        self.assertEqual(_metric_state(), metrics_before)

    # (c) nothing leader-keyed exists for the user before promotion
    def test_no_leader_keyed_rows_exist_for_the_user_before_promotion(self):
        self.assertFalse(ScorecardMonthSnapshot.objects.filter(leader=self.emp).exists())
        self.assertFalse(TLApprovalMetric.objects.filter(leader=self.emp).exists())
        self.assertFalse(PIPRecord.objects.filter(tl=self.emp).exists())

    # (d) the new Line Manager's scorecard is live, from the current roster, with no promotion date
    def test_new_lm_scorecard_is_live_from_the_current_roster(self):
        promoted = self._promote()
        report = make_user('ph_report')
        report.profile.albanian_tl = promoted
        report.profile.save()
        promoted = User.objects.select_related('profile').get(pk=promoted.pk)
        with patch('plugins.tl_scorecard.services.business_today', return_value=NOW.date()), \
                patch('django.utils.timezone.now', return_value=NOW):
            card = build_scorecard(promoted, NOV)
        self.assertEqual(scoreable_member_ids(promoted), {report.id})
        self.assertEqual(card['team_size'], 1)
        self.assertFalse(card['frozen'])
        # Still no stored row for the promoted user after the scorecard was read.
        self.assertFalse(ScorecardMonthSnapshot.objects.filter(leader=promoted).exists())

    def test_there_is_no_stored_promotion_date(self):
        # GAP: "starts from the promotion date" cannot be derived. No promotion column exists on the
        # profile; the only trace is the role assignment's own timestamps.
        names = {f.name for f in UserProfile._meta.get_fields()}
        self.assertFalse({n for n in names if 'promot' in n})
        self.assertFalse({f.name for f in ScorecardMonthSnapshot._meta.get_fields() if 'promot' in f.name})
        promoted = self._promote()
        role = UserRole.objects.get(user=promoted, role__code='albanian_tl')
        self.assertIsNotNone(role.created_at)  # the nearest proxy, not a promotion date by contract

    def test_a_late_freeze_backfill_for_a_past_month_uses_todays_roster_for_the_new_lm(self):
        # GAP (documented): the freeze job is not promotion-aware. Backfilling a month that was
        # never frozen writes the promoted user's snapshot from TODAY's roster (module docstring
        # of snapshots.py says the same of any backfill).
        promoted = self._promote()
        report = make_user('ph_report2')
        report.profile.albanian_tl = promoted
        report.profile.save()
        with patch('django.utils.timezone.now', return_value=NOW):
            freeze_scorecard_months(now=NOW, month=SEPT)
        snap = ScorecardMonthSnapshot.objects.get(leader=promoted, month=SEPT)
        self.assertEqual(snap.member_ids, [report.id])

    # (e) what the old Line Manager can still reach
    def test_old_lm_live_reach_loses_the_promoted_user(self):
        self._promote()
        old_lm = User.objects.select_related('profile').get(pk=self.old_lm.pk)
        self.assertNotIn(self.emp.id, old_lm.profile.get_team_member_ids())
        self.assertNotIn(self.emp.id, scoreable_member_ids(old_lm))
        self.assertIn(self.other.id, scoreable_member_ids(old_lm))
        # The Manager link is kept, so the Manager still reaches the promoted user.
        manager = User.objects.select_related('profile').get(pk=self.manager.id)
        self.assertIn(self.emp.id, manager.profile.get_team_member_ids())

    def test_old_lm_scorecard_team_size_drops_but_frozen_month_keeps_the_employee(self):
        self._promote()
        old_lm = User.objects.select_related('profile').get(pk=self.old_lm.pk)
        with patch('plugins.tl_scorecard.services.business_today', return_value=NOW.date()), \
                patch('django.utils.timezone.now', return_value=NOW):
            frozen = build_scorecard(old_lm, SEPT)
            live = build_scorecard(old_lm, NOV)
        self.assertTrue(frozen['frozen'])
        self.assertEqual(frozen['team_size'], 2)  # September as it was
        self.assertEqual(live['team_size'], 1)

    def test_old_lm_record_visibility_of_the_promoted_user_after_the_link_is_cleared(self):
        # Records the old LM authored stay visible to them through `own_q` (tl/flagged_by/
        # nominated_by == viewer). Records without that author column (EPR cycle: owner is the
        # employee) are gone from the old LM's list: GAP, the open EPR cycle is no longer reachable.
        self._promote()
        old_lm = User.objects.select_related('profile').get(pk=self.old_lm.pk)
        self.assertEqual(self._visible_to(PIPRecordViewSet, old_lm), {self.pip.id})
        self.assertEqual(self._visible_to(AbsenceViewSet, old_lm), {self.absence.id})
        self.assertEqual(self._visible_to(PromotionFlagViewSet, old_lm), {self.flag.id})
        self.assertEqual(self._visible_to(EPRCycleViewSet, old_lm), set())

    def test_old_lm_cannot_open_new_records_on_the_promoted_user(self):
        self._promote()
        old_lm = User.objects.select_related('profile').get(pk=self.old_lm.pk)
        request = self.factory.post(
            '/x/', {'employee': self.emp.id, 'start_date': '2026-11-12'}, format='json')
        force_authenticate(request, user=old_lm)
        resp = PIPRecordViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(resp.status_code, 400)
