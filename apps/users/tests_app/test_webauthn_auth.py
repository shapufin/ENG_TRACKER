"""HTTP tests for passkey management (signed in) and sign-in. Spec sections 3 and 5."""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.reports.models import AuditLog
from apps.users.models import WebAuthnCredential
from apps.users.services import mfa
from apps.users.tests_app.webauthn_helpers import FakeAuthenticator

User = get_user_model()
PASSWORD = 'pw-Strong-123'
BASE = '/api/auth/mfa/passkeys/'


class PasskeyApiTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('ann', 'ann@example.com', PASSWORD)
        self.device = FakeAuthenticator(settings.WEBAUTHN_RP_ID, settings.WEBAUTHN_ORIGINS[0])
        self.client.force_authenticate(self.user)

    def options(self, password=PASSWORD):
        return self.client.post(f'{BASE}options/', {'password': password}, format='json')

    def add_passkey(self, name='Phone', device=None):
        device = device or self.device
        options = self.options().data
        return self.client.post(
            f'{BASE}register/', {'response': device.create(options), 'name': name}, format='json',
        )


class PasskeyManagementTests(PasskeyApiTestCase):
    def test_register_options_require_the_password(self):
        response = self.options(password='wrong')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'invalid_password')

    def test_register_then_list_without_leaking_key_material(self):
        response = self.add_passkey(name='Work phone')
        self.assertEqual(response.status_code, 201)
        listing = self.client.get(BASE)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([p['name'] for p in listing.data], ['Work phone'])
        self.assertEqual(set(listing.data[0]), {'id', 'name', 'created_at', 'last_used_at'})
        self.assertEqual(mfa.status_for(self.user)['passkeys'][0]['name'], 'Work phone')

    def test_registering_is_audited(self):
        self.add_passkey()
        self.assertTrue(AuditLog.objects.filter(action='MFA_PASSKEY_ADDED').exists())

    def test_registration_with_a_bad_payload_is_a_400(self):
        self.options()
        response = self.client.post(f'{BASE}register/', {'response': {'nope': 1}, 'name': 'x'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(WebAuthnCredential.objects.exists())

    def test_duplicate_registration_returns_409(self):
        self.add_passkey()
        response = self.add_passkey()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'credential_exists')

    def test_passkeys_unavailable_returns_503(self):
        with override_settings(WEBAUTHN_RP_ID='', WEBAUTHN_ORIGINS=[]):
            self.assertEqual(self.options().status_code, 503)

    def test_rename_needs_the_password_and_renames(self):
        credential_id = self.add_passkey().data['id']
        url = f'{BASE}{credential_id}/'
        refused = self.client.patch(url, {'name': 'New', 'password': 'wrong'}, format='json')
        self.assertEqual(refused.status_code, 400)
        done = self.client.patch(url, {'name': 'New', 'password': PASSWORD}, format='json')
        self.assertEqual(done.status_code, 200)
        self.assertEqual(done.data['name'], 'New')

    def test_delete_needs_the_password_and_is_audited(self):
        credential_id = self.add_passkey().data['id']
        url = f'{BASE}{credential_id}/'
        self.assertEqual(self.client.delete(url, {'password': 'wrong'}, format='json').status_code, 400)
        self.assertTrue(WebAuthnCredential.objects.filter(pk=credential_id).exists())
        self.assertEqual(self.client.delete(url, {'password': PASSWORD}, format='json').status_code, 204)
        self.assertFalse(WebAuthnCredential.objects.filter(pk=credential_id).exists())
        self.assertTrue(AuditLog.objects.filter(action='MFA_PASSKEY_REMOVED').exists())

    def test_delete_with_totp_on_also_needs_a_code(self):
        credential_id = self.add_passkey().data['id']
        setup = mfa.begin_setup(self.user)
        mfa.activate(self.user, mfa.code_at(setup['secret'], mfa.current_step()))
        response = self.client.delete(f'{BASE}{credential_id}/', {'password': PASSWORD}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(WebAuthnCredential.objects.filter(pk=credential_id).exists())

    def test_cannot_touch_another_users_passkey(self):
        other = User.objects.create_user('bob', 'bob@example.com', PASSWORD)
        theirs = WebAuthnCredential.objects.create(
            user=other, credential_id=b'bob-1', public_key=b'pk', sign_count=0, name='Bob phone',
        )
        url = f'{BASE}{theirs.pk}/'
        self.assertEqual(self.client.patch(url, {'name': 'x', 'password': PASSWORD}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(url, {'password': PASSWORD}, format='json').status_code, 404)
        self.assertTrue(WebAuthnCredential.objects.filter(pk=theirs.pk).exists())
        self.assertEqual(self.client.get(BASE).data, [])

    def test_removing_the_last_factor_of_a_required_user_is_a_409(self):
        self.user.profile.mfa_required = True
        self.user.profile.save()
        credential_id = self.add_passkey().data['id']
        response = self.client.delete(f'{BASE}{credential_id}/', {'password': PASSWORD}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'last_factor')

    def test_endpoints_require_authentication(self):
        self.client.force_authenticate(None)
        for method, url in (('post', f'{BASE}options/'), ('post', f'{BASE}register/'),
                            ('get', BASE), ('patch', f'{BASE}1/'), ('delete', f'{BASE}1/')):
            self.assertEqual(getattr(self.client, method)(url, {}, format='json').status_code, 401, url)
