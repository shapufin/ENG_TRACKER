from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.overtime.models.core import OvertimeLog, Client
from apps.standby.models.core import StandbyLog
from apps.leave_management.models.core import LeaveRequest
from apps.users.models import Team, TeamMembership


class TeamStatsActiveOperatorCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.now().date()

        self.tl = User.objects.create_user(username="tl", password="testpass")
        self.team = Team.objects.create(name="Infra", code="INFRA")
        TeamMembership.objects.create(user_profile=self.tl.profile, team=self.team)

        self.on_leave_user = User.objects.create_user(username="on-leave", password="testpass")
        self.on_standby_user = User.objects.create_user(username="on-standby", password="testpass")
        self.free_user = User.objects.create_user(username="free", password="testpass")
        for user in (self.on_leave_user, self.on_standby_user, self.free_user):
            TeamMembership.objects.create(user_profile=user.profile, team=self.team)

        LeaveRequest.objects.create(
            user=self.on_leave_user,
            request_type="vacation",
            start_date=self.today - timedelta(days=1),
            end_date=self.today + timedelta(days=1),
            status="approved",
        )
        StandbyLog.objects.create(
            user=self.on_standby_user,
            date=self.today,
            hours=24,
            status="approved",
        )

        self.client.force_authenticate(self.tl)

    def test_active_operator_count_excludes_users_on_approved_leave_or_standby_today(self):
        response = self.client.get(
            "/api/dashboard/widgets/team_stats/", {"team_id": self.team.id}
        )

        self.assertEqual(response.status_code, 200, response.data)
        # team_size = tl + on_leave_user + on_standby_user + free_user = 4
        self.assertEqual(response.data["team_size"], 4)
        self.assertEqual(response.data["active_operator_count"], 2)

    def test_active_operator_count_is_zero_on_no_team_response(self):
        no_profile_user = User.objects.create_user(username="lonely", password="testpass")
        self.client.force_authenticate(no_profile_user)

        response = self.client.get("/api/dashboard/widgets/team_stats/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["active_operator_count"], 0)


class QueueHighlightsScopeAndTagTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.now().date()

        self.tl = User.objects.create_user(username="tl2", password="testpass")
        self.team = Team.objects.create(name="Infra2", code="INFRA2")
        TeamMembership.objects.create(user_profile=self.tl.profile, team=self.team)

        self.member = User.objects.create_user(username="member", password="testpass")
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)

        client_obj = Client.objects.create(name="Test Client", code="QH001")
        OvertimeLog.objects.create(
            user=self.member, date=self.today, hours=4, status="pending", client=client_obj
        )
        StandbyLog.objects.create(
            user=self.member, date=self.today, hours=24, status="pending"
        )
        LeaveRequest.objects.create(
            user=self.member,
            request_type="vacation",
            start_date=self.today,
            end_date=self.today,
            status="pending",
        )

        self.client.force_authenticate(self.tl)

    def test_omitting_scope_returns_all_types_with_additive_fields(self):
        response = self.client.get(
            "/api/dashboard/widgets/queue_highlights/",
            {"team_id": self.team.id, "limit": 10},
        )

        self.assertEqual(response.status_code, 200, response.data)
        types = {item["type"] for item in response.data}
        self.assertEqual(types, {"overtime", "standby", "leave"})
        for item in response.data:
            self.assertIn("tag", item)
            self.assertIn("hours", item)
            self.assertIn("days", item)

    def test_scope_filters_to_single_type(self):
        response = self.client.get(
            "/api/dashboard/widgets/queue_highlights/",
            {"team_id": self.team.id, "limit": 10, "scope": "standby"},
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["type"], "standby")
        self.assertEqual(response.data[0]["tag"], "Standby")
        self.assertEqual(response.data[0]["days"], None)


class MonthlyComparisonGranularityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.now().date()

        self.tl = User.objects.create_user(username="tl3", password="testpass")
        self.team = Team.objects.create(name="Infra3", code="INFRA3")
        TeamMembership.objects.create(user_profile=self.tl.profile, team=self.team)

        LeaveRequest.objects.create(
            user=self.tl,
            request_type="vacation",
            start_date=self.today,
            end_date=self.today,
            status="pending",
        )

        self.client.force_authenticate(self.tl)

    def test_default_granularity_is_month_and_matches_prior_shape(self):
        response = self.client.get(
            "/api/dashboard/widgets/monthly_comparison/", {"team_id": self.team.id}
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["granularity"], "month")
        self.assertEqual(response.data["current_month"]["month"], self.today.month)
        self.assertEqual(response.data["current_month"]["year"], self.today.year)
        self.assertGreaterEqual(response.data["current_month"]["data"]["leave"], 1)

    def test_week_granularity_returns_week_labels(self):
        response = self.client.get(
            "/api/dashboard/widgets/monthly_comparison/",
            {"team_id": self.team.id, "granularity": "week"},
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["granularity"], "week")
        self.assertTrue(response.data["current_month"]["month_name"].startswith("Week of"))
        self.assertIn("start", response.data["current_month"])
        self.assertGreaterEqual(response.data["current_month"]["data"]["leave"], 1)
