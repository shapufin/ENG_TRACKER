"""SEC-06: child lists of a visible parent must be scoped like UserViewSet."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.users.models import Team, Tech


class ChildListScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.team_a = Team.objects.create(name='Scope A', code='SCA')
        cls.team_b = Team.objects.create(name='Scope B', code='SCB')
        cls.tl = User.objects.create_user(username='sc_tl', password='x')
        cls.team_a.team_leader = cls.tl
        cls.team_a.save()
        cls.mate = User.objects.create_user(username='sc_mate', password='x', email='mate@example.com')
        cls.other = User.objects.create_user(username='sc_other', password='x', email='other@example.com')
        for u in (cls.tl, cls.mate):
            u.profile.teams.add(cls.team_a)
        cls.other.profile.teams.add(cls.team_b)
        cls.admin = User.objects.create_user(username='sc_admin', password='x', is_staff=True)
        cls.hr = User.objects.create_user(username='sc_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()
        cls.tech = Tech.objects.create(name='Scope Tech', code='SCT')
        for u in (cls.mate, cls.other):
            u.profile.techs.add(cls.tech)

    def _members(self, viewer, team):
        self.client.force_authenticate(viewer)
        resp = self.client.get(f'/api/users/teams/{team.id}/members/')
        self.assertEqual(resp.status_code, 200)
        return {row['user'] if isinstance(row['user'], int) else row['user']['id']
                for row in resp.data}

    def test_employee_sees_no_rows_of_a_foreign_team(self):
        self.assertEqual(self._members(self.mate, self.team_b), set())

    def test_employee_only_sees_self_on_own_team(self):
        self.assertEqual(self._members(self.mate, self.team_a), {self.mate.id})

    def test_tl_sees_own_team_but_not_foreign_team(self):
        self.assertEqual(self._members(self.tl, self.team_a), {self.tl.id, self.mate.id})
        self.assertEqual(self._members(self.tl, self.team_b), set())

    def test_staff_and_hr_see_every_member(self):
        self.assertEqual(self._members(self.admin, self.team_b), {self.other.id})
        self.assertEqual(self._members(self.hr, self.team_b), {self.other.id})

    def test_tech_users_list_is_denied_to_regular_users_and_tls(self):
        for viewer in (self.mate, self.tl):
            self.client.force_authenticate(viewer)
            resp = self.client.get(f'/api/users/techs/{self.tech.id}/users/')
            self.assertEqual(resp.status_code, 403, viewer.username)

    def test_tech_users_list_allowed_for_staff_and_hr(self):
        for viewer in (self.admin, self.hr):
            self.client.force_authenticate(viewer)
            resp = self.client.get(f'/api/users/techs/{self.tech.id}/users/')
            self.assertEqual(resp.status_code, 200, viewer.username)
            self.assertEqual({r['id'] for r in resp.data['results']}, {self.mate.id, self.other.id})

    def test_list_for_reports_exposes_no_more_than_the_team_list_already_does(self):
        """Proof for the 'list_for_reports' half of SEC-06: not a leak.

        Only id/name/code/count come back, and the unrestricted team list
        (IsAuthenticated by design) already carries the same facts.
        """
        self.client.force_authenticate(self.mate)
        resp = self.client.get('/api/users/teams/list_for_reports/')
        self.assertEqual(resp.status_code, 200)
        for row in resp.data:
            self.assertEqual(set(row), {'id', 'name', 'code', 'members_count'})
