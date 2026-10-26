"""Tests for security and authentication event logging."""

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from apps.reports.models.core import AuditLog


class SecurityAuditLoggingTests(APITestCase):
    def setUp(self):
        self.username = "secuser"
        self.password = "InitialPass123!"
        self.user = User.objects.create_user(
            username=self.username,
            password=self.password,
            email="secuser@example.com",
        )

    def test_failed_login_creates_audit_log(self):
        resp = self.client.post('/api/auth/token/', {
            'username': self.username,
            'password': 'WrongPassword!',
        })
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Check AuditLog
        log = AuditLog.objects.filter(action='LOGIN_FAILED').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.model_name, 'auth')
        self.assertEqual(log.object_repr, self.username)
        self.assertIn("Failed login attempt", log.changes_summary)

    def test_successful_login_without_mfa_creates_audit_log(self):
        resp = self.client.post('/api/auth/token/', {
            'username': self.username,
            'password': self.password,
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        log = AuditLog.objects.filter(action='LOGIN_SUCCESS').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.model_name, 'auth')
        self.assertEqual(log.user, self.user)
        self.assertIn("signed in successfully", log.changes_summary)

    def test_password_change_creates_audit_log(self):
        self.client.force_authenticate(user=self.user)
        new_pass = "NewStrongPass456!"
        resp = self.client.post('/api/auth/password/change/', {
            'current_password': self.password,
            'new_password': new_pass,
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        log = AuditLog.objects.filter(action='PASSWORD_CHANGED').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.user)
        self.assertIn("changed their password", log.changes_summary)
