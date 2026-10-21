from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.test import APITestCase

from apps.users.models import UserProfile

User = get_user_model()
STRONG = 'Zx9!kLmQ4#vTe7'
CREATE_URL = '/api/users/users/create_user/'


def make_user(name, code=None):
    user = User.objects.create_user(username=name, email=f'{name}@example.com', password='x')
    if code is not None:
        user.profile.code = code
        user.profile.save()
    return user


class EmployeeCodeModelTests(APITestCase):
    def test_code_is_trimmed_and_blank_becomes_null(self):
        user = make_user('model-a', '  EMP001  ')
        user.profile.refresh_from_db()
        self.assertEqual(user.profile.code, 'EMP001')
        user.profile.code = '   '
        user.profile.save()
        user.profile.refresh_from_db()
        self.assertIsNone(user.profile.code)

    def test_many_profiles_may_have_no_code(self):
        make_user('model-b')
        make_user('model-c')
        self.assertEqual(UserProfile.objects.filter(code__isnull=True).count(), 2)

    def test_code_is_unique_ignoring_case(self):
        make_user('model-d', 'EMP001')
        other = make_user('model-e')
        other.profile.code = 'emp001'
        with self.assertRaises(IntegrityError), transaction.atomic():
            other.profile.save()


class EmployeeCodeApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='code-admin', password='testpass123', email='code-admin@example.com'
        )
        self.client.force_authenticate(user=self.admin)

    def _create(self, **over):
        data = {'username': 'fresh', 'email': 'fresh@example.com', 'password': STRONG, **over}
        return self.client.post(CREATE_URL, data, format='json')

    def test_create_user_saves_code(self):
        self.assertEqual(self._create(code=' EMP100 ').status_code, 201)
        self.assertEqual(User.objects.get(username='fresh').profile.code, 'EMP100')

    def test_create_user_without_code_leaves_null(self):
        self.assertEqual(self._create(code='').status_code, 201)
        self.assertIsNone(User.objects.get(username='fresh').profile.code)

    def test_create_user_rejects_duplicate_code_keyed_to_code(self):
        make_user('holder', 'EMP100')
        resp = self._create(code='emp100')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('already', resp.data['code'][0])
        self.assertFalse(User.objects.filter(username='fresh').exists())

    def test_update_user_sets_and_clears_code(self):
        user = make_user('editme')
        url = f'/api/users/users/{user.pk}/update_user/'
        self.assertEqual(self.client.patch(url, {'code': 'EMP7'}, format='json').status_code, 200)
        user.profile.refresh_from_db()
        self.assertEqual(user.profile.code, 'EMP7')
        self.assertEqual(self.client.patch(url, {'code': ''}, format='json').status_code, 200)
        user.profile.refresh_from_db()
        self.assertIsNone(user.profile.code)

    def test_update_user_keeping_own_code_is_not_a_duplicate(self):
        user = make_user('keeper', 'EMP8')
        url = f'/api/users/users/{user.pk}/update_user/'
        self.assertEqual(self.client.patch(url, {'code': 'EMP8'}, format='json').status_code, 200)

    def test_update_user_rejects_code_of_another_user(self):
        make_user('holder2', 'EMP9')
        user = make_user('other2')
        url = f'/api/users/users/{user.pk}/update_user/'
        resp = self.client.patch(url, {'code': 'emp9'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('code', resp.data)
        user.profile.refresh_from_db()
        self.assertIsNone(user.profile.code)

    def test_profile_list_exposes_and_searches_code(self):
        make_user('findme', 'ZX-4242')
        resp = self.client.get('/api/users/profiles/', {'search': 'zx-42'})
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertEqual([r['code'] for r in rows], ['ZX-4242'])

    def test_user_list_search_matches_code(self):
        make_user('findme2', 'ZX-9999')
        resp = self.client.get('/api/users/users/', {'search': 'ZX-9999'})
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertEqual([r['username'] for r in rows], ['findme2'])
