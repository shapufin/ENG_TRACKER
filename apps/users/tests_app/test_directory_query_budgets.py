"""P-pass: the admin users list (search + paging) and the TL directories
must not issue more queries as the number of rows grows."""
from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.users.models import Team, TeamMembership


class DirectoryQueryBudgetTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='qb-admin', password='x', is_staff=True, is_superuser=True,
        )
        self.team = Team.objects.create(name='QB Team', code='QBT')
        self.n = 0
        self.client.force_authenticate(self.admin)

    def _add_member(self):
        self.n += 1
        user = User.objects.create_user(username=f'qb-user{self.n}', password='x', first_name='Qb')
        TeamMembership.objects.create(
            user_profile=user.profile, team=self.team, is_primary_team=True,
        )

    def _add_tl(self):
        self.n += 1
        tl = User.objects.create_user(username=f'qb-tl{self.n}', password='x')
        tl.profile.is_italian_tl_role = True
        tl.profile.is_albanian_tl_role = True
        tl.profile.save()
        team = Team.objects.create(name=f'QB TL team {self.n}', code=f'QT{self.n}')
        TeamMembership.objects.create(user_profile=tl.profile, team=team, is_primary_team=True)

    def _flat(self, url, add):
        add()
        add()
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200, getattr(resp, 'data', None))
        few = len(ctx.captured_queries)
        for _ in range(10):
            add()
        with CaptureQueriesContext(connection) as ctx:
            self.client.get(url)
        many = len(ctx.captured_queries)
        self.assertEqual(few, many, f'{url}: {few} queries (N=2) vs {many} (N=12)')

    def test_profile_list_with_search_and_paging_is_flat(self):
        self._flat('/api/users/profiles/?search=qb&page_size=50&page=1', self._add_member)

    def test_italian_team_leaders_is_flat(self):
        self._flat('/api/users/users/italian_team_leaders/', self._add_tl)

    def test_albanian_team_leaders_is_flat(self):
        self._flat('/api/users/users/albanian_team_leaders/', self._add_tl)
