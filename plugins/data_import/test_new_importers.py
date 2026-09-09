"""
Round-trip tests for the targets added alongside the per-page import dialog.
"""

from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from apps.dashboard.models.calendar import PublicHoliday
from apps.overtime.models import Client
from apps.users.models import Team, Tech
from plugins.control_room.models import ControlRoomAccess
from plugins.data_import.importers.clients import ClientImporter
from plugins.data_import.importers.control_room_access import ControlRoomAccessImporter
from plugins.data_import.importers.public_holidays import PublicHolidayImporter
from plugins.data_import.importers.skill_categories import SkillCategoryImporter
from plugins.data_import.importers.skills import SkillImporter
from plugins.data_import.importers.teams import TeamImporter
from plugins.data_import.importers.techs import TechImporter
from plugins.data_import.importers.user_skills import UserSkillImporter
from plugins.skills.models import Skill, SkillCategory, SkillRatingHistory, UserSkill

UPDATE = {"update_existing": True}
NO_UPDATE = {"update_existing": False}


def row(index=1, **values):
    return {"__row_index": index, **values}


class ClientImporterTests(TestCase):
    def setUp(self):
        self.importer = ClientImporter()

    def test_creates_a_client(self):
        result = self.importer.commit_row(
            row(code="ACME", name="Acme", description="", is_active=True), NO_UPDATE
        )
        self.assertEqual(result.status, "created")
        self.assertTrue(Client.objects.filter(code="ACME", name="Acme").exists())

    def test_dry_run_writes_nothing(self):
        result = self.importer.validate_row(row(code="ACME", name="Acme"), NO_UPDATE)
        self.assertEqual(result.status, "valid")
        self.assertFalse(Client.objects.exists())

    def test_skips_an_existing_client_without_update(self):
        Client.objects.create(code="ACME", name="Acme")
        result = self.importer.commit_row(row(code="ACME", name="Renamed"), NO_UPDATE)
        self.assertEqual(result.status, "skipped")
        self.assertEqual(Client.objects.get(code="ACME").name, "Acme")

    def test_updates_an_existing_client(self):
        Client.objects.create(code="ACME", name="Acme")
        result = self.importer.commit_row(row(code="ACME", name="Acme Inc"), UPDATE)
        self.assertEqual(result.status, "updated")
        self.assertEqual(Client.objects.get(code="ACME").name, "Acme Inc")

    def test_duplicate_name_reports_a_readable_error(self):
        Client.objects.create(code="OTHER", name="Acme")
        result = self.importer.commit_row(row(code="ACME", name="Acme"), NO_UPDATE)
        self.assertEqual(result.status, "error")
        self.assertIn("already uses the name", result.errors[0])

    def test_missing_code_is_an_error(self):
        result = self.importer.commit_row(row(name="Acme"), NO_UPDATE)
        self.assertEqual(result.status, "error")


class TechImporterTests(TestCase):
    def setUp(self):
        self.importer = TechImporter()

    def test_code_is_upper_cased_to_match_the_model(self):
        result = self.importer.commit_row(row(code="infra", name="Infrastructure"), NO_UPDATE)
        self.assertEqual(result.status, "created")
        self.assertTrue(Tech.objects.filter(code="INFRA").exists())

    def test_lower_case_code_matches_an_existing_upper_case_tech(self):
        Tech.objects.create(code="INFRA", name="Infrastructure")
        result = self.importer.commit_row(row(code="infra", name="Infra"), UPDATE)
        self.assertEqual(result.status, "updated")
        self.assertEqual(Tech.objects.count(), 1)


class TeamImporterTests(TestCase):
    def setUp(self):
        self.importer = TeamImporter()

    def _run(self, rows, options=NO_UPDATE):
        context = self.importer.prepare_batch(rows, options)
        context["actor"] = None
        results = [self.importer.commit_row(r, options, context=context) for r in rows]
        self.importer.finalize_batch(context, options)
        return results

    def test_creates_a_team(self):
        results = self._run([row(code="ENG", name="Engineering")])
        self.assertEqual(results[0].status, "created")
        self.assertTrue(Team.objects.filter(code="ENG").exists())

    def test_parent_listed_later_in_the_file_still_links(self):
        rows = [
            row(1, code="ENG-DB", name="Databases", parent_team_code="ENG"),
            row(2, code="ENG", name="Engineering"),
        ]
        results = self._run(rows)
        self.assertEqual([r.status for r in results], ["created", "created"])
        self.assertEqual(Team.objects.get(code="ENG-DB").parent_team.code, "ENG")

    def test_unknown_parent_is_a_row_error(self):
        results = self._run([row(code="ENG-DB", name="Databases", parent_team_code="NOPE")])
        self.assertEqual(results[0].status, "error")
        self.assertIn("does not exist", results[0].errors[0])

    def test_self_parenting_is_rejected(self):
        results = self._run([row(code="ENG", name="Engineering", parent_team_code="ENG")])
        self.assertEqual(results[0].status, "error")
        self.assertIn("own parent", results[0].errors[0])

    def test_team_leader_resolves_by_username(self):
        User.objects.create_user(username="lead", email="lead@example.com", password="pw")
        results = self._run([row(code="ENG", name="Engineering", team_leader_username="lead")])
        self.assertEqual(results[0].status, "created")
        self.assertEqual(Team.objects.get(code="ENG").team_leader.username, "lead")

    def test_unknown_team_leader_is_a_row_error(self):
        results = self._run([row(code="ENG", name="Engineering", team_leader_username="ghost")])
        self.assertEqual(results[0].status, "error")

    def test_dry_run_does_not_link_deferred_parents(self):
        rows = [
            row(1, code="ENG-DB", name="Databases", parent_team_code="ENG"),
            row(2, code="ENG", name="Engineering"),
        ]
        context = self.importer.prepare_batch(rows, NO_UPDATE, dry_run=True)
        for r in rows:
            self.importer.validate_row(r, NO_UPDATE, context=context)
        self.importer.finalize_batch(context, NO_UPDATE, dry_run=True)
        self.assertFalse(Team.objects.filter(code__in=["ENG", "ENG-DB"]).exists())


class SkillsImporterTests(TestCase):
    def setUp(self):
        self.category_importer = SkillCategoryImporter()
        self.skill_importer = SkillImporter()

    def test_creates_a_category(self):
        result = self.category_importer.commit_row(
            row(code="CLOUD", name="Cloud"), NO_UPDATE
        )
        self.assertEqual(result.status, "created")

    def test_skill_requires_an_existing_category(self):
        result = self.skill_importer.commit_row(
            row(code="AWS", name="AWS", category_code="NOPE"), NO_UPDATE
        )
        self.assertEqual(result.status, "error")
        self.assertIn("does not exist", result.errors[0])

    def test_creates_a_skill_in_its_category(self):
        SkillCategory.objects.create(code="CLOUD", name="Cloud")
        result = self.skill_importer.commit_row(
            row(code="AWS", name="AWS", category_code="CLOUD"), NO_UPDATE
        )
        self.assertEqual(result.status, "created")
        self.assertEqual(Skill.objects.get(code="AWS").category.code, "CLOUD")

    def test_duplicate_name_in_the_same_category_is_a_readable_error(self):
        category = SkillCategory.objects.create(code="CLOUD", name="Cloud")
        Skill.objects.create(code="AWS1", name="AWS", category=category)
        result = self.skill_importer.commit_row(
            row(code="AWS2", name="AWS", category_code="CLOUD"), NO_UPDATE
        )
        self.assertEqual(result.status, "error")
        self.assertIn("already exists in category", result.errors[0])


class UserSkillImporterTests(TestCase):
    def setUp(self):
        self.importer = UserSkillImporter()
        self.user = User.objects.create_user(
            username="mrossi", email="m.rossi@example.com", password="pw"
        )
        self.actor = User.objects.create_user(
            username="admin", email="admin@example.com", password="pw", is_staff=True
        )
        category = SkillCategory.objects.create(code="CLOUD", name="Cloud")
        self.skill = Skill.objects.create(code="AWS", name="AWS", category=category)

    def _context(self):
        return {"actor": self.actor}

    def test_creates_a_rating(self):
        result = self.importer.commit_row(
            row(username="mrossi", skill_code="AWS", level=4), NO_UPDATE, context=self._context()
        )
        self.assertEqual(result.status, "created")
        self.assertEqual(UserSkill.objects.get(user=self.user, skill=self.skill).level, 4)

    def test_creating_a_rating_records_history_attributed_to_the_importer(self):
        self.importer.commit_row(
            row(username="mrossi", skill_code="AWS", level=4), NO_UPDATE, context=self._context()
        )
        history = SkillRatingHistory.objects.get()
        self.assertEqual(history.new_level, 4)
        self.assertEqual(history.changed_by, self.actor)

    def test_level_out_of_range_is_an_error(self):
        result = self.importer.commit_row(
            row(username="mrossi", skill_code="AWS", level=9), NO_UPDATE, context=self._context()
        )
        self.assertEqual(result.status, "error")
        self.assertIn("between 1 and 5", result.errors[0])

    def test_unknown_skill_is_an_error(self):
        result = self.importer.commit_row(
            row(username="mrossi", skill_code="NOPE", level=3),
            NO_UPDATE,
            context=self._context(),
        )
        self.assertEqual(result.status, "error")

    def test_unknown_user_is_an_error(self):
        result = self.importer.commit_row(
            row(username="ghost", skill_code="AWS", level=3),
            NO_UPDATE,
            context=self._context(),
        )
        self.assertEqual(result.status, "error")

    def test_email_falls_back_when_the_username_does_not_match(self):
        result = self.importer.commit_row(
            row(username="ghost", email="m.rossi@example.com", skill_code="AWS", level=2),
            NO_UPDATE,
            context=self._context(),
        )
        self.assertEqual(result.status, "created")

    def test_existing_rating_is_skipped_without_update(self):
        UserSkill.objects.create(user=self.user, skill=self.skill, level=2)
        result = self.importer.commit_row(
            row(username="mrossi", skill_code="AWS", level=5), NO_UPDATE, context=self._context()
        )
        self.assertEqual(result.status, "skipped")
        self.assertEqual(UserSkill.objects.get().level, 2)

    def test_dry_run_writes_neither_rating_nor_history(self):
        self.importer.validate_row(
            row(username="mrossi", skill_code="AWS", level=4), NO_UPDATE, context=self._context()
        )
        self.assertFalse(UserSkill.objects.exists())
        self.assertFalse(SkillRatingHistory.objects.exists())


class PublicHolidayImporterTests(TestCase):
    def setUp(self):
        self.importer = PublicHolidayImporter()

    def test_creates_a_global_holiday(self):
        result = self.importer.commit_row(
            row(name="New Year", date=date(2026, 1, 1), country_code="IT"), NO_UPDATE
        )
        self.assertEqual(result.status, "created")
        holiday = PublicHoliday.objects.get()
        self.assertIsNone(holiday.calendar)
        self.assertTrue(holiday.is_global)

    def test_country_code_is_normalized_and_validated(self):
        result = self.importer.commit_row(
            row(name="New Year", date=date(2026, 1, 1), country_code="it"), NO_UPDATE
        )
        self.assertEqual(result.status, "created")
        self.assertEqual(PublicHoliday.objects.get().country_code, "IT")

        bad = self.importer.commit_row(
            row(name="Bad", date=date(2026, 5, 1), country_code="ITA"), NO_UPDATE
        )
        self.assertEqual(bad.status, "error")

    def test_same_date_and_country_is_skipped_without_update(self):
        PublicHoliday.objects.create(name="New Year", date=date(2026, 1, 1), country_code="IT")
        result = self.importer.commit_row(
            row(name="Capodanno", date=date(2026, 1, 1), country_code="IT"), NO_UPDATE
        )
        self.assertEqual(result.status, "skipped")

    def test_unknown_workspace_is_a_row_error(self):
        result = self.importer.commit_row(
            row(name="X", date=date(2026, 1, 1), workspace_name="Nope"), NO_UPDATE
        )
        self.assertEqual(result.status, "error")

    def test_missing_date_is_an_error(self):
        result = self.importer.commit_row(row(name="X"), NO_UPDATE)
        self.assertEqual(result.status, "error")


class ControlRoomAccessImporterTests(TestCase):
    def setUp(self):
        self.importer = ControlRoomAccessImporter()
        self.user = User.objects.create_user(
            username="mrossi", email="m.rossi@example.com", password="pw"
        )
        self.team = Team.objects.create(code="ENG", name="Engineering")
        self.actor = User.objects.create_user(
            username="admin", email="admin@example.com", password="pw", is_staff=True
        )

    def _context(self):
        return {"actor": self.actor}

    def test_grants_access_with_team_scopes(self):
        result = self.importer.commit_row(
            row(username="mrossi", team_codes="ENG"), NO_UPDATE, context=self._context()
        )
        self.assertEqual(result.status, "created")
        access = ControlRoomAccess.objects.get(user=self.user)
        self.assertEqual([s.team.code for s in access.team_scopes.all()], ["ENG"])

    def test_empty_scope_warns_that_it_grants_no_visibility(self):
        result = self.importer.commit_row(
            row(username="mrossi", team_codes=""), NO_UPDATE, context=self._context()
        )
        self.assertEqual(result.status, "created")
        self.assertIn("no visibility", result.warnings[0])

    def test_unknown_team_code_is_a_row_error(self):
        result = self.importer.commit_row(
            row(username="mrossi", team_codes="ENG,NOPE"), NO_UPDATE, context=self._context()
        )
        self.assertEqual(result.status, "error")
        self.assertIn("NOPE", result.errors[0])

    def test_update_replaces_the_scope_set(self):
        other = Team.objects.create(code="OPS", name="Operations")
        self.importer.commit_row(
            row(username="mrossi", team_codes="ENG"), NO_UPDATE, context=self._context()
        )
        self.importer.commit_row(
            row(username="mrossi", team_codes="OPS"), UPDATE, context=self._context()
        )
        access = ControlRoomAccess.objects.get(user=self.user)
        self.assertEqual([s.team_id for s in access.team_scopes.all()], [other.id])

    def test_dry_run_writes_nothing(self):
        self.importer.validate_row(
            row(username="mrossi", team_codes="ENG"), NO_UPDATE, context=self._context()
        )
        self.assertFalse(ControlRoomAccess.objects.exists())
