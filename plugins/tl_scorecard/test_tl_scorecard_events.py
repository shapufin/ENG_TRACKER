"""Tests for Phase 2 event-logging endpoints: Meeting, IdleFlag,
ReviewDelivery, EngagementSurveyResponse."""
from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from apps.users.models.core import Team, UserProfile

from .models import EngagementSurveyResponse, IdleFlag, Meeting
from .viewsets import (
    EngagementSurveyResponseViewSet,
    IdleFlagViewSet,
    IdleStatusUpdateViewSet,
    MeetingAttendeeViewSet,
    MeetingViewSet,
    ReviewDeliveryViewSet,
)


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


class MeetingAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_m')
        _assign_tl_role(self.leader, 'italian_tl')
        self.member = _make_user('member_m')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        self.other_leader = _make_user('leader_m2')
        _assign_tl_role(self.other_leader, 'italian_tl')

    def _create(self, user, data):
        request = self.factory.post('/api/plugins/tl_scorecard/meetings/', data)
        force_authenticate(request, user=user)
        return MeetingViewSet.as_view({'post': 'create'})(request)

    def _list(self, user):
        request = self.factory.get('/api/plugins/tl_scorecard/meetings/')
        force_authenticate(request, user=user)
        return MeetingViewSet.as_view({'get': 'list'})(request)

    def test_create_one_on_one_requires_counterparty(self):
        resp = self._create(self.leader, {'meeting_type': 'one_on_one', 'occurred_on': '2026-09-10'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('counterparty', resp.data)

    def test_create_team_meeting_requires_team(self):
        resp = self._create(self.leader, {'meeting_type': 'team_meeting', 'occurred_on': '2026-09-10'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('team', resp.data)

    def test_create_one_on_one_sets_organizer_to_caller(self):
        resp = self._create(self.leader, {
            'meeting_type': 'one_on_one', 'occurred_on': '2026-09-10', 'counterparty': self.member.id,
        })
        self.assertEqual(resp.status_code, 201, resp.data)
        meeting = Meeting.objects.get(pk=resp.data['id'])
        self.assertEqual(meeting.organizer, self.leader)
        self.assertEqual(meeting.recorded_by, self.leader)

    def test_tl_sync_counterparty_not_required_to_be_a_direct_report(self):
        # The Italy Technical Lead isn't resolved by get_team_member_ids() —
        # any user can be the counterparty for a tl_sync.
        outsider = _make_user('italy_tech_lead')
        resp = self._create(self.leader, {
            'meeting_type': 'tl_sync', 'occurred_on': '2026-09-10', 'counterparty': outsider.id,
        })
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_leader_only_sees_own_meetings(self):
        self._create(self.leader, {
            'meeting_type': 'one_on_one', 'occurred_on': '2026-09-10', 'counterparty': self.member.id,
        })
        resp = self._list(self.other_leader)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 0)


class MeetingAttendeeAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_att')
        _assign_tl_role(self.leader)
        self.other_leader = _make_user('leader_att2')
        _assign_tl_role(self.other_leader)
        self.hrbp = _make_user('hrbp_att')
        self.team = Team.objects.create(name='Attendee Team', code='ATT')
        self.meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.leader, team=self.team, occurred_on='2026-09-10',
        )

    def _create(self, user, data):
        request = self.factory.post('/api/plugins/tl_scorecard/meeting-attendees/', data)
        force_authenticate(request, user=user)
        return MeetingAttendeeViewSet.as_view({'post': 'create'})(request)

    def test_organizer_can_add_hrbp_attendee(self):
        resp = self._create(self.leader, {'meeting': self.meeting.id, 'user': self.hrbp.id, 'role': 'hrbp'})
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_non_organizer_cannot_add_attendee(self):
        resp = self._create(self.other_leader, {'meeting': self.meeting.id, 'user': self.hrbp.id, 'role': 'hrbp'})
        self.assertEqual(resp.status_code, 403)

    def test_cannot_reassign_attendee_to_a_meeting_you_do_not_organize_via_update(self):
        other_meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.other_leader, team=self.team, occurred_on='2026-09-11',
        )
        create_resp = self._create(self.leader, {'meeting': self.meeting.id, 'user': self.hrbp.id, 'role': 'hrbp'})
        attendee_id = create_resp.data['id']

        request = self.factory.patch(f'/api/plugins/tl_scorecard/meeting-attendees/{attendee_id}/', {
            'meeting': other_meeting.id,
        })
        force_authenticate(request, user=self.leader)
        resp = MeetingAttendeeViewSet.as_view({'patch': 'partial_update'})(request, pk=attendee_id)
        self.assertEqual(resp.status_code, 403)


class IdleFlagAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_idle')
        _assign_tl_role(self.leader, 'albanian_tl')
        self.employee = _make_user('employee_idle')
        self.employee.profile.albanian_tl = self.leader
        self.employee.profile.save()
        self.other_leader = _make_user('leader_idle2')
        _assign_tl_role(self.other_leader, 'albanian_tl')

    def _create(self, user, data):
        request = self.factory.post('/api/plugins/tl_scorecard/idle-flags/', data)
        force_authenticate(request, user=user)
        return IdleFlagViewSet.as_view({'post': 'create'})(request)

    def _update_status(self, user, data):
        request = self.factory.post('/api/plugins/tl_scorecard/idle-status-updates/', data)
        force_authenticate(request, user=user)
        return IdleStatusUpdateViewSet.as_view({'post': 'create'})(request)

    def test_create_sets_flagged_by_to_caller(self):
        resp = self._create(self.leader, {
            'employee': self.employee.id, 'flagged_on': '2026-09-10', 'status': 'open',
        })
        self.assertEqual(resp.status_code, 201, resp.data)
        flag = IdleFlag.objects.get(pk=resp.data['id'])
        self.assertEqual(flag.flagged_by, self.leader)

    def test_cannot_flag_a_non_team_member_as_idle(self):
        outsider = _make_user('outsider_idle')
        resp = self._create(self.leader, {
            'employee': outsider.id, 'flagged_on': '2026-09-10', 'status': 'open',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('employee', resp.data)

    def test_weekly_status_update_rejected_for_non_owner(self):
        flag = IdleFlag.objects.create(employee=self.employee, flagged_by=self.leader, flagged_on='2026-09-10')
        resp = self._update_status(self.other_leader, {
            'flag': flag.id, 'week_of': '2026-09-08', 'status_note': 'still idle',
        })
        self.assertEqual(resp.status_code, 403)

    def test_weekly_status_update_allowed_for_owner(self):
        flag = IdleFlag.objects.create(employee=self.employee, flagged_by=self.leader, flagged_on='2026-09-10')
        resp = self._update_status(self.leader, {
            'flag': flag.id, 'week_of': '2026-09-08', 'status_note': 'still idle',
        })
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_duplicate_weekly_status_update_rejected_cleanly(self):
        flag = IdleFlag.objects.create(employee=self.employee, flagged_by=self.leader, flagged_on='2026-09-10')
        self._update_status(self.leader, {'flag': flag.id, 'week_of': '2026-09-08', 'status_note': 'first'})
        resp = self._update_status(self.leader, {'flag': flag.id, 'week_of': '2026-09-08', 'status_note': 'second'})
        self.assertEqual(resp.status_code, 400)

    def test_cannot_reassign_idle_flag_to_non_team_member_via_update(self):
        outsider = _make_user('outsider_idle_update')
        flag = IdleFlag.objects.create(employee=self.employee, flagged_by=self.leader, flagged_on='2026-09-10')
        request = self.factory.patch(f'/api/plugins/tl_scorecard/idle-flags/{flag.id}/', {
            'employee': outsider.id,
        })
        force_authenticate(request, user=self.leader)
        resp = IdleFlagViewSet.as_view({'patch': 'partial_update'})(request, pk=flag.id)
        self.assertEqual(resp.status_code, 400)
        flag.refresh_from_db()
        self.assertEqual(flag.employee_id, self.employee.id)

    def test_cannot_reassign_status_update_to_a_flag_you_do_not_own_via_update(self):
        own_flag = IdleFlag.objects.create(employee=self.employee, flagged_by=self.leader, flagged_on='2026-09-10')
        other_employee = _make_user('other_employee_idle')
        other_employee.profile.albanian_tl = self.other_leader
        other_employee.profile.save()
        other_flag = IdleFlag.objects.create(
            employee=other_employee, flagged_by=self.other_leader, flagged_on='2026-09-10',
        )
        create_resp = self._update_status(self.leader, {
            'flag': own_flag.id, 'week_of': '2026-09-08', 'status_note': 'still idle',
        })
        status_update_id = create_resp.data['id']

        request = self.factory.patch(f'/api/plugins/tl_scorecard/idle-status-updates/{status_update_id}/', {
            'flag': other_flag.id,
        })
        force_authenticate(request, user=self.leader)
        resp = IdleStatusUpdateViewSet.as_view({'patch': 'partial_update'})(request, pk=status_update_id)
        self.assertEqual(resp.status_code, 403)


class ReviewDeliveryAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_rd')
        _assign_tl_role(self.leader)

    def test_create_sets_leader_to_caller(self):
        request = self.factory.post('/api/plugins/tl_scorecard/review-deliveries/', {
            'period': '2026-09', 'recipient': 'Ops', 'delivered_on': '2026-09-15',
        })
        force_authenticate(request, user=self.leader)
        resp = ReviewDeliveryViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['leader'], self.leader.id)


class EngagementSurveyResponseAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_survey')
        _assign_tl_role(self.leader)
        self.employee = _make_user('employee_survey')  # deliberately NOT a TL
        self.employee.profile.italian_tl = self.leader
        self.employee.profile.save()
        self.other_employee = _make_user('other_employee_survey')

    def _create(self, user, data):
        request = self.factory.post('/api/plugins/tl_scorecard/engagement-survey-responses/', data)
        force_authenticate(request, user=user)
        return EngagementSurveyResponseViewSet.as_view({'post': 'create'})(request)

    def _team_average(self, user, **params):
        request = self.factory.get('/api/plugins/tl_scorecard/engagement-survey-responses/team-average/', params)
        force_authenticate(request, user=user)
        return EngagementSurveyResponseViewSet.as_view({'get': 'team_average'})(request)

    def test_any_employee_can_submit_their_own_response(self):
        # Not a TL — proves the 'configure' bucket is genuinely public,
        # unlike every other action in this plugin.
        resp = self._create(self.employee, {'period': '2026-09', 'score': 9})
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['respondent'], self.employee.id)

    def test_duplicate_response_for_same_period_rejected(self):
        EngagementSurveyResponse.objects.create(respondent=self.employee, period='2026-09', score=7)
        resp = self._create(self.employee, {'period': '2026-09', 'score': 9})
        self.assertEqual(resp.status_code, 400)

    def test_team_average_aggregates_without_exposing_individual_scores(self):
        EngagementSurveyResponse.objects.create(respondent=self.employee, period='2026-09', score=8)
        outsider_flag = EngagementSurveyResponse.objects.create(
            respondent=self.other_employee, period='2026-09', score=2,
        )
        resp = self._team_average(self.leader, period='2026-09')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['average_score'], 8.0)
        self.assertEqual(resp.data['response_count'], 1)
        self.assertNotIn('responses', resp.data)
        # Outsider's score never leaks into this leader's aggregate.
        self.assertNotEqual(resp.data['average_score'], outsider_flag.score)
