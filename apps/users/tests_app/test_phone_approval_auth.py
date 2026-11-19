"""HTTP tests for phone approval sign-in and pairing. Spec: docs/superpowers/specs/2026-11-19-phone-approval-login-design.md."""
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.reports.models import AuditLog
from apps.users.models import PairedPhone, PhoneLoginRequest, WebAuthnCredential
from apps.users.services import mfa
from apps.users.tests_app.webauthn_helpers import FakeAuthenticator

User = get_user_model()
PASSWORD = 'pw-Strong-123'
PASSKEYS = '/api/auth/mfa/passkeys/'
PHONES = '/api/auth/mfa/phones/'
REQUEST = '/api/auth/token/phone-request/'
COLLECT = '/api/auth/token/phone-collect/'


def request_url(public_id, suffix=''):
    return f'/api/auth/phone/requests/{public_id}/{suffix}'


class PhoneApprovalHttpTestCase(APITestCase):
    """ann has a passkey made on "the phone" and, unless a test says otherwise, it is paired."""
    pair = True

    def setUp(self):
        self.user = User.objects.create_user('ann', 'ann@example.com', PASSWORD)
        self.device = FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0])
        self.client.force_authenticate(self.user)
        options = self.client.post(f'{PASSKEYS}options/', {'password': PASSWORD}, format='json').data
        created = self.client.post(
            PASSKEYS + 'register/', {'response': self.device.create(options), 'name': 'Phone'}, format='json',
        )
        self.credential_pk = created.data['id']
        if self.pair:
            paired = self.client.post(
                PHONES, {'password': PASSWORD, 'credential_id': self.credential_pk, 'name': 'My phone'}, format='json',
            )
            assert paired.status_code == 201, paired.data
        self.client.force_authenticate(None)
        self.pc = APIClient()
        self.phone_client = APIClient()  # the phone is not signed in

    def mfa_token(self):
        response = self.pc.post('/api/auth/token/', {'username': 'ann', 'password': PASSWORD}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['mfa_token']

    def start(self, token=None, via='qr'):
        token = token or self.mfa_token()
        response = self.pc.post(REQUEST, {'mfa_token': token, 'via': via}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return token, response.data

    def collect(self, token, started):
        return self.pc.post(
            COLLECT, {'mfa_token': token, 'request_id': started['request_id'], 'collect_key': started['collect_key']},
            format='json',
        )

    def approve_on_phone(self, started, number=None):
        view = self.phone_client.get(request_url(started['request_id']))
        self.assertEqual(view.status_code, 200, view.data)
        return self.phone_client.post(
            request_url(started['request_id'], 'decide/'),
            {'decision': 'approve', 'number': started['number'] if number is None else number,
             'response': self.device.get(view.data['assertion'])},
            format='json',
        )


class MethodsAndStatusTests(PhoneApprovalHttpTestCase):
    def test_methods_include_phone_only_with_pairing_switch_and_webauthn(self):
        self.assertEqual(self.pc.post('/api/auth/token/', {'username': 'ann', 'password': PASSWORD},
                                      format='json').data['methods'], ['passkey', 'phone'])
        with self.settings(PHONE_APPROVAL_ENABLED=False):
            self.assertEqual(self.pc.post('/api/auth/token/', {'username': 'ann', 'password': PASSWORD},
                                          format='json').data['methods'], ['passkey'])
        with self.settings(WEBAUTHN_RP_ID='', WEBAUTHN_ORIGINS=[]):
            self.assertNotIn('phone', mfa.login_challenge(self.user)['methods'])

    def test_status_reports_phone_approval_flag_and_paired_phones(self):
        self.client.force_authenticate(self.user)
        data = self.client.get('/api/auth/mfa/status/').data
        self.assertTrue(data['phone_approval'])
        self.assertEqual([p['name'] for p in data['phones']], ['My phone'])
        with self.settings(PHONE_APPROVAL_ENABLED=False):
            off = self.client.get('/api/auth/mfa/status/').data
        self.assertNotIn('phone_approval', off)
        self.assertNotIn('phones', off)

    def test_switch_on_costs_exactly_one_extra_query_and_off_costs_none(self):
        with self.settings(PHONE_APPROVAL_ENABLED=False), CaptureQueriesContext(connection) as off:
            mfa.login_challenge(self.user)
        with CaptureQueriesContext(connection) as on:
            mfa.login_challenge(self.user)
        self.assertEqual(len(on), len(off) + 1)


class NoPairingTests(PhoneApprovalHttpTestCase):
    pair = False

    def test_payload_is_unchanged_without_a_pairing(self):
        data = self.pc.post('/api/auth/token/', {'username': 'ann', 'password': PASSWORD}, format='json').data
        self.assertEqual(set(data), {'mfa_required', 'mfa_token', 'methods'})
        self.assertEqual(data['methods'], ['passkey'])

    def test_request_without_a_paired_phone_is_refused(self):
        response = self.pc.post(REQUEST, {'mfa_token': self.mfa_token(), 'via': 'qr'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'no_phone')


class FlowTests(PhoneApprovalHttpTestCase):
    def test_full_flow_issues_tokens_only_after_approval(self):
        token, started = self.start()
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 0)
        pending = self.collect(token, started)
        self.assertEqual((pending.status_code, pending.data), (202, {'status': 'pending'}))
        self.assertEqual(self.approve_on_phone(started).status_code, 200)
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 0)

        done = self.collect(token, started)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertIn('access', done.data)
        self.assertIn('refresh_token', done.cookies)
        row = AuditLog.objects.filter(action='LOGIN_SUCCESS').order_by('-id').first()
        self.assertEqual(row.extra_data['auth_method'], 'phone')

        again = self.collect(token, started)
        self.assertEqual((again.status_code, again.data['code']), (409, 'request_used'))
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 1)

    def test_push_request_reports_delivery(self):
        with mock.patch('plugins.notifications.push_service.send_push_notification', return_value=(1, 0)):
            _, started = self.start(via='push')
        self.assertIn('pushed', started)

    def test_deny_ends_the_request_and_pc_sees_denied(self):
        token, started = self.start()
        denied = self.phone_client.post(request_url(started['request_id'], 'decide/'), {'decision': 'deny'},
                                        format='json')
        self.assertEqual(denied.status_code, 200)
        response = self.collect(token, started)
        self.assertEqual((response.status_code, response.data), (202, {'status': 'denied'}))

    def test_wrong_number_is_refused_audited_and_cancels(self):
        token, started = self.start()
        wrong = next(n for n in self.phone_client.get(request_url(started['request_id'])).data['options']
                     if n != started['number'])
        response = self.approve_on_phone(started, number=wrong)
        self.assertEqual((response.status_code, response.data['code']), (400, 'wrong_number'))
        self.assertTrue(AuditLog.objects.filter(action='MFA_PHONE_WRONG_NUMBER').exists())
        self.assertEqual(self.collect(token, started).data, {'status': 'denied'})

    def test_unknown_or_malformed_request_id_is_404_not_500(self):
        for bad in ('not-a-uuid', '00000000-0000-0000-0000-000000000000'):
            self.assertEqual(self.phone_client.get(request_url(bad)).status_code, 404)
            self.assertEqual(self.phone_client.post(request_url(bad, 'decide/'), {'decision': 'deny'},
                                                    format='json').status_code, 404)

    def test_expired_request_is_410(self):
        _, started = self.start()
        from datetime import timedelta
        from django.utils import timezone
        PhoneLoginRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.phone_client.get(request_url(started['request_id'])).status_code, 410)

    def test_request_needs_a_valid_mfa_token(self):
        response = self.pc.post(REQUEST, {'mfa_token': 'junk', 'via': 'qr'}, format='json')
        self.assertEqual((response.status_code, response.data['code']), (401, 'challenge_invalid'))


class SwitchAndMaintenanceTests(PhoneApprovalHttpTestCase):
    def test_switch_off_returns_404_on_every_phone_endpoint(self):
        token, started = self.start()
        view_url = request_url(started['request_id'])
        self.client.force_authenticate(self.user)
        with self.settings(PHONE_APPROVAL_ENABLED=False):
            calls = [
                self.pc.post(REQUEST, {'mfa_token': token, 'via': 'qr'}, format='json'),
                self.collect(token, started),
                self.phone_client.get(view_url),
                self.phone_client.post(view_url + 'decide/', {'decision': 'deny'}, format='json'),
                self.client.get(PHONES),
                self.client.post(PHONES, {'password': PASSWORD, 'credential_id': 1}, format='json'),
            ]
        self.assertEqual([c.status_code for c in calls], [404] * 6)

    def test_maintenance_blocks_request_decision_and_collect(self):
        token, started = self.start()
        approved_token, approved = self.start()
        self.assertEqual(self.approve_on_phone(approved).status_code, 200)
        patches = (
            mock.patch('apps.users.views.auth.is_maintenance_active', return_value=True),
            mock.patch('apps.users.views.auth.is_user_exempt', return_value=False),
        )
        with patches[0], patches[1]:
            self.assertEqual(self.pc.post(REQUEST, {'mfa_token': token, 'via': 'qr'}, format='json').status_code, 503)
            self.assertEqual(self.phone_client.post(request_url(started['request_id'], 'decide/'),
                                                    {'decision': 'deny'}, format='json').status_code, 503)
            self.assertEqual(self.collect(approved_token, approved).status_code, 503)
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 0)
        # An approved request that was refused during maintenance is not spent.
        self.assertEqual(self.collect(approved_token, approved).status_code, 200)


class PairingEndpointTests(PhoneApprovalHttpTestCase):
    pair = False

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_pairing_endpoints_need_step_up(self):
        no_password = self.client.post(PHONES, {'credential_id': self.credential_pk}, format='json')
        self.assertEqual((no_password.status_code, no_password.data['code']), (400, 'invalid_password'))
        paired = self.client.post(
            PHONES, {'password': PASSWORD, 'credential_id': self.credential_pk, 'name': 'P'}, format='json')
        self.assertEqual(paired.status_code, 201)
        pk = paired.data['id']
        self.assertEqual(self.client.patch(f'{PHONES}{pk}/', {'name': 'x'}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(f'{PHONES}{pk}/', {}, format='json').status_code, 400)
        self.assertTrue(PairedPhone.objects.filter(pk=pk).exists())

    def test_pair_rename_list_unpair_and_audit(self):
        paired = self.client.post(
            PHONES, {'password': PASSWORD, 'credential_id': self.credential_pk, 'name': 'P'}, format='json')
        pk = paired.data['id']
        self.assertEqual(self.client.get(PHONES).data[0]['name'], 'P')
        renamed = self.client.patch(f'{PHONES}{pk}/', {'password': PASSWORD, 'name': 'Work'}, format='json')
        self.assertEqual(renamed.data['name'], 'Work')
        removed = self.client.delete(f'{PHONES}{pk}/', {'password': PASSWORD}, format='json')
        self.assertEqual(removed.status_code, 204)
        self.assertTrue(WebAuthnCredential.objects.filter(pk=self.credential_pk).exists())
        for action in ('MFA_PHONE_PAIRED', 'MFA_PHONE_REMOVED'):
            self.assertTrue(AuditLog.objects.filter(action=action).exists(), action)

    def test_double_pairing_is_409(self):
        body = {'password': PASSWORD, 'credential_id': self.credential_pk}
        self.client.post(PHONES, body, format='json')
        self.assertEqual(self.client.post(PHONES, body, format='json').status_code, 409)

    def test_reset_all_factors_removes_pairings_and_live_requests(self):
        self.client.post(PHONES, {'password': PASSWORD, 'credential_id': self.credential_pk}, format='json')
        self.client.force_authenticate(None)
        self.start()
        mfa.reset_all_factors(self.user)
        self.assertFalse(PairedPhone.objects.exists())
        self.assertFalse(PhoneLoginRequest.objects.exists())
