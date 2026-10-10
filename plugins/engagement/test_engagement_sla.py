"""
SLA-based engagement rules: deadlines, pending breaches, team coverage,
soft-deleted/inactive exclusions, holiday evidence and staff coverage.

Time is controlled by patching ``plugins.engagement.services._now``; every
freshness and deadline decision in the engagement plugin reads that helper.
"""
from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday, UserCalendarPreference
from apps.overtime.models.core import OvertimeLog
from apps.users.models.core import TeamMembership

from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.services import (
    compute_tl_metric,
    ensure_current_month_snapshots,
    is_stale,
    leader_team_pairs,
    team_member_ids,
)
from plugins.engagement.sla import TIRANA, deadline_for, responsiveness_score, today_local
from plugins.engagement.test_engagement import (
    _assign_tl_role,
    _make_client,
    _make_overtime,
    _make_team,
    _make_user,
)
from plugins.engagement.viewsets import TLEngagementMetricsViewSet

UTC = dt_timezone.utc
OCT = date(2026, 10, 1)


def _at(day, hour=8):
    """Aware UTC datetime for a Tirana-local wall time (Oct is CEST, UTC+2)."""
    return datetime(day.year, day.month, day.day, hour - 2, tzinfo=UTC)


class DeadlineRuleTests(TestCase):
    """Pure deadline arithmetic: Mon-Fri working days, Tirana local time."""

    def test_overtime_gets_five_working_days_end_of_day(self):
        fri = date(2026, 10, 9)  # Friday
        deadline = deadline_for('overtime', _at(fri, 10), holidays=set())
        self.assertEqual(deadline, datetime(2026, 10, 16, 23, 59, 59, 999999, tzinfo=TIRANA))

    def test_public_holiday_moves_overtime_deadline_one_working_day(self):
        fri = date(2026, 10, 9)
        holidays = {date(2026, 10, 12)}  # Monday holiday
        deadline = deadline_for('overtime', _at(fri, 10), holidays=holidays)
        self.assertEqual(deadline.date(), date(2026, 10, 19))

    def test_standby_uses_the_same_five_day_rule(self):
        fri = date(2026, 10, 9)
        self.assertEqual(
            deadline_for('standby', _at(fri, 10), holidays=set()),
            deadline_for('overtime', _at(fri, 10), holidays=set()),
        )

    def test_leave_submitted_on_saturday_is_due_monday_end_of_day(self):
        sat = date(2026, 10, 10)
        deadline = deadline_for('leave', _at(sat, 10), holidays=set())
        self.assertEqual(deadline.date(), date(2026, 10, 12))

    def test_leave_submitted_on_a_working_day_is_due_that_day(self):
        mon = date(2026, 10, 12)
        self.assertEqual(deadline_for('leave', _at(mon, 9), holidays=set()).date(), mon)

    def test_leave_submitted_on_a_holiday_rolls_to_next_working_day(self):
        mon = date(2026, 10, 12)
        deadline = deadline_for('leave', _at(mon, 9), holidays={mon})
        self.assertEqual(deadline.date(), date(2026, 10, 13))

    def test_responsiveness_curve_full_credit_to_25_percent_then_linear(self):
        self.assertEqual(responsiveness_score(0.25), 100.0)
        self.assertEqual(responsiveness_score(1.0), 0.0)
        self.assertAlmostEqual(responsiveness_score(0.625), 50.0)
        self.assertEqual(responsiveness_score(None), None)


class PendingBreachTests(TestCase):
    """A pending request that passes its deadline must count as a breach even
    though no database row changed (the time-based staleness path)."""

    def setUp(self):
        self.client_obj = _make_client()
        self.leader = _make_user('sla_leader')
        self.team = _make_team('SLA Team', 'SLA', leader=self.leader)
        self.member = _make_user('sla_member')
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)

    def _pending_ot(self, day=OCT.replace(day=9)):
        return _make_overtime(self.member, day, _at(day, 10), status='pending', client=self.client_obj)

    def test_pending_past_deadline_is_breach_and_triggers_recompute(self):
        self._pending_ot()
        before = datetime(2026, 10, 10, 8, tzinfo=UTC)
        with patch('plugins.engagement.services._now', return_value=before):
            snap = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(snap.metrics['overtime']['pending_past_deadline'], 0)
        self.assertIsNotNone(snap.next_deadline_at)

        after = datetime(2026, 10, 20, 8, tzinfo=UTC)
        with patch('plugins.engagement.services._now', return_value=after):
            self.assertTrue(is_stale(snap))
            refreshed = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(refreshed.metrics['overtime']['pending_past_deadline'], 1)
        self.assertEqual(refreshed.metrics['overtime']['breaches'], 1)
        self.assertEqual(refreshed.metrics['overtime']['on_time'], 0)
        self.assertEqual(refreshed.score_speed, 0.0)

    def test_pending_before_deadline_is_not_judgeable_yet(self):
        self._pending_ot()
        with patch('plugins.engagement.services._now', return_value=datetime(2026, 10, 10, 8, tzinfo=UTC)):
            snap = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(snap.metrics['overtime']['judgeable'], 0)
        self.assertIsNone(snap.score_speed)

    def test_decided_within_deadline_is_on_time(self):
        day = date(2026, 10, 9)
        _make_overtime(
            self.member, day, _at(day, 10), status='approved', approved_at=_at(day, 14),
            client=self.client_obj, approved_by=self.leader,
        )
        with patch('plugins.engagement.services._now', return_value=datetime(2026, 10, 20, 8, tzinfo=UTC)):
            snap = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(snap.metrics['overtime']['on_time'], 1)
        self.assertEqual(snap.score_speed, 100.0)

    def test_soft_deleted_pending_request_is_ignored(self):
        log = self._pending_ot()
        log.soft_delete()
        with patch('plugins.engagement.services._now', return_value=datetime(2026, 10, 20, 8, tzinfo=UTC)):
            snap = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(snap.metrics['overtime']['pending_past_deadline'], 0)
        self.assertEqual(snap.metrics['overtime']['judgeable'], 0)

    def test_leaders_own_requests_are_not_scored_against_them(self):
        own = _make_overtime(
            self.leader, OCT.replace(day=9), _at(OCT.replace(day=9), 10), status='pending',
            client=self.client_obj,
        )
        self.assertIsNotNone(own.pk)
        with patch('plugins.engagement.services._now', return_value=datetime(2026, 10, 20, 8, tzinfo=UTC)):
            snap = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(snap.team_size, 1)
        self.assertEqual(snap.metrics['overtime']['pending_past_deadline'], 0)

    def test_deactivated_staff_are_excluded(self):
        self.member.is_active = False
        self.member.save(update_fields=['is_active'])
        self._pending_ot()
        with patch('plugins.engagement.services._now', return_value=datetime(2026, 10, 20, 8, tzinfo=UTC)):
            snap = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(snap.team_size, 0)
        self.assertEqual(snap.metrics['overtime']['pending_past_deadline'], 0)


class TeamCoverageTests(TestCase):
    """Staff managed through the italian_tl/albanian_tl FK must appear in every
    team they belong to, even when the TL is not in that team."""

    def setUp(self):
        self.leader = _make_user('cov_leader')
        _assign_tl_role(self.leader, 'albanian_tl')
        self.team_b = _make_team('Cov Team B', 'COVB')
        self.staff = _make_user('cov_staff')
        self.staff.profile.albanian_tl = self.leader
        self.staff.profile.save(update_fields=['albanian_tl'])
        TeamMembership.objects.create(user_profile=self.staff.profile, team=self.team_b)

    def test_fk_managed_staff_creates_a_snapshot_for_their_team(self):
        ensure_current_month_snapshots({self.leader.id})
        self.assertTrue(
            TLApprovalMetric.objects.filter(leader=self.leader, team=self.team_b).exists()
        )

    def test_management_command_covers_fk_managed_teams(self):
        call_command('recompute_tl_metrics', month=OCT.isoformat())
        row = TLApprovalMetric.objects.get(leader=self.leader, team=self.team_b, month=OCT)
        self.assertEqual(row.team_size, 1)

    def test_all_months_backfill_covers_months_with_requests(self):
        _make_overtime(
            self.staff, date(2026, 9, 3), _at(date(2026, 9, 3), 10), status='pending', client=_make_client(),
        )
        call_command('recompute_tl_metrics', all_months=True)
        self.assertTrue(
            TLApprovalMetric.objects.filter(leader=self.leader, team=self.team_b, month=date(2026, 9, 1)).exists()
        )

    def test_staff_in_two_teams_counts_in_both(self):
        team_c = _make_team('Cov Team C', 'COVC')
        TeamMembership.objects.create(user_profile=self.staff.profile, team=team_c)
        snap_b = compute_tl_metric(self.leader, self.team_b, OCT)
        snap_c = compute_tl_metric(self.leader, team_c, OCT)
        self.assertEqual(snap_b.team_size, 1)
        self.assertEqual(snap_c.team_size, 1)

    def test_staff_without_a_team_is_excluded(self):
        loner = _make_user('cov_loner')
        loner.profile.albanian_tl = self.leader
        loner.profile.save(update_fields=['albanian_tl'])
        call_command('recompute_tl_metrics', month=OCT.isoformat())
        self.assertEqual(TLApprovalMetric.objects.get(leader=self.leader, team=self.team_b, month=OCT).team_size, 1)
        self.assertEqual(TLApprovalMetric.objects.filter(leader=self.leader, month=OCT).count(), 1)


class HolidayEvidenceTests(TestCase):
    def setUp(self):
        self.client_obj = _make_client()
        self.leader = _make_user('hol_leader')
        self.team = _make_team('Hol Team', 'HOL', leader=self.leader)
        self.member = _make_user('hol_member')
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)
        self.holiday = date(2026, 10, 12)

    def _decide_on(self, day):
        return _make_overtime(
            self.member, day, _at(day, 9), status='approved', approved_at=_at(day, 11),
            client=self.client_obj, approved_by=self.leader,
        )

    def test_global_holiday_decision_is_evidence_not_score(self):
        PublicHoliday.objects.create(name='Holiday', date=self.holiday, is_global=True, country_code='AL')
        self._decide_on(self.holiday)
        snap = compute_tl_metric(self.leader, self.team, OCT)
        self.assertEqual(snap.decisions_on_holidays, 1)

    def test_calendar_holiday_counts_only_when_leader_follows_that_calendar(self):
        calendar = CalendarWorkspace.objects.create(name='Albania', code='AL-CAL')
        PublicHoliday.objects.create(
            name='Local', date=self.holiday, is_global=False, country_code='AL', calendar=calendar,
        )
        self._decide_on(self.holiday)
        self.assertEqual(compute_tl_metric(self.leader, self.team, OCT).decisions_on_holidays, 0)

        UserCalendarPreference.objects.create(user=self.leader, calendar=calendar, is_active=True)
        self.assertEqual(compute_tl_metric(self.leader, self.team, OCT).decisions_on_holidays, 1)

    def test_decisions_on_ordinary_days_are_not_holiday_evidence(self):
        self._decide_on(date(2026, 10, 13))
        self.assertEqual(compute_tl_metric(self.leader, self.team, OCT).decisions_on_holidays, 0)


class StaffCoverageAPITests(TestCase):
    """Staff/admin must see current-month rows for every TL, not only the TLs
    who have opened the page."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('cov_staff_admin', is_staff=True)
        self.leader = _make_user('cov_api_leader')
        _assign_tl_role(self.leader, 'italian_tl')
        self.team = _make_team('Cov API Team', 'COVAPI', leader=self.leader)
        call_command('seed_plugin_permissions')

    def test_staff_read_creates_rows_for_every_tl(self):
        request = self.factory.get('/api/plugins/engagement/metrics/summary/', {'month': OCT.isoformat()})
        force_authenticate(request, user=self.staff)
        resp = TLEngagementMetricsViewSet.as_view({'get': 'summary'})(request)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            TLApprovalMetric.objects.filter(leader=self.leader, team=self.team, month=today_local().replace(day=1)).exists()
        )


class StaffReadScalingTests(TestCase):
    """A staff read must cost the same number of queries whether there are 3
    TLs or 12. Per-TL and per-row query loops made it grow linearly."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff = _make_user('scale_staff', is_staff=True)
        call_command('seed_plugin_permissions')

    def _make_tl(self, n):
        leader = _make_user(f'scale_tl_{n}')
        _assign_tl_role(leader, 'italian_tl')
        team = _make_team(f'Scale Team {n}', f'SCL{n}', leader=leader)
        member = _make_user(f'scale_member_{n}')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.italian_tl = leader
        member.profile.save(update_fields=['italian_tl'])
        return leader

    def _read_query_count(self):
        month = today_local().replace(day=1)  # staff reads create the current month's snapshots
        request = self.factory.get('/api/plugins/engagement/metrics/team-breakdown/', {'month': month.isoformat()})
        force_authenticate(request, user=self.staff)
        with CaptureQueriesContext(connection) as ctx:
            resp = TLEngagementMetricsViewSet.as_view({'get': 'team_breakdown'})(request)
        self.assertEqual(resp.status_code, 200)
        self.assertGreater(len(resp.data), 0)  # non-vacuous: rows exist for the TLs
        self.assertEqual(len(resp.data), len(TLApprovalMetric.objects.filter(month=month)))
        return len(ctx.captured_queries)

    def test_staff_read_query_count_does_not_grow_with_tl_count(self):
        for n in range(3):
            self._make_tl(n)
        self._read_query_count()  # first read creates the snapshots
        small = self._read_query_count()
        for n in range(3, 12):
            self._make_tl(n)
        self._read_query_count()  # creates snapshots for the new TLs
        large = self._read_query_count()
        self.assertEqual(small, large)


class ScopeCorrectnessTests(TestCase):
    def setUp(self):
        self.client_obj = _make_client()

    def test_soft_deleted_membership_does_not_bring_peers_into_scope(self):
        leader = _make_user('scope_leader')
        team = _make_team('Scope Team', 'SCOPE')
        peer = _make_user('scope_peer')
        TeamMembership.objects.create(user_profile=peer.profile, team=team)
        leftover = TeamMembership.objects.create(user_profile=leader.profile, team=team)
        leftover.soft_delete()
        self.assertNotIn(peer.id, team_member_ids(leader, team))

    def test_soft_deleted_team_gets_no_snapshot(self):
        leader = _make_user('deleted_team_leader')
        team = _make_team('Deleted Team', 'DELT', leader=leader)
        self.assertIn((leader.id, team.id), [(lead.id, t.id) for lead, t in leader_team_pairs()])  # positive control
        team.soft_delete()
        self.assertNotIn((leader.id, team.id), [(lead.id, t.id) for lead, t in leader_team_pairs()])
        ensure_current_month_snapshots({leader.id})
        self.assertFalse(TLApprovalMetric.objects.filter(leader=leader, team=team).exists())

    def test_membership_in_a_soft_deleted_team_does_not_crash_pair_building(self):
        leader = _make_user('ghost_team_leader')
        team = _make_team('Ghost Team', 'GHOST')
        staff = _make_user('ghost_team_staff')
        TeamMembership.objects.create(user_profile=staff.profile, team=team)
        staff.profile.italian_tl = leader
        staff.profile.save(update_fields=['italian_tl'])
        team.soft_delete()  # memberships stay live, the team is gone
        self.assertNotIn(team.id, [t.id for _, t in leader_team_pairs([leader.id])])

    def test_deactivated_tl_rows_are_hidden_from_staff_reads(self):
        leader = _make_user('gone_leader')
        team = _make_team('Gone Team', 'GONE', leader=leader)
        compute_tl_metric(leader, team, OCT)
        staff = _make_user('scope_staff', is_staff=True)
        call_command('seed_plugin_permissions')
        factory = APIRequestFactory()

        def team_names():
            request = factory.get('/api/plugins/engagement/metrics/team-breakdown/', {'month': OCT.isoformat()})
            force_authenticate(request, user=staff)
            return {row['team_name'] for row in TLEngagementMetricsViewSet.as_view({'get': 'team_breakdown'})(request).data}

        self.assertIn('Gone Team', team_names())  # positive control: visible while active
        leader.is_active = False
        leader.save(update_fields=['is_active'])
        self.assertNotIn('Gone Team', team_names())


class SnapshotCreationQueryTests(TestCase):
    def test_team_membership_reads_do_not_grow_with_team_count(self):
        leader = _make_user('many_teams_leader')
        _assign_tl_role(leader, 'italian_tl')
        table = TeamMembership._meta.db_table
        month = today_local().replace(day=1)

        def add_team(n):
            team = _make_team(f'Many Team {n}', f'MANY{n}', leader=leader)
            member = _make_user(f'many_member_{n}')
            TeamMembership.objects.create(user_profile=member.profile, team=team)
            member.profile.italian_tl = leader
            member.profile.save(update_fields=['italian_tl'])

        def membership_reads():
            with CaptureQueriesContext(connection) as ctx:
                ensure_current_month_snapshots({leader.id})
            return sum(table in q['sql'] for q in ctx.captured_queries)

        for n in range(2):
            add_team(n)
        small = membership_reads()
        for n in range(2, 6):
            add_team(n)
        large = membership_reads()
        self.assertEqual(TLApprovalMetric.objects.filter(leader=leader, month=month).count(), 6)  # positive control
        self.assertEqual(small, large)


class ReadPathTests(TestCase):
    """One request computes scope once, and the dashboard endpoint serves
    exactly what the three page endpoints serve."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.client_obj = _make_client()
        self.leader = _make_user('rp_leader')
        _assign_tl_role(self.leader, 'italian_tl')
        self.team = _make_team('RP Team', 'RP', leader=self.leader)
        self.member = _make_user('rp_member')
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)
        self.member.profile.italian_tl = self.leader
        self.member.profile.save(update_fields=['italian_tl'])
        _make_overtime(self.member, OCT.replace(day=9), _at(OCT.replace(day=9), 10), status='pending', client=self.client_obj)
        with patch('plugins.engagement.services._now', return_value=datetime(2026, 10, 10, 8, tzinfo=UTC)):
            compute_tl_metric(self.leader, self.team, OCT)  # explicit: reads must not depend on the current calendar month
        call_command('seed_plugin_permissions')
        self.staff = _make_user('rp_staff', is_staff=True)
        self.employee = _make_user('rp_employee')
        self.hbpr = _make_user('rp_hbpr')
        _assign_tl_role(self.hbpr, 'hbpr')

    def _get(self, action, user, **params):
        request = self.factory.get(f'/api/plugins/engagement/metrics/{action}/', params)
        force_authenticate(request, user=user)
        return TLEngagementMetricsViewSet.as_view({'get': action.replace('-', '_')})(request)

    def test_one_scope_computation_per_read(self):
        from plugins.engagement import services

        self._get('summary', self.leader, month=OCT.isoformat())  # creates the snapshots
        with patch('plugins.engagement.services._managed_map', wraps=services._managed_map) as managed:
            resp = self._get('summary', self.leader, month=OCT.isoformat())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(managed.call_count, 1)

    def test_dashboard_matches_the_three_page_endpoints(self):
        month = OCT.isoformat()
        self._get('summary', self.leader, month=month)  # warm
        dashboard = self._get('dashboard', self.leader, month=month)
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.data['summary']['team_count'], 1)  # non-vacuous: real data on both sides
        self.assertEqual(dashboard.data['summary'], self._get('summary', self.leader, month=month).data)
        self.assertEqual(dashboard.data['trend'], self._get('trend', self.leader).data)
        self.assertEqual(dashboard.data['team_breakdown'], self._get('team-breakdown', self.leader, month=month).data)

    def test_dashboard_without_month_uses_latest_month_like_the_others(self):
        self._get('summary', self.leader)
        dashboard = self._get('dashboard', self.leader)
        self.assertEqual(dashboard.data['summary'], self._get('summary', self.leader).data)

    def test_dashboard_permissions_match_the_other_read_actions(self):
        self.assertEqual(self._get('dashboard', self.leader).status_code, 200)
        self.assertEqual(self._get('dashboard', self.staff).status_code, 200)
        self.assertEqual(self._get('dashboard', self.employee).status_code, 403)
        self.assertEqual(self._get('dashboard', self.hbpr).status_code, 403)

    def test_dashboard_rejects_bad_parameters(self):
        self.assertEqual(self._get('dashboard', self.leader, month='not-a-month').status_code, 400)
        self.assertEqual(self._get('dashboard', self.leader, months='x').status_code, 400)


class FreshnessScopeTests(TestCase):
    def test_change_to_a_request_from_another_month_does_not_stale_this_month(self):
        leader = _make_user('fresh_leader')
        team = _make_team('Fresh Team', 'FRESH', leader=leader)
        member = _make_user('fresh_member')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        snap = compute_tl_metric(leader, team, OCT)
        old = _make_overtime(member, date(2026, 9, 3), _at(date(2026, 9, 3), 10), status='pending', client=_make_client())
        OvertimeLog.objects.filter(pk=old.pk).update(updated_at=timezone.now() + timedelta(minutes=1))
        self.assertFalse(is_stale(snap))


class PreSlaSnapshotTests(TestCase):
    """Snapshots written before the SLA rules have the old metrics shape. They
    must heal on read without anyone running the backfill command."""

    def test_snapshot_with_pre_sla_metrics_is_stale(self):
        leader = _make_user('legacy_leader')
        team = _make_team('Legacy Team', 'LEG', leader=leader)
        snap = compute_tl_metric(leader, team, OCT)
        TLApprovalMetric.objects.filter(pk=snap.pk).update(
            metrics={'leave': {'submitted': 1, 'aging': {}}, 'overtime': {}, 'standby': {}},
        )
        snap.refresh_from_db()
        self.assertTrue(is_stale(snap))

    def test_current_snapshot_is_not_stale(self):
        leader = _make_user('current_leader')
        team = _make_team('Current Team', 'CUR', leader=leader)
        snap = compute_tl_metric(leader, team, OCT)
        self.assertFalse(is_stale(snap))


class RefreshedOnReadTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.client_obj = _make_client()
        self.leader = _make_user('read_leader')
        _assign_tl_role(self.leader, 'italian_tl')
        self.team = _make_team('Read Team', 'READ', leader=self.leader)
        self.member = _make_user('read_member')
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)
        call_command('seed_plugin_permissions')
        self.day = date(2026, 10, 9)
        _make_overtime(self.member, self.day, _at(self.day, 10), status='pending', client=self.client_obj)
        with patch('plugins.engagement.services._now', return_value=datetime(2026, 10, 10, 8, tzinfo=UTC)):
            compute_tl_metric(self.leader, self.team, OCT)  # explicit: independent of the current calendar month

    def _summary(self, now):
        request = self.factory.get('/api/plugins/engagement/metrics/summary/', {'month': OCT.isoformat()})
        force_authenticate(request, user=self.leader)
        with patch('plugins.engagement.services._now', return_value=now):
            return TLEngagementMetricsViewSet.as_view({'get': 'summary'})(request)

    def test_summary_refreshes_when_a_deadline_passes_and_reports_it(self):
        self._summary(datetime(2026, 10, 10, 8, tzinfo=UTC))
        resp = self._summary(datetime(2026, 10, 20, 8, tzinfo=UTC))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['refreshed_on_read'])
        self.assertEqual(resp.data['breaches'], 1)
        self.assertNotIn('is_stale', resp.data)
        self.assertIn('score_responsiveness', resp.data)
        self.assertNotIn('score_activity', resp.data)
