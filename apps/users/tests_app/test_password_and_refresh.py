"""SEC-10 password policy + token revocation, and the refresh-for-deleted-user 500."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

STRONG = 'Sturdy-Pass-7391'
WEAK = 'abc123'  # six characters: passed the old len >= 6 check


class RefreshTokenOfDeletedUserTests(APITestCase):
    def test_refresh_for_deleted_user_is_401_not_500(self):
        user = User.objects.create_user(username='gone_user', password=STRONG)
        refresh = str(RefreshToken.for_user(user))
        user.delete()
        resp = self.client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(resp.status_code, 401)

    def test_refresh_for_live_user_still_works(self):
        user = User.objects.create_user(username='live_user', password=STRONG)
        refresh = str(RefreshToken.for_user(user))
        resp = self.client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)


class AdminPasswordPolicyTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='pp_admin', password=STRONG, is_staff=True, is_superuser=True,
        )
        cls.target = User.objects.create_user(username='pp_target', password=STRONG)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_reset_password_rejects_weak_password_with_validator_messages(self):
        resp = self.client.post(
            f'/api/users/users/{self.target.id}/reset_password/',
            {'new_password': WEAK}, format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data.get('error'))
        self.assertIsInstance(resp.data.get('messages'), list)
        self.assertTrue(resp.data['messages'])
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password(STRONG))

    def test_reset_password_accepts_strong_password_and_revokes_refresh_tokens(self):
        old_refresh = str(RefreshToken.for_user(self.target))
        resp = self.client.post(
            f'/api/users/users/{self.target.id}/reset_password/',
            {'new_password': 'Another-Sturdy-4417'}, format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password('Another-Sturdy-4417'))
        self.client.force_authenticate(None)
        refreshed = self.client.post(
            '/api/auth/token/refresh/', {'refresh': old_refresh}, format='json',
        )
        self.assertEqual(refreshed.status_code, 401)

    def test_create_user_rejects_weak_password(self):
        resp = self.client.post(
            '/api/users/users/create_user/',
            {'username': 'pp_new', 'email': 'pp_new@example.com', 'password': WEAK},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data['messages'])
        self.assertFalse(User.objects.filter(username='pp_new').exists())

    def test_create_user_accepts_strong_password(self):
        resp = self.client.post(
            '/api/users/users/create_user/',
            {'username': 'pp_new2', 'email': 'pp_new2@example.com', 'password': STRONG},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
