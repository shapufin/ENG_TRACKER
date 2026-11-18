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


class FakeAuthenticatorTests(TestCase):
    """The helper must produce payloads real py_webauthn verification accepts."""

    def test_fake_authenticator_round_trips_through_py_webauthn(self):
        import json

        from webauthn import (
            generate_authentication_options, generate_registration_options, options_to_json,
            verify_authentication_response, verify_registration_response,
        )
        from webauthn.helpers.structs import UserVerificationRequirement

        from apps.users.tests_app.webauthn_helpers import FakeAuthenticator

        rp_id, origin = 'localhost', 'http://localhost:5173'
        device = FakeAuthenticator(rp_id, origin)

        reg = generate_registration_options(rp_id=rp_id, rp_name='T', user_name='u', user_id=b'1')
        registered = verify_registration_response(
            credential=device.create(json.loads(options_to_json(reg))),
            expected_challenge=reg.challenge, expected_rp_id=rp_id, expected_origin=origin,
            require_user_verification=True,
        )
        self.assertEqual(registered.credential_id, device.credential_id)

        auth = generate_authentication_options(
            rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED,
        )
        verified = verify_authentication_response(
            credential=device.get(json.loads(options_to_json(auth))),
            expected_challenge=auth.challenge, expected_rp_id=rp_id, expected_origin=origin,
            credential_public_key=registered.credential_public_key,
            credential_current_sign_count=0, require_user_verification=True,
        )
        self.assertEqual(verified.new_sign_count, 1)
