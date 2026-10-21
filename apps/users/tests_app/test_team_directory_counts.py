"""Team confidentiality (2026-10-20): the team directory names every team and
leader, but member and sub-team counts are management data."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.users.models import Team

URL = '/api/users/teams/'


class TeamDirectoryCountTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.employee = User.objects.create_user(username='tdc_emp', password='x')
        cls.staff = User.objects.create_user(username='tdc_staff', password='x', is_staff=True)
        cls.hr = User.objects.create_user(username='tdc_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()
        cls.tl = User.objects.create_user(username='tdc_tl', password='x')
        cls.team_a = Team.objects.create(name='TDC A', code='TDA', team_leader=cls.tl)
        cls.team_b = Team.objects.create(name='TDC B', code='TDB')
        Team.objects.create(name='TDC A sub', code='TDS', parent_team=cls.team_a)
        for team in (cls.team_a, cls.team_b):
            for i in range(2):
                member = User.objects.create_user(username=f'tdc_m_{team.code}_{i}', password='x')
                member.profile.teams.add(team)
        cls.employee.profile.teams.add(cls.team_a)

    def _rows(self, user):
        self.client.force_authenticate(user)
        resp = self.client.get(URL, {'page_size': 100})
        self.assertEqual(resp.status_code, 200)
        data = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        return {row['id']: row for row in data}

    def test_employee_sees_names_but_no_counts_on_any_team(self):
        rows = self._rows(self.employee)
        for team in (self.team_a, self.team_b):
            with self.subTest(team=team.code):
                self.assertEqual(rows[team.id]['name'], team.name)
                self.assertIsNone(rows[team.id]['members_count'])
                self.assertIsNone(rows[team.id]['sub_teams_count'])

    def test_tl_sees_counts_for_own_team_only(self):
        rows = self._rows(self.tl)
        self.assertEqual(rows[self.team_a.id]['members_count'], 3)
        self.assertEqual(rows[self.team_a.id]['sub_teams_count'], 1)
        self.assertIsNone(rows[self.team_b.id]['members_count'])
        self.assertEqual(rows[self.team_b.id]['name'], 'TDC B')

    def test_staff_and_hr_see_every_count(self):
        for user in (self.staff, self.hr):
            with self.subTest(user=user.username):
                rows = self._rows(user)
                self.assertEqual(rows[self.team_a.id]['members_count'], 3)
                self.assertEqual(rows[self.team_b.id]['members_count'], 2)

    def test_hr_report_team_list_keeps_counts(self):
        self.client.force_authenticate(self.hr)
        resp = self.client.get(URL + 'list_for_reports/')
        self.assertEqual(resp.status_code, 200)
        counts = {r['code']: r['members_count'] for r in resp.data if r['code'] in ('TDA', 'TDB')}
        self.assertEqual(counts, {'TDA': 3, 'TDB': 2})

    def test_employee_report_team_list_has_no_counts(self):
        self.client.force_authenticate(self.employee)
        resp = self.client.get(URL + 'list_for_reports/')
        self.assertTrue(all(r['members_count'] is None for r in resp.data))
