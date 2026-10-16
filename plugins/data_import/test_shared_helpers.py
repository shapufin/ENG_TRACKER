"""Tests for the helpers every importer shares (importers/helpers.py)."""
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase

from plugins.data_import.importers.base import row_error_from_exception
from plugins.data_import.importers.clients import ClientImporter
from plugins.data_import.importers.helpers import is_blank, parse_bool, resolve_user
from plugins.data_import.importers.leave_balances import LeaveBalanceImporter


class ResolveUserTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="mrossi", email="m.rossi@example.com", password="x")

    def test_matches_by_username(self):
        self.assertEqual(resolve_user({"username": "mrossi"}), self.user)

    def test_falls_back_to_email(self):
        self.assertEqual(resolve_user({"username": "nobody", "email": "m.rossi@example.com"}), self.user)

    def test_unknown_returns_none(self):
        self.assertIsNone(resolve_user({"username": "nobody", "email": "x@example.com"}))
        self.assertIsNone(resolve_user({}))

    def test_ambiguous_email_returns_none_not_an_exception(self):
        User.objects.create_user(username="other", email="dup@example.com", password="x")
        User.objects.create_user(username="other2", email="dup@example.com", password="x")
        self.assertIsNone(resolve_user({"email": "dup@example.com"}))


class ParseBoolTests(TestCase):
    def test_truthy_values(self):
        for value in (True, "true", "TRUE", " yes ", "Y", "1", 1):
            self.assertIs(parse_bool(value), True, value)

    def test_falsy_values(self):
        for value in (False, "false", "no", "0", "n", 0):
            self.assertIs(parse_bool(value), False, value)

    def test_blank_returns_default(self):
        self.assertIsNone(parse_bool(None))
        self.assertIsNone(parse_bool(""))
        self.assertIs(parse_bool("", default=True), True)
        self.assertIs(parse_bool(None, default=False), False)


class IsBlankTests(TestCase):
    def test_blank_values(self):
        for value in (None, "", "   "):
            self.assertTrue(is_blank(value), repr(value))

    def test_non_blank_values(self):
        for value in ("a", 0, False):
            self.assertFalse(is_blank(value), repr(value))


class LeaveBalanceAmbiguousEmailTests(TestCase):
    def test_duplicate_email_is_a_clean_user_not_found_error(self):
        User.objects.create_user(username="a", email="dup@example.com", password="x")
        User.objects.create_user(username="b", email="dup@example.com", password="x")
        result = LeaveBalanceImporter().commit_row(
            {
                "__row_index": 1,
                "email": "dup@example.com",
                "leave_type": "vacation",
                "year": 2026,
                "total_days": Decimal("20"),
            },
            {},
            dry_run=True,
        )
        self.assertEqual(result.status, "error")
        self.assertFalse(any("Unexpected" in e for e in result.errors), result.errors)


class RowErrorEnvelopeTests(TestCase):
    def test_value_error_is_a_plain_row_error_and_not_logged(self):
        result = row_error_from_exception(3, ValueError("bad cell"))
        self.assertEqual((result.row_index, result.status, result.errors), (3, "error", ["bad cell"]))

    def test_unexpected_exception_is_logged_and_reported(self):
        with self.assertLogs("plugins.data_import.importers.base", level="ERROR"):
            result = row_error_from_exception(4, RuntimeError("boom"))
        self.assertEqual(result.status, "error")
        self.assertEqual(result.errors, ["Unexpected error: boom"])

    def test_importers_use_the_shared_envelope(self):
        importer = ClientImporter()
        with mock.patch.object(ClientImporter, "resolve_relations", side_effect=RuntimeError("boom")):
            with self.assertLogs("plugins.data_import.importers.base", level="ERROR"):
                result = importer.commit_row({"__row_index": 1, "code": "X1", "name": "X"}, {})
        self.assertEqual(result.errors, ["Unexpected error: boom"])
