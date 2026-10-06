"""An Albanian TL is governed by their HBPR, never scored by an Italian TL.

The records/scorecard population is `get_team_member_ids()` minus Albanian TLs
(`scope.scoreable_member_ids`); an AL TL who sits in an Italian TL's team (direct
FK or shared team) must not be a subject of PIPs, EPR cycles, flags or metrics.
"""
from datetime import date

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role

from .models import EPRCycle
from .scope import scoreable_member_ids
from .services import build_scorecard
from .testing import make_user
from .viewsets import (
    AbsenceViewSet, EPRCycleViewSet, IdleFlagViewSet, MeetingViewSet, PIPRecordViewSet,
    PromotionFlagViewSet,
)


class AlTlNotScoreableTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        for code in ('italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        call_command('seed_plugin_permissions')
        self.it_tl = make_user('it_tl_x')
        assign_role(self.it_tl, 'italian_tl')
        self.al_tl = make_user('al_tl_x')
        assign_role(self.al_tl, 'albanian_tl')
        self.al_tl.profile.italian_tl = self.it_tl
        self.al_tl.profile.save()
        self.member = make_user('member_x')
        self.member.profile.italian_tl = self.it_tl
        self.member.profile.save()

    def _post(self, viewset, user, data):
        request = self.factory.post('/x/', data, format='json')
        force_authenticate(request, user=user)
        return viewset.as_view({'post': 'create'})(request)

    def test_population_excludes_albanian_tl(self):
        ids = scoreable_member_ids(self.it_tl)
        self.assertIn(self.member.id, ids)
        self.assertNotIn(self.al_tl.id, ids)

    def test_it_tl_cannot_open_records_on_an_al_tl(self):
        today = date.today().isoformat()
        cases = (
            (PIPRecordViewSet, {'employee': self.al_tl.id, 'start_date': today}),
            (PromotionFlagViewSet, {'employee': self.al_tl.id, 'nominated_on': today}),
            (IdleFlagViewSet, {'employee': self.al_tl.id, 'flagged_on': today}),
            (AbsenceViewSet, {'employee': self.al_tl.id, 'absence_date': today}),
            (EPRCycleViewSet, {'user': self.al_tl.id, 'year': date.today().year}),
        )
        for viewset, data in cases:
            with self.subTest(viewset=viewset.__name__):
                self.assertEqual(self._post(viewset, self.it_tl, data).status_code, 400)

    def test_it_tl_can_still_score_a_regular_member(self):
        resp = self._post(
            EPRCycleViewSet, self.it_tl, {'user': self.member.id, 'year': date.today().year})
        self.assertEqual(resp.status_code, 201)

    def test_existing_epr_cycle_of_an_al_tl_is_hidden_from_the_it_tl(self):
        EPRCycle.objects.create(user=self.al_tl, year=2025)
        request = self.factory.get('/x/')
        force_authenticate(request, user=self.it_tl)
        resp = EPRCycleViewSet.as_view({'get': 'list'})(request)
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(rows), 0)

    def test_scorecard_team_size_does_not_count_the_al_tl(self):
        self.assertEqual(build_scorecard(self.it_tl, date.today())['team_size'], 1)

    def test_it_tl_cannot_hold_a_one_on_one_with_an_unrelated_user(self):
        stranger = make_user('stranger_x')
        data = {'meeting_type': 'one_on_one', 'counterparty': stranger.id,
                'occurred_on': date.today().isoformat()}
        self.assertEqual(self._post(MeetingViewSet, self.it_tl, data).status_code, 400)
        data['counterparty'] = self.member.id
        self.assertEqual(self._post(MeetingViewSet, self.it_tl, data).status_code, 201)
