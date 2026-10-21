"""The employee ``code`` column: Users importer writes it, resolve_user can match it."""
from django.contrib.auth.models import User
from django.test import TestCase

from plugins.data_import.importers.helpers import resolve_user
from plugins.data_import.importers.users import UserImporter

OPTIONS = {"update_existing": True, "password_strategy": "fixed", "default_password": "Zx9!kLmQ4#vTe7"}


def row(**over):
    return {"__row_index": 1, "username": "newbie", "email": "newbie@example.com", **over}


class UserImporterCodeTests(TestCase):
    def test_code_is_a_declared_optional_field_with_aliases(self):
        importer = UserImporter()
        field = next(f for f in importer.get_fields() if f.key == "code")
        self.assertFalse(field.required)
        self.assertIn("employee id", importer.get_alias_suggestions()["code"])

    def test_create_stores_code(self):
        result = UserImporter().commit_row(row(code=" EMP5 "), OPTIONS)
        self.assertEqual(result.status, "created", result.errors)
        self.assertEqual(User.objects.get(username="newbie").profile.code, "EMP5")

    def test_create_with_taken_code_is_a_row_error_and_creates_nobody(self):
        holder = User.objects.create_user(username="holder", email="h@example.com", password="x")
        holder.profile.code = "EMP5"
        holder.profile.save()
        result = UserImporter().commit_row(row(code="emp5"), OPTIONS)
        self.assertEqual(result.status, "error")
        self.assertIn("already exists", result.errors[0])
        self.assertFalse(User.objects.filter(username="newbie").exists())

    def test_dry_run_rejects_taken_code(self):
        holder = User.objects.create_user(username="holder", email="h@example.com", password="x")
        holder.profile.code = "EMP5"
        holder.profile.save()
        result = UserImporter().commit_row(row(code="EMP5"), OPTIONS, dry_run=True)
        self.assertEqual(result.status, "error")

    def test_update_sets_code_and_blank_leaves_it_alone(self):
        user = User.objects.create_user(username="newbie", email="newbie@example.com", password="x")
        UserImporter().commit_row(row(code="EMP6"), OPTIONS)
        user.profile.refresh_from_db()
        self.assertEqual(user.profile.code, "EMP6")
        UserImporter().commit_row(row(code=""), OPTIONS)
        user.profile.refresh_from_db()
        self.assertEqual(user.profile.code, "EMP6")

    def test_update_dry_run_rejects_code_of_another_user(self):
        User.objects.create_user(username="newbie", email="newbie@example.com", password="x")
        holder = User.objects.create_user(username="holder", email="h@example.com", password="x")
        holder.profile.code = "EMP7"
        holder.profile.save()
        result = UserImporter().commit_row(row(code="EMP7"), OPTIONS, dry_run=True)
        self.assertEqual(result.status, "error")

    def test_code_never_hijacks_a_different_username(self):
        holder = User.objects.create_user(username="holder", email="h@example.com", password="x")
        holder.profile.code = "EMP8"
        holder.profile.save()
        result = UserImporter().commit_row(row(code="EMP8"), OPTIONS)
        self.assertEqual(result.status, "error")
        holder.refresh_from_db()
        self.assertEqual(holder.username, "holder")


class ResolveUserByCodeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="mrossi", email="m@example.com", password="x")
        self.user.profile.code = "EMP9"
        self.user.profile.save()

    def test_matches_by_code_case_insensitively(self):
        self.assertEqual(resolve_user({"code": " emp9 "}), self.user)

    def test_username_still_wins_over_code(self):
        other = User.objects.create_user(username="other", email="o@example.com", password="x")
        self.assertEqual(resolve_user({"username": "other", "code": "EMP9"}), other)

    def test_unknown_code_returns_none(self):
        self.assertIsNone(resolve_user({"code": "NOPE"}))
