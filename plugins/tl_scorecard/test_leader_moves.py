"""What happens to scorecard records when a member is moved to another Line Manager.

Rows are never touched by a move (no delete, no re-owner). Visibility then follows
the row's own scope rule, and the two kinds differ on purpose:

* leader-authored records (idle flags, absences, PIPs, nominations, meetings,
  review deliveries) are scoped by AUTHOR: the Line Manager who wrote them keeps
  them, the new Line Manager does not inherit them;
* EPR cycles are scoped by the CURRENT team, because an EPR is the employee's own
  yearly record: it follows the employee to the new Line Manager.
"""
from datetime import date

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role

from .models import Absence, EPRCycle, IdleFlag
from .testing import make_user
from .viewsets import AbsenceViewSet, EPRCycleViewSet, IdleFlagViewSet

factory = APIRequestFactory()


def _ids(response):
    data = response.data
    rows = data['results'] if isinstance(data, dict) and 'results' in data else data
    return {r['id'] for r in rows}


class ScorecardLeaderMoveTests(TestCase):
    def setUp(self):
        for code in ('italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        call_command('seed_plugin_permissions')
        self.mgr = make_user('mv_mgr')
        assign_role(self.mgr, 'italian_tl')
        self.lm1 = make_user('mv_lm1')
        self.lm2 = make_user('mv_lm2')
        for lm in (self.lm1, self.lm2):
            assign_role(lm, 'albanian_tl')
            lm.profile.italian_tl = self.mgr
            lm.profile.save()
        self.member = make_user('mv_member')
        self.member.profile.albanian_tl = self.lm1
        self.member.profile.italian_tl = self.mgr
        self.member.profile.save()

        today = date.today().isoformat()
        self.flag = self._create(IdleFlagViewSet, self.lm1, {'employee': self.member.id, 'flagged_on': today})
        self.absence = self._create(AbsenceViewSet, self.lm1, {'employee': self.member.id, 'absence_date': today})
        self.cycle = self._create(EPRCycleViewSet, self.lm1, {'user': self.member.id, 'year': date.today().year})

    def _create(self, viewset, user, data):
        request = factory.post('/x/', data, format='json')
        force_authenticate(request, user=user)
        response = viewset.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def _list(self, viewset, user):
        request = factory.get('/x/')
        # A fresh user per request, as in production: scope helpers memoise on the profile object.
        force_authenticate(request, user=type(user).objects.get(pk=user.pk))
        return _ids(viewset.as_view({'get': 'list'})(request))

    def _move_to_lm2(self):
        profile = type(self.member.profile).objects.get(user=self.member)
        profile.albanian_tl = self.lm2
        profile.save()

    def test_a_move_never_deletes_or_reassigns_a_record(self):
        before = (IdleFlag.objects.count(), Absence.objects.count(), EPRCycle.objects.count())
        self._move_to_lm2()
        self.assertEqual(before, (IdleFlag.objects.count(), Absence.objects.count(), EPRCycle.objects.count()))
        self.assertEqual(IdleFlag.objects.get(pk=self.flag).flagged_by_id, self.lm1.id)
        self.assertEqual(Absence.objects.get(pk=self.absence).flagged_by_id, self.lm1.id)
        self.assertEqual(EPRCycle.objects.get(pk=self.cycle).user_id, self.member.id)

    def test_leader_authored_records_stay_with_their_author(self):
        self._move_to_lm2()
        self.assertIn(self.flag, self._list(IdleFlagViewSet, self.lm1))
        self.assertIn(self.absence, self._list(AbsenceViewSet, self.lm1))
        self.assertNotIn(self.flag, self._list(IdleFlagViewSet, self.lm2))
        self.assertNotIn(self.absence, self._list(AbsenceViewSet, self.lm2))

    def test_the_employees_epr_follows_the_employee_to_the_new_leader(self):
        self.assertIn(self.cycle, self._list(EPRCycleViewSet, self.lm1))
        self._move_to_lm2()
        self.assertNotIn(self.cycle, self._list(EPRCycleViewSet, self.lm1))
        self.assertIn(self.cycle, self._list(EPRCycleViewSet, self.lm2))
        self.assertIn(self.cycle, self._list(EPRCycleViewSet, self.mgr))  # the Manager link is unchanged

    def test_the_old_leader_can_still_close_their_own_open_flag_after_the_move(self):
        self._move_to_lm2()
        request = factory.post(f'/idle-flags/{self.flag}/resolve/')
        force_authenticate(request, user=type(self.lm1).objects.get(pk=self.lm1.pk))
        response = IdleFlagViewSet.as_view({'post': 'resolve'})(request, pk=self.flag)
        self.assertEqual(response.status_code, 200)
