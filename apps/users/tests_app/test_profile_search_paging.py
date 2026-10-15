from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()


class TestProfileSearchAndPaging(APITestCase):
    """Admin Users search and paging run on the server over the whole set, so a
    person beyond the first page is still reachable."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='sp-admin', password='testpass123', email='sp-admin@example.com'
        )
        for i in range(60):
            User.objects.create_user(
                username=f'sp-user{i:02d}', password='testpass123',
                first_name=f'First{i:02d}', last_name='Tester',
            )
        self.client.force_authenticate(user=self.admin)

    def _usernames(self, response):
        return [p['user']['username'] for p in response.data['results']]

    def test_explicit_page_size_pages_the_full_count(self):
        response = self.client.get('/api/users/profiles/', {'page_size': 50})
        self.assertEqual(len(response.data['results']), 50)
        self.assertEqual(response.data['count'], 61)
        page2 = self.client.get('/api/users/profiles/', {'page_size': 50, 'page': 2})
        self.assertEqual(len(page2.data['results']), 11)

    def test_search_finds_user_beyond_first_page(self):
        # sp-user00 has the lowest id, so it sits on page 2 of -id ordering.
        first_page = self._usernames(self.client.get('/api/users/profiles/', {'page_size': 50}))
        self.assertNotIn('sp-user00', first_page)
        response = self.client.get('/api/users/profiles/', {'search': 'sp-user00'})
        self.assertEqual(self._usernames(response), ['sp-user00'])

    def test_search_matches_first_and_last_name(self):
        by_first = self.client.get('/api/users/profiles/', {'search': 'First07'})
        self.assertEqual(self._usernames(by_first), ['sp-user07'])
        by_last = self.client.get('/api/users/profiles/', {'search': 'Tester', 'page_size': 100})
        self.assertEqual(by_last.data['count'], 60)

    def test_page_size_param_is_capped(self):
        response = self.client.get('/api/users/profiles/', {'page_size': 5000})
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(response.data['results']), 200)
