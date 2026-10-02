"""The AL TL's own view of their HBPR partnership.

The AL TL authors the governance evidence, so they need their assignment, the
HBPR they are paired with, and the cadence/EPR state — none of which the
staff-only `/api/users/hbpr-assignments/` endpoint exposes to them. This is the
read side of the Phase 8 "HBPR Partnership" scorecard section.
"""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission
from apps.users.models.core import UserProfile
from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .models import HbprGovernanceEvidence
from .viewsets import TLScorecardViewSet


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class PartnershipBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        for code in ('hbpr', 'albanian_tl', 'italian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        for role in ('albanian_tl', 'hbpr'):
            PluginPermission.objects.get(plugin_name='tl_scorecard', action='view') \
                .allowed_roles.add(Role.objects.get(code=role))

        self.hbpr = _make_user('hbpr_pn', first_name='Elda', last_name='Partner')
        assign_role(self.hbpr, 'hbpr')
        self.tl = _make_user('tl_pn', first_name='Enri', last_name='Leader')
        assign_role(self.tl, 'albanian_tl')
        self.member = _make_user('member_pn')
        self.member.profile.albanian_tl = self.tl
        self.member.profile.save()
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )
        self.other_tl = _make_user('other_tl_pn')
        assign_role(self.other_tl, 'albanian_tl')
        self.staff = _make_user('staff_pn', is_staff=True)
        self.employee = _make_user('plain_pn')
        self.today = date.today()

    def _get(self, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': 'partnership'})(request)

    def _evidence(self, kind='cadence_meeting', **overrides):
        data = {
            'assignment': self.assignment,
            'kind': kind,
            'occurred_on': self.today,
            'recorded_by': self.tl,
        }
        data.update(overrides)
        return HbprGovernanceEvidence.objects.create(**data)


class PartnershipReadTests(PartnershipBase):
    def test_al_tl_sees_their_assignment_and_hbpr(self):
        data = self._get(self.tl).data
        self.assertEqual(data['assignment']['hbpr']['name'], 'Elda Partner')
        self.assertEqual(data['assignment']['cadence'], 'weekly')
        self.assertEqual(data['assignment']['cadence_status'], 'not_started')
        self.assertIsNone(data['assignment']['last_meeting_on'])
        self.assertFalse(data['assignment']['epr_mid_year'])

    def test_cadence_evidence_moves_the_due_state(self):
        self._evidence()
        assignment = self._get(self.tl).data['assignment']
        self.assertEqual(assignment['last_meeting_on'], self.today)
        self.assertEqual(assignment['cadence_status'], 'on_track')
        self.assertEqual(assignment['next_due_on'], self.today + timedelta(days=7))
        self.assertEqual(assignment['evidence_count'], 1)

    def test_overdue_cadence_is_reported(self):
        self._evidence(occurred_on=self.today - timedelta(days=30))
        self.assertEqual(self._get(self.tl).data['assignment']['cadence_status'], 'overdue')

    def test_epr_evidence_flags_are_scoped_to_the_reporting_year(self):
        self._evidence(kind='epr_mid_year', reporting_year=self.today.year)
        data = self._get(self.tl).data
        self.assertTrue(data['assignment']['epr_mid_year'])
        self.assertFalse(data['assignment']['epr_year_end'])
        self.assertFalse(self._get(self.tl, year=self.today.year - 1).data['assignment']['epr_mid_year'])

    def test_unassigned_al_tl_gets_an_empty_assignment_not_an_error(self):
        data = self._get(self.other_tl).data
        self.assertIsNone(data['assignment'])
        self.assertEqual(data['reporting_year'], self.today.year)

    def test_bad_year_is_400(self):
        self.assertEqual(self._get(self.tl, year='abc').status_code, 400)

    def test_staff_can_read_another_leaders_partnership(self):
        data = self._get(self.staff, leader_id=self.tl.id).data
        self.assertEqual(data['assignment']['id'], self.assignment.id)

    def test_plain_employee_is_denied(self):
        self.assertEqual(self._get(self.employee).status_code, 403)

    def test_hbpr_reads_an_in_scope_leader_but_not_an_out_of_scope_one(self):
        self.assertEqual(self._get(self.hbpr, leader_id=self.tl.id).status_code, 200)
        self.assertEqual(self._get(self.hbpr, leader_id=self.other_tl.id).status_code, 403)

    def test_never_exposes_employee_one_on_one_data(self):
        data = self._get(self.tl).data
        self.assertNotIn('one_on_one', str(data))
        self.assertNotIn('people', data)
