"""Tests for the payroll wages import target.

Covers the importer's row behavior (create / skip / in-place update /
blank-leave-alone / overlap / month warning), its per-target authority, the
viewset gates, and the HR role grant introduced by the data_import migration.
"""

import io
import sys
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from apps.plugins.models import PluginPermission
from plugins.data_import.importers.wages import WageImporter
from plugins.data_import.viewsets import (
    DataImportViewSet,
    ImportTargetViewSet,
    _build_mapped_rows,
)
from plugins.payroll.models import WageAssignment

BASE = "/api/plugins/data_import"

UPDATE = {"update_existing": True}
NO_UPDATE = {"update_existing": False}


def row(index=1, **values):
    return {"__row_index": index, **values}


def mapped_rows(df, importer):
    """Build mapped rows exactly as preview/commit do: every column maps to itself."""
    return _build_mapped_rows(df, {key: key for key in df.columns}, {}, importer)


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


class WageImporterCommitTests(TestCase):
    def setUp(self):
        self.importer = WageImporter()
        self.user = User.objects.create_user(
            username="jdoe", email="jdoe@example.com", password="password"
        )
        self.other = User.objects.create_user(
            username="asmith", email="asmith@example.com", password="password"
        )
        self.actor = User.objects.create_user(
            username="admin", email="admin@example.com", password="password", is_staff=True
        )
        self.context = {"actor": self.actor}

    def test_creates_an_active_assignment_for_a_user_without_one(self):
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("150000"),
                effective_from=date(2026, 1, 1),
            ),
            NO_UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "created")
        assignment = WageAssignment.objects.get(user=self.user)
        self.assertEqual(assignment.gross_monthly_wage, Decimal("150000"))
        self.assertEqual(assignment.effective_from, date(2026, 1, 1))
        self.assertTrue(assignment.is_active)
        self.assertEqual(assignment.created_by, self.actor)

    def test_blank_required_cells_on_create_are_clean_errors_and_write_nothing(self):
        result = self.importer.commit_row(
            row(username="jdoe", gross_monthly_wage=None, effective_from=None),
            NO_UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "error")
        self.assertEqual(
            result.errors,
            ["gross_monthly_wage is required.", "effective_from is required."],
        )
        self.assertFalse(WageAssignment.objects.exists())

    def test_unknown_username_is_a_row_error(self):
        result = self.importer.commit_row(
            row(username="nobody", gross_monthly_wage=Decimal("1"), effective_from=date(2026, 1, 1)),
            NO_UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "error")
        self.assertEqual(result.errors, ["No existing user matches the provided username."])
        self.assertFalse(WageAssignment.objects.exists())

    def test_negative_wage_is_rejected(self):
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("-1"),
                effective_from=date(2026, 1, 1),
            ),
            NO_UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "error")
        self.assertEqual(result.errors, ["Wage cannot be negative."])
        self.assertFalse(WageAssignment.objects.exists())

    def test_effective_to_before_effective_from_is_rejected(self):
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("150000"),
                effective_from=date(2026, 6, 1),
                effective_to=date(2026, 5, 1),
            ),
            NO_UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "error")
        self.assertIn("effective", result.errors[0].lower())
        self.assertFalse(WageAssignment.objects.exists())

    def test_existing_wage_is_skipped_without_update_existing(self):
        existing = WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("100000"),
            effective_from=date(2026, 1, 1),
            created_by=self.actor,
            updated_by=self.actor,
        )
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("150000"),
                effective_from=date(2026, 7, 1),
            ),
            NO_UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "skipped")
        existing.refresh_from_db()
        self.assertEqual(existing.gross_monthly_wage, Decimal("100000"))
        self.assertEqual(WageAssignment.objects.filter(user=self.user).count(), 1)

    def test_update_existing_edits_the_active_assignment_in_place(self):
        existing = WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("100000"),
            effective_from=date(2026, 1, 1),
            created_by=self.actor,
            updated_by=self.actor,
        )
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("150000"),
                effective_from=date(2026, 1, 1),
                note="Contractual raise",
            ),
            UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "updated")
        self.assertEqual(WageAssignment.objects.filter(user=self.user).count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.gross_monthly_wage, Decimal("150000"))
        self.assertEqual(existing.note, "Contractual raise")
        self.assertEqual(existing.updated_by, self.actor)

    def test_blank_cells_on_update_leave_existing_values_alone(self):
        existing = WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("100000"),
            effective_from=date(2026, 1, 1),
            effective_to=date(2026, 6, 30),
            note="Original",
            created_by=self.actor,
            updated_by=self.actor,
        )
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=None,
                effective_from=None,
                effective_to=None,
                note=None,
            ),
            UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "updated")
        existing.refresh_from_db()
        self.assertEqual(existing.gross_monthly_wage, Decimal("100000"))
        self.assertEqual(existing.effective_from, date(2026, 1, 1))
        self.assertEqual(existing.effective_to, date(2026, 6, 30))
        self.assertEqual(existing.note, "Original")

    def test_update_that_overlaps_another_active_assignment_is_rejected(self):
        first = WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("100000"),
            effective_from=date(2026, 1, 1),
            effective_to=date(2026, 6, 30),
            created_by=self.actor,
            updated_by=self.actor,
        )
        second = WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("120000"),
            effective_from=date(2026, 8, 1),
            created_by=self.actor,
            updated_by=self.actor,
        )
        # The open-ended second row covers everything from 2026-08-01, so
        # extending it backwards to 2026-06-01 collides with the first row.
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("130000"),
                effective_from=date(2026, 6, 1),
            ),
            UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "error")
        self.assertEqual(
            result.errors, ["This wage period overlaps an active wage assignment."]
        )
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.gross_monthly_wage, Decimal("100000"))
        self.assertEqual(second.gross_monthly_wage, Decimal("120000"))

    def test_second_assignment_in_the_same_month_warns(self):
        # Two non-overlapping rows in January already exist; the later one is
        # the match, so the update path must surface the shared month.
        WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("100000"),
            effective_from=date(2026, 1, 1),
            effective_to=date(2026, 1, 10),
            created_by=self.actor,
            updated_by=self.actor,
        )
        WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("120000"),
            effective_from=date(2026, 1, 20),
            effective_to=date(2026, 1, 31),
            created_by=self.actor,
            updated_by=self.actor,
        )
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("150000"),
                effective_from=date(2026, 1, 20),
                effective_to=date(2026, 1, 31),
            ),
            UPDATE,
            context=self.context,
        )
        self.assertEqual(result.status, "updated")
        self.assertTrue(result.warnings, "a same-month second wage must warn")
        self.assertIn("2026-01", result.warnings[0])
        self.assertEqual(WageAssignment.objects.filter(user=self.user).count(), 2)

    def test_dry_run_writes_nothing(self):
        result = self.importer.commit_row(
            row(
                username="jdoe",
                gross_monthly_wage=Decimal("150000"),
                effective_from=date(2026, 1, 1),
            ),
            NO_UPDATE,
            dry_run=True,
            context=self.context,
        )
        self.assertEqual(result.status, "valid")
        self.assertFalse(WageAssignment.objects.exists())

    def test_malformed_wage_cell_on_update_is_an_error_not_a_silent_keep(self):
        # An unparseable cell ("150,000" with a thousands separator) must not
        # collapse to None and masquerade as blank: blank means "keep the
        # existing value", which would silently report "updated".
        existing = WageAssignment.objects.create(
            user=self.user,
            gross_monthly_wage=Decimal("100000"),
            effective_from=date(2026, 1, 1),
            created_by=self.actor,
            updated_by=self.actor,
        )
        df = pd.DataFrame(
            [
                {
                    "username": "jdoe",
                    "gross_monthly_wage": "150,000",
                    "effective_from": "2026-01-01",
                }
            ]
        )
        rows = mapped_rows(df, self.importer)
        result = self.importer.commit_row(rows[0], UPDATE, context=self.context)
        self.assertEqual(result.status, "error")
        self.assertEqual(result.errors, ["gross_monthly_wage must be a valid number."])
        existing.refresh_from_db()
        self.assertEqual(existing.gross_monthly_wage, Decimal("100000"))

    def test_malformed_effective_from_cell_is_a_date_error_not_a_required_error(self):
        df = pd.DataFrame(
            [{"username": "jdoe", "gross_monthly_wage": "150000", "effective_from": "not-a-date"}]
        )
        rows = mapped_rows(df, self.importer)
        result = self.importer.commit_row(rows[0], NO_UPDATE, context=self.context)
        self.assertEqual(result.status, "error")
        self.assertEqual(result.errors, ["effective_from must be a valid date."])
        self.assertFalse(WageAssignment.objects.exists())

    def test_build_mapped_rows_flags_malformed_cells_but_not_blank_ones(self):
        df = pd.DataFrame(
            [
                {"username": "jdoe", "gross_monthly_wage": "150,000", "effective_from": "2026-01-01"},
                {"username": "asmith", "gross_monthly_wage": "", "effective_from": ""},
                {"username": "buser", "gross_monthly_wage": None, "effective_from": None},
            ]
        )
        rows = mapped_rows(df, self.importer)
        self.assertEqual(rows[0].get("__parse_errors"), ["gross_monthly_wage"])
        self.assertNotIn("__parse_errors", rows[1])
        self.assertNotIn("__parse_errors", rows[2])
        self.assertIsNone(rows[1]["gross_monthly_wage"])


class WageImporterAuthorityTests(TestCase):
    def setUp(self):
        self.importer = WageImporter()

    def test_staff_are_allowed(self):
        staff = User.objects.create_user(
            username="staff", email="staff@example.com", password="password", is_staff=True
        )
        self.assertIsNone(self.importer.check_authority(staff))

    def test_plain_user_is_denied(self):
        user = User.objects.create_user(
            username="plain", email="plain@example.com", password="password"
        )
        self.assertIsNotNone(self.importer.check_authority(user))

    def test_payroll_manage_grant_allows_a_plain_user(self):
        user = User.objects.create_user(
            username="granted", email="granted@example.com", password="password"
        )
        PluginPermission.objects.update_or_create(
            plugin_name="payroll", action="manage", defaults={"is_public": True}
        )
        self.assertIsNone(self.importer.check_authority(user))

    def test_missing_payroll_plugin_denies_even_staff(self):
        staff = User.objects.create_user(
            username="staff2", email="staff2@example.com", password="password", is_staff=True
        )
        with patch.dict(sys.modules, {"plugins.payroll.models": None}):
            self.assertIsNotNone(self.importer.check_authority(staff))


class WagesTargetViewsetTests(TestCase):
    """Gate the ``wages`` target behind the data_import + payroll grants."""

    def setUp(self):
        self.plain = User.objects.create_user(
            username="plain", email="plain@example.com", password="password"
        )
        self.staff = User.objects.create_user(
            username="admin", email="admin@example.com", password="password", is_staff=True
        )
        for action in ("view", "manage"):
            PluginPermission.objects.update_or_create(
                plugin_name="data_import", action=action, defaults={"is_public": True}
            )

    def _targets(self, user):
        response = call(ImportTargetViewSet, {"get": "list"}, f"{BASE}/targets/", user)
        return response, {t["target_key"] for t in response.data["targets"]}

    def _analyze(self, user):
        return call(
            DataImportViewSet,
            {"post": "analyze"},
            f"{BASE}/import/analyze/",
            user,
            {
                "file": make_csv(
                    [{"Username": "jdoe", "Gross Monthly Wage": "100000",
                      "Effective From": "2026-01-01"}],
                    ["Username", "Gross Monthly Wage", "Effective From"],
                ),
                "target_key": "wages",
            },
        )

    def test_plain_user_neither_sees_nor_analyzes_the_wages_target(self):
        response, keys = self._targets(self.plain)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("wages", keys)
        self.assertEqual(self._analyze(self.plain).status_code, 403)

    def test_payroll_manage_grant_exposes_the_wages_target(self):
        PluginPermission.objects.update_or_create(
            plugin_name="payroll", action="manage", defaults={"is_public": True}
        )
        response, keys = self._targets(self.plain)
        self.assertEqual(response.status_code, 200)
        self.assertIn("wages", keys)
        self.assertEqual(self._analyze(self.plain).status_code, 200)

    def test_staff_see_the_wages_target(self):
        response, keys = self._targets(self.staff)
        self.assertEqual(response.status_code, 200)
        self.assertIn("wages", keys)

    def test_wages_template_round_trips_through_preview(self):
        User.objects.create_user(username="mrossi", email="m.rossi@example.com", password="x")
        User.objects.create_user(username="ahoxha", email="a.hoxha@example.com", password="x")

        template = call(
            ImportTargetViewSet,
            {"get": "template"},
            f"{BASE}/targets/wages/template/?file_format=csv",
            self.staff,
            {"file_format": "csv"},
            pk="wages",
        )
        self.assertEqual(template.status_code, 200)
        template.render() if hasattr(template, "render") else None
        header = template.content.decode("utf-8-sig").splitlines()[0].strip()
        self.assertEqual(
            header,
            "Username *,Gross Monthly Wage *,Effective From *,Effective To,Note",
        )

        upload = io.BytesIO(template.content)
        upload.name = "wages_import_template.csv"
        response = call(
            DataImportViewSet,
            {"post": "preview"},
            f"{BASE}/import/preview/",
            self.staff,
            {"file": upload, "target_key": "wages"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["error"], 0)
        self.assertEqual(response.data["summary"]["valid"], 2)


class HrRoleAccessTests(TestCase):
    """The hr role reaches the target through the data_import migration."""

    def setUp(self):
        self.hr_role, _ = Role.objects.get_or_create(code="hr", defaults={"name": "HR"})
        self.hr = User.objects.create_user(
            username="hruser", email="hr@example.com", password="password"
        )
        UserRole.objects.create(user=self.hr, role=self.hr_role, is_active=True)
        # HR holds payroll's manage grant (hr imports wages on the shared page).
        permission, _ = PluginPermission.objects.get_or_create(
            plugin_name="payroll", action="manage", defaults={"is_public": False}
        )
        permission.allowed_roles.add(self.hr_role)
        self.plain = User.objects.create_user(
            username="plain", email="plain@example.com", password="password"
        )

    def _targets(self, user):
        return call(ImportTargetViewSet, {"get": "list"}, f"{BASE}/targets/", user)

    def test_hr_user_reaches_the_wages_target(self):
        response = self._targets(self.hr)
        self.assertEqual(response.status_code, 200)
        keys = {t["target_key"] for t in response.data["targets"]}
        self.assertIn("wages", keys)

    def test_plain_user_is_denied_the_targets_endpoint(self):
        self.assertEqual(self._targets(self.plain).status_code, 403)
