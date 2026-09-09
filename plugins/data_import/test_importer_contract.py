"""
Tests for the self-describing importer contract.

Every importer must fully describe itself: its fields, the options the UI
should render, sample rows for the downloadable template, and the plugin
permission action that guards it. The frontend renders purely from this
metadata, so a target may never require a hardcoded frontend branch.
"""

from django.test import TestCase

from plugins.data_import.importers.base import (
    BaseImporter,
    ImportField,
    ImportOption,
    ImportRowResult,
)
from plugins.data_import.importers.registry import list_importers, register


class MinimalImporter(BaseImporter):
    """Declares only the abstract members, to exercise the defaults."""

    target_key = "contract_minimal"
    display_name = "Contract Minimal"
    description = "Defaults-only importer used by contract tests."

    def get_fields(self):
        return [ImportField(key="name", label="Name", required=True, field_type="string")]

    def get_alias_suggestions(self):
        return {"name": ["name"]}

    def get_dedupe_keys(self):
        return ["name"]

    def commit_row(self, mapped_row, options, *, existing=None, dry_run=False):
        return ImportRowResult(row_index=mapped_row.get("__row_index", 0), status="created")


class ImportOptionTests(TestCase):
    def test_option_defaults(self):
        option = ImportOption(key="update_existing", label="Update existing", option_type="bool")
        self.assertIsNone(option.default)
        self.assertIsNone(option.choices)
        self.assertEqual(option.help_text, "")
        self.assertIsNone(option.depends_on)


class BaseImporterDefaultsTests(TestCase):
    def setUp(self):
        self.importer = MinimalImporter()

    def test_default_options_expose_update_existing(self):
        keys = [o.key for o in self.importer.get_options()]
        self.assertEqual(keys, ["update_existing"])

    def test_default_option_is_a_bool_defaulting_to_false(self):
        option = self.importer.get_options()[0]
        self.assertEqual(option.option_type, "bool")
        self.assertIs(option.default, False)

    def test_default_permission_scope_is_manage(self):
        self.assertEqual(self.importer.permission_scope, "manage")

    def test_default_authority_allows(self):
        self.assertIsNone(self.importer.check_authority(None))

    def test_default_sample_rows_are_empty(self):
        self.assertEqual(self.importer.get_sample_rows(), [])

    def test_to_dict_includes_contract_members(self):
        data = self.importer.to_dict()
        for key in ("options", "permission_scope", "icon", "page_route", "sample_rows"):
            self.assertIn(key, data)

    def test_to_dict_serializes_options(self):
        options = self.importer.to_dict()["options"]
        self.assertEqual(
            options[0],
            {
                "key": "update_existing",
                "label": "Update existing records",
                "option_type": "bool",
                "default": False,
                "choices": None,
                "help_text": "Update matched records instead of skipping them.",
                "depends_on": None,
            },
        )


class RegistryDuplicateTests(TestCase):
    def test_duplicate_target_key_raises(self):
        @register
        class First(MinimalImporter):
            target_key = "contract_dupe"

        with self.assertRaises(ValueError):

            @register
            class Second(MinimalImporter):
                target_key = "contract_dupe"


class RegisteredImporterContractTests(TestCase):
    """Every shipped importer must satisfy the contract."""

    def setUp(self):
        # Test-only importers registered by other test modules are not shipped
        # importers; select by module so ordering between tests cannot matter.
        self.importers = [
            i
            for i in list_importers()
            if type(i).__module__.startswith("plugins.data_import.importers.")
        ]

    def test_all_expected_targets_are_registered(self):
        keys = {i.target_key for i in self.importers}
        expected = {
            "users",
            "clients",
            "teams",
            "techs",
            "leave_balances",
            "public_holidays",
            "skill_categories",
            "skills",
            "user_skills",
            "control_room_access",
        }
        self.assertTrue(expected.issubset(keys), f"missing: {expected - keys}")

    def test_every_importer_declares_options(self):
        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                options = importer.get_options()
                self.assertTrue(options, "at least update_existing is expected")
                for option in options:
                    self.assertIn(
                        option.option_type, {"bool", "string", "secret", "choice"}
                    )
                    if option.option_type == "choice":
                        self.assertTrue(option.choices)

    def test_permission_scope_is_a_platform_supported_action(self):
        from apps.plugins.services.permission_manifest import SUPPORTED_ACTIONS

        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                self.assertIn(importer.permission_scope, SUPPORTED_ACTIONS)

    def test_every_importer_narrows_authority_beyond_the_plugin_grant(self):
        """Holding the plugin's manage grant must not import every target."""
        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                self.assertIsNot(
                    type(importer).check_authority,
                    BaseImporter.check_authority,
                    "importer must override check_authority",
                )

    def test_every_importer_provides_two_sample_rows(self):
        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                rows = importer.get_sample_rows()
                self.assertEqual(len(rows), 2)

    def test_sample_rows_only_use_declared_field_keys(self):
        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                field_keys = {f.key for f in importer.get_fields()}
                for row in importer.get_sample_rows():
                    self.assertTrue(set(row).issubset(field_keys))

    def test_sample_rows_cover_every_required_field(self):
        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                required = {f.key for f in importer.get_fields() if f.required}
                for row in importer.get_sample_rows():
                    missing = required - {k for k, v in row.items() if v not in (None, "")}
                    self.assertFalse(missing, f"sample row missing {missing}")

    def test_sample_choice_values_are_valid_codes(self):
        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                choice_fields = {
                    f.key: {code for code, _ in (f.choices or [])}
                    for f in importer.get_fields()
                    if f.field_type == "choice" and f.choices
                }
                for row in importer.get_sample_rows():
                    for key, valid in choice_fields.items():
                        if row.get(key) not in (None, ""):
                            self.assertIn(row[key], valid)

    def test_alias_suggestions_only_reference_declared_fields(self):
        for importer in self.importers:
            with self.subTest(target=importer.target_key):
                field_keys = {f.key for f in importer.get_fields()}
                self.assertTrue(set(importer.get_alias_suggestions()).issubset(field_keys))


class UserImporterOptionTests(TestCase):
    """The password options moved from the frontend into the importer."""

    def setUp(self):
        from plugins.data_import.importers.users import UserImporter

        self.options = {o.key: o for o in UserImporter().get_options()}

    def test_declares_user_specific_options(self):
        self.assertEqual(
            set(self.options),
            {
                "update_existing",
                "match_by_email",
                "password_strategy",
                "default_password",
                "overwrite_existing_password",
            },
        )

    def test_password_strategy_is_a_choice_with_three_codes(self):
        option = self.options["password_strategy"]
        self.assertEqual(option.option_type, "choice")
        self.assertEqual({code for code, _ in option.choices}, {"generate", "fixed", "column"})
        self.assertEqual(option.default, "generate")

    def test_default_password_is_a_secret_shown_only_for_the_fixed_strategy(self):
        option = self.options["default_password"]
        self.assertEqual(option.option_type, "secret")
        self.assertEqual(option.depends_on, {"password_strategy": "fixed"})
