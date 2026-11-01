"""PostgreSQL enforces varchar length, SQLite does not: pin the width the security events need."""
from django.test import SimpleTestCase

from apps.reports.models import AuditLog

# Longest action the security-audit writers record (apps/users/views/auth.py, upper-cased by mfa.audit).
LONGEST_SECURITY_ACTION = 'MFA_BACKUP_CODES_REGENERATED'


class CoreAuditActionWidthTests(SimpleTestCase):
    def test_the_action_column_fits_every_security_event(self):
        self.assertGreaterEqual(AuditLog._meta.get_field('action').max_length, len(LONGEST_SECURITY_ACTION))
