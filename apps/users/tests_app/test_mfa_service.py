"""Service-level tests for the TOTP second factor (no HTTP)."""

import time
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.leave_management.models import GlobalSettings
from apps.users.models import MFABackupCode, UserMFA
from apps.users.services import mfa
from core.utils.crypto import SecretDecryptError, decrypt_text, encrypt_text, reencrypt_text

User = get_user_model()

# RFC 6238 appendix B, SHA-1 secret "12345678901234567890".
RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'


def enrol(user):
    """Run setup + activate with a real code; returns (secret, backup_codes)."""
    setup = mfa.begin_setup(user)
    codes = mfa.activate(user, mfa.code_at(setup['secret'], mfa.current_step()))
    return setup['secret'], codes


class TotpPrimitiveTests(TestCase):
    def test_matches_rfc_6238_vectors(self):
        self.assertEqual(mfa.code_at(RFC_SECRET, 59 // 30), '287082')
        self.assertEqual(mfa.code_at(RFC_SECRET, 1111111109 // 30), '081804')

    def test_window_accepts_adjacent_steps_only(self):
        now = 1_700_000_000
        step = mfa.current_step(now)
        self.assertEqual(mfa.match_step(RFC_SECRET, mfa.code_at(RFC_SECRET, step - 1), now), step - 1)
        self.assertEqual(mfa.match_step(RFC_SECRET, mfa.code_at(RFC_SECRET, step + 1), now), step + 1)
        self.assertIsNone(mfa.match_step(RFC_SECRET, mfa.code_at(RFC_SECRET, step + 2), now))
        self.assertIsNone(mfa.match_step(RFC_SECRET, mfa.code_at(RFC_SECRET, step - 2), now))

    def test_provisioning_uri_and_qr(self):
        uri = mfa.provisioning_uri(RFC_SECRET, 'a@b.com')
        self.assertTrue(uri.startswith('otpauth://totp/'))
        self.assertIn(f'secret={RFC_SECRET}', uri)
        self.assertIn('<svg', mfa.qr_svg(uri))


class CryptoTests(TestCase):
    def test_round_trip_and_wrong_key(self):
        token = encrypt_text('secret')
        self.assertEqual(decrypt_text(token), 'secret')
        with override_settings(MFA_ENCRYPTION_KEYS=['x' * 43 + '=']):
            with self.assertRaises(SecretDecryptError):
                decrypt_text(token)

    def test_ciphertext_written_by_cryptography_47_still_decrypts(self):
        """Pins Fernet cross-version compatibility: this token was produced under
        cryptography 47.0.0. If a library bump ever stops reading it, every
        enrolled user's MFA seed would be orphaned."""
        key = '35O3aAPWsLAtsX_wabRW-PnVPYV19nUYz986az3eNVg='
        token = 'gAAAAABq42RZ65gcgSgLNy_rTOl7Ygoet0E4lYGLorsk24kC81Ux7ffmKJ5LTxPVqxejuD2FsMlkPWNpQIfUjwbrRK03RuZuXQBNyLogdNOQv3TPG7HpVUU='
        with override_settings(MFA_ENCRYPTION_KEYS=[key]):
            self.assertEqual(decrypt_text(token), 'JBSWY3DPEHPK3PXP')

    def test_rotation_keeps_old_ciphertext_readable_and_reencrypts(self):
        from cryptography.fernet import Fernet
        old = encrypt_text('seed')
        new_key = Fernet.generate_key().decode()
        from django.conf import settings
        with override_settings(MFA_ENCRYPTION_KEYS=[new_key, *settings.MFA_ENCRYPTION_KEYS]):
            self.assertEqual(decrypt_text(old), 'seed')
            rotated = reencrypt_text(old)
        with override_settings(MFA_ENCRYPTION_KEYS=[new_key]):
            self.assertEqual(decrypt_text(rotated), 'seed')


class EnrolmentTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('ann', 'ann@example.com', 'pw-Strong-123')

    def test_seed_is_encrypted_and_pending_until_activated(self):
        setup = mfa.begin_setup(self.user)
        row = UserMFA.objects.get(user=self.user)
        self.assertFalse(row.is_enabled)
        self.assertNotIn(setup['secret'], row.secret_ciphertext)
        self.assertFalse(mfa.is_enrolled(self.user))

    def test_activate_rejects_wrong_code_and_enables_on_right_one(self):
        setup = mfa.begin_setup(self.user)
        with self.assertRaises(mfa.MFAError) as ctx:
            mfa.activate(self.user, '000000' if mfa.code_at(setup['secret'], mfa.current_step()) != '000000' else '111111')
        self.assertEqual(ctx.exception.code, 'invalid_code')
        codes = mfa.activate(self.user, mfa.code_at(setup['secret'], mfa.current_step()))
        self.assertTrue(mfa.is_enrolled(self.user))
        self.assertEqual(len(codes), mfa.BACKUP_CODE_COUNT)

    def test_backup_codes_are_stored_hashed(self):
        _, codes = enrol(self.user)
        stored = MFABackupCode.objects.filter(user=self.user)
        self.assertEqual(stored.count(), mfa.BACKUP_CODE_COUNT)
        for plain in codes:
            raw = plain.replace('-', '')
            self.assertFalse(any(raw in row.digest or raw == row.digest for row in stored))

    def test_setup_refused_when_already_enabled(self):
        enrol(self.user)
        with self.assertRaises(mfa.MFAError) as ctx:
            mfa.begin_setup(self.user)
        self.assertEqual(ctx.exception.code, 'already_enabled')


class VerificationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('bob', 'bob@example.com', 'pw-Strong-123')
        self.secret, self.codes = enrol(self.user)

    def _next_code(self):
        """A valid code for a step after the one used at activation."""
        return mfa.code_at(self.secret, mfa.current_step() + 1)

    def test_activation_step_cannot_be_replayed(self):
        with self.assertRaises(mfa.MFAError) as ctx:
            mfa.verify_second_factor(self.user, mfa.code_at(self.secret, mfa.current_step()))
        self.assertEqual(ctx.exception.code, 'invalid_code')

    def test_valid_code_accepted_once_then_replay_rejected(self):
        code = self._next_code()
        mfa.verify_second_factor(self.user, code)
        with self.assertRaises(mfa.MFAError):
            mfa.verify_second_factor(self.user, code)

    def test_code_with_spaces_is_accepted(self):
        code = self._next_code()
        mfa.verify_second_factor(self.user, f'{code[:3]} {code[3:]}')

    def test_backup_code_works_once(self):
        backup = self.codes[0]
        mfa.verify_second_factor(self.user, backup)
        with self.assertRaises(mfa.MFAError):
            mfa.verify_second_factor(self.user, backup)
        self.assertEqual(
            MFABackupCode.objects.filter(user=self.user, used_at__isnull=True).count(),
            mfa.BACKUP_CODE_COUNT - 1,
        )

    def test_backup_code_accepts_lowercase_and_no_dashes(self):
        mfa.verify_second_factor(self.user, self.codes[1].replace('-', '').lower())

    def test_five_failures_lock_and_failures_are_persisted(self):
        for _ in range(mfa.MAX_FAILURES - 1):
            with self.assertRaises(mfa.MFAError) as ctx:
                mfa.verify_second_factor(self.user, 'nope')
            self.assertEqual(ctx.exception.code, 'invalid_code')
        self.assertEqual(UserMFA.objects.get(user=self.user).failed_attempts, mfa.MAX_FAILURES - 1)
        with self.assertRaises(mfa.MFAError) as ctx:
            mfa.verify_second_factor(self.user, 'nope')
        self.assertEqual(ctx.exception.code, 'locked')
        # Locked: even a correct code is refused until the lock lapses.
        with self.assertRaises(mfa.MFAError) as ctx:
            mfa.verify_second_factor(self.user, self._next_code())
        self.assertEqual(ctx.exception.code, 'locked')

    def test_lock_lapses(self):
        UserMFA.objects.filter(user=self.user).update(locked_until=timezone.now() - timedelta(seconds=1))
        mfa.verify_second_factor(self.user, self._next_code())

    def test_success_resets_failure_counter(self):
        with self.assertRaises(mfa.MFAError):
            mfa.verify_second_factor(self.user, 'nope')
        mfa.verify_second_factor(self.user, self._next_code())
        self.assertEqual(UserMFA.objects.get(user=self.user).failed_attempts, 0)

    def test_undecryptable_seed_fails_closed(self):
        from cryptography.fernet import Fernet
        with override_settings(MFA_ENCRYPTION_KEYS=[Fernet.generate_key().decode()]):
            with self.assertRaises(mfa.MFAError) as ctx:
                mfa.verify_second_factor(self.user, self._next_code())
        self.assertEqual(ctx.exception.code, 'unavailable')


class ChallengeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('cy', 'cy@example.com', 'pw-Strong-123')

    def test_round_trip(self):
        token = mfa.make_challenge(self.user, mfa.PURPOSE_VERIFY)
        self.assertEqual(mfa.read_challenge(token, mfa.PURPOSE_VERIFY), self.user)

    def test_wrong_purpose_rejected(self):
        token = mfa.make_challenge(self.user, mfa.PURPOSE_SETUP)
        with self.assertRaises(mfa.MFAError):
            mfa.read_challenge(token, mfa.PURPOSE_VERIFY)

    def test_expired_rejected(self):
        token = mfa.make_challenge(self.user, mfa.PURPOSE_VERIFY)
        with mock.patch('time.time', return_value=time.time() + mfa.CHALLENGE_MAX_AGE + 5):
            with self.assertRaises(mfa.MFAError):
                mfa.read_challenge(token, mfa.PURPOSE_VERIFY)

    def test_password_change_voids_challenge(self):
        token = mfa.make_challenge(self.user, mfa.PURPOSE_VERIFY)
        self.user.set_password('another-Strong-456')
        self.user.save()
        with self.assertRaises(mfa.MFAError):
            mfa.read_challenge(token, mfa.PURPOSE_VERIFY)

    def test_inactive_user_rejected(self):
        token = mfa.make_challenge(self.user, mfa.PURPOSE_VERIFY)
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        with self.assertRaises(mfa.MFAError):
            mfa.read_challenge(token, mfa.PURPOSE_VERIFY)

    def test_garbage_rejected(self):
        with self.assertRaises(mfa.MFAError):
            mfa.read_challenge('not-a-token', mfa.PURPOSE_VERIFY)


class PolicyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('di', 'di@example.com', 'pw-Strong-123')

    def test_optional_by_default(self):
        self.assertIsNone(mfa.required_source(self.user))
        self.assertIsNone(mfa.login_challenge(self.user))

    def test_global_switch_requires_setup_for_unenrolled(self):
        GlobalSettings.objects.update_or_create(pk=1, defaults={'mfa_required': True})
        self.assertEqual(mfa.required_source(self.user), 'global')
        challenge = mfa.login_challenge(self.user)
        self.assertTrue(challenge['mfa_setup_required'])

    def test_per_user_flag_requires_setup_for_that_user_only(self):
        other = User.objects.create_user('ed', 'ed@example.com', 'pw-Strong-123')
        self.user.profile.mfa_required = True
        self.user.profile.save()
        self.assertEqual(mfa.required_source(self.user), 'user')
        self.assertIsNone(mfa.required_source(User.objects.get(pk=other.pk)))

    def test_enrolled_user_is_always_challenged_even_when_not_required(self):
        enrol(self.user)
        challenge = mfa.login_challenge(self.user)
        self.assertTrue(challenge['mfa_required'])
        self.assertNotIn('mfa_setup_required', challenge)

    def test_remove_mfa_clears_everything(self):
        enrol(self.user)
        mfa.remove_mfa(self.user)
        self.assertFalse(UserMFA.objects.filter(user=self.user).exists())
        self.assertFalse(MFABackupCode.objects.filter(user=self.user).exists())
