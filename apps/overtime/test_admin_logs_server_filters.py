"""Admin Hours Logs pages page, search and count on the server so they stay fast
with years of records for hundreds of employees."""
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog

URLS = ('/api/overtime/logs/admin_logs/', '/api/standby/logs/admin_logs/')


def _make(kind, user, day, status, **extra):
    if kind == 'overtime':
        extra.setdefault('client', Client.objects.get_or_create(name='ASF', code='ASF')[0])
        return OvertimeLog.objects.create(user=user, date=day, hours=2, status=status, **extra)
    return StandbyLog.objects.create(user=user, date=day, hours=8, status=status, **extra)


class AdminLogsServerFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='asf_admin', password='x')
        cls.anna = User.objects.create_user(username='asf_a', password='x', first_name='Anna', last_name='Zogaj')
        cls.ben = User.objects.create_user(username='asf_b', password='x', first_name='Ben', last_name='Hoxha')
        for kind in ('overtime', 'standby'):
            _make(kind, cls.anna, date(2026, 9, 1), 'pending', description='alpha')
            _make(kind, cls.anna, date(2026, 9, 20), 'approved')
            _make(kind, cls.ben, date(2026, 10, 5), 'rejected')
            for i in range(60):
                _make(kind, cls.ben, date(2025, 1, 1), 'approved')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_pages_newest_first_with_page_size(self):
        for url in URLS:
            r = self.client.get(url, {'page_size': 10})
            self.assertEqual(len(r.data['results']), 10)
            self.assertEqual(r.data['count'], 63)
            self.assertEqual(r.data['results'][0]['date'], '2026-10-05')

    def test_search_matches_full_name_and_description(self):
        for url in URLS:
            self.assertEqual(self.client.get(url, {'search': 'Anna Zogaj'}).data['count'], 2)
            self.assertEqual(self.client.get(url, {'search': 'alpha'}).data['count'], 1)

    def test_date_range(self):
        for url in URLS:
            r = self.client.get(url, {'date_from': '2026-09-01', 'date_to': '2026-09-30'})
            self.assertEqual(r.data['count'], 2)

    def test_status_counts_ignore_the_status_filter_but_respect_the_rest(self):
        for url in URLS:
            r = self.client.get(url, {'status': 'pending', 'search': 'Anna'})
            self.assertEqual(r.data['count'], 1)
            self.assertEqual(
                r.data['status_counts'],
                {'total': 2, 'pending': 1, 'approved': 1, 'rejected': 0},
            )
