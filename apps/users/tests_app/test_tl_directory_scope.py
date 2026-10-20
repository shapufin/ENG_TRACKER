"""M-2: the Italian/Albanian TL lists are for staff, HR and team leaders only.

Team confidentiality (2026-10-20): a TL's name is not confidential, per-team
member counts are management data.
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.users.models import Team

URLS = ('/api/users/users/italian_team_leaders/', '/api/users/users/albanian_team_leaders/')


class TeamLeaderDirectoryScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.employee = User.objects.create_user(username='dir_emp', password='x')
        cls.staff = User.objects.create_user(username='dir_staff', password='x', is_staff=True)
        cls.hr = User.objects.create_user(username='dir_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()
        cls.tl = User.objects.create_user(username='dir_tl', password='x')
        cls.tl.profile.is_italian_tl_role = True
        cls.tl.profile.is_albanian_tl_role = True
        cls.tl.profile.save()
        cls.employee.profile.italian_tl = cls.tl
        cls.employee.profile.albanian_tl = cls.tl
        cls.employee.profile.save()
        cls.team = Team.objects.create(name='Dir Team', code='DIR', team_leader=cls.tl)
        cls.tl.profile.teams.add(cls.team)

    def _get(self, user, url):
        self.client.force_authenticate(user)
        return self.client.get(url)

    def test_employee_is_refused(self):
        for url in URLS:
            with self.subTest(url=url):
                self.assertEqual(self._get(self.employee, url).status_code, 403)

    def test_staff_and_hr_keep_member_counts(self):
        for user in (self.staff, self.hr):
            for url in URLS:
                with self.subTest(user=user.username, url=url):
                    resp = self._get(user, url)
                    self.assertEqual(resp.status_code, 200)
                    row = next(r for r in resp.data if r['id'] == self.tl.id)
                    self.assertEqual(row['member_count'], 1)
                    self.assertEqual(row['username'], 'dir_tl')

    def test_team_leader_gets_names_without_management_numbers(self):
        for url in URLS:
            with self.subTest(url=url):
                resp = self._get(self.tl, url)
                self.assertEqual(resp.status_code, 200)
                row = next(r for r in resp.data if r['id'] == self.tl.id)
                self.assertEqual(set(row), {'id', 'username', 'full_name'})
