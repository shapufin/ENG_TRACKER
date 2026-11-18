"""HTTP tests for passkey sign-in and forced enrolment. Spec sections 3 and 5."""
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.reports.models import AuditLog
from apps.users.models import WebAuthnCredential
from apps.users.services import mfa
from apps.users.tests_app.webauthn_helpers import FakeAuthenticator

User = get_user_model()
PASSWORD = 'pw-Strong-123'
BASE = '/api/auth/mfa/passkeys/'


def password_login(client, username='ann'):
    return client.post('/api/auth/token/', {'username': username, 'password': PASSWORD}, format='json')


class PasskeyLoginTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('ann', 'ann@example.com', PASSWORD)
        self.device = FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0])
        self.client.force_authenticate(self.user)
        options = self.client.post(f'{BASE}options/', {'password': PASSWORD}, format='json').data
        self.client.post(
            f'{BASE}register/', {'response': self.device.create(options), 'name': 'Phone'}, format='json',
        )
        self.client.force_authenticate(None)

    def challenge(self):
        response = password_login(self.client)
        self.assertEqual(response.status_code, 200)
        return response.data

    def passkey_options(self, token):
        return self.client.post('/api/auth/token/passkey-options/', {'mfa_token': token}, format='json')

    def passkey_verify(self, token, response):
        return self.client.post(
            '/api/auth/token/passkey-verify/', {'mfa_token': token, 'response': response}, format='json',
        )

    def test_password_step_returns_a_challenge_and_no_tokens(self):
        data = self.challenge()
        self.assertTrue(data['mfa_required'])
        self.assertEqual(data['methods'], ['passkey'])
        self.assertNotIn('access', data)
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 0)

    def test_passkey_login_issues_tokens_after_the_password_step(self):
        token = self.challenge()['mfa_token']
        options = self.passkey_options(token)
        self.assertEqual(options.status_code, 200)
        response = self.passkey_verify(token, self.device.get(options.data))
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['username'], 'ann')
        self.assertIn('refresh_token', response.cookies)
        row = AuditLog.objects.filter(action='LOGIN_SUCCESS').order_by('-id').first()
        self.assertEqual(row.extra_data['auth_method'], 'passkey')

    def test_failed_assertion_issues_no_token_and_is_audited(self):
        token = self.challenge()['mfa_token']
        options = self.passkey_options(token).data
        response = self.passkey_verify(token, self.device.get(options, origin='https://evil.example'))
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('access', response.data)
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 0)
        self.assertTrue(AuditLog.objects.filter(action='MFA_FAILED').exists())

    def test_lockout_returns_429_and_logs_mfa_locked(self):
        token = self.challenge()['mfa_token']
        for _ in range(mfa.MAX_FAILURES):
            options = self.passkey_options(token).data
            response = self.passkey_verify(token, self.device.get(options, origin='https://evil.example'))
        self.assertEqual(response.status_code, 429)
        self.assertTrue(AuditLog.objects.filter(action='MFA_LOCKED').exists())

    def test_replayed_assertion_is_refused(self):
        token = self.challenge()['mfa_token']
        assertion = self.device.get(self.passkey_options(token).data)
        self.assertEqual(self.passkey_verify(token, assertion).status_code, 200)
        self.assertEqual(self.passkey_verify(token, assertion).status_code, 401)

    def test_garbage_and_wrong_purpose_tokens_are_401(self):
        self.assertEqual(self.passkey_options('x').status_code, 401)
        self.assertEqual(self.passkey_verify('x', {}).status_code, 401)
        setup_token = mfa.make_challenge(self.user, mfa.PURPOSE_SETUP)
        self.assertEqual(self.passkey_options(setup_token).status_code, 401)

    def test_a_pending_challenge_dies_when_the_password_changes(self):
        token = self.challenge()['mfa_token']
        self.user.set_password('another-pw-456')
        self.user.save()
        self.assertEqual(self.passkey_options(token).status_code, 401)

    def test_maintenance_refuses_a_non_exempt_user_before_any_check(self):
        token = self.challenge()['mfa_token']
        with mock.patch('apps.users.views.auth.is_maintenance_active', return_value=True), \
                mock.patch('apps.users.views.auth.is_user_exempt', return_value=False):
            self.assertEqual(self.passkey_options(token).status_code, 503)

    def test_totp_login_still_works_for_a_user_with_a_passkey(self):
        setup = mfa.begin_setup(self.user)
        mfa.activate(self.user, mfa.code_at(setup['secret'], mfa.current_step()))
        data = self.challenge()
        self.assertEqual(data['methods'], ['passkey', 'totp'])
        response = self.client.post('/api/auth/token/mfa-verify/', {
            'mfa_token': data['mfa_token'], 'code': mfa.code_at(setup['secret'], mfa.current_step() + 1),
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)

    def test_passkey_login_query_budget(self):
        token = self.challenge()['mfa_token']
        assertion = self.device.get(self.passkey_options(token).data)
        with CaptureQueriesContext(connection) as ctx:
            self.assertEqual(self.passkey_verify(token, assertion).status_code, 200)
        self.assertLessEqual(len(ctx), 45, [q['sql'][:80] for q in ctx])


class PasskeyForcedSetupTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('newbie', 'n@example.com', PASSWORD)
        self.user.profile.mfa_required = True
        self.user.profile.save()
        self.device = FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0])

    def setup_options(self, token):
        return self.client.post('/api/auth/mfa/login/passkey-options/', {'mfa_token': token}, format='json')

    def test_required_user_can_enrol_a_passkey_at_sign_in_and_is_signed_in(self):
        data = password_login(self.client, 'newbie').data
        self.assertTrue(data['mfa_setup_required'])
        self.assertEqual(data['methods'], ['passkey', 'totp'])
        options = self.setup_options(data['mfa_token'])
        self.assertEqual(options.status_code, 200)
        response = self.client.post('/api/auth/mfa/login/passkey-register/', {
            'mfa_token': data['mfa_token'], 'response': self.device.create(options.data), 'name': 'Phone',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertEqual(WebAuthnCredential.objects.filter(user=self.user).count(), 1)

    def test_a_verify_purpose_token_cannot_enrol_at_sign_in(self):
        token = mfa.make_challenge(self.user, mfa.PURPOSE_VERIFY)
        self.assertEqual(self.setup_options(token).status_code, 401)

    def test_a_failed_enrolment_signs_nobody_in(self):
        data = password_login(self.client, 'newbie').data
        options = self.setup_options(data['mfa_token']).data
        response = self.client.post('/api/auth/mfa/login/passkey-register/', {
            'mfa_token': data['mfa_token'],
            'response': self.device.create(options, origin='https://evil.example'), 'name': 'x',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('access', response.data)
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 0)
