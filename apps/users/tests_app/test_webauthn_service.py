"""Passkey (WebAuthn) service tests. Spec: docs/superpowers/specs/2026-11-18-passkeys-design.md."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.users.models import WebAuthnChallenge, WebAuthnCredential

User = get_user_model()


def make_credential(user, credential_id=b'cred-1', **extra):
    return WebAuthnCredential.objects.create(
        user=user, credential_id=credential_id, public_key=b'pk', sign_count=0,
        transports=[], name='Phone', **extra,
    )


class WebAuthnModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('pk_user', password='x' * 12)

    def test_credential_id_is_unique(self):
        make_credential(self.user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_credential(User.objects.create_user('other', password='x' * 12))

    def test_user_delete_cascades_credentials_and_challenges(self):
        make_credential(self.user)
        WebAuthnChallenge.objects.create(
            user=self.user, purpose='login', challenge=b'c',
            expires_at=timezone.now() + timedelta(seconds=120),
        )
        self.user.delete()
        self.assertFalse(WebAuthnCredential.objects.exists())
        self.assertFalse(WebAuthnChallenge.objects.exists())
