"""Passkey enrolment status, factor rules and removal. Spec section 3."""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.users.models import WebAuthnCredential
from apps.users.services import mfa
from apps.users.services import webauthn as service
from apps.users.tests_app.test_webauthn_service import make_credential

User = get_user_model()


class PasskeyFactorRuleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('rules', 'r@example.com', 'pw-Strong-123')

    def enrol_totp(self):
        setup = mfa.begin_setup(self.user)
        mfa.activate(self.user, mfa.code_at(setup['secret'], mfa.current_step()))

    def require_mfa(self):
        self.user.profile.mfa_required = True
        self.user.profile.save()

    def test_passkey_only_user_is_enrolled_and_challenged_when_required(self):
        self.require_mfa()
        make_credential(self.user)
        self.assertTrue(mfa.is_enrolled(self.user))
        self.assertFalse(mfa.totp_enabled(self.user))
        challenge = mfa.login_challenge(self.user)
        self.assertTrue(challenge['mfa_required'])
        self.assertEqual(challenge['methods'], ['passkey'])

    def test_login_challenge_lists_methods_with_the_passkey_first(self):
        self.enrol_totp()
        make_credential(self.user)
        self.assertEqual(mfa.login_challenge(self.user)['methods'], ['passkey', 'totp'])

    def test_totp_only_challenge_lists_totp(self):
        self.enrol_totp()
        self.assertEqual(mfa.login_challenge(self.user)['methods'], ['totp'])

    def test_a_passkey_user_is_still_challenged_when_passkeys_are_switched_off(self):
        make_credential(self.user)
        with override_settings(WEBAUTHN_RP_ID='', WEBAUTHN_ORIGINS=[]):
            challenge = mfa.login_challenge(self.user)
        self.assertTrue(challenge['mfa_required'])
        self.assertEqual(challenge['methods'], [])

    def test_setup_required_lists_the_methods_on_offer(self):
        self.require_mfa()
        challenge = mfa.login_challenge(self.user)
        self.assertTrue(challenge['mfa_setup_required'])
        self.assertEqual(challenge['methods'], ['passkey', 'totp'])

    def test_status_reports_passkeys_and_keeps_enabled_meaning_totp(self):
        credential = make_credential(self.user, name='Laptop')
        status = mfa.status_for(self.user)
        self.assertFalse(status['enabled'])
        self.assertTrue(status['enrolled'])
        self.assertEqual(status['passkeys'][0]['id'], credential.pk)
        self.assertEqual(status['passkeys'][0]['name'], 'Laptop')

    def test_step_up_for_a_passkey_only_user_needs_only_the_password(self):
        make_credential(self.user)
        mfa.check_step_up(self.user, 'pw-Strong-123', '')
        with self.assertRaises(mfa.MFAError):
            mfa.check_step_up(self.user, 'wrong', '')

    def test_a_passkey_user_can_still_add_totp(self):
        make_credential(self.user)
        self.enrol_totp()
        self.assertTrue(mfa.totp_enabled(self.user))

    def test_required_user_cannot_remove_last_factor(self):
        self.require_mfa()
        credential = make_credential(self.user)
        with self.assertRaises(mfa.MFAError) as ctx:
            service.remove(self.user, credential.pk)
        self.assertEqual(ctx.exception.code, 'last_factor')
        self.assertTrue(WebAuthnCredential.objects.filter(pk=credential.pk).exists())

    def test_user_with_totp_and_passkey_can_remove_the_passkey_even_when_required(self):
        self.enrol_totp()
        self.require_mfa()
        credential = make_credential(self.user)
        service.remove(self.user, credential.pk)
        self.assertFalse(WebAuthnCredential.objects.exists())

    def test_optional_user_can_remove_their_only_passkey(self):
        credential = make_credential(self.user)
        service.remove(self.user, credential.pk)
        self.assertFalse(mfa.is_enrolled(self.user))

    def test_rename_and_remove_only_touch_the_users_own_credentials(self):
        other = User.objects.create_user('someone', password='x' * 12)
        theirs = make_credential(other, credential_id=b'cred-2')
        for call in (lambda: service.rename(self.user, theirs.pk, 'mine now'),
                     lambda: service.remove(self.user, theirs.pk)):
            with self.assertRaises(mfa.MFAError) as ctx:
                call()
            self.assertEqual(ctx.exception.code, 'not_found')

    def test_rename_cleans_the_name(self):
        credential = make_credential(self.user)
        service.rename(self.user, credential.pk, '  Work laptop  ')
        credential.refresh_from_db()
        self.assertEqual(credential.name, 'Work laptop')

    def test_disabling_totp_keeps_passkeys(self):
        self.enrol_totp()
        make_credential(self.user)
        mfa.remove_mfa(self.user)
        self.assertTrue(WebAuthnCredential.objects.filter(user=self.user).exists())

    def test_reset_all_factors_removes_totp_and_passkeys(self):
        self.enrol_totp()
        make_credential(self.user)
        mfa.reset_all_factors(self.user)
        self.assertFalse(mfa.is_enrolled(self.user))
        self.assertFalse(WebAuthnCredential.objects.exists())

    def test_list_credentials_is_ordered_oldest_first(self):
        first = make_credential(self.user, credential_id=b'a')
        second = make_credential(self.user, credential_id=b'b')
        self.assertEqual([c.pk for c in service.list_credentials(self.user)], [first.pk, second.pk])
