"""
Regression tests for the code-review findings.

Each test pins a defect the review found: a committed import reported as a
failure, a blank boolean cell reactivating a disabled record, and the profile
and history endpoints missing the per-target authority check.
"""

import io
from unittest.mock import patch

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models import Client
from apps.plugins.models import PluginPermission
from plugins.audit_log.models import AuditLog
from plugins.data_import.importers.clients import ClientImporter
from plugins.data_import.importers.techs import TechImporter
from plugins.data_import.models import ImportBatch, ImportProfile
from plugins.data_import.viewsets import DataImportViewSet, ImportProfileViewSet

BASE = "/api/plugins/data_import"


def make_csv(rows, columns, name="import.csv") -> io.BytesIO:
    buffer = io.BytesIO()
    pd.DataFrame(rows, columns=columns).to_csv(buffer, index=False)
    buffer.seek(0)
    buffer.name = name
    return buffer


def call(view_cls, method_map, path, user, data=None, **kwargs):
    factory = APIRequestFactory()
    http_method = next(iter(method_map))
    if http_method == "get":
        request = factory.get(path, data or {})
    elif http_method == "delete":
        request = factory.delete(path)
    else:
        request = factory.post(path, data or {}, format="multipart")
    force_authenticate(request, user=user)
    return view_cls.as_view(method_map)(request, **kwargs)


class CommitAuditFailureTests(TestCase):
    """A bookkeeping failure must not report a committed import as failed."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="pw", is_staff=True
        )

    def _commit(self):
        return call(
            DataImportViewSet,
            {"post": "commit"},
            f"{BASE}/import/commit/",
            self.admin,
            {
                "file": make_csv([{"Code": "ACME", "Name": "Acme"}], ["Code", "Name"]),
                "target_key": "clients",
                "field_mapping": '{"code": "Code", "name": "Name"}',
            },
        )

    def test_import_still_reported_as_successful_when_the_batch_record_fails(self):
        with patch.object(
            ImportBatch.objects, "create", side_effect=RuntimeError("db down")
        ):
            response = self._commit()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["created"], 1)
        self.assertTrue(Client.objects.filter(code="ACME").exists())

    def test_the_rows_are_kept_when_the_batch_record_fails(self):
        with patch.object(
            ImportBatch.objects, "create", side_effect=RuntimeError("db down")
        ):
            self._commit()
        self.assertEqual(Client.objects.filter(code="ACME").count(), 1)

    def test_the_audit_action_is_part_of_the_audit_log_vocabulary(self):
        self._commit()
        entry = AuditLog.objects.filter(action="data_import").first()
        self.assertIsNotNone(entry)
        self.assertIn("data_import", {code for code, _ in AuditLog.ACTION_TYPES})
        self.assertEqual(entry.get_action_display(), "Data Import")


class BlankBooleanCellTests(TestCase):
    """An empty cell means "leave this alone", for booleans as for scalars."""

    def test_blank_active_cell_does_not_reactivate_a_disabled_client(self):
        Client.objects.create(code="ACME", name="Acme", is_active=False)
        result = ClientImporter().commit_row(
            {"__row_index": 1, "code": "ACME", "name": "Acme", "is_active": None},
            {"update_existing": True},
        )
        self.assertEqual(result.status, "updated")
        self.assertFalse(Client.objects.get(code="ACME").is_active)

    def test_blank_active_cell_does_not_reactivate_a_disabled_tech(self):
        from apps.users.models import Tech

        Tech.objects.create(code="INFRA", name="Infrastructure", is_active=False)
        TechImporter().commit_row(
            {"__row_index": 1, "code": "INFRA", "name": "Infrastructure", "is_active": None},
            {"update_existing": True},
        )
        self.assertFalse(Tech.objects.get(code="INFRA").is_active)

    def test_an_explicit_false_still_disables(self):
        Client.objects.create(code="ACME", name="Acme", is_active=True)
        ClientImporter().commit_row(
            {"__row_index": 1, "code": "ACME", "name": "Acme", "is_active": False},
            {"update_existing": True},
        )
        self.assertFalse(Client.objects.get(code="ACME").is_active)

    def test_an_explicit_true_still_enables(self):
        Client.objects.create(code="ACME", name="Acme", is_active=False)
        ClientImporter().commit_row(
            {"__row_index": 1, "code": "ACME", "name": "Acme", "is_active": True},
            {"update_existing": True},
        )
        self.assertTrue(Client.objects.get(code="ACME").is_active)

    def test_a_new_record_without_an_active_column_keeps_the_model_default(self):
        ClientImporter().commit_row(
            {"__row_index": 1, "code": "NEW", "name": "New"}, {"update_existing": False}
        )
        self.assertTrue(Client.objects.get(code="NEW").is_active)


class ProfileAndHistoryAuthorityTests(TestCase):
    """Profiles and batch history carry their target's authority."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="granted", email="granted@example.com", password="pw"
        )
        for action in ("view", "manage"):
            PluginPermission.objects.update_or_create(
                plugin_name="data_import", action=action, defaults={"is_public": True}
            )
        PluginPermission.objects.update_or_create(
            plugin_name="skills", action="manage", defaults={"is_public": True}
        )
        ImportProfile.objects.create(name="Client map", target_key="clients")
        ImportProfile.objects.create(name="Skill map", target_key="skills")
        ImportBatch.objects.create(
            target_key="clients",
            original_filename="clients.csv",
            row_errors=[{"row_index": 1, "errors": ['User "j.smith" does not exist.']}],
        )
        ImportBatch.objects.create(target_key="skills", original_filename="skills.csv")

    def _profiles(self, user):
        return call(
            ImportProfileViewSet, {"get": "list"}, f"{BASE}/profiles/", user
        )

    def _batches(self, user):
        return call(
            DataImportViewSet, {"get": "batches"}, f"{BASE}/import/batches/", user
        )

    def test_profiles_of_an_inaccessible_target_are_hidden(self):
        names = {p["name"] for p in self._profiles(self.user).data["results"]}
        self.assertEqual(names, {"Skill map"})

    def test_history_of_an_inaccessible_target_is_hidden(self):
        keys = {b["target_key"] for b in self._batches(self.user).data}
        self.assertEqual(keys, {"skills"})

    def test_staff_still_see_every_profile_and_batch(self):
        staff = User.objects.create_user(
            username="staff", email="staff@example.com", password="pw", is_staff=True
        )
        self.assertEqual(len(self._profiles(staff).data["results"]), 2)
        self.assertEqual(len(self._batches(staff).data), 2)

    def test_creating_a_profile_for_an_inaccessible_target_is_forbidden(self):
        factory = APIRequestFactory()
        request = factory.post(
            f"{BASE}/profiles/",
            {"name": "Sneaky", "target_key": "clients", "field_mapping": {}},
            format="json",
        )
        force_authenticate(request, user=self.user)
        response = ImportProfileViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ImportProfile.objects.filter(name="Sneaky").exists())

    def test_creating_a_profile_for_an_accessible_target_still_works(self):
        factory = APIRequestFactory()
        request = factory.post(
            f"{BASE}/profiles/",
            {"name": "Skills v2", "target_key": "skills", "field_mapping": {}},
            format="json",
        )
        force_authenticate(request, user=self.user)
        response = ImportProfileViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.status_code, 201)


class AuthorityCachingTests(TestCase):
    """Listing targets must not re-run each importer's permission lookup."""

    def test_authority_is_resolved_once_per_target_per_request(self):
        from plugins.data_import.viewsets import ImportTargetViewSet

        user = User.objects.create_user(
            username="granted", email="granted@example.com", password="pw"
        )
        for action in ("view", "manage"):
            PluginPermission.objects.update_or_create(
                plugin_name="data_import", action=action, defaults={"is_public": True}
            )

        from plugins.data_import.importers.registry import get_importer

        factory = APIRequestFactory()
        request = factory.get(f"{BASE}/targets/")
        request.user = user

        view = ImportTargetViewSet()
        view.request = request
        view.action = "list"

        importer = get_importer("skills")
        with patch.object(
            type(importer), "check_authority", return_value="denied"
        ) as spy:
            view.can_access(importer)
            view.can_access(importer)
            view.can_access(importer)
        self.assertEqual(spy.call_count, 1)
