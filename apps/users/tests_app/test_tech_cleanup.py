from io import StringIO

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase

from apps.dashboard.models import CalendarWorkspace
from apps.users.models import Tech, Team, TeamMembership


class OrganigramaCleanupTests(TestCase):
    def setUp(self):
        self.leader = User.objects.create_user(username="cleanup-leader", password="test123")
        self.employee = User.objects.create_user(username="cleanup-employee", password="test123")
        self.parent = Team.objects.create(
            name="Albanian Operations", code="AL_OPS", team_leader=self.leader
        )
        self.infra = Team.objects.create(name="Infrastructure", code="INFRA", parent_team=self.parent)
        TeamMembership.objects.create(user_profile=self.employee.profile, team=self.infra)
        self.workspace = CalendarWorkspace.objects.create(
            name="Infrastructure Temporary", code="infra-temporary", team=self.infra
        )

    def test_dry_run_reports_without_mutating(self):
        output = StringIO()
        call_command("migrate_organigrama_techs", stdout=output)

        self.assertIn("dry-run", output.getvalue().lower())
        self.assertTrue(Team.objects.filter(code="INFRA").exists())
        self.assertTrue(CalendarWorkspace.objects.filter(pk=self.workspace.pk).exists())
        self.assertFalse(Tech.objects.filter(code="INFRA").exists())

    def test_confirmed_cleanup_converts_membership_and_deletes_linked_workspace(self):
        call_command("migrate_organigrama_techs", "--confirm-delete")

        self.assertFalse(Team.objects.filter(code__in=["AL_OPS", "INFRA"]).exists())
        self.assertFalse(CalendarWorkspace.objects.filter(pk=self.workspace.pk).exists())
        self.assertTrue(Tech.objects.filter(code="INFRA").exists())
        self.assertTrue(self.employee.profile.techs.filter(code="INFRA").exists())
