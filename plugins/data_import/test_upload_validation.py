"""SEC-17: the importer checks extension and magic bytes before pandas runs."""
import io
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase

from apps.plugins.models import Plugin
from plugins.data_import.test_viewset_hardening import call, make_csv
from plugins.data_import.viewsets import DataImportViewSet

BASE = "/api/plugins/data_import"


def _named(content, name):
    buffer = io.BytesIO(content)
    buffer.name = name
    return buffer


class ImportUploadTypeTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="a@example.com", password="password", is_staff=True
        )
        Plugin.objects.update_or_create(
            name="data_import",
            defaults={"config": {"max_file_size_mb": 1, "max_rows_per_import": 100}},
        )

    def _analyze(self, upload):
        return call(
            DataImportViewSet, {"post": "analyze"}, f"{BASE}/import/analyze/",
            self.admin, {"file": upload, "target_key": "clients"},
        )

    def test_rejects_extension_outside_policy(self):
        with patch("plugins.data_import.viewsets.read_tabular_file") as parse:
            response = self._analyze(_named(b"Code,Name\nA,B\n", "notes.txt"))
        self.assertEqual(response.status_code, 400)
        self.assertIn(".txt", response.data["error"])
        parse.assert_not_called()

    def test_extensionless_upload_is_judged_by_content(self):
        rejected = self._analyze(_named(b"%PDF-1.7\x00binary", "import"))
        self.assertEqual(rejected.status_code, 400)
        accepted = self._analyze(_named(b"Code,Name\nA,B\n", "import"))
        self.assertEqual(accepted.status_code, 200, accepted.data)

    def test_rejects_xlsx_without_zip_signature(self):
        with patch("plugins.data_import.viewsets.read_tabular_file") as parse:
            response = self._analyze(_named(b"Code,Name\nA,B\n", "data.xlsx"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("does not match", response.data["error"])
        parse.assert_not_called()

    def test_rejects_binary_content_named_csv(self):
        with patch("plugins.data_import.viewsets.read_tabular_file") as parse:
            response = self._analyze(_named(b"%PDF-1.7\x00\x01binary", "data.csv"))
        self.assertEqual(response.status_code, 400)
        parse.assert_not_called()

    def test_oversized_file_is_still_rejected_by_size_first(self):
        big = _named(b"Code,Name\n" + b"A,name\n" * 400_000, "big.txt")
        response = self._analyze(big)
        self.assertIn("maximum size", response.data["error"])

    def test_valid_csv_still_analyzes(self):
        response = self._analyze(make_csv([["A", "Alpha"]], ["Code", "Name"]))
        self.assertEqual(response.status_code, 200, response.data)


class TemplateFormulaInjectionTests(TestCase):
    """SEC-16: a sample row that starts with a formula trigger is neutralised."""

    def test_template_csv_and_xlsx_neutralise_sample_cells(self):
        from types import SimpleNamespace

        from core.utils.csv_injection_assert import (
            PAYLOAD,
            assert_csv_neutralised,
            assert_xlsx_neutralised,
        )
        from plugins.data_import.viewsets import _template_response

        field = SimpleNamespace(key="name", label="Name", required=False)
        importer = SimpleNamespace(
            target_key="demo", display_name="Demo",
            get_fields=lambda: [field],
            get_sample_rows=lambda: [{"name": PAYLOAD}],
        )
        assert_csv_neutralised(self, _template_response(importer, "csv").content)
        assert_xlsx_neutralised(self, _template_response(importer, "xlsx").content)
