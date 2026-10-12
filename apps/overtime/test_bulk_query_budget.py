from datetime import date

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team, TeamMembership

"""Per-row query ceilings for bulk actions.

Bulk approve: lookup of the actor's team is cached per request, leaving the
row fetch, the payroll reference check, and the UPDATE.

Bulk delete ceilings reflect the remaining per-row work, measured on
2026-10-12: payroll reference checks (2, pinned by the finalized-payroll
guard tests), row lock fetch, ticket-link cascade, row delete, actor/user
fetch, audit insert, nested savepoint (2), and for approved rows the
approval-period membership lookup (1).
"""

MAX_APPROVE_QUERIES_PER_ROW = 8
MAX_DELETE_APPROVED_QUERIES_PER_ROW = 10
MAX_DELETE_PENDING_QUERIES_PER_ROW = 9


class BulkActionQueryBudgetTests(TestCase):
    def setUp(self):
        self.tl = User.objects.create_user(username='bq-tl', password='pass')
        self.tl.profile.is_albanian_tl_role = True
        self.tl.profile.save(update_fields=['is_albanian_tl_role', 'updated_at'])
        self.emp = User.objects.create_user(username='bq-emp', password='pass')
        team = Team.objects.create(name='BQ Team', code='BQ', team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.emp.profile, team=team, is_primary_team=True)
        self.client_obj = Client.objects.create(name='BQ Client', code='BQ-CLIENT')
        self.api = APIClient()
        self.api.force_authenticate(user=self.tl)

    def _query_count(self, url, status, n):
        ids = [
            OvertimeLog.objects.create(
                user=self.emp, client=self.client_obj, date=date.today().replace(day=1), hours=1, status=status,
            ).id
            for _ in range(n)
        ]
        with CaptureQueriesContext(connection) as ctx:
            response = self.api.post(url, {'ids': ids}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return len(ctx.captured_queries)

    def _per_row(self, url, status):
        small = self._query_count(url, status, 2)
        large = self._query_count(url, status, 10)
        return (large - small) / 8

    def test_bulk_approve_queries_per_row_within_budget(self):
        per_row = self._per_row('/api/overtime/logs/bulk_approve/', 'pending')
        self.assertLessEqual(per_row, MAX_APPROVE_QUERIES_PER_ROW)

    def test_bulk_delete_approved_queries_per_row_within_budget(self):
        per_row = self._per_row('/api/overtime/logs/bulk_delete/', 'approved')
        self.assertLessEqual(per_row, MAX_DELETE_APPROVED_QUERIES_PER_ROW)

    def test_bulk_delete_pending_queries_per_row_within_budget(self):
        per_row = self._per_row('/api/overtime/logs/bulk_delete/', 'pending')
        self.assertLessEqual(per_row, MAX_DELETE_PENDING_QUERIES_PER_ROW)
