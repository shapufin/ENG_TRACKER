from django.test import TestCase

from apps.overtime.models import Client
from plugins.data_import.importers.catalog import derive_code
from plugins.data_import.importers.clients import ClientImporter


class DeriveCodeTests(TestCase):
    def test_examples(self):
        self.assertEqual(derive_code("BACKUP"), "BACKUP")
        self.assertEqual(derive_code("backup"), "BACKUP")
        self.assertEqual(derive_code("Engineering Databases"), "ENGINEERING-DATABASES")
        self.assertEqual(derive_code("  Café  Dëlta! "), "CAFE-DELTA")
        self.assertEqual(derive_code("!!!"), "")


class BlankCodeDerivationTests(TestCase):
    def setUp(self):
        self.importer = ClientImporter()

    def _row(self, **kw):
        return {"__row_index": 1, "code": "", "name": "Backup Team", **kw}

    def test_blank_code_is_derived_on_commit(self):
        result = self.importer.commit_row(self._row(), {})
        self.assertEqual(result.status, "created")
        self.assertTrue(Client.objects.filter(code="BACKUP-TEAM").exists())

    def test_explicit_code_wins(self):
        self.importer.commit_row(self._row(code="XYZ"), {})
        self.assertTrue(Client.objects.filter(code="XYZ").exists())
        self.assertFalse(Client.objects.filter(code="BACKUP-TEAM").exists())

    def test_derived_code_dedupes_against_existing(self):
        Client.objects.create(code="BACKUP-TEAM", name="Old")
        result = self.importer.commit_row(self._row(), {"update_existing": False})
        self.assertEqual(result.status, "skipped")

    def test_dry_run_tracks_derived_codes(self):
        ctx = {}
        first = self.importer.commit_row(self._row(), {}, dry_run=True, context=ctx)
        second = self.importer.commit_row(self._row(), {}, dry_run=True, context=ctx)
        self.assertEqual(first.status, "valid")
        self.assertEqual(second.status, "skipped")

    def test_blank_code_and_name_is_an_error(self):
        result = self.importer.commit_row(self._row(name=""), {})
        self.assertEqual(result.status, "error")
