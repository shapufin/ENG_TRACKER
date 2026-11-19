"""verify_assertion_for_challenge: the one assertion check shared by sign-in and phone approval."""
import json

from django.conf import settings
from webauthn import generate_authentication_options, options_to_json
from webauthn.helpers.structs import UserVerificationRequirement

from apps.users.models import PairedPhone
from apps.users.services import webauthn as service
from apps.users.services.mfa import MFAError
from apps.users.tests_app.test_webauthn_service import PasskeyServiceTestCase

CHALLENGE = b'c' * 32


class SharedVerifyTests(PasskeyServiceTestCase):
    def assertion(self, challenge=CHALLENGE, **kwargs):
        options = json.loads(options_to_json(generate_authentication_options(
            rp_id=settings.WEBAUTHN_RP_ID, challenge=challenge,
            user_verification=UserVerificationRequirement.REQUIRED,
        )))
        return self.device.get(options, **kwargs)

    def test_verify_assertion_for_challenge_matches_login_behaviour(self):
        credential = self.register()
        verified = service.verify_assertion_for_challenge(self.user, self.assertion(), CHALLENGE)
        self.assertEqual(verified.pk, credential.pk)
        self.assertIsNotNone(verified.last_used_at)
        self.assertGreater(verified.sign_count, 0)

    def test_wrong_challenge_is_refused_and_counted(self):
        self.register()
        with self.assertRaises(MFAError) as ctx:
            service.verify_assertion_for_challenge(self.user, self.assertion(b'd' * 32), CHALLENGE)
        self.assertEqual(ctx.exception.code, 'passkey_invalid')
        self.user.mfa.refresh_from_db()
        self.assertEqual(self.user.mfa.failed_attempts, 1)

    def test_require_paired_refuses_unpaired_passkey(self):
        self.register()
        with self.assertRaises(MFAError) as ctx:
            service.verify_assertion_for_challenge(
                self.user, self.assertion(), CHALLENGE, require_paired=True,
            )
        self.assertEqual(ctx.exception.code, 'no_phone')

    def test_require_paired_accepts_a_paired_passkey(self):
        credential = self.register()
        PairedPhone.objects.create(user=self.user, credential=credential, name='Phone')
        verified = service.verify_assertion_for_challenge(
            self.user, self.assertion(), CHALLENGE, require_paired=True,
        )
        self.assertEqual(verified.pk, credential.pk)
