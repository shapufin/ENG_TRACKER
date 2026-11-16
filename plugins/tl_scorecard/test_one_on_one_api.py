"""1-on-1 plan endpoints on the scorecard viewset, and the plan on the Team tab rows."""
from datetime import date

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import force_authenticate

from .models import Meeting, OneOnOnePlan, OneOnOneSkip
from .test_team_members import TeamMembersBase
from .viewsets import TLScorecardViewSet

WEEKLY = {'cadence': 'weekly', 'cadence_day_of_week': 2, 'cadence_nth_week': None}


class OneOnOneApiBase(TeamMembersBase):
    def _post(self, user, action, body):
        request = self.factory.post('/x/', body, format='json')
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'post': action})(request)


class PlanWriteTests(OneOnOneApiBase):
    def test_a_leader_sets_a_plan_for_several_members_at_once(self):
        response = self._post(self.tl, 'one_on_one_plans', {'employee_ids': [self.member.id], **WEEKLY})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(OneOnOnePlan.objects.filter(leader=self.tl).count(), 1)

    def test_one_bad_employee_rejects_the_whole_batch(self):
        response = self._post(
            self.tl, 'one_on_one_plans', {'employee_ids': [self.member.id, self.stranger.id], **WEEKLY},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(OneOnOnePlan.objects.count(), 0)

    def test_an_hbpr_cannot_write_a_plan(self):
        response = self._post(self.hbpr, 'one_on_one_plans', {'employee_ids': [self.member.id], **WEEKLY})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(OneOnOnePlan.objects.count(), 0)

    def test_staff_cannot_write_a_plan_for_a_leader(self):
        response = self._post(self.staff, 'one_on_one_plans', {'employee_ids': [self.member.id], **WEEKLY})
        self.assertEqual(response.status_code, 403)

    def test_clear_removes_plans(self):
        self._post(self.tl, 'one_on_one_plans', {'employee_ids': [self.member.id], **WEEKLY})
        response = self._post(self.tl, 'one_on_one_plans_clear', {'employee_ids': [self.member.id]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(OneOnOnePlan.objects.count(), 0)

    def test_an_invalid_schedule_is_a_400_not_a_500(self):
        response = self._post(
            self.tl, 'one_on_one_plans',
            {'employee_ids': [self.member.id], 'cadence': 'weekly', 'cadence_nth_week': 2},
        )
        self.assertEqual(response.status_code, 400)


class SkipApiTests(OneOnOneApiBase):
    def test_skip_needs_a_reason_and_a_due_slot(self):
        OneOnOnePlan.objects.create(
            leader=self.tl, employee=self.member, cadence='weekly',
            cadence_day_of_week=None, effective_from=date(2020, 1, 6),
        )
        bad = self._post(self.tl, 'one_on_one_skip', {'employee': self.member.id, 'reason': ''})
        self.assertEqual(bad.status_code, 400)
        ok = self._post(self.tl, 'one_on_one_skip', {'employee': self.member.id, 'reason': 'On a client site'})
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(OneOnOneSkip.objects.count(), 1)
        self.assertEqual(Meeting.objects.count(), 0)

    def test_an_hbpr_cannot_skip(self):
        response = self._post(self.hbpr, 'one_on_one_skip', {'employee': self.member.id, 'reason': 'x'})
        self.assertEqual(response.status_code, 403)


class TeamRowTests(OneOnOneApiBase):
    def test_the_row_carries_the_plan_for_the_leader_only(self):
        OneOnOnePlan.objects.create(
            leader=self.tl, employee=self.member, cadence='weekly',
            cadence_day_of_week=None, effective_from=date(2020, 1, 6),
        )
        row = self._member_row(self._get(self.tl))
        plan = row['meetings']['plan']
        self.assertEqual(plan['cadence'], 'weekly')
        self.assertEqual(plan['status'], 'overdue')
        self.assertIn('next_due_on', plan)
        self.assertIsNone(self._member_row(self._get(self.tl))['meetings']['plan']['moved_reason'])

    def test_a_member_without_a_plan_has_none(self):
        self.assertIsNone(self._member_row(self._get(self.tl))['meetings']['plan'])

    def test_plan_queries_are_constant_not_per_member(self):
        from .testing import make_user
        extras = []
        for i in range(5):
            extra = make_user(f'team_extra_{i}')
            extra.profile.italian_tl = self.tl
            extra.profile.save()
            extras.append(extra)
        self._get(self.tl)  # warm caches
        with CaptureQueriesContext(connection) as without:
            self._get(self.tl)
        for extra in [self.member, *extras]:
            OneOnOnePlan.objects.create(
                leader=self.tl, employee=extra, cadence='biweekly',
                cadence_day_of_week=None, effective_from=date(2020, 1, 6),
            )
        with CaptureQueriesContext(connection) as with_plans:
            self._get(self.tl)
        # Plans cost a fixed handful of queries however many members have one.
        self.assertLessEqual(len(with_plans) - len(without), 6)
