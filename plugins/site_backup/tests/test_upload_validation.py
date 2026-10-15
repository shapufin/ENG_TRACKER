"""SEC-17: the restore upload must be a .zip with a zip signature."""
import io
import zipfile

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.site_backup.viewsets import RestoreViewSet

PATH = '/api/plugins/site_backup/restore/preview/'


def _upload(name, content):
    buf = io.BytesIO(content)
    buf.name = name
    return buf


def _zip_bytes():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as archive:
        archive.writestr('x.txt', 'x')
    return buf.getvalue()


class RestoreUploadTypeTests(TestCase):
    def setUp(self):
        self.root = User.objects.create_user(username='root', password='x', is_superuser=True)

    def _preview(self, upload):
        request = APIRequestFactory().post(PATH, {'file': upload}, format='multipart')
        force_authenticate(request, user=self.root)
        return RestoreViewSet.as_view({'post': 'preview'})(request)

    def test_rejects_non_zip_extension(self):
        response = self._preview(_upload('backup.txt', _zip_bytes()))
        self.assertEqual(response.status_code, 400)
        self.assertIn('.zip', str(response.data))

    def test_rejects_missing_zip_signature(self):
        response = self._preview(_upload('backup.zip', b'MZ not a zip at all'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('zip', str(response.data).lower())

    def test_zip_with_signature_passes_the_type_gate(self):
        # Reaches the archive reader, which rejects it for the missing manifest.
        response = self._preview(_upload('backup.zip', _zip_bytes()))
        self.assertEqual(response.status_code, 400)
        self.assertIn('manifest', str(response.data).lower())
