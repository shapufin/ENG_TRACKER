"""Tests for audit log rotation, gzip compression, and archiving."""

import gzip
import json
from datetime import datetime

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.reports.models.core import AuditLog
from apps.reports.services.audit_archive import (
    archive_month,
    get_archive_dir,
)
from core.utils.timezone_local import business_tz


class AuditArchiveServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="auditor", password="password123")
        self.admin = User.objects.create_superuser(username="admin", password="password123", email="admin@example.com")
        self.client = APIClient()

    def test_archive_creates_valid_gzip_and_prunes_database(self):
        tz = business_tz()
        # Create records in 2026-08 (target month)
        dt_august = datetime(2026, 8, 15, 12, 0, 0, tzinfo=tz)
        dt_september = datetime(2026, 9, 15, 12, 0, 0, tzinfo=tz)

        log1 = AuditLog.objects.create(
            user=self.user,
            action='LOGIN_SUCCESS',
            model_name='auth',
            object_id=str(self.user.id),
            object_repr=self.user.username,
            timestamp=dt_august,
            ip_address='192.168.1.100',
            extra_data={'description': 'Login ok'},
        )
        AuditLog.objects.filter(id=log1.id).update(timestamp=dt_august)

        log2 = AuditLog.objects.create(
            user=self.user,
            action='LOGIN_FAILED',
            model_name='auth',
            object_id='0',
            object_repr=self.user.username,
            timestamp=dt_august,
            ip_address='192.168.1.101',
            extra_data={'description': 'Failed login'},
        )
        AuditLog.objects.filter(id=log2.id).update(timestamp=dt_august)

        # Create record in September (should NOT be pruned)
        log_keep = AuditLog.objects.create(
            user=self.user,
            action='CREATE',
            model_name='overtimelog',
            object_id='100',
            object_repr='OT 100',
            timestamp=dt_september,
        )
        AuditLog.objects.filter(id=log_keep.id).update(timestamp=dt_september)

        # Archive August 2026
        result = archive_month(month_str='2026-08', delete_after=True)
        self.assertTrue(result['success'])
        self.assertEqual(result['archived_count'], 2)
        self.assertEqual(result['filename'], 'audit_logs_2026_08.json.gz')

        archive_path = get_archive_dir() / 'audit_logs_2026_08.json.gz'
        self.assertTrue(archive_path.exists())
        self.assertGreater(archive_path.stat().st_size, 0)

        # Verify content can be decompressed and lines read
        with gzip.open(archive_path, 'rt', encoding='utf-8') as gz:
            lines = [json.loads(line) for line in gz]
        # First line is metadata header, followed by 2 records
        self.assertEqual(len(lines), 3)
        self.assertIn('_archive_metadata', lines[0])
        self.assertEqual(lines[1]['action'], 'LOGIN_SUCCESS')
        self.assertEqual(lines[2]['action'], 'LOGIN_FAILED')

        # Verify DB pruning: August records deleted, September record kept
        self.assertFalse(AuditLog.objects.filter(action__in=['LOGIN_SUCCESS', 'LOGIN_FAILED']).exists())
        self.assertTrue(AuditLog.objects.filter(id=log_keep.id).exists())

        # Cleanup created archive
        if archive_path.exists():
            archive_path.unlink()

    def test_archive_status_and_actions_via_api(self):
        self.client.force_authenticate(user=self.admin)

        # 1. Check archive_status endpoint
        resp = self.client.get('/api/reports/audit-logs/archive_status/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('target_month', resp.data)
        self.assertIn('eligible_count', resp.data)
        self.assertIn('archives', resp.data)

        # 2. Non-admin is forbidden
        self.client.force_authenticate(user=self.user)
        resp_forbidden = self.client.get('/api/reports/audit-logs/archive_status/')
        self.assertEqual(resp_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Path traversal attack prevented in download_archive
        self.client.force_authenticate(user=self.admin)
        resp_traversal = self.client.get('/api/reports/audit-logs/download_archive/?filename=../../etc/passwd')
        self.assertEqual(resp_traversal.status_code, status.HTTP_404_NOT_FOUND)

    def test_management_command_rotate_audit_logs(self):
        # Dry-run status
        call_command('rotate_audit_logs', status=True)
