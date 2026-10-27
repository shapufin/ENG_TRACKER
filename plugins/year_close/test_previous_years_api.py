"""Previous-years API: superuser-only, single-use signed downloads (plan Y4)."""
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plugins.year_close.models import YearSnapshot
from plugins.year_close.services.closer import close_year
from plugins.year_close.test_year_close import YearCloseFixture

LIST_URL = '/api/plugins/year_close/snapshots/'


class PreviousYearsApiTests(YearCloseFixture):
    def setUp(self):
        super().setUp()
        # The fixture is a plain TestCase, so swap in the DRF client for auth.
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username='py_staff', password='x', is_staff=True,
        )
        self.superuser = User.objects.create_user(
            username='py_super', password='x', is_staff=True, is_superuser=True,
        )
        self.add_overtime(status='rejected')
        self.snapshot = close_year(self.year)
        self.assertEqual(self.snapshot.status, 'ready', self.snapshot.readiness)

    def test_staff_cannot_read_closed_years(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_superuser_lists_snapshots(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(rows[0]['year'], self.year)
        self.assertEqual(rows[0]['status'], 'ready')
        self.assertEqual(rows[0]['file_count'], self.snapshot.files.count())

    def test_files_are_listed_per_snapshot(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.get(f'{LIST_URL}{self.snapshot.pk}/files/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kinds = {row['kind'] for row in response.data}
        self.assertIn('company', kinds)
        self.assertIn('team', kinds)

    def test_a_signed_link_downloads_the_file_exactly_once(self):
        self.client.force_authenticate(self.superuser)
        row = self.snapshot.files.filter(kind='company').first()

        link = self.client.post(f'/api/plugins/year_close/files/{row.pk}/download-link/')
        self.assertEqual(link.status_code, status.HTTP_200_OK, link.data)
        url = link.data['url']

        first = self.client.get(url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertIn('application/zip', first['Content-Type'])

        second = self.client.get(url)
        self.assertEqual(second.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_forged_token_is_refused(self):
        row = self.snapshot.files.filter(kind='company').first()
        path = reverse('year_close-file-download', kwargs={'pk': row.pk})
        response = self.client.get(f'{path}?token=not-a-real-token')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_token_for_another_file_is_refused(self):
        self.client.force_authenticate(self.superuser)
        first = self.snapshot.files.filter(kind='company').first()
        other = self.snapshot.files.exclude(pk=first.pk).first()
        link = self.client.post(f'/api/plugins/year_close/files/{first.pk}/download-link/')
        url = link.data['url'].replace(f'/files/{first.pk}/', f'/files/{other.pk}/')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_token_from_a_deactivated_user_is_refused_and_not_burned(self):
        """The token binds the user, so a user who lost access must not download —
        and a refused request must not consume the single-use nonce."""
        self.client.force_authenticate(self.superuser)
        row = self.snapshot.files.filter(kind='company').first()
        url = self.client.post(f'/api/plugins/year_close/files/{row.pk}/download-link/').data['url']

        User.objects.filter(pk=self.superuser.pk).update(is_active=False)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        row.refresh_from_db()
        self.assertNotEqual(row.download_nonce, '', 'a refused request must not burn the link')
        # A second attempt by a re-activated user still works.
        User.objects.filter(pk=self.superuser.pk).update(is_active=True)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_a_failed_file_cannot_be_linked(self):
        self.client.force_authenticate(self.superuser)
        row = self.snapshot.files.filter(kind='company').first()
        row.status = 'failed'
        row.save(update_fields=['status'])
        response = self.client.post(f'/api/plugins/year_close/files/{row.pk}/download-link/')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_the_plugin_being_disabled_refuses_the_api(self):
        from apps.plugins.models import Plugin

        # Tests have no synced Plugin rows, so create the disabled one explicitly.
        Plugin.objects.update_or_create(
            name='year_close',
            defaults={'verbose_name': 'Year Close', 'version': '1.0.0', 'is_enabled': False},
        )
        self.client.force_authenticate(self.superuser)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_downloads_are_audited(self):
        from apps.reports.models import AuditLog

        self.client.force_authenticate(self.superuser)
        row = self.snapshot.files.filter(kind='company').first()
        url = self.client.post(f'/api/plugins/year_close/files/{row.pk}/download-link/').data['url']
        self.client.get(url)
        entry = AuditLog.objects.filter(
            model_name='closedyear', extra_data__operation='year_snapshot_download',
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.object_id, str(self.year))

    def test_the_snapshot_queryset_is_read_only(self):
        self.client.force_authenticate(self.superuser)
        response = self.client.delete(f'{LIST_URL}{self.snapshot.pk}/')
        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED),
        )
        self.assertTrue(YearSnapshot.objects.filter(pk=self.snapshot.pk).exists())
