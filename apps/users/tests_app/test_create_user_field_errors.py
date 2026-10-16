from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()
STRONG = 'Zx9!kLmQ4#vTe7'
URL = '/api/users/users/create_user/'


class TestCreateUserFieldErrors(APITestCase):
    """create_user keys every validation failure by field so the form can show
    it inline; the legacy `error` message stays for existing callers."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='fe-admin', password='testpass123', email='fe-admin@example.com'
        )
        User.objects.create_user(username='taken', email='taken@example.com', password='x')
        self.client.force_authenticate(user=self.admin)

    def _post(self, **over):
        data = {'username': 'fresh', 'email': 'fresh@example.com', 'password': STRONG, **over}
        return self.client.post(URL, data, format='json')

    def test_duplicate_username_is_keyed_to_username(self):
        resp = self._post(username='taken')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('already exists', resp.data['username'][0])
        self.assertIn('already exists', resp.data['error'])

    def test_duplicate_email_is_keyed_to_email(self):
        resp = self._post(email='taken@example.com')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('email', resp.data)

    def test_invalid_email_is_keyed_to_email(self):
        resp = self._post(email='not-an-email')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['email'], ['Invalid email address.'])

    def test_short_username_is_keyed_to_username(self):
        resp = self._post(username='ab')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('username', resp.data)

    def test_weak_password_is_keyed_to_password(self):
        resp = self._post(password='12345678')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(resp.data['password'])
        self.assertTrue(resp.data['messages'])

    def test_missing_fields_are_each_keyed(self):
        resp = self.client.post(URL, {}, format='json')
        self.assertEqual(resp.status_code, 400)
        for field in ('username', 'email', 'password'):
            self.assertIn(field, resp.data)
        self.assertIn('Missing required fields', resp.data['error'])

    def test_valid_payload_still_creates(self):
        self.assertEqual(self._post().status_code, 201)
