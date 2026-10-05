"""Security hardening for tl_scorecard (HBPR plan, Phase 1b): server-controlled
status fields, `leader_id` validation, and spreadsheet formula injection."""
import io
import zipfile
from datetime import date

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole

from .excel_export import build_workbook_bytes
from .testing import make_user as _make_user
from .models import PIPRecord, PromotionFlag
from .viewsets import PIPRecordViewSet, PromotionFlagViewSet, TLScorecardViewSet


def _assign_tl_role(user):
    role, _ = Role.objects.get_or_create(code='italian_tl', defaults={'name': 'italian_tl'})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


class ScorecardHardeningBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_hard')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_hard')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        self.staff = _make_user('staff_hard', is_staff=True)


class StatusFieldsAreServerControlledTests(ScorecardHardeningBase):
    def _create_pip(self, **extra):
        request = self.factory.post('/api/plugins/tl_scorecard/pip-records/', {
            'employee': self.member.id, 'start_date': str(date.today()), **extra,
        })
        force_authenticate(request, user=self.leader)
        return PIPRecordViewSet.as_view({'post': 'create'})(request)

    def _create_flag(self):
        request = self.factory.post('/api/plugins/tl_scorecard/promotion-flags/', {
            'employee': self.member.id, 'nominated_on': str(date.today()),
        })
        force_authenticate(request, user=self.leader)
        return PromotionFlagViewSet.as_view({'post': 'create'})(request)

    def test_pip_is_always_created_as_draft(self):
        resp = self._create_pip(status='active')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(PIPRecord.objects.get(pk=resp.data['id']).status, 'draft')

    def _approve(self, pip_id, user):
        request = self.factory.post(f'/api/plugins/tl_scorecard/pip-records/{pip_id}/approve/')
        force_authenticate(request, user=user)
        return PIPRecordViewSet.as_view({'post': 'approve'})(request, pk=pip_id)

    def test_approve_moves_draft_to_active_and_records_the_approver(self):
        pip_id = self._create_pip().data['id']
        resp = self._approve(pip_id, self.staff)
        self.assertEqual(resp.status_code, 200, resp.data)
        pip = PIPRecord.objects.get(pk=pip_id)
        self.assertEqual(pip.status, 'active')
        self.assertEqual(pip.approved_by_id, self.staff.id)

    def test_approving_twice_is_a_409_and_keeps_the_first_approver(self):
        pip_id = self._create_pip().data['id']
        self._approve(pip_id, self.staff)
        other = _make_user('staff_two_hard', is_staff=True)
        resp = self._approve(pip_id, other)
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(PIPRecord.objects.get(pk=pip_id).approved_by_id, self.staff.id)

    def test_tl_cannot_change_pip_status_by_patch(self):
        pip_id = self._create_pip().data['id']
        request = self.factory.patch(
            f'/api/plugins/tl_scorecard/pip-records/{pip_id}/', {'status': 'completed'},
        )
        force_authenticate(request, user=self.leader)
        PIPRecordViewSet.as_view({'patch': 'partial_update'})(request, pk=pip_id)
        self.assertEqual(PIPRecord.objects.get(pk=pip_id).status, 'draft')

    def test_tl_cannot_decide_promotion_by_patch(self):
        flag_id = self._create_flag().data['id']
        request = self.factory.patch(
            f'/api/plugins/tl_scorecard/promotion-flags/{flag_id}/',
            {'status': 'promoted', 'decided_on': str(date.today())},
        )
        force_authenticate(request, user=self.leader)
        PromotionFlagViewSet.as_view({'patch': 'partial_update'})(request, pk=flag_id)
        flag = PromotionFlag.objects.get(pk=flag_id)
        self.assertEqual(flag.status, 'nominated')
        self.assertIsNone(flag.decided_on)

    def test_decide_action_still_works_for_staff(self):
        flag_id = self._create_flag().data['id']
        request = self.factory.post(
            f'/api/plugins/tl_scorecard/promotion-flags/{flag_id}/decide/', {'status': 'promoted'},
        )
        force_authenticate(request, user=self.staff)
        resp = PromotionFlagViewSet.as_view({'post': 'decide'})(request, pk=flag_id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(PromotionFlag.objects.get(pk=flag_id).status, 'promoted')


class LeaderIdValidationTests(ScorecardHardeningBase):
    def _get(self, user, leader_id):
        request = self.factory.get('/api/plugins/tl_scorecard/scorecard/', {'leader_id': leader_id})
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': 'scorecard'})(request)

    def test_non_integer_leader_id_is_a_400_not_a_500(self):
        self.assertEqual(self._get(self.staff, 'abc').status_code, 400)

    def test_unknown_leader_id_is_404_for_staff(self):
        self.assertEqual(self._get(self.staff, 999999).status_code, 404)

    def test_non_staff_gets_403_whether_or_not_the_id_exists(self):
        existing = self._get(self.leader, self.member.id)
        missing = self._get(self.leader, 999999)
        self.assertEqual(existing.status_code, 403)
        self.assertEqual(missing.status_code, 403)

    def test_target_must_be_a_team_leader(self):
        self.assertEqual(self._get(self.staff, self.member.id).status_code, 400)

    def test_staff_can_view_a_real_team_leader(self):
        self.assertEqual(self._get(self.staff, self.leader.id).status_code, 200)


class WorkbookFormulaInjectionTests(TestCase):
    def test_free_text_is_never_written_as_a_formula_or_link(self):
        hostile = '=HYPERLINK("http://evil.example","click")'
        governance = {
            'open_pips': [],
            'open_absences': [{
                'employee': '=1+1', 'absence_date': '2026-09-01', 'reason': hostile,
            }],
            'pending_promotions': [],
            'epr_cycles': [],
        }
        scorecard = {
            'team_size': 1,
            'leave': {'pct_within_2_days': None, 'pending_at_month_end': 0},
            'overtime': {'avg_turnaround_days': None},
            'meetings': {
                'one_on_one_compliance_pct': None, 'tl_sync_count': 0,
                'team_meetings_with_hrbp': 0,
            },
            'review_deliveries_ytd': 0,
            'idle': {'open_count': 0},
            'absences': {'breached_5_day_sla': 0},
            'pip': {'pending_approval_count': 0},
            'promotion': {'promoted_pct': None},
            'escalation_count': 0,
        }
        data = build_workbook_bytes(scorecard, governance, 'September 2026')
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            sheet_xml = ''.join(
                zf.read(name).decode('utf-8')
                for name in zf.namelist() if name.startswith('xl/worksheets/')
            )
            self.assertNotIn('<f>', sheet_xml)
            self.assertNotIn('hyperlink', sheet_xml.lower().replace('hide_gridlines', ''))
            self.assertFalse([n for n in zf.namelist() if 'externalLinks' in n])
