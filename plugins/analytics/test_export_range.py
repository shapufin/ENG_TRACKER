"""The synchronous analytics export is bounded like the export jobs (audit 2026-11-17 M7)."""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

URL = '/api/plugins/analytics/metrics/export/'


class SyncExportRangeTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(User.objects.create_user('ax_staff', password='x', is_staff=True))

    def test_a_range_over_the_cap_is_refused(self):
        response = self.api.get(URL, {'export_format': 'csv', 'date_from': '2000-01-01',
                                      'date_to': '2100-12-31'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('400 days', response.json()['error'])

    def test_a_reversed_or_malformed_range_is_refused(self):
        for params in ({'date_from': '2026-05-01', 'date_to': '2026-04-01'},
                       {'date_from': 'x', 'date_to': '2026-04-01'}):
            response = self.api.get(URL, {'export_format': 'csv', **params})
            self.assertEqual(response.status_code, 400, params)

    def test_a_range_inside_the_cap_still_exports(self):
        response = self.api.get(URL, {'export_format': 'csv', 'date_from': '2026-01-01',
                                      'date_to': '2026-03-31'})
        self.assertEqual(response.status_code, 200)
