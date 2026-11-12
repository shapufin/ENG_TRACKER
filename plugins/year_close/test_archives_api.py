"""Archives area API: per-year categories with retention dates, integrity check, leader history."""
import io
from datetime import date

from django.contrib.auth.models import User
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework import status
from rest_framework.test import APIClient

from plugins.tl_scorecard.models import EPRCycle, IdleFlag, ScorecardMonthSnapshot
from plugins.year_close.services.closer import close_year
from plugins.year_close.test_year_close import YearCloseFixture

BASE = '/api/plugins/year_close'


class ArchivesApiTests(YearCloseFixture):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.staff = User.objects.create_user(username='ar_staff', password='x', is_staff=True)
        self.superuser = User.objects.create_user(
            username='ar_super', password='x', is_staff=True, is_superuser=True)
        self.other_leader = User.objects.create_user(username='ar_other_tl', password='x')
        self.add_overtime(status='rejected')
        EPRCycle.objects.create(user=self.member, year=self.year)
        for leader in (self.tl, self.other_leader):
            for month in (3, 12):
                ScorecardMonthSnapshot.objects.create(
                    leader=leader, month=date(self.year, month, 1), member_ids=[],
                    payload={}, computed_at=timezone.now())
        IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=date(self.year, 5, 5))
        self.snapshot = close_year(self.year)
        self.assertEqual(self.snapshot.status, 'ready', self.snapshot.readiness)

    def test_only_a_superuser_reads_archives(self):
        self.client.force_authenticate(self.staff)
        for path in ('/archives/', '/archives/leaders/?year=%d' % self.year):
            self.assertEqual(self.client.get(BASE + path).status_code, status.HTTP_403_FORBIDDEN)

    def test_each_year_lists_categories_with_counts_and_removal_dates(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.get(f'{BASE}/archives/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        entry = next(row for row in response.data if row['year'] == self.year)
        categories = {c['key']: c for c in entry['categories']}
        self.assertEqual(categories['overtime']['count'], 1)
        self.assertEqual(categories['epr']['count'], 1)
        self.assertEqual(categories['scorecard']['count'], 4)
        self.assertEqual(categories['overtime']['retention_years'], 3)
        self.assertEqual(categories['overtime']['remove_on'], f'{self.year + 3}-12-31')
        self.assertEqual(categories['payroll']['retention_years'], 5)
        self.assertEqual(categories['payroll']['remove_on'], f'{self.year + 5}-12-31')
        self.assertEqual({f['kind'] for f in entry['files']}, {'team', 'company', 'manifest'})

    def test_verify_reports_ok_mismatch_and_missing(self):
        self.client.force_authenticate(self.superuser)
        row = self.snapshot.files.filter(kind='company').first()
        url = f'{BASE}/files/{row.pk}/verify/'
        self.assertEqual(self.client.post(url).data['result'], 'ok')
        path = self.root / row.relative_path
        path.write_bytes(path.read_bytes() + b'x')
        self.assertEqual(self.client.post(url).data['result'], 'mismatch')
        path.unlink()
        self.assertEqual(self.client.post(url).data['result'], 'missing')

    def test_leader_history_lists_current_leaders_with_counts(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.get(f'{BASE}/archives/leaders/?year={self.year}')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {r['username']: r for r in response.data}
        self.assertEqual(rows['yc_tl']['scorecard_months'], 2)
        self.assertEqual(rows['yc_tl']['leader_records'], 1)
        self.assertEqual(rows['ar_other_tl']['scorecard_months'], 2)

    def test_leader_export_contains_only_that_leader(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.get(
            f'{BASE}/archives/leaders/export/?year={self.year}&leader={self.tl.pk}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('spreadsheetml', response['Content-Type'])
        workbook = load_workbook(io.BytesIO(response.content))
        months = list(workbook['Scorecard months'].iter_rows(values_only=True))
        self.assertEqual(len(months) - 1, 2)
        self.assertTrue(all('yc_tl' in str(row[0]) for row in months[1:]))
