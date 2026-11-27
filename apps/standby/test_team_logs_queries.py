"""standby team_logs must not run queries per row (Team Overview speed, 2026-11-27)."""
from datetime import date, time, timedelta
from uuid import uuid4

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.overtime.models import Client
from apps.permissions.services.role_service import assign_role
from apps.standby.models import StandbyLog
from apps.users.models import Team, TeamMembership

URL = '/api/standby/logs/team_logs/'
URL_TEAM_PENDING = '/api/standby/logs/team_pending/'
URL_ADMIN_LOGS = '/api/standby/logs/admin_logs/'


class StandbyTeamLogsQueryCountTests(TestCase):
    def setUp(self):
        cache.clear()
        self.tl = User.objects.create_user(username=f'sbq-tl-{uuid4().hex[:6]}', password='pass')
        assign_role(self.tl, 'albanian_tl')
        self.team = Team.objects.create(name='SBQ Team', code=f'SBQ{uuid4().hex[:6]}', team_leader=self.tl)
        self.member = User.objects.create_user(username=f'sbq-m-{uuid4().hex[:6]}', password='pass')
        self.member.profile.albanian_tl = self.tl  # link-only scope (workflow-invariants item 64)
        self.member.profile.save()
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team, is_primary_team=True)
        self.clients = [
            Client.objects.create(name=f'SBQ Client {i}', code=f'SBQ-{uuid4().hex[:8]}') for i in range(2)
        ]
        self.api = APIClient()
        self.api.force_authenticate(user=self.tl)

    def _add_log(self, day, client_count):
        log = StandbyLog.objects.create(
            user=self.member, date=day, start_time=time(18, 0), end_time=time(23, 0), hours=5,
        )
        if client_count:
            log.clients.set(self.clients[:client_count])
        return log

    def _query_count(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.api.get(URL)
        self.assertEqual(response.status_code, 200, response.data)
        return len(ctx.captured_queries), response

    def test_query_count_does_not_grow_with_rows(self):
        start = date(2026, 3, 2)
        for i in range(2):
            self._add_log(start + timedelta(days=i), client_count=1 + i % 2)
        few, _ = self._query_count()

        for i in range(2, 8):
            self._add_log(start + timedelta(days=i), client_count=1 + i % 2)
        many, response = self._query_count()

        self.assertEqual(few, many, f'{few} queries (2 rows) vs {many} (8 rows)')
        rows = response.data.get('results', response.data)
        self.assertEqual(len(rows), 8)
        by_count = {len(r['client_ids']): r for r in rows}
        self.assertEqual(
            sorted(by_count[2]['client_names']),
            sorted(c.name for c in self.clients),
        )
        self.assertEqual(by_count[1]['client_names'], [self.clients[0].name])



class StandbyClientPrefetchQueryCountTests(TestCase):
    """team_pending and admin_logs render client_ids/client_names through the same serializer."""

    def setUp(self):
        cache.clear()
        self.tl = User.objects.create_user(username=f'sbp-tl-{uuid4().hex[:6]}', password='pass')
        assign_role(self.tl, 'albanian_tl')
        self.team = Team.objects.create(name='SBP Team', code=f'SBP{uuid4().hex[:6]}', team_leader=self.tl)
        self.member = User.objects.create_user(username=f'sbp-m-{uuid4().hex[:6]}', password='pass')
        self.member.profile.albanian_tl = self.tl  # link-only scope (workflow-invariants item 64)
        self.member.profile.save()
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team, is_primary_team=True)
        self.clients = [
            Client.objects.create(name=f'SBP Client {i}', code=f'SBP-{uuid4().hex[:8]}') for i in range(2)
        ]
        self.api = APIClient()

    def _add_log(self, day, client_count):
        log = StandbyLog.objects.create(
            user=self.member, date=day, start_time=time(18, 0), end_time=time(23, 0), hours=5,
        )
        log.clients.set(self.clients[:client_count])

    def _assert_flat(self, url):
        start = date(2026, 3, 2)
        for i in range(2):
            self._add_log(start + timedelta(days=i), client_count=1 + i % 2)
        with CaptureQueriesContext(connection) as ctx:
            response = self.api.get(url)
        few = len(ctx.captured_queries)
        self.assertEqual(response.status_code, 200, response.data)

        for i in range(2, 8):
            self._add_log(start + timedelta(days=i), client_count=1 + i % 2)
        with CaptureQueriesContext(connection) as ctx:
            response = self.api.get(url)
        many = len(ctx.captured_queries)
        self.assertEqual(response.status_code, 200, response.data)

        self.assertEqual(few, many, f'{url}: {few} queries (2 rows) vs {many} (8 rows)')
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 8)
        by_count = {len(r['client_ids']): r for r in rows}
        self.assertEqual(by_count[1]['client_names'], [self.clients[0].name])
        self.assertEqual(sorted(by_count[2]['client_names']), sorted(c.name for c in self.clients))

    def test_team_pending_query_count_does_not_grow_with_rows(self):
        self.api.force_authenticate(user=self.tl)
        self._assert_flat(URL_TEAM_PENDING)

    def test_admin_logs_query_count_does_not_grow_with_rows(self):
        admin = User.objects.create_superuser(username=f'sbp-admin-{uuid4().hex[:6]}', password='pass', email='a@a.a')
        self.api.force_authenticate(user=admin)
        self._assert_flat(URL_ADMIN_LOGS)
