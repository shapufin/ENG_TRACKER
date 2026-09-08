from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday
from apps.users.models import Team, TeamMembership


class CalendarWorkspaceVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.team = Team.objects.create(name="Italian Core", code="ITA", calendar_group="it")
        self.workspace = CalendarWorkspace.objects.create(
            name="Italian Workspace",
            code="italian-ws",
            team=self.team,
            is_public=False,
        )

        self.team_user = User.objects.create_user(username="member", password="testpass")
        TeamMembership.objects.create(user_profile=self.team_user.profile, team=self.team, is_primary_team=True)
        self.team_leader = User.objects.create_user(username="leader", password="testpass")
        self.team.team_leader = self.team_leader
        self.team.save()

        self.sibling_team = Team.objects.create(name="Italian Sub", code="ITA-SUB", calendar_group="it")
        self.sibling_user = User.objects.create_user(username="sibling", password="testpass")
        TeamMembership.objects.create(user_profile=self.sibling_user.profile, team=self.sibling_team, is_primary_team=True)

        self.outsider = User.objects.create_user(username="outsider", password="testpass")
        self.explicit_user = User.objects.create_user(username="explicit", password="testpass")
        self.workspace.allowed_users.add(self.explicit_user)

    def _extract_ids(self, response):
        payload = response.data
        if isinstance(payload, dict):
            payload = payload.get('results', [])
        return [item['id'] for item in payload]

    def test_team_member_can_access_team_workspace(self):
        self.client.force_authenticate(self.team_user)
        response = self.client.get('/api/dashboard/calendar-workspaces/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = self._extract_ids(response)
        self.assertIn(self.workspace.id, ids)

    def test_calendar_group_members_can_access_related_workspace(self):
        self.client.force_authenticate(self.sibling_user)
        response = self.client.get('/api/dashboard/calendar-workspaces/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = self._extract_ids(response)
        self.assertIn(self.workspace.id, ids)

    def test_outsider_cannot_access_private_workspace(self):
        self.client.force_authenticate(self.outsider)
        response = self.client.get('/api/dashboard/calendar-workspaces/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = self._extract_ids(response)
        self.assertNotIn(self.workspace.id, ids)

    def test_workspace_users_endpoint_returns_identity_fields(self):
        self.client.force_authenticate(self.team_user)
        response = self.client.get(
            f'/api/dashboard/calendar-workspaces/{self.workspace.id}/workspace_users/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreater(len(response.data), 0)
        first = response.data[0]
        expected_fields = {
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'is_staff',
            'is_superuser',
        }
        self.assertTrue(expected_fields.issubset(first.keys()))

    def test_workspace_users_excludes_calendar_group_members(self):
        """workspace_users returns only the workspace's own team members, not calendar_group siblings."""
        self.client.force_authenticate(self.team_user)
        response = self.client.get(
            f'/api/dashboard/calendar-workspaces/{self.workspace.id}/workspace_users/'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = self._extract_ids(response)
        self.assertIn(self.team_user.id, ids)
        self.assertIn(self.team_leader.id, ids)
        self.assertNotIn(self.sibling_user.id, ids)
        self.assertNotIn(self.outsider.id, ids)
        self.assertNotIn(self.explicit_user.id, ids)

    def test_workspace_users_excludes_inactive_team_members(self):
        inactive_user = User.objects.create_user(username="inactive", password="testpass")
        TeamMembership.objects.create(
            user_profile=inactive_user.profile, team=self.team, is_primary_team=True
        )
        inactive_user.is_active = False
        inactive_user.save(update_fields=["is_active"])

        users = self.workspace.get_users_for_workspace()

        self.assertNotIn(inactive_user.id, users.values_list("id", flat=True))

    def test_led_teams_tl_sees_member_team_workspaces(self):
        """A TL set via Team.team_leader (led_teams) must see workspaces for
        teams their assigned members belong to — not just FK-assigned TLs.

        Regression: my_teams_workspaces previously only queried
        albanian_tl/italian_tl FKs, missing the led_teams source that
        get_team_member_ids() includes. This mirrors CONTEXT.md rule #9.
        """
        # TL leads self.team (already set in setUp) and has a member on a
        # separate team with no calendar_group overlap and no FK assignment.
        other_team = Team.objects.create(name="Other Team", code="OTH")
        other_workspace = CalendarWorkspace.objects.create(
            name="Other Workspace",
            code="other-ws",
            team=other_team,
            is_public=False,
        )
        other_member = User.objects.create_user(username="other_member", password="testpass")
        TeamMembership.objects.create(
            user_profile=other_member.profile, team=other_team, is_primary_team=True
        )
        # Assign other_member to the TL via the team the TL leads (so
        # get_team_member_ids picks them up via led_teams + shared team M2M).
        TeamMembership.objects.create(
            user_profile=other_member.profile, team=self.team, is_primary_team=False
        )

        self.client.force_authenticate(self.team_leader)
        response = self.client.get('/api/dashboard/calendar-workspaces/my_teams_workspaces/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = self._extract_ids(response)
        self.assertIn(self.workspace.id, ids)
        self.assertIn(other_workspace.id, ids)


class PublicHolidayUniquenessTests(TestCase):
    def test_global_holidays_are_unique_per_date_and_country(self):
        PublicHoliday.objects.create(
            name="New Year",
            date="2026-01-01",
            country_code="AL",
            is_global=True,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PublicHoliday.objects.create(
                    name="Duplicate New Year",
                    date="2026-01-01",
                    country_code="AL",
                    is_global=True,
                )

    def test_workspace_holidays_can_share_date_and_country(self):
        workspace = CalendarWorkspace.objects.create(
            name="Holiday Workspace",
            code="holiday-workspace",
        )
        second_workspace = CalendarWorkspace.objects.create(
            name="Second Holiday Workspace",
            code="second-holiday-workspace",
        )
        PublicHoliday.objects.create(
            name="Team Holiday A",
            date="2026-01-01",
            country_code="AL",
            calendar=workspace,
            is_global=False,
        )
        PublicHoliday.objects.create(
            name="Team Holiday B",
            date="2026-01-01",
            country_code="AL",
            calendar=second_workspace,
            is_global=False,
        )

        self.assertEqual(PublicHoliday.objects.count(), 2)


class TeamCalendarSignalPrivacyTests(TestCase):
    """Regression: the auto-created team calendar must NOT be public.

    The ``create_team_calendar_workspace`` signal previously set
    ``is_public=True``, which — via ``get_accessible_for_user`` and the
    workspace permission mixin — leaked every team's calendar (and its
    overtime/standby/leave entries + balances) to every authenticated user.
    Team visibility is scoped via team membership, ``calendar_group``, and
    explicit ``allowed_users``; ``is_public`` is reserved for genuinely
    company-wide calendars an admin enables intentionally.
    """

    def test_signal_creates_team_calendar_as_private(self):
        Team.objects.create(name="Signal Team", code="SIG")
        ws = CalendarWorkspace.objects.get(code="SIG_calendar")
        self.assertFalse(
            ws.is_public,
            "Auto-created team calendars must default to is_public=False.",
        )

    def test_outsider_cannot_see_auto_created_team_calendar(self):
        Team.objects.create(name="Signal Team 2", code="SIG2")
        ws = CalendarWorkspace.objects.get(code="SIG2_calendar")
        outsider = User.objects.create_user(username="sig_outsider", password="testpass")

        accessible = CalendarWorkspace.get_accessible_for_user(outsider)
        self.assertNotIn(ws, accessible)
        # And the main list endpoint agrees.
        client = APIClient()
        client.force_authenticate(outsider)
        response = client.get('/api/dashboard/calendar-workspaces/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = self._extract_ids_helper(response)
        self.assertNotIn(ws.id, ids)

    @staticmethod
    def _extract_ids_helper(response):
        payload = response.data
        if isinstance(payload, dict):
            payload = payload.get('results', [])
        return [item['id'] for item in payload]
