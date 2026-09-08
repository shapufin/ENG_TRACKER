from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.leave_management.models.core import LeaveRequest
from apps.standby.models.core import StandbyLog
from apps.users.models import Team, TeamMembership
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.viewsets import ControlRoomDashboardViewSet


class CalendarControlRoomVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.viewer = User.objects.create_user(
            username="calendar-viewer", password="testpass", is_staff=True
        )
        self.team = Team.objects.create(name="Shared Team", code="SHARED")
        self.workspace = CalendarWorkspace.objects.create(
            name="Shared Calendar",
            code="shared-calendar",
            team=self.team,
        )

        self.regular_user = User.objects.create_user(username="regular", password="testpass")
        self.cr_user = User.objects.create_user(username="cr-user", password="testpass")
        self.multi_role_user = User.objects.create_user(username="cr-hr", password="testpass")
        self.multi_role_user.profile.is_hr_user = True
        self.multi_role_user.profile.save(update_fields=["is_hr_user"])

        for user in (self.regular_user, self.cr_user, self.multi_role_user):
            TeamMembership.objects.create(user_profile=user.profile, team=self.team)

        self.cr_access = ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=self.cr_access, team=self.team)
        multi_access = ControlRoomAccess.objects.create(user=self.multi_role_user)
        ControlRoomTeamScope.objects.create(access=multi_access, team=self.team)

        self.standby_logs = [
            StandbyLog.objects.create(user=user, date=date(2026, 8, 3), hours=4)
            for user in (self.regular_user, self.cr_user, self.multi_role_user)
        ]
        self.leave_requests = [
            LeaveRequest.objects.create(
                user=user,
                request_type="vacation",
                start_date=date(2026, 8, 3),
                end_date=date(2026, 8, 4),
            )
            for user in (self.regular_user, self.cr_user, self.multi_role_user)
        ]

        self.client.force_authenticate(self.viewer)

    def test_calendar_exclusion_helper_identifies_only_cr_only_users(self):
        from plugins.control_room.services.scope_service import get_calendar_excluded_user_ids

        excluded_ids = get_calendar_excluded_user_ids()
        self.assertIn(self.cr_user.id, excluded_ids)
        self.assertNotIn(self.multi_role_user.id, excluded_ids)

    def test_workspace_users_excludes_cr_only_users_but_keeps_multi_role_users(self):
        response = self.client.get(
            f"/api/dashboard/calendar-workspaces/{self.workspace.id}/workspace_users/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        returned_ids = {user["id"] for user in response.data}
        self.assertIn(self.regular_user.id, returned_ids)
        self.assertIn(self.multi_role_user.id, returned_ids)
        self.assertNotIn(self.cr_user.id, returned_ids)

    def test_calendar_standby_scope_excludes_cr_only_logs(self):
        from apps.standby.viewsets import StandbyLogViewSet

        request = APIRequestFactory().get(
            "/api/standby/logs/",
            {"workspace_ids": self.workspace.id, "calendar": "true", "ignore_date_filter": "true"},
        )
        force_authenticate(request, user=self.viewer)
        view = StandbyLogViewSet()
        view.action_map = {"get": "list"}
        view.request = view.initialize_request(request)
        view.action = "list"
        view_queryset = view.get_queryset()
        self.assertNotIn(self.cr_user.id, set(view_queryset.values_list("user_id", flat=True)))

        response = self.client.get(
            "/api/standby/logs/",
            {"workspace_ids": self.workspace.id, "calendar": "true", "ignore_date_filter": "true"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        returned_ids = {log["user"] for log in response.data["results"]}
        self.assertIn(self.regular_user.id, returned_ids)
        self.assertIn(self.multi_role_user.id, returned_ids)
        self.assertNotIn(self.cr_user.id, returned_ids)

    def test_calendar_leave_scope_excludes_cr_only_requests(self):
        response = self.client.get(
            "/api/leave-management/requests/",
            {"workspace_ids": self.workspace.id, "calendar": "true", "ignore_date_filter": "true"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        returned_ids = {request["user"] for request in response.data["results"]}
        self.assertIn(self.regular_user.id, returned_ids)
        self.assertIn(self.multi_role_user.id, returned_ids)
        self.assertNotIn(self.cr_user.id, returned_ids)

    def test_control_room_roster_still_includes_cr_user_shift(self):
        request = APIRequestFactory().get(
            "/api/plugins/control_room/dashboard/roster/",
            {"date_from": "2026-08-03", "date_to": "2026-08-03"},
        )
        force_authenticate(request, user=self.viewer)
        response = ControlRoomDashboardViewSet.as_view({"get": "roster"})(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        roster_user_ids = {entry["user_id"] for entry in response.data["results"]}
        self.assertIn(self.cr_user.id, roster_user_ids)
