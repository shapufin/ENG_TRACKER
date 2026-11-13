import time
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


class SessionTimeoutTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='timeout_user', password='TestPassword123!', email='timeout@example.com'
        )

    def test_login_sets_refresh_cookie_max_age_and_session_exp(self):
        resp = self.client.post(
            '/api/auth/token/',
            {'username': 'timeout_user', 'password': 'TestPassword123!'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(cookie)
        # Cookie max-age must be set (not a session-only cookie that lives forever)
        self.assertTrue(bool(cookie.get('max-age')))
        expected_idle = int(getattr(settings, 'SESSION_IDLE_TIMEOUT', timedelta(hours=4)).total_seconds())
        self.assertAlmostEqual(int(cookie['max-age']), expected_idle, delta=10)

    def test_refresh_preserves_session_exp_and_caps_remaining(self):
        resp = self.client.post(
            '/api/auth/token/',
            {'username': 'timeout_user', 'password': 'TestPassword123!'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        refresh_cookie = resp.cookies['refresh_token'].value
        initial_token = RefreshToken(refresh_cookie)
        session_exp = initial_token.payload.get('session_exp')
        self.assertIsNotNone(session_exp)

        # Refresh with the cookie
        refresh_resp = self.client.post('/api/auth/token/refresh/', {}, format='json')
        self.assertEqual(refresh_resp.status_code, status.HTTP_200_OK)
        new_cookie = refresh_resp.cookies.get('refresh_token')
        self.assertIsNotNone(new_cookie)
        new_token = RefreshToken(new_cookie.value)
        self.assertEqual(new_token.payload.get('session_exp'), session_exp)

    def test_refresh_rejected_when_absolute_session_timeout_exceeded(self):
        refresh = RefreshToken.for_user(self.user)
        # Force session_exp to have expired in the past
        refresh.payload['session_exp'] = int(time.time()) - 10
        self.client.cookies['refresh_token'] = str(refresh)

        resp = self.client.post('/api/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(resp.data.get('code'), 'session_expired')

    def test_refresh_fails_closed_when_session_check_errors(self):
        from unittest import mock

        refresh = RefreshToken.for_user(self.user)
        self.client.cookies['refresh_token'] = str(refresh)
        with mock.patch(
            'apps.users.views.auth.RefreshToken', side_effect=RuntimeError('boom')
        ):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/auth/token/refresh/', {}, format='json')

    def test_rotated_token_exp_capped_at_session_exp(self):
        refresh = RefreshToken.for_user(self.user)
        now = int(time.time())
        # Set absolute session expiration 1 hour from now (less than 4h idle timeout)
        refresh.payload['session_exp'] = now + 3600
        self.client.cookies['refresh_token'] = str(refresh)

        resp = self.client.post('/api/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        new_cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(new_cookie)
        new_token = RefreshToken(new_cookie.value)
        # Token exp must not exceed session_exp
        self.assertLessEqual(new_token.payload['exp'], refresh.payload['session_exp'])
        # Cookie max-age must be bounded by remaining session time (~3600s)
        self.assertAlmostEqual(int(new_cookie['max-age']), 3600, delta=10)
