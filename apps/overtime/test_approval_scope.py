"""SEC-09 proof tests: approve/reject authority of a plain team leader.

Covers single and bulk endpoints of overtime, standby and leave: a TL may act
on managed users' rows only, never on another team's rows and never on their
own request.
"""
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team

OT = '/api/overtime/logs/'
SB = '/api/standby/logs/'
LV = '/api/leave-management/requests/'


class TeamLeaderApprovalScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tl = User.objects.create_user(username='ap_tl', password='x')
        cls.mate = User.objects.create_user(username='ap_mate', password='x')
        cls.foreign = User.objects.create_user(username='ap_foreign', password='x')
        cls.team = Team.objects.create(name='AP Team', code='APT', team_leader=cls.tl)
        cls.other_team = Team.objects.create(name='AP Other', code='APO')
        for user in (cls.tl, cls.mate):
            user.profile.teams.add(cls.team)
        cls.foreign.profile.teams.add(cls.other_team)
        cls.client_obj = Client.objects.create(name='AP Client', code='APC')

    def setUp(self):
        self.client.force_authenticate(self.tl)
        self.today = date.today()

    def _ot(self, user):
        return OvertimeLog.objects.create(
            user=user, date=self.today, hours=1, description='x',
            client=self.client_obj, status='pending',
        )

    def _sb(self, user):
        return StandbyLog.objects.create(user=user, date=self.today, hours=1, status='pending')

    def _lv(self, user):
        return LeaveRequest.objects.create(
            user=user, request_type='vacation', start_date=self.today,
            end_date=self.today, status='pending',
        )

    def _cases(self):
        return (('overtime', OT, self._ot), ('standby', SB, self._sb), ('leave', LV, self._lv))

    def _assert_pending(self, obj):
        obj.refresh_from_db()
        self.assertEqual(obj.status, 'pending')

    def test_single_approve_and_reject_of_foreign_team_row_is_refused(self):
        for label, url, make in self._cases():
            obj = make(self.foreign)
            for verb in ('approve', 'reject'):
                with self.subTest(kind=label, verb=verb):
                    resp = self.client.post(f'{url}{obj.id}/{verb}/', {}, format='json')
                    self.assertIn(resp.status_code, (403, 404))
                    self._assert_pending(obj)

    def test_bulk_approve_and_reject_of_foreign_team_rows_change_nothing(self):
        for label, url, make in self._cases():
            for verb in ('bulk_approve', 'bulk_reject'):
                obj = make(self.foreign)
                with self.subTest(kind=label, verb=verb):
                    resp = self.client.post(f'{url}{verb}/', {'ids': [obj.id]}, format='json')
                    self.assertLess(resp.status_code, 500)
                    self._assert_pending(obj)

    def test_team_leader_can_still_approve_a_managed_members_row(self):
        for label, url, make in self._cases():
            obj = make(self.mate)
            with self.subTest(kind=label):
                resp = self.client.post(f'{url}{obj.id}/approve/', {}, format='json')
                self.assertEqual(resp.status_code, 200)
                obj.refresh_from_db()
                self.assertEqual(obj.status, 'approved')

    def test_team_leader_cannot_approve_or_reject_their_own_request(self):
        for label, url, make in self._cases():
            for verb in ('approve', 'reject'):
                obj = make(self.tl)
                with self.subTest(kind=label, verb=verb):
                    resp = self.client.post(f'{url}{obj.id}/{verb}/', {}, format='json')
                    self.assertIn(resp.status_code, (403, 404))
                    self._assert_pending(obj)

    def test_team_leader_cannot_bulk_approve_or_reject_their_own_requests(self):
        for label, url, make in self._cases():
            for verb in ('bulk_approve', 'bulk_reject'):
                obj = make(self.tl)
                with self.subTest(kind=label, verb=verb):
                    resp = self.client.post(f'{url}{verb}/', {'ids': [obj.id]}, format='json')
                    self.assertLess(resp.status_code, 500)
                    self._assert_pending(obj)
