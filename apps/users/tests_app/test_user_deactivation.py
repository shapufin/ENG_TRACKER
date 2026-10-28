"""Deactivating a team leader must say who is left without an active approver."""
from django.contrib.auth.models import User
from django.test import TestCase

from apps.users.models import Team
from apps.users.services.user_deactivation import deactivation_warnings
from plugins.data_import.importers.users import UserImporter
from plugins.notifications.signals import _team_recipients

OPTIONS = {"update_existing": True, "password_strategy": "fixed", "default_password": "Zx9!kLmQ4#vTe7"}


def make_user(name):
    return User.objects.create_user(name, email=f"{name}@example.com", password="x")


class DeactivationWarningTests(TestCase):
    def setUp(self):
        self.leader = make_user("lead")
        self.member = make_user("mem")
        self.team = Team.objects.create(name="Alpha", code="ALP", team_leader=self.leader)
        self.member.profile.teams.add(self.team)

    def test_plain_user_has_no_warnings(self):
        self.assertEqual(deactivation_warnings(self.member), [])

    def test_leader_of_an_active_team_is_named_with_its_members(self):
        warnings = deactivation_warnings(self.leader)
        self.assertEqual(len(warnings), 1)
        self.assertIn("Alpha", warnings[0])
        self.assertIn("1 member", warnings[0])

    def test_archived_team_is_not_reported(self):
        Team.objects.filter(pk=self.team.pk).update(is_active=False)
        self.assertEqual(deactivation_warnings(self.leader), [])

    def test_members_linked_by_italian_or_albanian_tl_are_counted(self):
        other = make_user("other")
        other.profile.albanian_tl = self.leader
        other.profile.save()
        warnings = deactivation_warnings(self.leader)
        self.assertTrue(any("1 member" in w and "TL link" in w for w in warnings), warnings)

    def test_importer_reports_the_warning_when_it_deactivates_a_leader(self):
        row = {"__row_index": 1, "username": "lead", "email": "lead@example.com", "is_active": "no"}
        result = UserImporter().commit_row(row, OPTIONS)
        self.assertEqual(result.status, "updated", result.errors)
        self.assertTrue(any("Alpha" in w for w in result.warnings), result.warnings)
        self.leader.refresh_from_db()
        self.assertFalse(self.leader.is_active)

    def test_importer_stays_quiet_when_the_user_was_already_inactive(self):
        User.objects.filter(pk=self.leader.pk).update(is_active=False)
        row = {"__row_index": 1, "username": "lead", "email": "lead@example.com", "is_active": "no"}
        result = UserImporter().commit_row(row, OPTIONS)
        self.assertFalse(any("Alpha" in w for w in result.warnings), result.warnings)


class NotificationRecipientTests(TestCase):
    def test_a_deactivated_leader_is_not_a_recipient(self):
        leader = make_user("lead")
        linked = make_user("linked")
        member = make_user("mem")
        team = Team.objects.create(name="Alpha", code="ALP", team_leader=leader)
        member.profile.teams.add(team)
        member.profile.italian_tl = linked
        member.profile.save()
        self.assertEqual({u.pk for u in _team_recipients(member)}, {leader.pk, linked.pk})
        User.objects.filter(pk__in=[leader.pk, linked.pk]).update(is_active=False)
        self.assertEqual(list(_team_recipients(member)), [])
