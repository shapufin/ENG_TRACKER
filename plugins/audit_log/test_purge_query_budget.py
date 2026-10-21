"""P-pass: the audit-log purge deletes in bulk (queries do not grow with rows)."""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from plugins.audit_log.models import AuditLog


class PurgeAuditLogsQueryBudgetTests(TestCase):
    def _old_logs(self, count):
        AuditLog.objects.bulk_create([AuditLog(action='view') for _ in range(count)])
        AuditLog.objects.update(timestamp=timezone.now() - timedelta(days=500))

    def _purge_queries(self):
        with CaptureQueriesContext(connection) as ctx:
            call_command('purge_audit_logs', '--days', '30', stdout=StringIO())
        return len(ctx.captured_queries)

    def test_purge_query_count_does_not_grow_with_rows(self):
        self._old_logs(2)
        few = self._purge_queries()
        self.assertEqual(AuditLog.objects.count(), 0)
        self._old_logs(50)
        many = self._purge_queries()
        self.assertEqual(AuditLog.objects.count(), 0)
        self.assertEqual(few, many, f'{few} queries (2 rows) vs {many} (50 rows)')
