"""Phase 6 audit findings S-F1..S-F6, reproduced as API calls."""
from datetime import date, timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.leave_management.models import LeaveRequest
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission
from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .models import (
    Absence,
    EPRCycle,
    EPRStageRecord,
    HbprGovernanceEvidence,
    IdleFlag,
    Meeting,
    PIPRecord,
    PromotionFlag,
)
from .services import build_scorecard
from .testing import make_user as _make_user
from .viewsets import (
    AbsenceViewSet,
    EPRCycleViewSet,
    HbprGovernanceEvidenceViewSet,
    IdleFlagViewSet,
    MeetingViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
    TLScorecardViewSet,
)


class Phase6Base(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        for code in ('hbpr', 'italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.leader = _make_user('leader_p6')
        assign_role(self.leader, 'italian_tl')
        self.member = _make_user('member_p6')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        self.today = date.today()

    def call(self, viewset, mapping, user, pk=None, data=None, method='post', **extra):
        request = getattr(self.factory, method)('/x/', data or {}, format='json')
        force_authenticate(request, user=user)
        kwargs = {'pk': pk} if pk is not None else {}
        return viewset.as_view(mapping)(request, **kwargs, **extra)

    def delete(self, viewset, user, pk):
        return self.call(viewset, {'delete': 'destroy'}, user, pk=pk, method='delete')

    def patch(self, viewset, user, pk, data):
        return self.call(viewset, {'patch': 'partial_update'}, user, pk=pk, data=data, method='patch')


class DecidedRecordsCannotBeDeletedTests(Phase6Base):
    """S-F1."""

    def test_approved_pip_delete_refused_and_row_remains(self):
        pip = PIPRecord.objects.create(
            employee=self.member, tl=self.leader, start_date=self.today,
            status='active', approved_by=self.leader, approved_at=timezone.now())
        resp = self.delete(PIPRecordViewSet, self.leader, pip.pk)
        self.assertIn(resp.status_code, (403, 409), resp.data)
        self.assertTrue(PIPRecord.objects.filter(pk=pip.pk).exists())

    def test_draft_pip_still_deletable(self):
        pip = PIPRecord.objects.create(employee=self.member, tl=self.leader, start_date=self.today)
        self.assertEqual(self.delete(PIPRecordViewSet, self.leader, pip.pk).status_code, 204)

    def test_decided_promotion_flag_delete_refused(self):
        flag = PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.leader, nominated_on=self.today,
            status='promoted', decided_on=self.today)
        resp = self.delete(PromotionFlagViewSet, self.leader, flag.pk)
        self.assertIn(resp.status_code, (403, 409), resp.data)
        self.assertTrue(PromotionFlag.objects.filter(pk=flag.pk).exists())

    def test_nominated_promotion_flag_still_deletable(self):
        flag = PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.leader, nominated_on=self.today)
        self.assertEqual(self.delete(PromotionFlagViewSet, self.leader, flag.pk).status_code, 204)

    def test_epr_cycle_with_stage_records_delete_refused(self):
        cycle = EPRCycle.objects.create(
            user=self.member, year=self.today.year, goal_setting_completed_at=timezone.now())
        EPRStageRecord.objects.create(
            cycle=cycle, stage='goal_setting', summary='agreed', recorded_by=self.leader)
        resp = self.delete(EPRCycleViewSet, self.leader, cycle.pk)
        self.assertIn(resp.status_code, (403, 409), resp.data)
        self.assertTrue(EPRCycle.objects.filter(pk=cycle.pk).exists())
        self.assertEqual(EPRStageRecord.objects.filter(cycle=cycle).count(), 1)

    def test_untouched_epr_cycle_still_deletable(self):
        cycle = EPRCycle.objects.create(user=self.member, year=self.today.year)
        self.assertEqual(self.delete(EPRCycleViewSet, self.leader, cycle.pk).status_code, 204)

    def test_resolved_idle_flag_delete_refused(self):
        flag = IdleFlag.objects.create(
            employee=self.member, flagged_by=self.leader, flagged_on=self.today,
            status='resolved', resolved_on=self.today)
        resp = self.delete(IdleFlagViewSet, self.leader, flag.pk)
        self.assertIn(resp.status_code, (403, 409), resp.data)
        self.assertTrue(IdleFlag.objects.filter(pk=flag.pk).exists())

    def test_addressed_absence_delete_refused(self):
        absence = Absence.objects.create(
            employee=self.member, flagged_by=self.leader, absence_date=self.today,
            addressed_on=self.today)
        resp = self.delete(AbsenceViewSet, self.leader, absence.pk)
        self.assertIn(resp.status_code, (403, 409), resp.data)
        self.assertTrue(Absence.objects.filter(pk=absence.pk).exists())

    def test_open_absence_still_deletable(self):
        absence = Absence.objects.create(
            employee=self.member, flagged_by=self.leader, absence_date=self.today)
        self.assertEqual(self.delete(AbsenceViewSet, self.leader, absence.pk).status_code, 204)


class HbprEscalationLeakTests(Phase6Base):
    """S-F2."""

    def setUp(self):
        super().setUp()
        PluginPermission.objects.get(plugin_name='tl_scorecard', action='view') \
            .allowed_roles.add(Role.objects.get(code='hbpr'))
        self.hbpr = _make_user('hbpr_p6')
        assign_role(self.hbpr, 'hbpr')
        self.al_tl = _make_user('al_tl_p6')
        assign_role(self.al_tl, 'albanian_tl')
        self.al_member = _make_user('al_member_p6')
        self.al_member.profile.albanian_tl = self.al_tl
        self.al_member.profile.save()
        HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.al_tl, cadence='weekly',
            effective_from=date(2020, 1, 1))
        self.outsider = _make_user('outsider_p6')

    def _get(self, name, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': name})(request)

    def test_hbpr_escalations_have_no_leave_and_no_out_of_scope_subjects(self):
        start = self.today + timedelta(days=30)
        LeaveRequest.objects.create(
            user=self.al_member, request_type='vacation', start_date=start,
            end_date=start + timedelta(days=1), status='pending')
        LeaveRequest.objects.update(submitted_at=timezone.now() - timedelta(days=20))
        # A PIP the AL TL wrote about someone outside the HBPR's population.
        pip = PIPRecord.objects.create(
            employee=self.outsider, tl=self.al_tl, start_date=self.today)
        PIPRecord.objects.filter(pk=pip.pk).update(created_at=timezone.now() - timedelta(days=60))

        resp = self._get('escalations', self.hbpr, leader_id=self.al_tl.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        kinds = {row['kind'] for row in resp.data}
        subjects = {row['subject_id'] for row in resp.data}
        self.assertNotIn('leave_pending', kinds)
        self.assertNotIn(self.outsider.id, subjects)

    def test_hbpr_scorecard_omits_leave_and_overtime(self):
        resp = self._get('scorecard', self.hbpr, leader_id=self.al_tl.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn('leave', resp.data)
        self.assertNotIn('overtime', resp.data)


class MeetingUpdateTests(Phase6Base):
    """S-F3 and S-F4."""

    def test_patch_to_one_on_one_with_non_team_counterparty_refused(self):
        outsider = _make_user('outsider_meet')
        meeting = Meeting.objects.create(
            meeting_type='tl_sync', organizer=self.leader, counterparty=outsider,
            occurred_on=self.today)
        resp = self.patch(MeetingViewSet, self.leader, meeting.pk, {'meeting_type': 'one_on_one'})
        self.assertEqual(resp.status_code, 400, resp.data)
        meeting.refresh_from_db()
        self.assertEqual(meeting.meeting_type, 'tl_sync')

    def test_forged_notes_published_at_does_not_earn_24h_kpi(self):
        meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.leader, occurred_on=self.today)
        Meeting.objects.filter(pk=meeting.pk).update(
            created_at=timezone.now() - timedelta(days=3))
        meeting.refresh_from_db()
        forged = (meeting.created_at - timedelta(hours=1)).isoformat()
        self.patch(MeetingViewSet, self.leader, meeting.pk, {'notes_published_at': forged})
        meeting.refresh_from_db()
        data = build_scorecard(self.leader, self.today.replace(day=1))
        self.assertEqual(data['meetings']['team_meeting_notes_within_24h'], 0)
        self.assertIsNone(meeting.notes_published_at)


class EPRCycleUpdateTests(Phase6Base):
    """S-F5."""

    def test_patch_to_duplicate_user_year_is_400_not_500(self):
        year = self.today.year
        EPRCycle.objects.create(user=self.member, year=year)
        other = EPRCycle.objects.create(user=self.member, year=year - 1)
        resp = self.patch(EPRCycleViewSet, self.leader, other.pk, {'year': year})
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_patch_year_after_stage_completed_refused(self):
        cycle = EPRCycle.objects.create(
            user=self.member, year=self.today.year, goal_setting_completed_at=timezone.now())
        resp = self.patch(EPRCycleViewSet, self.leader, cycle.pk, {'year': self.today.year - 1})
        self.assertEqual(resp.status_code, 400, resp.data)
        cycle.refresh_from_db()
        self.assertEqual(cycle.year, self.today.year)


class EvidenceWindowTests(Phase6Base):
    """S-F6."""

    def test_patch_occurred_on_outside_assignment_window_refused(self):
        hbpr = _make_user('hbpr_win')
        assign_role(hbpr, 'hbpr')
        al_tl = _make_user('al_tl_win')
        assign_role(al_tl, 'albanian_tl')
        assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=hbpr, albanian_tl=al_tl, cadence='weekly',
            effective_from=date(2020, 1, 1))
        evidence = HbprGovernanceEvidence.objects.create(
            assignment=assignment, kind='cadence_meeting', occurred_on=self.today,
            shared_summary='sync', recorded_by=al_tl)
        resp = self.patch(
            HbprGovernanceEvidenceViewSet, al_tl, evidence.pk, {'occurred_on': '2019-01-01'})
        self.assertEqual(resp.status_code, 400, resp.data)
        evidence.refresh_from_db()
        self.assertEqual(evidence.occurred_on, self.today)
