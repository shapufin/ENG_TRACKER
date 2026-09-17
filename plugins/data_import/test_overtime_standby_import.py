"""
Tests for the OvertimeLog / StandbyLog importers and the optional
draft-payroll-generation hook.
"""

import io
import json
from datetime import date, time
from decimal import Decimal
from unittest.mock import patch

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from plugins.data_import.importers.overtime_logs import OvertimeLogImporter
from plugins.data_import.importers.standby_logs import StandbyLogImporter
from plugins.data_import.viewsets import DataImportViewSet
from plugins.payroll.models import (
    PayrollLine,
    PayrollRuleSet,
    PayrollRun,
    PayrollRunEntry,
    WageAssignment,
)

UPDATE = {"update_existing": True}
NO_UPDATE = {"update_existing": False}


def row(index=1, **values):
    return {"__row_index": index, **values}


def make_actor():
    return User.objects.create_user(username="importer_admin", is_staff=True)


def make_rule_set(**overrides):
    defaults = dict(
        name="Standard", country="AL", tax_profile="standard",
        effective_from=date(2020, 1, 1), is_active=True,
    )
    defaults.update(overrides)
    return PayrollRuleSet.objects.create(**defaults)


class OvertimeLogImporterTests(TestCase):
    def setUp(self):
        self.importer = OvertimeLogImporter()
        self.actor = make_actor()
        self.user = User.objects.create_user(username="mrossi", email="m.rossi@example.com")
        self.client_obj = Client.objects.create(code="ACME", name="Acme")

    def _ctx(self):
        return {"actor": self.actor}

    def test_creates_an_approved_overtime_log(self):
        result = self.importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("3")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "created")
        log = OvertimeLog.objects.get(user=self.user, client=self.client_obj, date=date(2026, 1, 5))
        self.assertEqual(log.status, "approved")
        self.assertEqual(log.approved_by, self.actor)
        self.assertIsNotNone(log.approved_at)

    def test_missing_user_is_a_clean_error(self):
        result = self.importer.commit_row(
            row(username="ghost", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("3")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "error")
        self.assertIn("No existing user", result.errors[0])

    def test_missing_client_is_a_clean_error(self):
        result = self.importer.commit_row(
            row(username="mrossi", client_code="NOPE", date=date(2026, 1, 5), hours=Decimal("3")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "error")
        self.assertIn("NOPE", result.errors[0])
        self.assertIn("Value Transforms", result.errors[0])

    def test_client_code_matches_leniently(self):
        result = self.importer.commit_row(
            row(username="mrossi", client_code="  acme ", date=date(2026, 1, 5), hours=Decimal("3")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "created")
        self.assertTrue(
            OvertimeLog.objects.filter(user=self.user, client=self.client_obj, date=date(2026, 1, 5)).exists()
        )

    def test_client_field_exposes_choices_for_value_transforms(self):
        fields = {f.key: f for f in self.importer.get_fields()}
        self.assertIn(("ACME", "ACME — Acme"), fields["client_code"].choices)

    def test_missing_hours_without_times_is_a_clean_error(self):
        result = self.importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5)),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "error")
        self.assertIn("hours", result.errors[0])

    def test_start_and_end_time_compute_hours(self):
        result = self.importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5),
                start_time="18:00", end_time="21:00"),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "created")
        log = OvertimeLog.objects.get(user=self.user, client=self.client_obj, date=date(2026, 1, 5))
        self.assertEqual(log.hours, Decimal("3"))

    def test_duplicate_row_is_skipped_without_update_existing(self):
        OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=date(2026, 1, 5), hours=Decimal("3"),
            status="approved",
        )
        result = self.importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("5")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "skipped")
        self.assertEqual(OvertimeLog.objects.count(), 1)
        self.assertEqual(OvertimeLog.objects.first().hours, Decimal("3"))

    def test_duplicate_row_updates_with_update_existing(self):
        OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=date(2026, 1, 5), hours=Decimal("3"),
            status="approved",
        )
        result = self.importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("5")),
            UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "updated")
        self.assertEqual(OvertimeLog.objects.count(), 1)
        self.assertEqual(OvertimeLog.objects.first().hours, Decimal("5"))

    def test_dry_run_writes_nothing(self):
        result = self.importer.validate_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("3")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "valid")
        self.assertFalse(OvertimeLog.objects.exists())

    def test_update_with_blank_times_leaves_existing_times_alone(self):
        from datetime import time
        OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=date(2026, 1, 5), hours=Decimal("3"),
            start_time=time(18, 0), end_time=time(21, 0), status="approved",
        )
        result = self.importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("5")),
            UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "updated")
        log = OvertimeLog.objects.get(user=self.user, client=self.client_obj, date=date(2026, 1, 5))
        self.assertEqual(log.start_time, time(18, 0))
        self.assertEqual(log.end_time, time(21, 0))

    def test_payroll_option_is_hidden_when_no_actor_context_requested(self):
        keys = {o.key for o in self.importer.get_options()}
        self.assertIn("generate_draft_payroll", keys)

    def test_overlapping_time_range_is_a_clean_error(self):
        OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=date(2026, 1, 5), hours=Decimal("3"),
            start_time=time(18, 0), end_time=time(21, 0), status="approved",
        )
        other_client = Client.objects.create(code="GLOBEX", name="Globex")
        result = self.importer.commit_row(
            row(username="mrossi", client_code="GLOBEX", date=date(2026, 1, 5),
                start_time="19:00", end_time="22:00"),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "error")
        self.assertIn("overlaps", result.errors[0])
        self.assertEqual(OvertimeLog.objects.filter(client=other_client).count(), 0)

    def test_update_referenced_by_finalized_payroll_is_a_clean_error(self):
        log = OvertimeLog.objects.create(
            user=self.user, client=self.client_obj, date=date(2026, 1, 5), hours=Decimal("3"),
            status="approved",
        )
        rule_set = make_rule_set()
        run = PayrollRun.objects.create(year=2026, month=1, status="draft", rule_set=rule_set, created_by=self.actor)
        line = PayrollLine.objects.create(user=self.user, run=run)
        PayrollRunEntry.objects.create(
            run=run, line=line, source_kind="overtime", source_id=log.pk, user=self.user,
            work_date=log.date, requested_period=date(2026, 1, 1), resolved_period=date(2026, 1, 1),
            status="finalized",
        )

        result = self.importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("9")),
            UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "error")
        self.assertIn("finalized payroll", result.errors[0])
        self.assertEqual(OvertimeLog.objects.get(pk=log.pk).hours, Decimal("3"))

    def test_two_users_sharing_an_email_is_a_clean_error_not_a_crash(self):
        User.objects.create_user(username="mrossi2", email="m.rossi@example.com")
        result = self.importer.commit_row(
            row(client_code="ACME", email="m.rossi@example.com", date=date(2026, 1, 5), hours=Decimal("3")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "error")
        self.assertIn("No existing user", result.errors[0])


class StandbyLogImporterTests(TestCase):
    def setUp(self):
        self.importer = StandbyLogImporter()
        self.actor = make_actor()
        self.user = User.objects.create_user(username="mrossi", email="m.rossi@example.com")
        self.client_a = Client.objects.create(code="ACME", name="Acme")
        self.client_b = Client.objects.create(code="GLOBEX", name="Globex")

    def _ctx(self):
        return {"actor": self.actor}

    def test_creates_an_approved_standby_log_with_multiple_clients(self):
        result = self.importer.commit_row(
            row(username="mrossi", date=date(2026, 1, 5), hours=Decimal("12"),
                client_codes="ACME,GLOBEX"),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "created")
        log = StandbyLog.objects.get(user=self.user, date=date(2026, 1, 5))
        self.assertEqual(log.status, "approved")
        self.assertEqual(set(log.clients.values_list("code", flat=True)), {"ACME", "GLOBEX"})

    def test_unknown_client_code_is_a_clean_error(self):
        result = self.importer.commit_row(
            row(username="mrossi", date=date(2026, 1, 5), hours=Decimal("12"), client_codes="NOPE"),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "error")
        self.assertIn("NOPE", result.errors[0])
        self.assertIn("Value Transforms", result.errors[0])

    def test_client_codes_match_leniently(self):
        result = self.importer.commit_row(
            row(username="mrossi", date=date(2026, 1, 5), hours=Decimal("12"),
                client_codes="acme, GLOBEX"),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "created")
        log = StandbyLog.objects.get(user=self.user, date=date(2026, 1, 5))
        self.assertEqual(set(log.clients.values_list("code", flat=True)), {"ACME", "GLOBEX"})

    def test_client_codes_field_exposes_choices_for_value_transforms(self):
        fields = {f.key: f for f in self.importer.get_fields()}
        self.assertIn(("ACME", "ACME — Acme"), fields["client_codes"].choices)

    def test_client_codes_are_optional(self):
        result = self.importer.commit_row(
            row(username="mrossi", date=date(2026, 1, 5), hours=Decimal("12")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "created")

    def test_duplicate_row_is_skipped_without_update_existing(self):
        StandbyLog.objects.create(user=self.user, date=date(2026, 1, 5), hours=Decimal("12"), status="approved")
        result = self.importer.commit_row(
            row(username="mrossi", date=date(2026, 1, 5), hours=Decimal("24")),
            NO_UPDATE, context=self._ctx(),
        )
        self.assertEqual(result.status, "skipped")
        self.assertEqual(StandbyLog.objects.count(), 1)


class StandbyLogImporterNotificationBundlingTests(TestCase):
    """A week's worth of imported standby rows for one user must produce a
    single range notification, not one per day (notification bar bloat)."""

    def setUp(self):
        self.importer = StandbyLogImporter()
        self.actor = make_actor()
        self.user = User.objects.create_user(username="mrossi", email="m.rossi@example.com")

    def _ctx(self):
        return {"actor": self.actor}

    def test_week_of_rows_bundles_into_one_notification(self):
        from plugins.notifications.models import Notification

        context = self._ctx()
        for day in range(5, 12):  # Mon–Sun, 2026-01-05..2026-01-11
            result = self.importer.commit_row(
                row(day, username="mrossi", date=date(2026, 1, day), hours=Decimal("12")),
                NO_UPDATE, context=context,
            )
            self.assertEqual(result.status, "created")

        self.assertEqual(StandbyLog.objects.filter(user=self.user).count(), 7)
        self.assertEqual(
            Notification.objects.filter(user=self.user, title__icontains="Standby").count(), 0,
            "per-row notifications must be suppressed during import",
        )

        self.importer.finalize_batch(context, NO_UPDATE, dry_run=False)

        notifications = Notification.objects.filter(user=self.user, title__icontains="Standby")
        self.assertEqual(notifications.count(), 1)
        message = notifications.first().message
        self.assertIn("2026-01-05", message)
        self.assertIn("2026-01-11", message)

    def test_dry_run_does_not_create_notification(self):
        context = self._ctx()
        self.importer.commit_row(
            row(username="mrossi", date=date(2026, 1, 5), hours=Decimal("12")),
            NO_UPDATE, context=context, dry_run=True,
        )
        self.importer.finalize_batch(context, NO_UPDATE, dry_run=True)

        from plugins.notifications.models import Notification
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 0)


class PayrollDraftGenerationTests(TestCase):
    """Exercises the optional `generate_draft_payroll` finalize_batch hook."""

    def setUp(self):
        self.overtime_importer = OvertimeLogImporter()
        self.actor = make_actor()
        self.user_with_wage = User.objects.create_user(username="mrossi", email="m.rossi@example.com")
        self.user_without_wage = User.objects.create_user(username="ahoxha", email="a.hoxha@example.com")
        self.client_obj = Client.objects.create(code="ACME", name="Acme")
        self.rule_set = make_rule_set()
        WageAssignment.objects.create(
            user=self.user_with_wage, gross_monthly_wage=Decimal("1000"), effective_from=date(2025, 1, 1),
        )

    def _commit_two_rows(self, options):
        context = {"actor": self.actor}
        r1 = self.overtime_importer.commit_row(
            row(1, username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("3")),
            options, context=context,
        )
        r2 = self.overtime_importer.commit_row(
            row(2, username="ahoxha", client_code="ACME", date=date(2026, 1, 6), hours=Decimal("4")),
            options, context=context,
        )
        self.overtime_importer.finalize_batch(context, options, dry_run=False)
        return r1, r2, context

    def test_generates_a_draft_run_and_skips_user_without_wage(self):
        options = {"update_existing": False, "generate_draft_payroll": True}
        r1, r2, context = self._commit_two_rows(options)

        self.assertEqual(r1.status, "created")
        self.assertEqual(r2.status, "created")

        run = PayrollRun.objects.get(year=2026, month=1)
        self.assertEqual(run.status, "draft")
        self.assertEqual(list(run.lines.values_list("user", flat=True)), [self.user_with_wage.id])

        result = context["payroll_result"]
        self.assertTrue(result["attempted"])
        self.assertEqual(len(result["runs_created"]), 1)
        self.assertEqual(result["users_without_wage"][0]["username"], "ahoxha")

    def test_no_payroll_run_is_created_when_option_is_off(self):
        options = {"update_existing": False, "generate_draft_payroll": False}
        self._commit_two_rows(options)
        self.assertFalse(PayrollRun.objects.exists())

    def test_existing_run_for_the_period_is_left_alone(self):
        PayrollRun.objects.create(
            year=2026, month=1, status="draft", rule_set=self.rule_set, created_by=self.actor,
        )
        options = {"update_existing": False, "generate_draft_payroll": True}
        r1, r2, context = self._commit_two_rows(options)

        self.assertEqual(r1.status, "created")
        self.assertEqual(PayrollRun.objects.filter(year=2026, month=1).count(), 1)
        self.assertIn("already exists", context["payroll_result"]["runs_skipped"][0]["reason"])

    def test_a_generation_failure_does_not_roll_back_the_already_imported_logs(self):
        """finalize_batch must never let a Payroll-side bug undo the import."""
        options = {"update_existing": False, "generate_draft_payroll": True}
        context = {"actor": self.actor}
        result = self.overtime_importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("3")),
            options, context=context,
        )
        self.assertEqual(result.status, "created")

        with patch(
            "plugins.payroll.services.payroll_service.generate_draft_run",
            side_effect=RuntimeError("boom"),
        ):
            self.overtime_importer.finalize_batch(context, options, dry_run=False)

        self.assertTrue(OvertimeLog.objects.filter(user=self.user_with_wage).exists())
        self.assertFalse(PayrollRun.objects.exists())
        self.assertIn("Draft payroll generation failed", context["payroll_result"]["runs_skipped"][0]["reason"])

    def test_dry_run_never_generates_a_payroll_run(self):
        options = {"update_existing": False, "generate_draft_payroll": True}
        context = {"actor": self.actor}
        self.overtime_importer.validate_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("3")),
            options, context=context,
        )
        self.overtime_importer.finalize_batch(context, options, dry_run=True)
        self.assertFalse(PayrollRun.objects.exists())

    def test_dry_run_still_reports_a_payroll_preview(self):
        """Preview must show what WOULD happen, without writing anything."""
        options = {"update_existing": False, "generate_draft_payroll": True}
        context = {"actor": self.actor}
        self.overtime_importer.validate_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("3")),
            options, context=context,
        )
        self.overtime_importer.finalize_batch(context, options, dry_run=True)
        self.assertFalse(PayrollRun.objects.exists())
        result = context["payroll_result"]
        self.assertTrue(result["attempted"])
        self.assertEqual(len(result["runs_created"]), 1)
        self.assertIsNone(result["runs_created"][0]["run_id"])

    def test_a_skipped_duplicate_row_still_counts_toward_payroll_eligibility(self):
        OvertimeLog.objects.create(
            user=self.user_with_wage, client=self.client_obj, date=date(2026, 1, 5),
            hours=Decimal("3"), status="approved",
        )
        options = {"update_existing": False, "generate_draft_payroll": True}
        context = {"actor": self.actor}
        result = self.overtime_importer.commit_row(
            row(username="mrossi", client_code="ACME", date=date(2026, 1, 5), hours=Decimal("5")),
            options, context=context,
        )
        self.assertEqual(result.status, "skipped")

        self.overtime_importer.finalize_batch(context, options, dry_run=False)

        run = PayrollRun.objects.get(year=2026, month=1)
        self.assertEqual(list(run.lines.values_list("user", flat=True)), [self.user_with_wage.id])


class ClientValueTransformTests(TestCase):
    """End-to-end: an unknown raw client code remapped via value_transforms."""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin", is_staff=True)
        self.user = User.objects.create_user(username="mrossi")
        self.client_obj = Client.objects.create(code="ACME", name="Acme")
        self.factory = APIRequestFactory()

    def _make_csv(self, rows, columns):
        df = pd.DataFrame(rows, columns=columns)
        buffer = io.BytesIO()
        df.to_csv(buffer, index=False)
        buffer.seek(0)
        return buffer

    def test_unknown_client_code_remapped_via_value_transform(self):
        csv = self._make_csv(
            [{"Username": "mrossi", "Client Code": "ACM", "Date": "2026-01-05", "Hours": 3}],
            ["Username", "Client Code", "Date", "Hours"],
        )
        view = DataImportViewSet.as_view({"post": "preview"})
        request = self.factory.post(
            "/api/plugins/data_import/import/preview/",
            {
                "file": csv,
                "target_key": "overtime_logs",
                "field_mapping": json.dumps({
                    "username": "Username",
                    "client_code": "Client Code",
                    "date": "Date",
                    "hours": "Hours",
                }),
                "default_values": "{}",
                "options": json.dumps({
                    "value_transforms": {"client_code": {"ACM": "ACME"}},
                }),
            },
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["valid"], 1)
        self.assertEqual(response.data["rows"][0]["preview"]["client_code"], "ACME")
