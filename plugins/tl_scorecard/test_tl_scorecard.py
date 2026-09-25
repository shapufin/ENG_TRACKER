"""Tests for the TL Scorecard plugin (Phase 1)."""
from datetime import time, timedelta

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.leave_management.models import LeaveRequest
from apps.overtime.models.core import Client, OvertimeLog
from apps.permissions.models import Role, UserRole
from apps.users.models.core import UserProfile

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
from .viewsets import TLScorecardViewSet


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


def _leave(user, submitted_at, approved_at=None, status='approved'):
    request = LeaveRequest.objects.create(
        user=user, request_type='vacation',
        start_date=submitted_at.date() + timedelta(days=5),
        end_date=submitted_at.date() + timedelta(days=6),
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

    def test_ot_turnaround_average(self):
        _overtime(self.member, self.month, approved_at=self.month)
        result = ot_turnaround_metrics({self.member.id}, self.month_start)
        self.assertEqual(result['decided_count'], 1)
        self.assertEqual(result['avg_turnaround_days'], 0)

    def test_ot_turnaround_empty_when_nothing_decided(self):
        result = ot_turnaround_metrics({self.member.id}, self.month_start)
        self.assertEqual(result['decided_count'], 0)
        self.assertIsNone(result['avg_turnaround_days'])

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
            notes_published_at=self.month + timedelta(hours=2),
        )
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

    def _kpi_coverage(self, user):
        request = self.factory.get('/api/plugins/tl_scorecard/kpi-coverage/')
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': 'kpi_coverage'})(request)

    def test_tl_sees_own_scorecard(self):
        resp = self._scorecard(self.leader)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['team_size'], 1)

    def test_tl_cannot_view_another_leaders_scorecard(self):
        resp = self._scorecard(self.other_leader, leader_id=self.leader.id)
        self.assertEqual(resp.status_code, 403)

    def test_staff_can_view_any_leaders_scorecard(self):
        resp = self._scorecard(self.staff, leader_id=self.leader.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['team_size'], 1)

    def test_kpi_coverage_lists_every_kpi_with_a_status(self):
        resp = self._kpi_coverage(self.leader)
        self.assertEqual(resp.status_code, 200)
        self.assertGreater(len(resp.data), 15)
        statuses = {row['status'] for row in resp.data}
        self.assertTrue(statuses.issubset({'measured', 'approximate', 'planned', 'blocked', 'excluded'}))
