"""check_webauthn_config and the seedless-row interplay with check_mfa_key."""
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.users.models import UserMFA, WebAuthnCredential

User = get_user_model()


class CheckWebauthnConfigTests(TestCase):
    def run_command(self, *args):
        out = StringIO()
        call_command('check_webauthn_config', *args, stdout=out)
        return out.getvalue()

    def test_prints_rp_id_origins_and_credential_count(self):
        user = User.objects.create_user('pk', password='x' * 12)
        WebAuthnCredential.objects.create(
            user=user, credential_id=b'c', public_key=b'k', sign_count=0, name='Phone',
        )
        with override_settings(WEBAUTHN_RP_ID='integrit.org', WEBAUTHN_ORIGINS=['https://tracker2.integrit.org']):
            output = self.run_command()
        self.assertIn('integrit.org', output)
        self.assertIn('https://tracker2.integrit.org', output)
        self.assertIn('1 passkey', output)

    def test_reports_that_passkeys_are_off_when_unset(self):
        with override_settings(WEBAUTHN_RP_ID='', WEBAUTHN_ORIGINS=[]):
            self.assertIn('OFF', self.run_command())

    def test_production_mode_fails_on_an_http_origin(self):
        with override_settings(WEBAUTHN_RP_ID='tracker2.integrit.org', WEBAUTHN_ORIGINS=['http://tracker2.integrit.org']):
            with self.assertRaises(CommandError):
                self.run_command('--production')

    def test_production_mode_accepts_a_valid_setup(self):
        with override_settings(WEBAUTHN_RP_ID='tracker2.integrit.org', WEBAUTHN_ORIGINS=['https://tracker2.integrit.org']):
            self.assertIn('OK', self.run_command('--production'))


class SeedlessMfaRowTests(TestCase):
    """A passkey-only user's failure counter row has no seed (see services/webauthn._lock_row)."""

    def test_check_mfa_key_ignores_a_seedless_row(self):
        user = User.objects.create_user('pk', password='x' * 12)
        UserMFA.objects.create(user=user, secret_ciphertext='', is_enabled=False)
        out = StringIO()
        call_command('check_mfa_key', stdout=out, stderr=StringIO())
        self.assertIn('All 0 MFA seeds', out.getvalue())

    def test_reencrypt_leaves_a_seedless_row_alone(self):
        user = User.objects.create_user('pk', password='x' * 12)
        UserMFA.objects.create(user=user, secret_ciphertext='', is_enabled=False)
        call_command('check_mfa_key', '--reencrypt', stdout=StringIO(), stderr=StringIO())
        self.assertEqual(UserMFA.objects.get(user=user).secret_ciphertext, '')
