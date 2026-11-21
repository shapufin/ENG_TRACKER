"""Tests for the TL Scorecard plugin (Phase 1)."""
from datetime import date, datetime as _datetime, time, timedelta, timezone as _utc
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import LeaveRequest
from apps.overtime.models.core import Client, OvertimeLog
from apps.permissions.models import Role, UserRole

from .testing import make_user as _make_user
from .models import IdleFlag, Meeting, MeetingAttendee, ReviewDelivery
from .services import (
    build_scorecard,
    idle_metrics,
    leave_sla_metrics,
    meeting_compliance_metrics,
    ot_turnaround_metrics,
    review_delivery_count,
    seniority_ratio,
)
from core.utils import timezone_local
from .viewsets import TLScorecardViewSet


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


def _leave(user, submitted_at, approved_at=None, status='approved'):
    start = submitted_at.date() + timedelta(days=5)
    while start.weekday() >= 5:  # leave must include a business day
        start += timedelta(days=1)
    request = LeaveRequest.objects.create(
        user=user, request_type='vacation',
        start_date=start,
        end_date=start + timedelta(days=1),
        status=status,
    )
    LeaveRequest.objects.filter(pk=request.pk).update(submitted_at=submitted_at, approved_at=approved_at)
    return LeaveRequest.objects.get(pk=request.pk)


def _overtime(user, submitted_at, approved_at=None, status='approved'):
    client, _ = Client.objects.get_or_create(name='Acme', code='ACME')
    log = OvertimeLog.objects.create(
        user=user, client=client, date=submitted_at.date(), hours=2,
        start_time=time(18, 0), end_time=time(20, 0), status=status,
    )
    OvertimeLog.objects.filter(pk=log.pk).update(submitted_at=submitted_at, approved_at=approved_at)
    return OvertimeLog.objects.get(pk=log.pk)


class TLScorecardServiceTests(TestCase):
    def setUp(self):
        self.leader = _make_user('leader_a')
        self.member = _make_user('member_a')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        self.month = timezone.now().replace(day=15, hour=12, minute=0, second=0, microsecond=0)
        self.month_start = self.month.replace(day=1)

    def test_leave_sla_pct_within_2_days(self):
        # Decided same day (0 business days elapsed) — within SLA.
        _leave(self.member, self.month, approved_at=self.month)
        # Decided 5 business days later — outside SLA (assuming no weekend
        # spans the gap; the test month/day is controlled below).
        late_submit = self.month.replace(day=2)
        late_decide = self.month.replace(day=9)  # spans a full week -> >2 business days
        _leave(self.member, late_submit, approved_at=late_decide)

        result = leave_sla_metrics({self.member.id}, self.month_start)
        self.assertEqual(result['decided_count'], 2)
        self.assertEqual(result['pct_within_2_days'], 50.0)

    def test_leave_pending_at_month_end_counts_only_still_pending(self):
        _leave(self.member, self.month, approved_at=None, status='pending')
        _leave(self.member, self.month, approved_at=self.month, status='approved')

        result = leave_sla_metrics({self.member.id}, self.month_start)
        self.assertEqual(result['pending_at_month_end'], 1)

    def test_leave_sla_excludes_other_teams_requests(self):
        outsider = _make_user('outsider')
        _leave(outsider, self.month, approved_at=self.month)

        result = leave_sla_metrics({self.member.id}, self.month_start)
        self.assertEqual(result['decided_count'], 0)

    def _decided_wed_to_mon(self, holiday=False):
        # Wed 4 Mar 2026 submit, Mon 9 Mar 2026 approve: Thu 5 and Fri 6 are weekdays.
        if holiday:
            PublicHoliday.objects.create(name='Test holiday', date=date(2026, 3, 5))
        return _leave(
            self.member, _datetime(2026, 3, 4, 10, 0, tzinfo=_utc.utc),
            approved_at=_datetime(2026, 3, 9, 10, 0, tzinfo=_utc.utc),
        )

    def test_leave_sla_counts_weekdays_without_a_holiday_as_outside_2_days(self):
        self._decided_wed_to_mon(holiday=False)  # Wed, Thu, Fri, Mon = 3 elapsed
        result = leave_sla_metrics({self.member.id}, date(2026, 3, 1))
        self.assertEqual(result['pct_within_2_days'], 0.0)
        self.assertEqual(result['within_2_days'], 0)

    def test_leave_sla_excludes_public_holidays_from_business_days(self):
        self._decided_wed_to_mon(holiday=True)  # Thu holiday drops out: 2 elapsed
        result = leave_sla_metrics({self.member.id}, date(2026, 3, 1))
        self.assertEqual(result['pct_within_2_days'], 100.0)
        self.assertEqual(result['within_2_days'], 1)

    def test_one_on_one_reports_compliant_and_eligible_counts(self):
        second = _make_user('member_b')
        second.profile.italian_tl = self.leader
        second.profile.save()
        Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.leader, counterparty=self.member,
            occurred_on=self.month.date(),
        )
        result = meeting_compliance_metrics(self.leader, {self.member.id, second.id}, self.month_start)
        self.assertEqual(result['one_on_one_compliant'], 1)
        self.assertEqual(result['one_on_one_eligible'], 2)
        self.assertEqual(result['one_on_one_compliance_pct'], 50.0)

    def test_tl_sync_ytd_counts_this_year_up_to_the_month_with_pace(self):
        for occurred in (date(2026, 1, 20), date(2026, 3, 10), date(2026, 4, 2)):
            Meeting.objects.create(
                meeting_type='tl_sync', organizer=self.leader,
                counterparty=_make_user(f'mgr_{occurred.isoformat()}'), occurred_on=occurred,
            )
        data = build_scorecard(self.leader, date(2026, 3, 1))
        self.assertEqual(data['tl_sync_ytd'], 2)  # April is outside March's YTD
        self.assertEqual(data['tl_sync_expected_ytd'], 12)  # ceil(45 * 3 / 12)

    def test_build_scorecard_exposes_the_targets_it_is_measured_against(self):
        data = build_scorecard(self.leader, self.month_start)
        self.assertEqual(data['targets'], {
            'tl_sync_per_year': 45, 'reviews_per_year': 12,
            'one_on_one_pct': 100.0, 'promotion_pct': 3.0,
            'ot_within_sla_pct': 100.0,
        })

    def test_targets_follow_the_viewers_role(self):
        pm_targets = {
            'tl_sync_per_year': 24, 'reviews_per_year': 4, 'one_on_one_pct': 100.0, 'promotion_pct': 3.0,
            'ot_within_sla_pct': 100.0,
        }
        with mock.patch.dict('plugins.tl_scorecard.services.SCORECARD_TARGETS_BY_ROLE', {'pm': pm_targets}):
            _assign_tl_role(self.leader, 'pm')
            data = build_scorecard(self.leader, date(2026, 3, 1))
        self.assertEqual(data['targets'], pm_targets)
        self.assertEqual(data['tl_sync_expected_ytd'], 6)  # ceil(24 * 3 / 12)

    def test_targets_fall_back_to_the_line_manager_kpi_without_a_mapped_role(self):
        data = build_scorecard(self.leader, date(2026, 3, 1))
        self.assertEqual(data['targets']['tl_sync_per_year'], 45)
        self.assertEqual(data['targets']['reviews_per_year'], 12)

    def test_ot_turnaround_average(self):
        _overtime(self.member, self.month, approved_at=self.month)
        result = ot_turnaround_metrics(self.leader.id, self.month_start)
        self.assertEqual(result['decided_count'], 1)
        self.assertEqual(result['avg_turnaround_days'], 0)

    def test_ot_turnaround_empty_when_nothing_decided(self):
        result = ot_turnaround_metrics(self.leader.id, self.month_start)
        self.assertEqual(result['decided_count'], 0)
        self.assertIsNone(result['avg_turnaround_days'])

    def test_ot_pct_within_sla_counts_rows_at_or_under_two_business_days(self):
        # 3 decided rows at 1, 2 and 3 business days -> within_sla == 2, pct_within_sla == 66.7
        t_sub = _datetime(2026, 3, 2, 10, 0, tzinfo=_utc.utc)
        _overtime(self.member, t_sub, approved_at=_datetime(2026, 3, 3, 10, 0, tzinfo=_utc.utc))
        _overtime(self.member, t_sub, approved_at=_datetime(2026, 3, 4, 10, 0, tzinfo=_utc.utc))
        _overtime(self.member, t_sub, approved_at=_datetime(2026, 3, 5, 10, 0, tzinfo=_utc.utc))
        result = ot_turnaround_metrics(self.leader.id, date(2026, 3, 1))
        self.assertEqual(result['decided_count'], 3)
        self.assertEqual(result['within_sla'], 2)
        self.assertEqual(result['pct_within_sla'], 66.7)

    def test_ot_sla_does_not_charge_a_public_holiday(self):
        # Submitted Fri, approved Tue, Monday a global PublicHoliday -> that row counts as within (1 business day)
        PublicHoliday.objects.create(name='Global holiday', date=date(2026, 3, 9))
        t_sub = _datetime(2026, 3, 6, 10, 0, tzinfo=_utc.utc)
        t_app = _datetime(2026, 3, 10, 10, 0, tzinfo=_utc.utc)
        _overtime(self.member, t_sub, approved_at=t_app)
        result = ot_turnaround_metrics(self.leader.id, date(2026, 3, 1))
        self.assertEqual(result['decided_count'], 1)
        self.assertEqual(result['within_sla'], 1)
        self.assertEqual(result['pct_within_sla'], 100.0)

    def test_ot_sla_holiday_set_spans_the_new_year(self):
        # Submitted 31 Dec, approved 4 Jan, 1 Jan a holiday -> elapsed excludes 1 Jan
        PublicHoliday.objects.create(name='New Year', date=date(2026, 1, 1))
        t_sub = _datetime(2025, 12, 31, 10, 0, tzinfo=_utc.utc)
        t_app = _datetime(2026, 1, 4, 10, 0, tzinfo=_utc.utc)
        _overtime(self.member, t_sub, approved_at=t_app)
        result = ot_turnaround_metrics(self.leader.id, date(2025, 12, 1))
        self.assertEqual(result['decided_count'], 1)
        self.assertEqual(result['within_sla'], 1)
        self.assertEqual(result['pct_within_sla'], 100.0)
        self.assertEqual(result['avg_turnaround_days'], 1.0)

    def test_ot_sla_with_no_decided_rows_is_none(self):
        result = ot_turnaround_metrics(self.leader.id, self.month_start)
        self.assertEqual(result['decided_count'], 0)
        self.assertIsNone(result['avg_turnaround_days'])
        self.assertEqual(result['within_sla'], 0)
        self.assertIsNone(result['pct_within_sla'])

    def test_build_scorecard_resolves_team_size_from_profile(self):
        data = build_scorecard(self.leader, self.month_start)
        self.assertEqual(data['team_size'], 1)
        self.assertIn('leave', data)
        self.assertIn('overtime', data)
        self.assertIn('meetings', data)
        self.assertIn('idle', data)
        self.assertIn('seniority', data)

    def test_one_on_one_compliance_counts_only_current_team_members(self):
        Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.leader, counterparty=self.member,
            occurred_on=self.month.date(),
        )
        outsider = _make_user('outsider_meeting')
        Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.leader, counterparty=outsider,
            occurred_on=self.month.date(),
        )
        result = meeting_compliance_metrics(self.leader, {self.member.id}, self.month_start)
        self.assertEqual(result['one_on_one_compliance_pct'], 100.0)

    def test_tl_sync_count_and_team_meeting_governance(self):
        Meeting.objects.create(
            meeting_type='tl_sync', organizer=self.leader, counterparty=_make_user('italy_lead'),
            occurred_on=self.month.date(),
        )
        team_meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.leader, occurred_on=self.month.date(),
        )
        # Publish notes 2h after the row was created, not 2h after a fixed
        # calendar day: `self.month` is the 15th, which is in the future early
        # in a month, making the gap > 24h and the metric 0.
        Meeting.objects.filter(pk=team_meeting.pk).update(
            notes_published_at=team_meeting.created_at + timedelta(hours=2))
        team_meeting.refresh_from_db()
        MeetingAttendee.objects.create(meeting=team_meeting, user=_make_user('hrbp_x'), role='hrbp')

        result = meeting_compliance_metrics(self.leader, {self.member.id}, self.month_start)
        self.assertEqual(result['tl_sync_count'], 1)
        self.assertEqual(result['team_meetings_held'], 1)
        self.assertEqual(result['team_meetings_with_hrbp'], 1)
        self.assertEqual(result['team_meeting_notes_within_24h'], 1)

    def test_idle_metrics_counts_by_status(self):
        IdleFlag.objects.create(employee=self.member, flagged_by=self.leader, flagged_on=self.month.date(), status='open')
        IdleFlag.objects.create(
            employee=self.member, flagged_by=self.leader, flagged_on=self.month.date(), status='resolved',
        )
        result = idle_metrics(self.leader)
        self.assertEqual(result['open_count'], 1)
        self.assertEqual(result['resolved_count'], 1)

    def test_review_delivery_count_scoped_to_year(self):
        ReviewDelivery.objects.create(
            leader=self.leader, period='2026-01', recipient='Ops', delivered_on='2026-01-15',
        )
        ReviewDelivery.objects.create(
            leader=self.leader, period='2025-12', recipient='Ops', delivered_on='2025-12-15',
        )
        self.assertEqual(review_delivery_count(self.leader, 2026), 1)

    def test_seniority_ratio_counts_unset_members(self):
        result = seniority_ratio({self.member.id})
        self.assertEqual(result, {'junior': 0, 'mid': 0, 'senior': 0, 'unset': 1})
        self.member.profile.seniority_level = 'senior'
        self.member.profile.save()
        result = seniority_ratio({self.member.id})
        self.assertEqual(result, {'junior': 0, 'mid': 0, 'senior': 1, 'unset': 0})


class TLScorecardAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_b')
        _assign_tl_role(self.leader, 'albanian_tl')
        self.other_leader = _make_user('leader_c')
        _assign_tl_role(self.other_leader, 'albanian_tl')
        self.member = _make_user('member_b')
        self.member.profile.albanian_tl = self.leader
        self.member.profile.save()
        self.staff = _make_user('staff_b', is_staff=True)

    def _scorecard(self, user, **params):
        request = self.factory.get('/api/plugins/tl_scorecard/scorecard/', params)
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': 'scorecard'})(request)

    def test_tl_sees_own_scorecard(self):
        resp = self._scorecard(self.leader)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['team_size'], 1)

    def test_default_month_follows_the_tirana_calendar_at_0030_on_the_first(self):
        # 2026-11-01 00:30 in Europe/Tirane is still 2026-10-31 in UTC; the
        # default month must be November, not the server's UTC month.
        instant = _datetime(2026, 10, 31, 23, 30, tzinfo=_utc.utc)
        fake = mock.MagicMock(wraps=_datetime)
        fake.now.side_effect = lambda tz=None: instant.astimezone(tz)
        with mock.patch.object(timezone_local, 'datetime', fake):
            resp = self._scorecard(self.leader)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['month'][:7], '2026-11')

    def test_tl_cannot_view_another_leaders_scorecard(self):
        resp = self._scorecard(self.other_leader, leader_id=self.leader.id)
        self.assertEqual(resp.status_code, 403)

    def test_staff_can_view_any_leaders_scorecard(self):
        resp = self._scorecard(self.staff, leader_id=self.leader.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['team_size'], 1)
