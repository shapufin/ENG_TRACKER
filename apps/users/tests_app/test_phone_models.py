"""Phone approval models. Spec: docs/superpowers/specs/2026-11-19-phone-approval-login-design.md section 2."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.users.models import PairedPhone, PhoneLoginRequest, WebAuthnCredential
from apps.users.services.user_deletion import user_delete_blockers

User = get_user_model()


def make_phone_request(user, **extra):
    fields = {
        'number': 42, 'options': [42, 17, 63], 'challenge': b'c' * 32,
        'collector_digest': 'd' * 64, 'expires_at': timezone.now() + timedelta(seconds=120),
        **extra,
    }
    return PhoneLoginRequest.objects.create(user=user, **fields)


class PhoneModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('phone_user', password='x' * 12)
        self.credential = WebAuthnCredential.objects.create(
            user=self.user, credential_id=b'cred-phone', public_key=b'pk', name='Phone',
        )

    def test_removing_a_passkey_removes_its_pairing(self):
        PairedPhone.objects.create(user=self.user, credential=self.credential, name='My phone')
        self.credential.delete()
        self.assertFalse(PairedPhone.objects.exists())

    def test_credential_pairs_once(self):
        PairedPhone.objects.create(user=self.user, credential=self.credential, name='A')
        with self.assertRaises(IntegrityError), transaction.atomic():
            PairedPhone.objects.create(user=self.user, credential=self.credential, name='B')

    def test_user_delete_is_not_blocked_by_pairings_or_requests(self):
        PairedPhone.objects.create(user=self.user, credential=self.credential, name='A')
        make_phone_request(self.user)
        self.assertEqual(user_delete_blockers(self.user), {})

    def test_public_id_is_unique_uuid(self):
        first, second = make_phone_request(self.user), make_phone_request(self.user)
        self.assertNotEqual(first.public_id, second.public_id)
        self.assertEqual(first.status, PhoneLoginRequest.STATUS_PENDING)
