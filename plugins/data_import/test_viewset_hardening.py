"""
Tests for the data import viewset hardening:

- upload limits enforced before the file is parsed, on every write endpoint
- per-target authority on top of the plugin's manage grant
- generated CSV/XLSX templates
- soft-deleted profiles stay out of the list

Views are exercised directly (as the rest of this plugin's tests do) because
plugin URLs are mounted from the runtime plugin registry, not from a static
URLconf.
"""

import io

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.plugins.models import Plugin, PluginPermission
from plugins.data_import.models import ImportProfile
from plugins.data_import.viewsets import (
    DataImportViewSet,
    ImportProfileViewSet,
    ImportTargetViewSet,
)

BASE = "/api/plugins/data_import"


def make_csv(rows, columns, name="import.csv") -> io.BytesIO:
    buffer = io.BytesIO()
    pd.DataFrame(rows, columns=columns).to_csv(buffer, index=False)
    buffer.seek(0)
    buffer.name = name
    return buffer


def call(view_cls, method_map, path, user, data=None, fmt="multipart", **kwargs):
    factory = APIRequestFactory()
    http_method = next(iter(method_map))
    if http_method == "get":
        request = factory.get(path, data or {})
    elif http_method == "delete":
        request = factory.delete(path)
    else:
        request = factory.post(path, data or {}, format=fmt)
    force_authenticate(request, user=user)
    return view_cls.as_view(method_map)(request, **kwargs)


class UploadLimitTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password", is_staff=True
        )
        Plugin.objects.update_or_create(
            name="data_import",
            defaults={"config": {"max_file_size_mb": 1, "max_rows_per_import": 3}},
        )

    def _oversized_file(self) -> io.BytesIO:
        buffer = io.BytesIO(b"Code,Name\n" + b"A,name\n" * 400_000)
        buffer.name = "big.csv"
        return buffer

    def _post(self, action, file_obj, extra=None):
        data = {"file": file_obj, "target_key": "clients"}
        data.update(extra or {})
        return call(
            DataImportViewSet, {"post": action}, f"{BASE}/import/{action}/", self.admin, data
        )

    def test_analyze_rejects_oversized_file(self):
        response = self._post("analyze", self._oversized_file())
        self.assertEqual(response.status_code, 400)
        self.assertIn("maximum size", response.data["error"])

    def test_preview_also_enforces_the_size_limit(self):
        response = self._post("preview", self._oversized_file())
        self.assertEqual(response.status_code, 400)
        self.assertIn("maximum size", response.data["error"])

    def test_commit_also_enforces_the_size_limit(self):
        response = self._post("commit", self._oversized_file())
        self.assertEqual(response.status_code, 400)
        self.assertIn("maximum size", response.data["error"])

    def test_oversized_file_is_rejected_without_parsing(self):
        """The guard must run before pandas touches the upload."""
        import plugins.data_import.viewsets as viewsets_module

        calls = []
        original = viewsets_module.read_tabular_file

        def spy(*args, **kwargs):
            calls.append(args)
            return original(*args, **kwargs)

        viewsets_module.read_tabular_file = spy
        try:
            self._post("analyze", self._oversized_file())
        finally:
            viewsets_module.read_tabular_file = original

        self.assertEqual(calls, [])

    def test_commit_enforces_the_row_limit(self):
        rows = [{"Code": f"C{i}", "Name": f"Client {i}"} for i in range(5)]
        response = self._post(
            "commit",
            make_csv(rows, ["Code", "Name"]),
            {"field_mapping": '{"code": "Code", "name": "Name"}'},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("maximum rows", response.data["error"])


class PerTargetAuthorityTests(TestCase):
    """The plugin manage grant must not unlock every target."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="granted", email="granted@example.com", password="password"
        )
        for action in ("view", "manage"):
            PluginPermission.objects.update_or_create(
                plugin_name="data_import", action=action, defaults={"is_public": True}
            )

    def _analyze(self, target_key, user=None):
        return call(
            DataImportViewSet,
            {"post": "analyze"},
            f"{BASE}/import/analyze/",
            user or self.user,
            {
                "file": make_csv([{"Code": "AWS", "Name": "Amazon"}], ["Code", "Name"]),
                "target_key": target_key,
            },
        )

    def test_plugin_grant_alone_cannot_import_a_staff_only_target(self):
        self.assertEqual(self._analyze("clients").status_code, 403)

    def test_skills_target_requires_the_skills_manage_permission(self):
        self.assertEqual(self._analyze("skills").status_code, 403)

        PluginPermission.objects.update_or_create(
            plugin_name="skills", action="manage", defaults={"is_public": True}
        )
        self.assertEqual(self._analyze("skills").status_code, 200)

    def test_targets_list_hides_targets_the_caller_cannot_import(self):
        response = call(
            ImportTargetViewSet, {"get": "list"}, f"{BASE}/targets/", self.user
        )
        self.assertEqual(response.status_code, 200)
        keys = {t["target_key"] for t in response.data["targets"]}
        self.assertNotIn("clients", keys)
        self.assertNotIn("users", keys)

    def test_staff_still_see_every_target(self):
        staff = User.objects.create_user(
            username="staff", email="staff@example.com", password="password", is_staff=True
        )
        response = call(ImportTargetViewSet, {"get": "list"}, f"{BASE}/targets/", staff)
        keys = {t["target_key"] for t in response.data["targets"]}
        self.assertIn("clients", keys)
        self.assertIn("users", keys)


class TemplateDownloadTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password", is_staff=True
        )

    def _template(self, target_key, fmt=None):
        query = f"?file_format={fmt}" if fmt else ""
        return call(
            ImportTargetViewSet,
            {"get": "template"},
            f"{BASE}/targets/{target_key}/template/{query}",
            self.admin,
            {"file_format": fmt} if fmt else None,
            pk=target_key,
        )

    def _content(self, response) -> bytes:
        response.render() if hasattr(response, "render") else None
        return response.content

    def test_csv_template_has_the_field_labels_as_headers(self):
        response = self._template("clients", "csv")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("clients_import_template.csv", response["Content-Disposition"])
        header = self._content(response).decode("utf-8-sig").splitlines()[0]
        self.assertEqual(header.strip(), "Code,Name,Description,Active")

    def test_csv_template_includes_the_sample_rows(self):
        response = self._template("clients", "csv")
        lines = self._content(response).decode("utf-8-sig").strip().splitlines()
        self.assertEqual(len(lines), 3)
        self.assertIn("ACME", lines[1])

    def test_xlsx_template_is_a_workbook(self):
        response = self._template("clients", "xlsx")
        self.assertEqual(response.status_code, 200)
        self.assertIn("spreadsheetml", response["Content-Type"])
        self.assertIn("clients_import_template.xlsx", response["Content-Disposition"])
        frame = pd.read_excel(io.BytesIO(self._content(response)))
        self.assertEqual(list(frame.columns), ["Code", "Name", "Description", "Active"])
        self.assertEqual(len(frame), 2)

    def test_csv_is_the_default_format(self):
        self.assertEqual(self._template("clients")["Content-Type"], "text/csv")

    def test_unknown_format_is_rejected(self):
        self.assertEqual(self._template("clients", "pdf").status_code, 400)

    def test_unknown_target_is_not_found(self):
        self.assertEqual(self._template("nope", "csv").status_code, 404)

    def test_every_target_produces_a_template(self):
        listing = call(
            ImportTargetViewSet, {"get": "list"}, f"{BASE}/targets/", self.admin
        )
        for target in listing.data["targets"]:
            with self.subTest(target=target["target_key"]):
                self.assertEqual(self._template(target["target_key"], "csv").status_code, 200)

    def test_downloaded_sample_imports_cleanly(self):
        """The generated template must round-trip through preview without errors."""
        template = self._template("clients", "csv")
        upload = io.BytesIO(self._content(template))
        upload.name = "clients_import_template.csv"
        response = call(
            DataImportViewSet,
            {"post": "preview"},
            f"{BASE}/import/preview/",
            self.admin,
            {"file": upload, "target_key": "clients"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["error"], 0)
        self.assertEqual(response.data["summary"]["valid"], 2)


class ProfileVisibilityTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password", is_staff=True
        )

    def _list(self):
        return call(
            ImportProfileViewSet,
            {"get": "list"},
            f"{BASE}/profiles/?target_key=clients",
            self.admin,
            {"target_key": "clients"},
        )

    def test_soft_deleted_profiles_are_not_listed(self):
        ImportProfile.objects.create(name="Live", target_key="clients")
        ImportProfile.objects.create(name="Gone", target_key="clients", is_active=False)

        response = self._list()
        self.assertEqual(response.status_code, 200)
        self.assertEqual({p["name"] for p in response.data["results"]}, {"Live"})

    def test_destroy_soft_deletes_and_removes_it_from_the_list(self):
        profile = ImportProfile.objects.create(name="Temp", target_key="clients")
        response = call(
            ImportProfileViewSet,
            {"delete": "destroy"},
            f"{BASE}/profiles/{profile.id}/",
            self.admin,
            pk=profile.id,
        )
        self.assertEqual(response.status_code, 204)
        profile.refresh_from_db()
        self.assertFalse(profile.is_active)
        self.assertEqual(self._list().data["results"], [])
