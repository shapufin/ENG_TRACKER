"""Requesting, polling and downloading onboarding exports through the API (plan A4)."""
import io
import tempfile
import zipfile
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.signals import request_finished
from django.db import close_old_connections
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.overtime.models.core import Client

from .export_viewsets import ClientExportViewSet
from .models import ClientExport, Document
from .services import exporter
from .viewsets import OnboardingClientViewSet

BASE = '/api/plugins/onboarding'


class ExportApiTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters otherwise leak between tests
        call_command('seed_plugin_permissions')
        media, exports = tempfile.TemporaryDirectory(), tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        self.addCleanup(exports.cleanup)
        override = override_settings(
            MEDIA_ROOT=media.name, EXPORT_ROOT=exports.name,
            EXPORT_JOBS_INLINE=True, USE_X_ACCEL_REDIRECT=False,
        )
        override.enable()
        self.addCleanup(override.disable)

        self.admin = User.objects.create_superuser(username='xa_admin', password='x')
        self.staff = User.objects.create_user(username='xa_staff', password='x', is_staff=True)
        self.member = User.objects.create_user(username='xa_member', password='x')
        self.other = User.objects.create_user(username='xa_other', password='x')
        self.outsider = User.objects.create_user(username='xa_outsider', password='x')

        self.acme = Client.objects.create(name='Acme', code='ACME')
        self.globex = Client.objects.create(name='Globex', code='GLBX')
        self.member.profile.clients.add(self.acme)
        self.other.profile.clients.add(self.globex)
        Document.objects.create(
            client=self.acme, name='a.pdf', size_bytes=9, uploaded_by=self.admin,
            file=SimpleUploadedFile('a.pdf', b'acme-data', content_type='application/pdf'),
        )

    def _post_export(self, user, client):
        self.client.force_authenticate(user)
        return self.client.post(f'{BASE}/clients/{client.pk}/exports/')

    def _ready_export(self, user=None, client=None):
        return exporter.request_export(user or self.member, 'client', client or self.acme)


class CreateExportTests(ExportApiTestCase):
    def test_a_member_exports_an_assigned_client(self):
        response = self._post_export(self.member, self.acme)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'ready')
        self.assertEqual(response.data['documents'], 1)
        self.assertEqual(response.data['client_code'], 'ACME')

    def test_a_user_cannot_export_a_client_they_are_not_assigned_to(self):
        for user in (self.outsider, self.other):
            self.assertEqual(self._post_export(user, self.acme).status_code, 403, user.username)
        self.assertFalse(ClientExport.objects.exists())

    def test_staff_can_export_any_active_client(self):
        self.assertEqual(self._post_export(self.staff, self.globex).status_code, 201)

    def test_an_archived_clients_export_is_superuser_only(self):
        self.acme.is_active = False
        self.acme.save(update_fields=['is_active'])
        for user in (self.member, self.staff):
            self.assertEqual(self._post_export(user, self.acme).status_code, 403, user.username)
        self.assertEqual(self._post_export(self.admin, self.acme).status_code, 201)

    def test_the_all_clients_export_is_superuser_only(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(f'{BASE}/exports/all/')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['kind'], 'all')
        for user in (self.staff, self.member):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.post(f'{BASE}/exports/all/').status_code, 403, user.username)

    def test_export_requests_are_throttled_under_the_export_scope(self):
        self.assertEqual(OnboardingClientViewSet.create_export.kwargs['throttle_scope'], 'export')
        self.assertEqual(ClientExportViewSet.all.kwargs['throttle_scope'], 'export')
        self.assertEqual(ClientExportViewSet.download_link.kwargs['throttle_scope'], 'export')
        # ...but never on the status poll, which the UI hits every couple of seconds.
        self.assertIsNone(ClientExportViewSet.throttle_scope)


class ExportStatusTests(ExportApiTestCase):
    def test_owner_and_superuser_can_read_status_others_cannot(self):
        export = self._ready_export()
        for user, expected in ((self.member, 200), (self.admin, 200), (self.other, 404), (self.outsider, 404)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(f'{BASE}/exports/{export.pk}/').status_code, expected, user.username)

    def test_status_never_exposes_the_server_path_or_nonce(self):
        export = self._ready_export()
        self.client.force_authenticate(self.member)
        data = self.client.get(f'{BASE}/exports/{export.pk}/').data
        self.assertNotIn('relative_path', data)
        self.assertNotIn('download_nonce', data)


class DownloadTests(ExportApiTestCase):
    def _link(self, user, export):
        self.client.force_authenticate(user)
        return self.client.post(f'{BASE}/exports/{export.pk}/download-link/')

    def _download(self, url):
        response = APIClient().get(url)  # a browser navigation: no JWT
        self.addCleanup(self._close, response)
        return response

    @staticmethod
    def _close(response):
        # A closed FileResponse fires request_finished, whose close_old_connections receiver
        # closes the connection and poisons the rest of the class on PostgreSQL ("connection
        # already closed"). Hold the response and close it without that receiver.
        request_finished.disconnect(close_old_connections)
        try:
            response.close()
        finally:
            request_finished.connect(close_old_connections)

    def test_a_link_needs_a_ready_export(self):
        with override_settings(EXPORT_JOBS_INLINE=False):
            pending = self._ready_export()
        self.assertEqual(pending.status, 'pending')
        self.assertEqual(self._link(self.member, pending).status_code, status.HTTP_409_CONFLICT)

    def test_only_the_owner_or_a_superuser_gets_a_link(self):
        export = self._ready_export()
        self.assertEqual(self._link(self.other, export).status_code, 404)
        self.assertEqual(self._link(self.member, export).status_code, 200)
        self.assertEqual(self._link(self.admin, export).status_code, 200)

    def test_the_link_downloads_the_zip_without_a_jwt(self):
        export = self._ready_export()
        url = self._link(self.member, export).data['url']
        response = self._download(url)
        self.assertEqual(response.status_code, 200)
        body = b''.join(response.streaming_content)
        response.close()
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            self.assertEqual(archive.read('ACME - Acme/a.pdf'), b'acme-data')
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn('ACME', response['Content-Disposition'])

    def test_a_link_works_once(self):
        export = self._ready_export()
        url = self._link(self.member, export).data['url']
        first = self._download(url)
        first.close()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self._download(url).status_code, 403)

    def test_a_new_link_replaces_the_previous_unused_one(self):
        export = self._ready_export()
        old = self._link(self.member, export).data['url']
        new = self._link(self.member, export).data['url']
        self.assertEqual(self._download(old).status_code, 403)
        response = self._download(new)
        response.close()
        self.assertEqual(response.status_code, 200)

    def test_an_expired_or_forged_token_is_refused(self):
        export = self._ready_export()
        url = self._link(self.member, export).data['url']
        with mock.patch('django.core.signing.time.time', return_value=10 ** 11):
            self.assertEqual(self._download(url).status_code, 403)
        self.assertEqual(self._download(url[:-3] + 'xyz').status_code, 403)
        self.assertEqual(self._download(f'{BASE}/exports/{export.pk}/download/').status_code, 403)

    def test_a_token_cannot_be_used_on_another_export(self):
        first = self._ready_export()
        second = self._ready_export()
        token = self._link(self.member, first).data['url'].split('token=')[1]
        self.assertEqual(self._download(f'{BASE}/exports/{second.pk}/download/?token={token}').status_code, 403)

    def test_an_expired_export_cannot_be_downloaded(self):
        export = self._ready_export()
        url = self._link(self.member, export).data['url']
        ClientExport.objects.filter(pk=export.pk).update(status='expired')
        self.assertEqual(self._download(url).status_code, 404)

    def test_each_download_is_audited(self):
        export = self._ready_export()
        url = self._link(self.member, export).data['url']
        with mock.patch('plugins.onboarding.export_viewsets.log_action') as audit:
            response = self._download(url)
            response.close()
        audit.assert_called_once()
        self.assertEqual(audit.call_args.kwargs['action'], 'export')
        self.assertEqual(audit.call_args.kwargs['user'], self.member)

    @override_settings(USE_X_ACCEL_REDIRECT=True)
    def test_in_production_nginx_serves_the_file(self):
        export = self._ready_export()
        url = self._link(self.member, export).data['url']
        response = self._download(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'')
        self.assertEqual(response['X-Accel-Redirect'], f'/_protected/exports/onboarding/{export.pk}.zip')


class StaleAccessTests(ExportApiTestCase):
    """An export lives for 24 hours, but access to the client may not."""

    def _link(self, user, export):
        self.client.force_authenticate(user)
        return self.client.post(f'{BASE}/exports/{export.pk}/download-link/')

    def test_a_user_unassigned_from_the_client_cannot_get_a_link_any_more(self):
        export = self._ready_export()
        self.member.profile.clients.remove(self.acme)
        self.assertEqual(self._link(self.member, export).status_code, 403)

    def test_archiving_the_client_ends_the_owners_access_but_not_a_superusers(self):
        export = self._ready_export()
        self.acme.is_active = False
        self.acme.save(update_fields=['is_active'])
        self.assertEqual(self._link(self.member, export).status_code, 403)
        self.assertEqual(self._link(self.admin, export).status_code, 200)

    def test_an_all_clients_export_stays_with_superusers(self):
        self.client.force_authenticate(self.admin)
        export_id = self.client.post(f'{BASE}/exports/all/').data['id']
        ClientExport.objects.filter(pk=export_id).update(requested_by=self.member)  # demoted owner
        self.assertEqual(self._link(self.member, ClientExport.objects.get(pk=export_id)).status_code, 403)

    def test_a_user_still_assigned_keeps_access(self):
        export = self._ready_export()
        self.assertEqual(self._link(self.member, export).status_code, 200)
