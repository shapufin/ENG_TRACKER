"""Self-service password change: POST /api/auth/password/change/."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.tests_app.test_mfa_service import enrol

URL = '/api/auth/password/change/'
OLD = 'Sturdy-Pass-7391'
NEW = 'Another-Sturdy-4417'


class ChangePasswordTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='cp_user', email='cp@example.com', password=OLD)
        self.client.force_authenticate(self.user)

    def _post(self, **body):
        return self.client.post(URL, body, format='json')

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self._post(current_password=OLD, new_password=NEW).status_code, 401)

    def test_changes_password_and_keeps_this_session_alive(self):
        old_refresh = str(RefreshToken.for_user(self.user))
        resp = self._post(current_password=OLD, new_password=NEW)
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW))
        # A fresh access token and refresh cookie replace the revoked ones.
        self.assertIn('access', resp.data)
        self.assertIn('refresh_token', resp.cookies)
        self.client.force_authenticate(None)
        stale = self.client.post('/api/auth/token/refresh/', {'refresh': old_refresh}, format='json')
        self.assertEqual(stale.status_code, 401)
        fresh = self.client.post(
            '/api/auth/token/refresh/', {'refresh': resp.cookies['refresh_token'].value}, format='json',
        )
        self.assertEqual(fresh.status_code, 200)

    def test_wrong_current_password_is_rejected(self):
        resp = self._post(current_password='Not-My-Password-1', new_password=NEW)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'invalid_password')
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(OLD))

    def test_weak_new_password_returns_policy_messages(self):
        resp = self._post(current_password=OLD, new_password='abc123')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data['messages'])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(OLD))

    def test_new_password_must_differ(self):
        resp = self._post(current_password=OLD, new_password=OLD)
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data['messages'])

    def test_missing_fields_are_400_not_500(self):
        self.assertEqual(self._post(current_password=OLD).status_code, 400)
        self.assertEqual(self._post(new_password=NEW).status_code, 400)

    def test_enrolled_user_must_also_prove_a_second_factor(self):
        _, codes = enrol(self.user)
        no_code = self._post(current_password=OLD, new_password=NEW)
        self.assertEqual(no_code.status_code, 400)
        self.assertEqual(no_code.data['code'], 'invalid_code')
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(OLD))
        ok = self._post(current_password=OLD, new_password=NEW, code=codes[0])
        self.assertEqual(ok.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW))
