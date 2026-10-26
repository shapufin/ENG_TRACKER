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
        # 2026-10-26: 162/user — ClosedYear, YearSnapshot and YearSnapshotFile each
        # carry a User FK (the latter two through BaseModel.deleted_by), so the
        # collector visits three more relations per deleted user. Not a regression.
        self.assertLessEqual((large - small) / 6, 170)


class ProtectedUserDeleteTests(TestCase):
    """A user referenced by payroll lines cannot be deleted; the failure must be
    clean (no 500) and must not leave the TL references half-cleared."""

    def setUp(self):
        from datetime import date

        from plugins.payroll.models import PayrollLine, PayrollRuleSet, PayrollRun

        self.admin = User.objects.create_user(username='pd-admin', password='x', is_staff=True)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.leader = User.objects.create_user(username='pd-leader', password='x')
        rule_set = PayrollRuleSet.objects.create(
            name='Std', country='AL', tax_profile='standard',
            effective_from=date(2020, 1, 1), is_active=True)
        run = PayrollRun.objects.create(year=2026, month=1, status='draft', rule_set=rule_set)
        PayrollLine.objects.create(user=self.leader, run=run)

    def test_bulk_delete_failure_keeps_tl_references(self):
        from apps.users.models import Team

        member = User.objects.create_user(username='pd-member', password='x')
        member.profile.italian_tl = self.leader
        member.profile.save()
        team = Team.objects.create(name='PD Team', code='PDT', team_leader=self.leader)

        resp = self.api.post(URL, {'ids': [self.leader.id]}, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['deleted_count'], 0)
        self.assertEqual(len(resp.data['failed_users']), 1)
        reason = resp.data['failed_users'][0]['reason']
        self.assertNotIn('ProtectedError', reason)
        self.assertNotIn('PayrollLine', reason)
        self.assertIn('Deactivate the user instead', reason)
        member.profile.refresh_from_db()
        team.refresh_from_db()
        self.assertEqual(member.profile.italian_tl_id, self.leader.id)
        self.assertEqual(team.team_leader_id, self.leader.id)

    def test_single_delete_is_a_409_not_a_500(self):
        resp = self.api.delete(f'/api/users/users/{self.leader.id}/')
        self.assertEqual(resp.status_code, 409, getattr(resp, 'data', None))
        self.assertTrue(User.objects.filter(pk=self.leader.id).exists())
