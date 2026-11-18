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


class PasskeyServiceTestCase(TestCase):
    def setUp(self):
        from django.conf import settings

        from apps.users.tests_app.webauthn_helpers import FakeAuthenticator

        self.user = User.objects.create_user('pk_user', password='x' * 12)
        self.device = FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0])

    def register(self, user=None, device=None, name='Phone', **create_kwargs):
        from apps.users.services import webauthn as service

        user = user or self.user
        device = device or self.device
        options = service.registration_options(user)
        return service.register(user, device.create(options, **create_kwargs), name)


class PasskeyRegistrationTests(PasskeyServiceTestCase):
    def test_register_stores_credential(self):
        credential = self.register(name='  Work phone ', transports=['internal'])
        self.assertEqual(credential.user, self.user)
        self.assertEqual(bytes(credential.credential_id), self.device.credential_id)
        self.assertEqual(credential.name, 'Work phone')
        self.assertEqual(credential.transports, ['internal'])

    def test_registration_without_transports_is_accepted(self):
        self.assertEqual(self.register().transports, [])

    def test_registration_rejects_replayed_challenge(self):
        from apps.users.services import webauthn as service
        from apps.users.services.mfa import MFAError

        options = service.registration_options(self.user)
        response = self.device.create(options)
        service.register(self.user, response, 'One')
        with self.assertRaises(MFAError) as ctx:
            service.register(self.user, response, 'Two')
        self.assertEqual(ctx.exception.code, 'challenge_invalid')

    def test_registration_rejects_expired_challenge(self):
        from apps.users.services import webauthn as service
        from apps.users.services.mfa import MFAError

        options = service.registration_options(self.user)
        WebAuthnChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        with self.assertRaises(MFAError) as ctx:
            service.register(self.user, self.device.create(options), 'Phone')
        self.assertEqual(ctx.exception.code, 'challenge_invalid')

    def test_registration_rejects_wrong_origin(self):
        from apps.users.services import webauthn as service
        from apps.users.services.mfa import MFAError

        options = service.registration_options(self.user)
        with self.assertRaises(MFAError) as ctx:
            service.register(self.user, self.device.create(options, origin='https://evil.example'), 'x')
        self.assertEqual(ctx.exception.code, 'passkey_invalid')
        self.assertFalse(WebAuthnCredential.objects.exists())

    def test_registration_rejects_missing_user_verification(self):
        from apps.users.services import webauthn as service
        from apps.users.services.mfa import MFAError

        options = service.registration_options(self.user)
        with self.assertRaises(MFAError) as ctx:
            service.register(self.user, self.device.create(options, uv=False), 'x')
        self.assertEqual(ctx.exception.code, 'passkey_invalid')

    def test_registration_rejects_garbage_payload(self):
        from apps.users.services import webauthn as service
        from apps.users.services.mfa import MFAError

        for payload in ({}, {'response': {'clientDataJSON': '!!!'}}, 'nope'):
            with self.assertRaises(MFAError) as ctx:
                service.register(self.user, payload, 'x')
            self.assertIn(ctx.exception.code, {'passkey_invalid', 'challenge_invalid'})

    def test_duplicate_authenticator_is_a_conflict_not_a_500(self):
        from apps.users.services.mfa import MFAError

        self.register()
        with self.assertRaises(MFAError) as ctx:
            self.register()
        self.assertEqual(ctx.exception.code, 'credential_exists')
        self.assertEqual(WebAuthnCredential.objects.count(), 1)

    def test_registration_options_exclude_existing_credentials(self):
        from apps.users.services import webauthn as service
        from apps.users.tests_app.webauthn_helpers import b64url

        self.register()
        options = service.registration_options(self.user)
        self.assertEqual(
            [c['id'] for c in options['excludeCredentials']], [b64url(self.device.credential_id)],
        )
        self.assertEqual(options['authenticatorSelection']['userVerification'], 'required')
        self.assertEqual(options['attestation'], 'none')

    def test_two_challenges_for_one_user_are_independent(self):
        from apps.users.services import webauthn as service
        from apps.users.tests_app.webauthn_helpers import FakeAuthenticator

        other = FakeAuthenticator(self.device.rp_id, self.device.origin)
        first = service.registration_options(self.user)
        second = service.registration_options(self.user)
        service.register(self.user, other.create(second), 'Second')
        service.register(self.user, self.device.create(first), 'First')
        self.assertEqual(WebAuthnCredential.objects.filter(user=self.user).count(), 2)

    def test_new_challenge_prunes_expired_and_used_rows(self):
        from apps.users.services import webauthn as service

        past = timezone.now() - timedelta(minutes=5)
        WebAuthnChallenge.objects.create(user=self.user, purpose='login', challenge=b'old', expires_at=past)
        WebAuthnChallenge.objects.create(
            user=self.user, purpose='login', challenge=b'used', used_at=past,
            expires_at=timezone.now() + timedelta(seconds=60),
        )
        service.new_challenge(self.user, 'register')
        self.assertEqual(list(WebAuthnChallenge.objects.values_list('purpose', flat=True)), ['register'])

    def test_passkeys_are_unavailable_when_the_rp_id_is_unset(self):
        from django.test import override_settings

        from apps.users.services import webauthn as service
        from apps.users.services.mfa import MFAError

        with override_settings(WEBAUTHN_RP_ID='', WEBAUTHN_ORIGINS=[]):
            self.assertFalse(service.is_available())
            with self.assertRaises(MFAError) as ctx:
                service.registration_options(self.user)
        self.assertEqual(ctx.exception.code, 'unavailable')
