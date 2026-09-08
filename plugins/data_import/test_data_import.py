"""
Tests for the Universal Data Import plugin.
"""

import io
import json
from decimal import Decimal

import pandas as pd
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient, APIRequestFactory

from apps.leave_management.models import LeaveBalance
from apps.users.models import Team
from plugins.data_import.importers.base import BaseImporter, ImportField, ImportRowResult
from plugins.data_import.importers.registry import (
    get_importer,
    is_registered,
    list_importers,
    register,
)
from plugins.data_import.importers.users import UserImporter
from plugins.data_import.importers.leave_balances import LeaveBalanceImporter
from plugins.data_import.models import ImportBatch
from plugins.data_import.viewsets import (
    DataImportViewSet,
    ImportTargetViewSet,
)


class DummyImporter(BaseImporter):
    target_key = "dummy"
    display_name = "Dummy"
    description = "For testing registration only."

    def get_fields(self):
        return [ImportField(key="name", label="Name", required=True, field_type="string")]

    def get_alias_suggestions(self):
        return {"name": ["name"]}

    def get_dedupe_keys(self):
        return []

    def validate_row(self, mapped_row, options, *, existing=None):
        return ImportRowResult(row_index=mapped_row.get("__row_index", 0), status="valid")

    def commit_row(self, mapped_row, options, *, existing=None, dry_run=False):
        return ImportRowResult(row_index=mapped_row.get("__row_index", 0), status="created")


class RegistryTests(TestCase):
    def test_registered_importers(self):
        self.assertTrue(is_registered("users"))
        self.assertTrue(is_registered("leave_balances"))
        self.assertFalse(is_registered("unknown"))

    def test_list_importers(self):
        importers = list_importers()
        keys = [i.target_key for i in importers]
        self.assertIn("users", keys)
        self.assertIn("leave_balances", keys)

    def test_register_decorator(self):
        @register
        class TestImporter(DummyImporter):
            target_key = "test_target"

        self.assertTrue(is_registered("test_target"))
        importer = get_importer("test_target")
        self.assertIsInstance(importer, TestImporter)


class UserImporterTests(TestCase):
    def setUp(self):
        self.importer = UserImporter()
        self.team = Team.objects.create(name="Engineering", code="eng")
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password"
        )
        self.admin.is_staff = True
        self.admin.save()

    def test_get_fields(self):
        fields = self.importer.get_fields()
        keys = [f.key for f in fields]
        self.assertIn("username", keys)
        self.assertIn("email", keys)
        self.assertIn("password", keys)

    def test_create_user_with_generated_password(self):
        row = {
            "__row_index": 1,
            "username": "newuser",
            "email": "newuser@example.com",
            "first_name": "New",
            "last_name": "User",
            "team_code": "eng",
        }
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "created")
        self.assertIn("password", result.extra)

        user = User.objects.get(username="newuser")
        self.assertEqual(user.email, "newuser@example.com")
        self.assertEqual(user.first_name, "New")
        self.assertTrue(user.profile.team_memberships.filter(team=self.team).exists())

    def test_create_user_with_fixed_password(self):
        row = {
            "__row_index": 1,
            "username": "newuser2",
            "email": "newuser2@example.com",
        }
        options = {"password_strategy": "fixed", "default_password": "StrongPass123!"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "created")
        self.assertEqual(result.extra.get("password"), "StrongPass123!")

    def test_update_existing_user(self):
        user = User.objects.create_user(
            username="existing", email="existing@example.com", password="password"
        )
        row = {
            "__row_index": 1,
            "username": "existing",
            "email": "existing@example.com",
            "first_name": "Updated",
        }
        options = {"password_strategy": "generate", "update_existing": True}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "updated")
        user.refresh_from_db()
        self.assertEqual(user.first_name, "Updated")

    def test_skip_existing_user_without_update(self):
        User.objects.create_user(
            username="existing", email="existing@example.com", password="password"
        )
        row = {
            "__row_index": 1,
            "username": "existing",
            "email": "existing@example.com",
        }
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "skipped")

    def test_invalid_team_code(self):
        row = {
            "__row_index": 1,
            "username": "badteam",
            "email": "badteam@example.com",
            "team_code": "noexist",
        }
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "error")
        self.assertTrue(any("Team" in e for e in result.errors))

    def test_missing_username_email(self):
        row = {"__row_index": 1, "username": "", "email": ""}
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "error")

    def test_weak_fixed_password_rejected(self):
        row = {
            "__row_index": 1,
            "username": "newuser3",
            "email": "newuser3@example.com",
        }
        options = {"password_strategy": "fixed", "default_password": "123"}
        result = self.importer.validate_row(row, options)
        self.assertEqual(result.status, "error")

    def test_password_strategy_missing_default(self):
        row = {
            "__row_index": 1,
            "username": "newuser4",
            "email": "newuser4@example.com",
        }
        options = {"password_strategy": "fixed"}
        result = self.importer.validate_row(row, options)
        self.assertEqual(result.status, "error")

    def test_create_user_with_tech_codes(self):
        from apps.users.models import Tech
        tech1 = Tech.objects.create(name="Infrastructure", code="INFRA")
        tech2 = Tech.objects.create(name="Database", code="DB")
        row = {
            "__row_index": 1,
            "username": "techuser",
            "email": "techuser@example.com",
            "tech_codes": "INFRA,DB",
        }
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "created")
        user = User.objects.get(username="techuser")
        self.assertIn(tech1, user.profile.techs.all())
        self.assertIn(tech2, user.profile.techs.all())

    def test_create_user_with_single_tech_code(self):
        from apps.users.models import Tech
        tech = Tech.objects.create(name="Backup", code="BACKUP")
        row = {
            "__row_index": 1,
            "username": "techuser2",
            "email": "techuser2@example.com",
            "tech_codes": "BACKUP",
        }
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "created")
        user = User.objects.get(username="techuser2")
        self.assertIn(tech, user.profile.techs.all())

    def test_update_user_tech_codes(self):
        from apps.users.models import Tech
        tech1 = Tech.objects.create(name="Infrastructure", code="INFRA")
        user = User.objects.create_user(
            username="techupdate", email="techupdate@example.com", password="password"
        )
        user.profile.techs.add(tech1)
        tech2 = Tech.objects.create(name="Database", code="DB")
        row = {
            "__row_index": 1,
            "username": "techupdate",
            "email": "techupdate@example.com",
            "tech_codes": "DB",
        }
        options = {"password_strategy": "generate", "update_existing": True}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "updated")
        user.refresh_from_db()
        self.assertNotIn(tech1, user.profile.techs.all())
        self.assertIn(tech2, user.profile.techs.all())

    def test_update_user_clear_tech_codes(self):
        from apps.users.models import Tech
        tech = Tech.objects.create(name="Infrastructure", code="INFRA")
        user = User.objects.create_user(
            username="techclear", email="techclear@example.com", password="password"
        )
        user.profile.techs.add(tech)
        row = {
            "__row_index": 1,
            "username": "techclear",
            "email": "techclear@example.com",
            "tech_codes": "",
        }
        options = {"password_strategy": "generate", "update_existing": True}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "updated")
        user.refresh_from_db()
        self.assertEqual(user.profile.techs.count(), 0)

    def test_invalid_tech_code(self):
        row = {
            "__row_index": 1,
            "username": "badtech",
            "email": "badtech@example.com",
            "tech_codes": "NOTEXIST",
        }
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "error")
        self.assertTrue(any("Tech" in e for e in result.errors))

    def test_tech_codes_lowercase_normalized(self):
        from apps.users.models import Tech
        tech = Tech.objects.create(name="Infrastructure", code="INFRA")
        row = {
            "__row_index": 1,
            "username": "lowertech",
            "email": "lowertech@example.com",
            "tech_codes": "infra",
        }
        options = {"password_strategy": "generate"}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "created")
        user = User.objects.get(username="lowertech")
        self.assertIn(tech, user.profile.techs.all())


class LeaveBalanceImporterTests(TestCase):
    def setUp(self):
        self.importer = LeaveBalanceImporter()
        self.user = User.objects.create_user(
            username="leaveuser", email="leave@example.com", password="password"
        )

    def test_create_leave_balance(self):
        row = {
            "__row_index": 1,
            "username": "leaveuser",
            "leave_type": "vacation",
            "year": 2026,
            "total_days": Decimal("22.0"),
            "used_days": Decimal("5.0"),
        }
        options = {}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "created")
        balance = LeaveBalance.objects.get(user=self.user, year=2026)
        self.assertEqual(balance.total_days, Decimal("22.0"))
        self.assertEqual(balance.used_days, Decimal("5.0"))

    def test_update_existing_balance(self):
        LeaveBalance.objects.create(
            user=self.user,
            leave_type="vacation",
            year=2026,
            total_days=Decimal("20.0"),
            used_days=Decimal("0.0"),
        )
        row = {
            "__row_index": 1,
            "username": "leaveuser",
            "leave_type": "vacation",
            "year": 2026,
            "total_days": Decimal("25.0"),
        }
        options = {"update_existing": True}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "updated")
        balance = LeaveBalance.objects.get(user=self.user, year=2026)
        self.assertEqual(balance.total_days, Decimal("25.0"))

    def test_skip_without_update(self):
        LeaveBalance.objects.create(
            user=self.user,
            leave_type="vacation",
            year=2026,
            total_days=Decimal("20.0"),
        )
        row = {
            "__row_index": 1,
            "username": "leaveuser",
            "leave_type": "vacation",
            "year": 2026,
            "total_days": Decimal("25.0"),
        }
        options = {"update_existing": False}
        result = self.importer.commit_row(row, options)
        self.assertEqual(result.status, "skipped")

    def test_error_when_user_missing(self):
        row = {
            "__row_index": 1,
            "username": "nouser",
            "leave_type": "vacation",
            "year": 2026,
            "total_days": Decimal("10.0"),
        }
        result = self.importer.commit_row(row, {})
        self.assertEqual(result.status, "error")
        self.assertTrue(any("does not exist" in e.lower() or "import users" in e.lower() for e in result.errors))

    def test_negative_total_days_error(self):
        row = {
            "__row_index": 1,
            "username": "leaveuser",
            "leave_type": "vacation",
            "year": 2026,
            "total_days": Decimal("-1.0"),
        }
        result = self.importer.commit_row(row, {})
        self.assertEqual(result.status, "error")

    def test_used_exceeds_total_warning(self):
        row = {
            "__row_index": 1,
            "username": "leaveuser",
            "leave_type": "vacation",
            "year": 2026,
            "total_days": Decimal("5.0"),
            "used_days": Decimal("10.0"),
        }
        result = self.importer.commit_row(row, {})
        self.assertEqual(result.status, "created")
        self.assertTrue(result.warnings)


class ViewsetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password"
        )
        self.admin.is_staff = True
        self.admin.save()
        self.client.force_authenticate(user=self.admin)

    def _make_csv(self, rows, columns):
        df = pd.DataFrame(rows, columns=columns)
        buffer = io.BytesIO()
        df.to_csv(buffer, index=False)
        buffer.seek(0)
        return buffer

    def test_targets_list(self):
        view = ImportTargetViewSet.as_view({'get': 'list'})
        request = APIRequestFactory().get('/api/plugins/data_import/targets/')
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        target_keys = [t['target_key'] for t in response.data['targets']]
        self.assertIn('users', target_keys)
        self.assertIn('leave_balances', target_keys)

    def test_analyze_csv(self):
        csv = self._make_csv(
            [{'Username': 'u1', 'Email': 'u1@example.com'}],
            ['Username', 'Email']
        )
        view = DataImportViewSet.as_view({'post': 'analyze'})
        request = APIRequestFactory().post(
            '/api/plugins/data_import/import/analyze/',
            {'file': csv, 'target_key': 'users'},
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn('detected_columns', response.data)
        self.assertIn('suggested_mapping', response.data)

    def test_preview_and_commit_users(self):
        Team.objects.create(name="Engineering", code="eng")
        csv = self._make_csv(
            [{'Username': 'importeduser', 'Email': 'imported@example.com', 'Team Code': 'eng'}],
            ['Username', 'Email', 'Team Code']
        )
        mapping = {
            'username': 'Username',
            'email': 'Email',
            'team_code': 'Team Code',
        }
        import json

        # Preview
        view = DataImportViewSet.as_view({'post': 'preview'})
        request = APIRequestFactory().post(
            '/api/plugins/data_import/import/preview/',
            {
                'file': csv,
                'target_key': 'users',
                'field_mapping': json.dumps(mapping),
                'default_values': '{}',
                'options': json.dumps({'password_strategy': 'generate'}),
            },
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['valid'], 1)

        # Commit
        csv.seek(0)
        view = DataImportViewSet.as_view({'post': 'commit'})
        request = APIRequestFactory().post(
            '/api/plugins/data_import/import/commit/',
            {
                'file': csv,
                'target_key': 'users',
                'field_mapping': json.dumps(mapping),
                'default_values': '{}',
                'options': json.dumps({'password_strategy': 'generate'}),
            },
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['created'], 1)
        self.assertTrue(User.objects.filter(username='importeduser').exists())
        self.assertEqual(ImportBatch.objects.count(), 1)

    def test_saving_existing_profile_updates_its_mapping(self):
        import json
        from .models import ImportProfile

        view = DataImportViewSet.as_view({'post': 'commit'})
        first_csv = self._make_csv(
            [{'Username': 'profile-user-1', 'Email': 'one@example.com'}],
            ['Username', 'Email'],
        )
        first_mapping = {'username': 'Username', 'email': 'Email'}
        first_request = APIRequestFactory().post(
            '/api/plugins/data_import/import/commit/',
            {
                'file': first_csv,
                'target_key': 'users',
                'field_mapping': json.dumps(first_mapping),
                'default_values': '{}',
                'options': json.dumps({'password_strategy': 'generate'}),
                'save_profile': 'true',
                'profile_name': 'Users profile',
            },
        )
        first_request.user = self.admin
        self.assertEqual(view(first_request).status_code, 200)

        second_csv = self._make_csv(
            [{'Login': 'profile-user-2', 'Email Address': 'two@example.com'}],
            ['Login', 'Email Address'],
        )
        second_mapping = {'username': 'Login', 'email': 'Email Address'}
        second_request = APIRequestFactory().post(
            '/api/plugins/data_import/import/commit/',
            {
                'file': second_csv,
                'target_key': 'users',
                'field_mapping': json.dumps(second_mapping),
                'default_values': '{}',
                'options': json.dumps({'password_strategy': 'generate'}),
                'save_profile': 'true',
                'profile_name': 'Users profile',
            },
        )
        second_request.user = self.admin
        self.assertEqual(view(second_request).status_code, 200)

        profile = ImportProfile.objects.get(name='Users profile', target_key='users')
        self.assertEqual(profile.field_mapping, second_mapping)

    def test_non_staff_user_forbidden(self):
        user = User.objects.create_user(
            username="regular", email="regular@example.com", password="password"
        )
        request = APIRequestFactory().post(
            '/api/plugins/data_import/import/analyze/',
            {'file': io.BytesIO(b'Username,Email\nu1,e@example.com'), 'target_key': 'users'},
        )
        request.user = user
        view = DataImportViewSet.as_view({'post': 'analyze'})
        response = view(request)
        self.assertIn(response.status_code, [403, 404])


class ValueTransformTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="leaveuser", email="leave@example.com", password="password"
        )
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password"
        )
        self.admin.is_staff = True
        self.admin.save()

    def _make_csv(self, rows, columns):
        df = pd.DataFrame(rows, columns=columns)
        buffer = io.BytesIO()
        df.to_csv(buffer, index=False)
        buffer.seek(0)
        return buffer

    def test_detected_values_in_analyze(self):
        csv = self._make_csv(
            [{"Leave Type": "PTO", "Total Days": 22}],
            ["Leave Type", "Total Days"],
        )
        view = DataImportViewSet.as_view({'post': 'analyze'})
        request = APIRequestFactory().post(
            '/api/plugins/data_import/import/analyze/',
            {'file': csv, 'target_key': 'leave_balances'},
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn('detected_values', response.data)
        self.assertIn('PTO', response.data['detected_values']['Leave Type'])

    def test_value_transforms_map_raw_to_canonical(self):
        csv = self._make_csv(
            [{"Username": "leaveuser", "Leave Type": "PTO", "Year": 2026, "Total Days": 22}],
            ["Username", "Leave Type", "Year", "Total Days"],
        )
        mapping = {
            'username': 'Username',
            'leave_type': 'Leave Type',
            'year': 'Year',
            'total_days': 'Total Days',
        }

        view = DataImportViewSet.as_view({'post': 'preview'})
        request = APIRequestFactory().post(
            '/api/plugins/data_import/import/preview/',
            {
                'file': csv,
                'target_key': 'leave_balances',
                'field_mapping': json.dumps(mapping),
                'default_values': '{}',
                'options': json.dumps({
                    'value_transforms': {'leave_type': {'PTO': 'vacation'}},
                }),
            },
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['valid'], 1)
        preview = response.data['rows'][0]['preview']
        self.assertEqual(preview['leave_type'], 'vacation')

    def test_unmapped_choice_value_without_transform_errors(self):
        csv = self._make_csv(
            [{"Username": "leaveuser", "Leave Type": "UNKNOWN", "Year": 2026, "Total Days": 22}],
            ["Username", "Leave Type", "Year", "Total Days"],
        )
        mapping = {
            'username': 'Username',
            'leave_type': 'Leave Type',
            'year': 'Year',
            'total_days': 'Total Days',
        }

        view = DataImportViewSet.as_view({'post': 'preview'})
        request = APIRequestFactory().post(
            '/api/plugins/data_import/import/preview/',
            {
                'file': csv,
                'target_key': 'leave_balances',
                'field_mapping': json.dumps(mapping),
                'default_values': '{}',
                'options': '{}',
            },
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['error'], 1)


class SharedTabularFileTests(TestCase):
    def test_read_csv(self):
        from core.utils.tabular_file import read_tabular_file, suggest_mapping
        csv = b"Username,Email\nu1,e1@example.com"
        df = read_tabular_file(csv, filename="users.csv")
        self.assertEqual(list(df.columns), ["Username", "Email"])

        mapping = suggest_mapping(
            list(df.columns),
            {"username": ["username"], "email": ["email"]},
        )
        self.assertEqual(mapping, {"username": "Username", "email": "Email"})

    def test_suggest_mapping_case_insensitive(self):
        from core.utils.tabular_file import suggest_mapping
        mapping = suggest_mapping(
            ["USER NAME", "E-MAIL"],
            {"username": ["user name", "username"], "email": ["email", "e-mail"]},
        )
        self.assertEqual(mapping["username"], "USER NAME")
        self.assertEqual(mapping["email"], "E-MAIL")


class UserImporterIsolationTests(TestCase):
    """Verify that one bad row does not roll back the whole batch."""

    def setUp(self):
        self.importer = UserImporter()
        self.team = Team.objects.create(name="Engineering", code="eng")

    def test_one_bad_row_does_not_block_valid_rows(self):
        rows = [
            {"__row_index": 1, "username": "gooduser", "email": "good@example.com", "team_code": "eng"},
            {"__row_index": 2, "username": "baduser", "email": "bad@example.com", "team_code": "nope"},
            {"__row_index": 3, "username": "gooduser2", "email": "good2@example.com", "team_code": "eng"},
        ]
        options = {"password_strategy": "generate"}

        results = [self.importer.commit_row(row, options) for row in rows]

        statuses = [r.status for r in results]
        self.assertEqual(statuses, ["created", "error", "created"])
        self.assertTrue(User.objects.filter(username="gooduser").exists())
        self.assertTrue(User.objects.filter(username="gooduser2").exists())
        self.assertFalse(User.objects.filter(username="baduser").exists())

    def test_duplicate_username_within_file_second_row_skips(self):
        rows = [
            {"__row_index": 1, "username": "dupuser", "email": "first@example.com"},
            {"__row_index": 2, "username": "dupuser", "email": "second@example.com"},
        ]
        options = {"password_strategy": "generate"}

        results = [self.importer.commit_row(row, options) for row in rows]

        self.assertEqual(results[0].status, "created")
        self.assertEqual(results[1].status, "skipped")
        self.assertEqual(User.objects.filter(username="dupuser").count(), 1)

    def test_match_by_email_falls_back(self):
        User.objects.create_user(username="legacy", email="legacy@example.com", password="password")
        row = {
            "__row_index": 1,
            "username": "",
            "email": "legacy@example.com",
            "first_name": "Updated",
        }
        options = {"password_strategy": "generate", "update_existing": True, "match_by_email": True}
        result = self.importer.commit_row(row, options)

        self.assertEqual(result.status, "updated")
        user = User.objects.get(email="legacy@example.com")
        self.assertEqual(user.first_name, "Updated")


class UserCreationServiceTests(TestCase):
    """Direct tests for the shared create_user_with_profile helper."""

    def setUp(self):
        self.team = Team.objects.create(name="Engineering", code="eng")

    def test_create_user_with_profile_creates_user_and_profile(self):
        from apps.users.services.user_creation import create_user_with_profile

        user = create_user_with_profile(
            username="serviceuser",
            email="service@example.com",
            password="StrongPass123!",
            first_name="Service",
            last_name="User",
            phone="12345",
            team=self.team,
            is_hr=True,
            is_italian_tl_role=True,
        )
        self.assertEqual(user.username, "serviceuser")
        self.assertEqual(user.email, "service@example.com")
        self.assertEqual(user.first_name, "Service")
        self.assertTrue(user.profile.is_hr_user)
        self.assertTrue(user.profile.is_italian_tl_role)
        self.assertTrue(user.profile.team_memberships.filter(team=self.team).exists())

    def test_create_user_with_profile_rejects_duplicate_username(self):
        from apps.users.services.user_creation import create_user_with_profile

        create_user_with_profile(
            username="dupuser",
            email="dup1@example.com",
            password="StrongPass123!",
        )
        with self.assertRaises(ValueError) as ctx:
            create_user_with_profile(
                username="dupuser",
                email="dup2@example.com",
                password="StrongPass123!",
            )
        self.assertIn("already exists", str(ctx.exception).lower())


class ViewsetExcelTests(TestCase):
    """Happy-path viewset tests using an XLSX fixture."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="password"
        )
        self.admin.is_staff = True
        self.admin.save()
        self.client.force_authenticate(user=self.admin)

    def _make_xlsx(self, rows, columns):
        df = pd.DataFrame(rows, columns=columns)
        buffer = io.BytesIO()
        df.to_excel(buffer, index=False, engine="openpyxl")
        buffer.seek(0)
        return buffer

    def test_analyze_xlsx(self):
        xlsx = self._make_xlsx(
            [{"Username": "u1", "Email": "u1@example.com"}],
            ["Username", "Email"],
        )
        view = DataImportViewSet.as_view({"post": "analyze"})
        request = APIRequestFactory().post(
            "/api/plugins/data_import/import/analyze/",
            {"file": xlsx, "target_key": "users"},
        )
        request.user = self.admin
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn("detected_columns", response.data)
        self.assertIn("Username", response.data["detected_columns"])


class PasswordAuditTests(TestCase):
    """Verify plaintext passwords never leak into persisted audit records."""

    def test_fixed_password_not_stored_in_import_batch(self):
        from plugins.data_import.viewsets import _sanitize_options_for_storage

        sanitized = _sanitize_options_for_storage({
            "password_strategy": "fixed",
            "default_password": "SuperSecret123!",
        })
        self.assertNotIn("default_password", sanitized)
        self.assertEqual(sanitized["password_strategy"], "fixed")
