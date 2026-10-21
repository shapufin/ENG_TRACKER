"""The admin Hours Logs CSV export honours the page's search box, which matches
the employee's full name as well as the username."""
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog


class HoursExportSearchTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='hes_admin', password='x')
        cls.anna = User.objects.create_user(username='hes_a', password='x', first_name='Anna', last_name='Zogaj')
        cls.ben = User.objects.create_user(username='hes_b', password='x', first_name='Ben', last_name='Hoxha')
        client = Client.objects.create(name='HES Client', code='HES')
        for user in (cls.anna, cls.ben):
            OvertimeLog.objects.create(user=user, client=client, date=date(2026, 9, 14), hours=2)
            StandbyLog.objects.create(user=user, date=date(2026, 9, 14), hours=8)

    def _export(self, url):
        self.client.force_authenticate(self.admin)
        response = self.client.get(url, {'search': 'Zogaj', 'ignore_date_filter': 'true'})
        self.assertEqual(response.status_code, 200)
        return b''.join(response.streaming_content).decode('utf-8-sig')

    def test_overtime_export_matches_full_name(self):
        rows = self._export('/api/overtime/logs/export/').strip().splitlines()
        self.assertEqual(len(rows), 2, rows)  # header + Anna only
        self.assertIn('hes_a', rows[1])

    def test_standby_export_matches_full_name(self):
        rows = self._export('/api/standby/logs/export/').strip().splitlines()
        self.assertEqual(len(rows), 2, rows)
        self.assertIn('Anna Zogaj', rows[1])
