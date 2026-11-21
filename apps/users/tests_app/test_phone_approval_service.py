"""Phone approval service. Spec: docs/superpowers/specs/2026-11-19-phone-approval-login-design.md."""
import hashlib
import sys
from datetime import timedelta
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.users.models import PairedPhone, PhoneLoginRequest, WebAuthnCredential
from apps.users.services import phone_approval as service
from apps.users.services.mfa import MFAError
from apps.users.tests_app.test_webauthn_service import PasskeyServiceTestCase
from apps.users.tests_app.webauthn_helpers import FakeAuthenticator

User = get_user_model()
PUSH = 'plugins.notifications.push_service.send_push_notification'
ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'


class PhoneApprovalTestCase(PasskeyServiceTestCase):
    def setUp(self):
        super().setUp()
        self.credential = self.register()
        self.phone = PairedPhone.objects.create(
            user=self.user, credential=self.credential, name='My phone', push_endpoint=ENDPOINT,
        )

    def start(self, via='qr', user=None):
        return service.request_approval(user or self.user, via, '203.0.113.9', 'Chrome on Windows')

    def wrong_number(self, started):
        row = PhoneLoginRequest.objects.get(public_id=started['request_id'])
        return next(n for n in row.options if n != started['number'])

    def approve(self, started, device=None, number=None, **assertion_kwargs):
        view = service.approval_view(started['request_id'])
        response = (device or self.device).get(view['assertion'], **assertion_kwargs)
        service.decide(
            started['request_id'], 'approve',
            number=started['number'] if number is None else number, response=response,
        )


class RequestTests(PhoneApprovalTestCase):
    def test_request_creates_pending_row_with_digest_not_key(self):
        started = self.start()
        row = PhoneLoginRequest.objects.get(public_id=started['request_id'])
        self.assertEqual(row.status, 'pending')
        self.assertEqual(row.collector_digest, hashlib.sha256(started['collect_key'].encode()).hexdigest())
        self.assertEqual(row.number, started['number'])
        self.assertIn(row.number, row.options)
        self.assertEqual(len(set(row.options)), 3)
        self.assertTrue(all(10 <= n <= 99 for n in row.options))
        self.assertEqual(
            started['approve_url'], f"{settings.WEBAUTHN_ORIGINS[0]}/phone-approve/{started['request_id']}",
        )
        self.assertIn('<svg', started['qr_svg'])
        self.assertLessEqual(started['expires_in'], 120)

    def test_request_without_paired_phone_is_refused(self):
        self.phone.delete()
        with self.assertRaises(MFAError) as ctx:
            self.start()
        self.assertEqual(ctx.exception.code, 'no_phone')

    def test_fourth_live_request_is_refused(self):
        for _ in range(3):
            self.start()
        with self.assertRaises(MFAError) as ctx:
            self.start()
        self.assertEqual(ctx.exception.code, 'too_many_requests')

    def test_expired_rows_are_pruned_on_create(self):
        old = self.start()
        PhoneLoginRequest.objects.update(expires_at=timezone.now() - timedelta(hours=2))
        self.start()
        self.assertFalse(PhoneLoginRequest.objects.filter(public_id=old['request_id']).exists())

    def test_disabled_switch_refuses_everything(self):
        with self.settings(PHONE_APPROVAL_ENABLED=False), self.assertRaises(MFAError) as ctx:
            self.start()
        self.assertEqual(ctx.exception.code, 'unavailable')

    def test_push_goes_only_to_paired_endpoints_and_reports_delivery(self):
        with mock.patch(PUSH, return_value=(1, 0)) as send:
            started = self.start('push')
        self.assertTrue(started['pushed'])
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs['endpoints'], [ENDPOINT])
        self.assertEqual(kwargs['url'], started['approve_url'])
        # The alert is only useful while the request is live: high urgency plus
        # the request's own TTL, or a sleeping phone gets it late (2026-11-21).
        self.assertEqual(kwargs['ttl'], service.PHONE_REQUEST_TTL_SECONDS)
        self.assertEqual(kwargs['urgency'], 'high')

    def test_push_failure_or_missing_plugin_still_returns_qr(self):
        with mock.patch(PUSH, return_value=(0, 1)):
            self.assertFalse(self.start('push')['pushed'])
        with mock.patch.dict(sys.modules, {'plugins.notifications.push_service': None}):
            started = self.start('push')
        self.assertFalse(started['pushed'])
        self.assertIn('<svg', started['qr_svg'])
        with mock.patch(PUSH, side_effect=RuntimeError('boom')):
            self.assertFalse(self.start('push')['pushed'])

    def test_qr_request_sends_no_push(self):
        with mock.patch(PUSH) as send:
            self.assertFalse(self.start('qr')['pushed'])
        send.assert_not_called()

    def test_unknown_via_is_refused(self):
        with self.assertRaises(MFAError) as ctx:
            self.start('carrier-pigeon')
        self.assertEqual(ctx.exception.code, 'request_invalid')


class DecideTests(PhoneApprovalTestCase):
    def test_approve_with_right_number_and_valid_assertion_marks_approved(self):
        started = self.start()
        self.approve(started)
        row = PhoneLoginRequest.objects.get(public_id=started['request_id'])
        self.assertEqual(row.status, 'approved')
        self.assertEqual(row.credential_id, self.credential.pk)
        self.assertIsNotNone(row.decided_at)
        self.phone.refresh_from_db()
        self.assertIsNotNone(self.phone.last_used_at)

    def test_view_shows_options_requester_and_only_paired_credentials(self):
        started = self.start()
        view = service.approval_view(started['request_id'])
        self.assertEqual(sorted(view['options']), sorted(PhoneLoginRequest.objects.get().options))
        self.assertEqual(view['requester']['agent'], 'Chrome on Windows')
        self.assertEqual(view['username'], self.user.username)
        self.assertEqual(len(view['assertion']['allowCredentials']), 1)
        self.assertNotIn('number', view)

    def test_wrong_number_denies_and_counts_a_failure_toward_the_shared_lock(self):
        started = self.start()
        with self.assertRaises(MFAError) as ctx:
            self.approve(started, number=self.wrong_number(started))
        self.assertEqual(ctx.exception.code, 'wrong_number')
        self.assertEqual(PhoneLoginRequest.objects.get().status, 'denied')
        self.user.mfa.refresh_from_db()
        self.assertEqual(self.user.mfa.failed_attempts, 1)

    def test_blind_approvals_lock_the_account(self):
        for _ in range(5):
            started = self.start()
            with self.assertRaises(MFAError):
                self.approve(started, number=self.wrong_number(started))
        with self.assertRaises(MFAError) as ctx:
            self.start()
        self.assertEqual(ctx.exception.code, 'locked')

    def test_deny_needs_no_assertion_and_ends_the_request(self):
        started = self.start()
        service.decide(started['request_id'], 'deny')
        self.assertEqual(PhoneLoginRequest.objects.get().status, 'denied')

    def test_assertion_for_another_requests_challenge_is_refused(self):
        first, second = self.start(), self.start()
        response = self.device.get(service.approval_view(second['request_id'])['assertion'])
        with self.assertRaises(MFAError) as ctx:
            service.decide(first['request_id'], 'approve', number=first['number'], response=response)
        self.assertEqual(ctx.exception.code, 'passkey_invalid')
        self.assertEqual(PhoneLoginRequest.objects.get(public_id=first['request_id']).status, 'pending')

    def test_unpaired_passkey_is_refused(self):
        second_device = FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0])
        self.register(device=second_device, name='Laptop')
        started = self.start()
        with self.assertRaises(MFAError) as ctx:
            self.approve(started, device=second_device)
        self.assertEqual(ctx.exception.code, 'no_phone')
        self.assertEqual(PhoneLoginRequest.objects.get().status, 'pending')

    def test_other_users_passkey_is_refused(self):
        other = User.objects.create_user('someone_else', password='x' * 12)
        other_device = FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0])
        self.register(user=other, device=other_device)
        started = self.start()
        with self.assertRaises(MFAError) as ctx:
            self.approve(started, device=other_device)
        self.assertEqual(ctx.exception.code, 'passkey_invalid')

    def test_missing_user_verification_is_refused(self):
        started = self.start()
        with self.assertRaises(MFAError) as ctx:
            self.approve(started, uv=False)
        self.assertEqual(ctx.exception.code, 'passkey_invalid')
        self.assertEqual(PhoneLoginRequest.objects.get().status, 'pending')

    def test_decision_cannot_be_replayed(self):
        started = self.start()
        response = self.device.get(service.approval_view(started['request_id'])['assertion'])
        service.decide(started['request_id'], 'approve', number=started['number'], response=response)
        with self.assertRaises(MFAError) as ctx:
            service.decide(started['request_id'], 'approve', number=started['number'], response=response)
        self.assertEqual(ctx.exception.code, 'request_used')

    def test_expired_request_cannot_be_decided_or_viewed(self):
        started = self.start()
        PhoneLoginRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        with self.assertRaises(MFAError) as ctx:
            service.approval_view(started['request_id'])
        self.assertEqual(ctx.exception.code, 'request_expired')
        with self.assertRaises(MFAError) as ctx:
            service.decide(started['request_id'], 'deny')
        self.assertEqual(ctx.exception.code, 'request_expired')

    def test_unknown_or_malformed_request_id_is_a_clean_error(self):
        for bad in ('not-a-uuid', '00000000-0000-0000-0000-000000000000', ''):
            with self.assertRaises(MFAError) as ctx:
                service.approval_view(bad)
            self.assertEqual(ctx.exception.code, 'request_invalid')

    def test_removed_passkey_means_request_cannot_be_approved(self):
        started = self.start()
        response = self.device.get(service.approval_view(started['request_id'])['assertion'])
        WebAuthnCredential.objects.filter(pk=self.credential.pk).delete()
        with self.assertRaises(MFAError):
            service.decide(started['request_id'], 'approve', number=started['number'], response=response)
        state = service.collect(self.user, started['request_id'], started['collect_key'], consume=False)
        self.assertEqual(state, 'pending')


class CollectTests(PhoneApprovalTestCase):
    def test_collect_pending_then_approved_consumes_once(self):
        started = self.start()
        request_id, key = started['request_id'], started['collect_key']
        self.assertEqual(service.collect(self.user, request_id, key), 'pending')
        self.approve(started)
        self.assertEqual(service.collect(self.user, request_id, key, consume=False), 'approved')
        self.assertIsNone(PhoneLoginRequest.objects.get().consumed_at)
        self.assertEqual(service.collect(self.user, request_id, key), 'approved')
        with self.assertRaises(MFAError) as ctx:
            service.collect(self.user, request_id, key)
        self.assertEqual(ctx.exception.code, 'request_used')

    def test_collect_with_wrong_key_is_refused_and_does_not_consume(self):
        started = self.start()
        self.approve(started)
        with self.assertRaises(MFAError) as ctx:
            service.collect(self.user, started['request_id'], 'wrong-key')
        self.assertEqual(ctx.exception.code, 'request_invalid')
        self.assertIsNone(PhoneLoginRequest.objects.get().consumed_at)
        self.assertEqual(service.collect(self.user, started['request_id'], started['collect_key']), 'approved')

    def test_collect_for_another_users_request_is_refused(self):
        started = self.start()
        self.approve(started)
        other = User.objects.create_user('someone_else', password='x' * 12)
        with self.assertRaises(MFAError) as ctx:
            service.collect(other, started['request_id'], started['collect_key'])
        self.assertEqual(ctx.exception.code, 'request_invalid')

    def test_collect_reports_denied_and_expired(self):
        denied = self.start()
        service.decide(denied['request_id'], 'deny')
        self.assertEqual(service.collect(self.user, denied['request_id'], denied['collect_key']), 'denied')
        expired = self.start()
        PhoneLoginRequest.objects.filter(public_id=expired['request_id']).update(
            expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(service.collect(self.user, expired['request_id'], expired['collect_key']), 'expired')

    def test_no_token_row_exists_before_approval(self):
        self.start()
        self.assertFalse(OutstandingToken.objects.filter(user=self.user).exists())
