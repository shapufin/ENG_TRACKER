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
        self.assertEqual({u.pk for u in _team_recipients(member)}, {linked.pk})  # Team.team_leader is calendar-only
        User.objects.filter(pk__in=[leader.pk, linked.pk]).update(is_active=False)
        self.assertEqual(list(_team_recipients(member)), [])


class OffboardingReportTests(TestCase):
    """Deactivating a leader also reports the pending requests and open HBPR assignments left on them."""

    @classmethod
    def setUpTestData(cls):
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role
        from apps.users.services.hbpr_assignments import create_assignment

        for code, name in [("hbpr", "HBPR"), ("albanian_tl", "Line Manager")]:
            Role.objects.get_or_create(code=code, defaults={"name": name})
        cls.leader = make_user("off-lead")
        assign_role(cls.leader, "albanian_tl")
        cls.hbpr = make_user("off-hbpr")
        assign_role(cls.hbpr, "hbpr")
        cls.assignment_factory = create_assignment
        cls.member = make_user("off-member")
        cls.member.profile.albanian_tl = cls.leader
        cls.member.profile.save()

    def test_pending_leave_and_overtime_of_linked_members_are_reported(self):
        from datetime import date, time

        from apps.leave_management.models import LeaveRequest
        from apps.overtime.models import Client, OvertimeLog

        LeaveRequest.objects.create(
            user=self.member, request_type="vacation", start_date=date(2026, 12, 1),
            end_date=date(2026, 12, 2), status="pending",
        )
        OvertimeLog.objects.create(
            user=self.member, client=Client.objects.create(name="Off Client"), date="2026-12-03",
            hours=2.0, start_time=time(18, 0), end_time=time(20, 0), description="x",
        )
        warnings = deactivation_warnings(self.leader)
        self.assertTrue(any("2 pending requests" in line for line in warnings), warnings)

    def test_open_hbpr_assignment_is_reported(self):
        from datetime import date

        self.assignment_factory(
            hbpr=self.hbpr, albanian_tl=self.leader, effective_from=date(2026, 1, 1), cadence="weekly",
        )
        warnings = deactivation_warnings(self.leader)
        self.assertTrue(any("HBPR" in line for line in warnings), warnings)

    def test_plain_member_still_has_no_warnings(self):
        self.assertEqual(deactivation_warnings(self.member), [])
