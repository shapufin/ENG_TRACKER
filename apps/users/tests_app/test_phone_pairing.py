"""Pairing a phone. Spec: docs/superpowers/specs/2026-11-19-phone-approval-login-design.md section 3."""
import sys
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model

from apps.users.models import PairedPhone, PhoneLoginRequest
from apps.users.services import phone_approval, phone_pairing
from apps.users.services.mfa import MFAError
from apps.users.tests_app.test_phone_models import make_phone_request
from apps.users.tests_app.test_webauthn_service import PasskeyServiceTestCase
from apps.users.tests_app.webauthn_helpers import FakeAuthenticator
from plugins.notifications.models import PushSubscription

User = get_user_model()
ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'


class PairingTests(PasskeyServiceTestCase):
    def setUp(self):
        super().setUp()
        self.credential = self.register()

    def subscription(self, user=None, endpoint=ENDPOINT):
        return PushSubscription.objects.create(
            user=user or self.user, endpoint=endpoint, p256dh_key='k', auth_key='a',
        )

    def test_pair_own_passkey(self):
        self.subscription()
        phone = phone_pairing.pair(self.user, self.credential.pk, '  My phone ', ENDPOINT)
        self.assertEqual((phone.user, phone.credential, phone.name, phone.push_endpoint),
                         (self.user, self.credential, 'My phone', ENDPOINT))

    def test_cannot_pair_another_users_passkey(self):
        other = User.objects.create_user('someone_else', password='x' * 12)
        other_credential = self.register(
            user=other, device=FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0]),
        )
        with self.assertRaises(MFAError) as ctx:
            phone_pairing.pair(self.user, other_credential.pk, 'x')
        self.assertEqual(ctx.exception.code, 'not_found')
        self.assertFalse(PairedPhone.objects.exists())

    def test_pair_twice_is_a_clear_conflict(self):
        phone_pairing.pair(self.user, self.credential.pk, 'A')
        with self.assertRaises(MFAError) as ctx:
            phone_pairing.pair(self.user, self.credential.pk, 'B')
        self.assertEqual(ctx.exception.code, 'phone_exists')

    def test_push_endpoint_must_be_a_stored_push_service_subscription_of_the_user(self):
        other = User.objects.create_user('someone_else', password='x' * 12)
        self.subscription(user=other)
        for endpoint in (ENDPOINT, 'https://evil.example.com/push', 'not a url'):
            PairedPhone.objects.all().delete()
            phone = phone_pairing.pair(self.user, self.credential.pk, 'Phone', endpoint)
            self.assertEqual(phone.push_endpoint, '', endpoint)  # QR only, still paired

    def test_missing_notifications_plugin_pairs_as_qr_only(self):
        self.subscription()
        with mock.patch.dict(sys.modules, {'plugins.notifications.push_service': None}):
            phone = phone_pairing.pair(self.user, self.credential.pk, 'Phone', ENDPOINT)
        self.assertEqual(phone.push_endpoint, '')

    def test_list_rename_and_remove_are_owner_only(self):
        phone = phone_pairing.pair(self.user, self.credential.pk, 'Phone', '')
        listed = phone_pairing.list_phones(self.user)
        self.assertEqual([(p['id'], p['name'], p['can_push']) for p in listed], [(phone.pk, 'Phone', False)])
        self.assertEqual(phone_pairing.rename(self.user, phone.pk, 'Work phone').name, 'Work phone')
        other = User.objects.create_user('someone_else', password='x' * 12)
        for action in (lambda: phone_pairing.rename(other, phone.pk, 'x'), lambda: phone_pairing.remove(other, phone.pk)):
            with self.assertRaises(MFAError) as ctx:
                action()
            self.assertEqual(ctx.exception.code, 'not_found')
        phone_pairing.remove(self.user, phone.pk)
        self.assertFalse(PairedPhone.objects.exists())
        self.assertTrue(self.user.passkeys.exists())  # unpairing keeps the passkey itself

    def test_remove_all_deletes_pairings_and_live_requests(self):
        phone_pairing.pair(self.user, self.credential.pk, 'Phone', '')
        make_phone_request(self.user)
        phone_pairing.remove_all(self.user)
        self.assertFalse(PairedPhone.objects.exists())
        self.assertFalse(PhoneLoginRequest.objects.exists())

    def test_pairing_is_refused_while_the_switch_is_off(self):
        with self.settings(PHONE_APPROVAL_ENABLED=False):
            self.assertFalse(phone_approval.phone_approval_enabled())
            with self.assertRaises(MFAError) as ctx:
                phone_pairing.pair(self.user, self.credential.pk, 'Phone')
        self.assertEqual(ctx.exception.code, 'unavailable')
