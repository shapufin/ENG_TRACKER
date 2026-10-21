"""SEC-09 proof tests: approve/reject authority of a plain team leader.

Covers single and bulk endpoints of overtime, standby and leave: a TL may act
on managed users' rows only, never on another team's rows. A TL may decide
their own overtime and standby (product ruling 2026-10-21) but never their own
leave; non-TL users never decide their own request.
"""
from datetime import date, timedelta

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
        # LeaveRequest needs a business day, so never pin these rows to a weekend.
        self.today = date.today()
        while self.today.weekday() >= 5:
            self.today -= timedelta(days=1)

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

    def test_team_leader_can_approve_or_reject_own_overtime_and_standby(self):
        for label, url, make in self._cases()[:2]:
            for verb, status in (('approve', 'approved'), ('reject', 'rejected')):
                obj = make(self.tl)
                body = {'rejection_reason': 'x'} if verb == 'reject' else {}
                with self.subTest(kind=label, verb=verb):
                    resp = self.client.post(f'{url}{obj.id}/{verb}/', body, format='json')
                    self.assertEqual(resp.status_code, 200, resp.data)
                    obj.refresh_from_db()
                    self.assertEqual(obj.status, status)

    def test_team_leader_can_bulk_approve_own_overtime_and_standby(self):
        for label, url, make in self._cases()[:2]:
            obj = make(self.tl)
            with self.subTest(kind=label):
                resp = self.client.post(f'{url}bulk_approve/', {'ids': [obj.id]}, format='json')
                self.assertEqual(resp.data['approved_count'], 1, resp.data)

    def test_team_leader_cannot_decide_their_own_leave(self):
        _, url, make = self._cases()[2]
        for verb in ('approve', 'reject'):
            obj = make(self.tl)
            with self.subTest(verb=verb):
                resp = self.client.post(f'{url}{obj.id}/{verb}/', {}, format='json')
                self.assertIn(resp.status_code, (403, 404))
                self._assert_pending(obj)
        obj = make(self.tl)
        resp = self.client.post(f'{url}bulk_approve/', {'ids': [obj.id]}, format='json')
        self.assertLess(resp.status_code, 500)
        self._assert_pending(obj)

    def test_non_team_leader_cannot_decide_own_overtime_or_standby(self):
        plain = User.objects.create_user(username='ap_plain', password='x')
        self.client.force_authenticate(plain)
        for label, url, make in self._cases()[:2]:
            obj = make(plain)
            with self.subTest(kind=label):
                resp = self.client.post(f'{url}{obj.id}/approve/', {}, format='json')
                self.assertIn(resp.status_code, (403, 404))
                self._assert_pending(obj)
