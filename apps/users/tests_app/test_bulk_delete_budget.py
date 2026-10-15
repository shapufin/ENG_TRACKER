"""PERF-14: bulk_delete must not run per-user COUNT queries just to write log lines."""
from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

URL = '/api/users/users/bulk_delete/'


class BulkDeleteQueryTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='bd-admin', password='x', is_staff=True)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def _delete(self, n, tag):
        ids = [User.objects.create_user(username=f'bd-{tag}-{i}', password='x').id for i in range(n)]
        with CaptureQueriesContext(connection) as ctx:
            resp = self.api.post(URL, {'ids': ids}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['deleted_count'], n)
        return ctx.captured_queries

    def test_no_logging_only_count_queries(self):
        queries = self._delete(3, 'c')
        counts = [q['sql'] for q in queries if q['sql'].lstrip().upper().startswith('SELECT COUNT')
                  and ('italian_tl' in q['sql'] or 'albanian_tl' in q['sql'] or 'team_leader' in q['sql'])]
        self.assertEqual(counts, [])

    def test_users_are_still_deleted_and_references_cleared(self):
        from apps.users.models import Team

        leader = User.objects.create_user(username='bd-leader', password='x')
        member = User.objects.create_user(username='bd-member', password='x')
        member.profile.italian_tl = leader
        member.profile.save()
        team = Team.objects.create(name='BD Team', code='BDT', team_leader=leader)
        resp = self.api.post(URL, {'ids': [leader.id]}, format='json')
        self.assertEqual(resp.data['deleted_count'], 1)
        member.profile.refresh_from_db()
        team.refresh_from_db()
        self.assertIsNone(member.profile.italian_tl)
        self.assertIsNone(team.team_leader)

    def test_per_user_cost_is_bounded(self):
        small = len(self._delete(2, 's'))
        large = len(self._delete(8, 'l'))
        # Measured 2026-10-14: 153/user (157 before the logging counts were removed).
        # Almost all of it is Django's delete cascade over every FK to User.
        self.assertLessEqual((large - small) / 6, 160)
