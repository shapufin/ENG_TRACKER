"""A site restore saves rows with raw=True; it must not write audit rows about them.

The audit log is itself restored from the archive. A fresh CREATE/UPDATE row per restored
overtime, standby or leave row, attributed to whoever ran the restore, would forge history.
"""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from apps.reports.models import AuditLog
from apps.standby.models import StandbyLog


class RawSaveWritesNoAuditRowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('raw_audit_user', password='x')
        self.log = StandbyLog.objects.create(
            user=self.user, date=date(2026, 11, 2), hours=8, status='approved',
        )

    def test_a_normal_save_is_audited(self):
        AuditLog.objects.all().delete()
        self.log.hours = 9
        self.log.save()
        self.assertEqual(AuditLog.objects.filter(model_name='standbylog').count(), 1)

    def test_a_raw_save_is_not(self):
        AuditLog.objects.all().delete()
        self.log.save_base(raw=True)
        self.assertEqual(AuditLog.objects.count(), 0)
