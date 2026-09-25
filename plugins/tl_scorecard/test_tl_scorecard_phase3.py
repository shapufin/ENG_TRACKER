"""Tests for Phase 3: Absence, PIPRecord, PromotionFlag, EPRCycle/EPRGoal,
and the computed (non-logged) escalation_candidates()."""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.leave_management.models import LeaveRequest
from apps.permissions.models import Role, UserRole
from apps.users.models.core import UserProfile

from .models import Absence, EPRCycle, EPRGoal, IdleFlag, PIPRecord, PromotionFlag
from .services import (
    absence_metrics,
    epr_metrics,
    epr_stage_due_date,
    escalation_candidates,
    pip_metrics,
    promotion_ratio,
)
from .viewsets import (
    AbsenceViewSet,
    EPRCycleViewSet,
    EPRGoalViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
    TLScorecardViewSet,
)


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


class AbsenceServiceTests(TestCase):
    def setUp(self):
        self.leader = _make_user('leader_abs')
        self.member = _make_user('member_abs')

    def test_breached_5_day_sla_counted_when_still_open(self):
        Absence.objects.create(
            employee=self.member, flagged_by=self.leader,
            absence_date=date.today() - timedelta(days=10),
        )
        result = absence_metrics({self.member.id})
        self.assertEqual(result['open_count'], 1)
        self.assertEqual(result['breached_5_day_sla'], 1)

    def test_addressed_absence_not_counted_as_open(self):
        Absence.objects.create(
            employee=self.member, flagged_by=self.leader,
            absence_date=date.today() - timedelta(days=10), addressed_on=date.today(),
        )
        result = absence_metrics({self.member.id})
        self.assertEqual(result['open_count'], 0)
        self.assertEqual(result['breached_5_day_sla'], 0)


class PIPServiceTests(TestCase):
    def setUp(self):
        self.leader = _make_user('leader_pip')
        self.member = _make_user('member_pip')

    def test_pending_approval_counted_until_approved(self):
        PIPRecord.objects.create(employee=self.member, tl=self.leader, start_date=date.today())
        self.assertEqual(pip_metrics(self.leader)['pending_approval_count'], 1)

    def test_approved_pip_not_counted_as_pending(self):
        pip = PIPRecord.objects.create(employee=self.member, tl=self.leader, start_date=date.today())
        pip.approved_by = self.leader
        pip.approved_at = timezone.now()
        pip.save()
        self.assertEqual(pip_metrics(self.leader)['pending_approval_count'], 0)


class PromotionRatioServiceTests(TestCase):
    def test_ratio_computed_from_promoted_count_and_team_size(self):
        leader = _make_user('leader_promo')
        members = [_make_user(f'member_promo_{i}') for i in range(4)]
        PromotionFlag.objects.create(
            employee=members[0], nominated_by=leader, nominated_on=date.today(),
            status='promoted', decided_on=date.today(),
        )
        result = promotion_ratio({m.id for m in members}, date.today().year)
        self.assertEqual(result['promoted_count'], 1)
        self.assertEqual(result['team_size'], 4)
        self.assertEqual(result['promoted_pct'], 25.0)


class EPRServiceTests(TestCase):
    def test_due_dates_are_fixed_per_year_not_typed(self):
        self.assertEqual(epr_stage_due_date(2026, 'goal_setting'), date(2026, 3, 31))
        self.assertEqual(epr_stage_due_date(2026, 'mid_year'), date(2026, 9, 30))
        self.assertEqual(epr_stage_due_date(2026, 'final_review'), date(2026, 12, 31))

    def test_on_time_completion_measured_against_computed_due_date(self):
        member = _make_user('member_epr')
        cycle = EPRCycle.objects.create(
            user=member, year=2026,
            goal_setting_completed_at=timezone.make_aware(timezone.datetime(2026, 3, 15)),
        )
        for i in range(5):
            EPRGoal.objects.create(cycle=cycle, description=f'Goal {i}')

        result = epr_metrics({member.id}, 2026)
        self.assertEqual(result['stages']['goal_setting']['completed_on_time'], 1)
        self.assertEqual(result['cycles_with_5plus_goals'], 1)

    def test_late_completion_not_counted_on_time(self):
        member = _make_user('member_epr_late')
        EPRCycle.objects.create(
            user=member, year=2026,
            goal_setting_completed_at=timezone.make_aware(timezone.datetime(2026, 4, 15)),
        )
        result = epr_metrics({member.id}, 2026)
        self.assertEqual(result['stages']['goal_setting']['completed_on_time'], 0)


class EscalationCandidatesServiceTests(TestCase):
    def setUp(self):
        self.leader = _make_user('leader_esc')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_esc')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()

    def test_stale_pending_leave_surfaces_as_candidate(self):
        LeaveRequest.objects.create(
            user=self.member, request_type='vacation',
            start_date=date.today() + timedelta(days=10), end_date=date.today() + timedelta(days=11),
            status='pending',
        )
        LeaveRequest.objects.filter(user=self.member).update(
            submitted_at=timezone.now() - timedelta(days=10)
        )
        candidates = escalation_candidates(self.leader)
        self.assertTrue(any(c['kind'] == 'leave_pending' for c in candidates))

    def test_recently_submitted_leave_does_not_escalate(self):
        LeaveRequest.objects.create(
            user=self.member, request_type='vacation',
            start_date=date.today() + timedelta(days=10), end_date=date.today() + timedelta(days=11),
            status='pending',
        )
        candidates = escalation_candidates(self.leader)
        self.assertFalse(any(c['kind'] == 'leave_pending' for c in candidates))

    def test_stale_idle_flag_surfaces_as_candidate(self):
        IdleFlag.objects.create(
            employee=self.member, flagged_by=self.leader,
            flagged_on=date.today() - timedelta(weeks=6), status='open',
        )
        candidates = escalation_candidates(self.leader)
        self.assertTrue(any(c['kind'] == 'idle_flag_stale' for c in candidates))

    def test_no_manual_escalation_model_exists(self):
        # This whole feature is computed, not logged — there's no
        # EscalationRecord model to create in the first place.
        from . import models
        self.assertFalse(hasattr(models, 'EscalationRecord'))


class AbsenceAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_abs_api')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_abs_api')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()

    def test_cannot_flag_absence_for_non_team_member(self):
        outsider = _make_user('outsider_abs')
        request = self.factory.post('/api/plugins/tl_scorecard/absences/', {
            'employee': outsider.id, 'absence_date': str(date.today()),
        })
        force_authenticate(request, user=self.leader)
        resp = AbsenceViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(resp.status_code, 400)


class PIPRecordAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_pip_api')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_pip_api')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        self.staff = _make_user('staff_pip_api', is_staff=True)

    def test_tl_cannot_self_approve_own_pip(self):
        request = self.factory.post('/api/plugins/tl_scorecard/pip-records/', {
            'employee': self.member.id, 'start_date': str(date.today()), 'status': 'active',
        })
        force_authenticate(request, user=self.leader)
        resp = PIPRecordViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(resp.status_code, 201, resp.data)
        pip_id = resp.data['id']

        approve_request = self.factory.post(f'/api/plugins/tl_scorecard/pip-records/{pip_id}/approve/')
        force_authenticate(approve_request, user=self.leader)
        approve_resp = PIPRecordViewSet.as_view({'post': 'approve'})(approve_request, pk=pip_id)
        self.assertEqual(approve_resp.status_code, 403)

    def test_staff_can_approve_a_pip(self):
        request = self.factory.post('/api/plugins/tl_scorecard/pip-records/', {
            'employee': self.member.id, 'start_date': str(date.today()), 'status': 'active',
        })
        force_authenticate(request, user=self.leader)
        resp = PIPRecordViewSet.as_view({'post': 'create'})(request)
        pip_id = resp.data['id']

        approve_request = self.factory.post(f'/api/plugins/tl_scorecard/pip-records/{pip_id}/approve/')
        force_authenticate(approve_request, user=self.staff)
        approve_resp = PIPRecordViewSet.as_view({'post': 'approve'})(approve_request, pk=pip_id)
        self.assertEqual(approve_resp.status_code, 200, approve_resp.data)
        self.assertIsNotNone(approve_resp.data['approved_at'])


class PromotionFlagAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_promo_api')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_promo_api')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()

    def test_decide_sets_status_and_decided_on(self):
        create_request = self.factory.post('/api/plugins/tl_scorecard/promotion-flags/', {
            'employee': self.member.id, 'nominated_on': str(date.today()),
        })
        force_authenticate(create_request, user=self.leader)
        create_resp = PromotionFlagViewSet.as_view({'post': 'create'})(create_request)
        self.assertEqual(create_resp.status_code, 201, create_resp.data)
        flag_id = create_resp.data['id']

        decide_request = self.factory.post(
            f'/api/plugins/tl_scorecard/promotion-flags/{flag_id}/decide/', {'status': 'promoted'},
        )
        force_authenticate(decide_request, user=self.leader)
        decide_resp = PromotionFlagViewSet.as_view({'post': 'decide'})(decide_request, pk=flag_id)
        self.assertEqual(decide_resp.status_code, 200, decide_resp.data)
        self.assertEqual(decide_resp.data['status'], 'promoted')
        self.assertIsNotNone(decide_resp.data['decided_on'])

    def test_decide_rejects_invalid_status(self):
        create_request = self.factory.post('/api/plugins/tl_scorecard/promotion-flags/', {
            'employee': self.member.id, 'nominated_on': str(date.today()),
        })
        force_authenticate(create_request, user=self.leader)
        flag_id = PromotionFlagViewSet.as_view({'post': 'create'})(create_request).data['id']

        decide_request = self.factory.post(
            f'/api/plugins/tl_scorecard/promotion-flags/{flag_id}/decide/', {'status': 'maybe'},
        )
        force_authenticate(decide_request, user=self.leader)
        resp = PromotionFlagViewSet.as_view({'post': 'decide'})(decide_request, pk=flag_id)
        self.assertEqual(resp.status_code, 400)


class EPRCycleAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_epr_api')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_epr_api')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()

    def _create_cycle(self):
        request = self.factory.post('/api/plugins/tl_scorecard/epr-cycles/', {
            'user': self.member.id, 'year': 2026,
        })
        force_authenticate(request, user=self.leader)
        return EPRCycleViewSet.as_view({'post': 'create'})(request)

    def test_cannot_complete_goal_setting_with_fewer_than_5_goals(self):
        cycle_id = self._create_cycle().data['id']
        request = self.factory.patch(f'/api/plugins/tl_scorecard/epr-cycles/{cycle_id}/', {
            'goal_setting_completed_at': timezone.now().isoformat(),
        })
        force_authenticate(request, user=self.leader)
        resp = EPRCycleViewSet.as_view({'patch': 'partial_update'})(request, pk=cycle_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('goal_setting_completed_at', resp.data)

    def test_can_complete_goal_setting_with_5_goals(self):
        cycle_id = self._create_cycle().data['id']
        for i in range(5):
            goal_request = self.factory.post('/api/plugins/tl_scorecard/epr-goals/', {
                'cycle': cycle_id, 'description': f'Goal {i}',
            })
            force_authenticate(goal_request, user=self.leader)
            goal_resp = EPRGoalViewSet.as_view({'post': 'create'})(goal_request)
            self.assertEqual(goal_resp.status_code, 201, goal_resp.data)

        request = self.factory.patch(f'/api/plugins/tl_scorecard/epr-cycles/{cycle_id}/', {
            'goal_setting_completed_at': timezone.now().isoformat(),
        })
        force_authenticate(request, user=self.leader)
        resp = EPRCycleViewSet.as_view({'patch': 'partial_update'})(request, pk=cycle_id)
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_duplicate_cycle_for_same_user_year_rejected_cleanly(self):
        self._create_cycle()
        resp = self._create_cycle()
        self.assertEqual(resp.status_code, 400)


class ScorecardIncludesPhase3Metrics(TestCase):
    def test_scorecard_endpoint_serializes_phase3_sections(self):
        factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        leader = _make_user('leader_full_scorecard')
        _assign_tl_role(leader)
        request = factory.get('/api/plugins/tl_scorecard/scorecard/')
        force_authenticate(request, user=leader)
        resp = TLScorecardViewSet.as_view({'get': 'scorecard'})(request)
        self.assertEqual(resp.status_code, 200, resp.data)
        for key in ('absences', 'pip', 'promotion', 'escalation_count'):
            self.assertIn(key, resp.data)
