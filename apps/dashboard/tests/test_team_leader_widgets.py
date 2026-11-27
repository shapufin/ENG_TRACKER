from apps.permissions.services.role_service import assign_role
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from core.utils.timezone_local import business_today
from rest_framework.test import APIClient

from apps.overtime.models.core import OvertimeLog, Client
from apps.standby.models.core import StandbyLog
from apps.leave_management.models.core import LeaveRequest
from apps.users.models import Team, TeamMembership


class TeamStatsActiveOperatorCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = business_today()

        self.tl = User.objects.create_user(username="tl", password="testpass")
        self.team = Team.objects.create(name="Infra", code="INFRA", team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.tl.profile, team=self.team)

        self.on_leave_user = User.objects.create_user(username="on-leave", password="testpass")
        self.on_standby_user = User.objects.create_user(username="on-standby", password="testpass")
        self.free_user = User.objects.create_user(username="free", password="testpass")
        for user in (self.on_leave_user, self.on_standby_user, self.free_user):
            TeamMembership.objects.create(user_profile=user.profile, team=self.team)
            user.profile.italian_tl = self.tl
            user.profile.save(update_fields=["italian_tl"])

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
        # The three linked reports; the viewer is not part of their own roster.
        self.assertEqual(response.data["team_size"], 3)
        self.assertEqual(response.data["active_operator_count"], 1)

    def test_active_operator_count_is_zero_on_no_team_response(self):
        no_profile_user = User.objects.create_user(username="lonely", password="testpass")
        assign_role(no_profile_user, 'italian_tl')
        assign_role(no_profile_user, 'italian_tl')
        no_profile_user.profile.save()
        self.client.force_authenticate(no_profile_user)

        response = self.client.get("/api/dashboard/widgets/team_stats/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["active_operator_count"], 0)


class QueueHighlightsScopeAndTagTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = business_today()

        self.tl = User.objects.create_user(username="tl2", password="testpass")
        self.team = Team.objects.create(name="Infra2", code="INFRA2", team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.tl.profile, team=self.team)

        self.member = User.objects.create_user(username="member", password="testpass")
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)
        self.member.profile.italian_tl = self.tl
        self.member.profile.save(update_fields=["italian_tl"])

        client_obj = Client.objects.create(name="Test Client", code="QH001")
        OvertimeLog.objects.create(
            user=self.member, date=self.today, hours=4, status="pending", client=client_obj
        )
        StandbyLog.objects.create(
            user=self.member, date=self.today, hours=24, status="pending"
        )
        # start_date stays "today" (the period bucket is keyed on it); the range
        # must still contain a business day, or `LeaveRequest.clean()` rejects it
        # on a Saturday/Sunday. today -> today+2 always contains one.
        LeaveRequest.objects.create(
            user=self.member,
            request_type="vacation",
            start_date=self.today,
            end_date=self.today + timedelta(days=2),
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
        self.today = business_today()

        self.tl = User.objects.create_user(username="tl3", password="testpass")
        self.team = Team.objects.create(name="Infra3", code="INFRA3", team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.tl.profile, team=self.team)

        self.member = User.objects.create_user(username="member3", password="testpass")
        self.member.profile.italian_tl = self.tl
        self.member.profile.save(update_fields=["italian_tl"])
        TeamMembership.objects.create(user_profile=self.member.profile, team=self.team)

        # Same weekend-proof range as above: a single-day fixture leave dated on a
        # Saturday/Sunday has zero business days and fails model validation.
        LeaveRequest.objects.create(
            user=self.member,
            request_type="vacation",
            start_date=self.today,
            end_date=self.today + timedelta(days=2),
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


class QueueFigureDefinitionTests(TestCase):
    """Every dashboard figure counts the same rows as the queue (workflow-invariants item 93)."""

    # Noon in Tirane on 15 June 2026, so "today" never moves with the machine clock.
    NOW = datetime(2026, 6, 15, 10, 0, tzinfo=dt_timezone.utc)

    def setUp(self):
        patcher = mock.patch("django.utils.timezone.now", return_value=self.NOW)
        patcher.start()
        self.addCleanup(patcher.stop)
        today = mock.patch("apps.dashboard.viewsets.business_today", return_value=self.NOW.date())
        today.start()
        self.addCleanup(today.stop)
        self.tl = User.objects.create_user(username="def_tl", password="x")
        self.member = User.objects.create_user(username="def_member", password="x")
        self.member.profile.italian_tl = self.tl
        self.member.profile.save(update_fields=["italian_tl"])
        self.client = APIClient()
        self.client.force_authenticate(self.tl)

    def _leave(self, user, start, submitted, status="pending"):
        row = LeaveRequest.objects.create(
            user=user, request_type="vacation", start_date=start, end_date=start, status=status)
        LeaveRequest.objects.filter(pk=row.pk).update(submitted_at=submitted)
        return row

    def _at(self, *args):
        return datetime(*args, tzinfo=dt_timezone.utc)

    def _get(self, name):
        response = self.client.get(f"/api/dashboard/widgets/{name}/")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_future_dated_leave_is_in_the_trend_on_the_day_it_was_submitted(self):
        self._leave(self.member, date(2026, 8, 3), self._at(2026, 6, 10, 9, 0))
        trend = {p["date"]: p["count"] for p in self._get("pending_trend")}
        self.assertEqual(len(trend), 14)
        self.assertEqual(trend["2026-06-10"], 1)
        self.assertEqual(sum(trend.values()), 1)

    def test_trend_sum_equals_the_queue_total_and_older_rows_fold_into_the_first_day(self):
        self._leave(self.member, date(2026, 8, 3), self._at(2026, 6, 10, 9, 0))
        self._leave(self.member, date(2026, 8, 4), self._at(2026, 5, 20, 9, 0))
        trend = self._get("pending_trend")
        stats = self._get("team_stats")
        self.assertEqual(sum(p["count"] for p in trend), stats["pending_team_leaves"])
        self.assertEqual((trend[0]["count"], trend[0]["includes_earlier"]), (1, 1))

    def test_viewer_own_pending_leave_is_not_in_any_figure(self):
        self._leave(self.tl, date(2026, 8, 3), self._at(2026, 6, 10, 9, 0))
        self.assertEqual(self._get("queue_highlights"), [])
        self.assertEqual(self._get("top_pending_users"), [])
        stats = self._get("team_stats")
        self.assertEqual((stats["team_size"], stats["pending_team_leaves"]), (1, 0))
        self.assertEqual(sum(p["count"] for p in self._get("pending_trend")), 0)
        self.assertEqual(self._get("monthly_comparison")["current_month"]["data"]["total"], 0)

    def test_comparison_counts_requests_received_by_tirane_submission_date(self):
        # 22:30 UTC on 31 May is already 1 June in Europe/Tirane.
        self._leave(self.member, date(2026, 9, 1), self._at(2026, 5, 31, 22, 30), status="approved")
        self._leave(self.member, date(2026, 9, 2), self._at(2026, 5, 31, 12, 0), status="rejected")
        data = self._get("monthly_comparison")
        self.assertEqual(data["current_month"]["data"]["leave"], 1)
        self.assertEqual(data["previous_month"]["data"]["leave"], 1)

    def test_legacy_leave_without_submitted_at_uses_created_at(self):
        row = self._leave(self.member, date(2026, 8, 3), None)
        LeaveRequest.objects.filter(pk=row.pk).update(created_at=self._at(2026, 6, 12, 9, 0))
        trend = {p["date"]: p["count"] for p in self._get("pending_trend")}
        self.assertEqual(trend["2026-06-12"], 1)
