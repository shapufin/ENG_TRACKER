"""Read-through cache tests for shared reference-table endpoints.

Part of the security/perf/cache audit (see
``.devin/plans/plan-security-perf-cache-audit-2026-09-27.md``, Phase 2):
`PublicHoliday`/`DashboardWidget`/`GlobalSettings` are read on nearly every
dashboard/calendar/leave-validation page load but were never cached despite
Redis being configured (confirmed dead invalidation: `CacheInvalidationMixin`
was already wired into 8+ viewsets, but nothing ever populated the
`dashboard:*` cache namespace those invalidation calls were clearing). This
closes that gap using the existing invalidation machinery instead of a new
cache namespace.
"""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from rest_framework.test import APIClient

from apps.dashboard.models import DashboardWidget
from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday
from apps.leave_management.models import GlobalSettings


class PublicHolidayCacheTests(TestCase):
    def setUp(self):
        cache.clear()
        self.staff = User.objects.create_user(
            username="staff", password="x", is_staff=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.staff)
        self.calendar = CalendarWorkspace.objects.create(
            name="Team A", code="team-a", is_public=False
        )
        PublicHoliday.objects.create(
            name="New Year", date="2026-01-01", calendar=self.calendar
        )

    def test_second_list_call_hits_cache_not_db(self):
        first = self.client.get("/api/dashboard/holidays/")
        self.assertEqual(first.status_code, 200)

        with CaptureQueriesContext(connection) as ctx:
            second = self.client.get("/api/dashboard/holidays/")

        self.assertEqual(second.data, first.data)
        self.assertEqual(len(ctx.captured_queries), 0)

    def test_create_invalidates_cache(self):
        self.client.get("/api/dashboard/holidays/")  # populate cache

        create = self.client.post(
            "/api/dashboard/holidays/",
            {
                "name": "Second Holiday",
                "date": "2026-02-02",
                "calendar": self.calendar.id,
                "country_code": "US",
            },
        )
        self.assertEqual(create.status_code, 201, create.data)

        after = self.client.get("/api/dashboard/holidays/")
        self.assertEqual(after.data["count"], 2)

    def test_different_filter_params_do_not_collide(self):
        other_calendar = CalendarWorkspace.objects.create(
            name="Team B", code="team-b", is_public=False
        )
        unfiltered = self.client.get("/api/dashboard/holidays/")
        filtered = self.client.get(
            "/api/dashboard/holidays/", {"calendar": other_calendar.id}
        )
        self.assertEqual(unfiltered.data["count"], 1)
        self.assertEqual(filtered.data["count"], 0)


class DashboardWidgetCacheTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="u", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        DashboardWidget.objects.create(
            widget_type="stat_card", is_active=True, name="Team Stats",
            data_source="team_stats",
        )

    def test_second_list_call_hits_cache_not_db(self):
        first = self.client.get("/api/dashboard/widgets/")
        self.assertEqual(first.status_code, 200)

        with CaptureQueriesContext(connection) as ctx:
            second = self.client.get("/api/dashboard/widgets/")

        self.assertEqual(second.data, first.data)
        self.assertEqual(len(ctx.captured_queries), 0)


class GlobalSettingsCacheTests(TestCase):
    def setUp(self):
        cache.clear()
        self.superuser = User.objects.create_superuser(
            username="root", password="x", email="root@example.com"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.superuser)

    def test_second_list_call_hits_cache_not_db(self):
        first = self.client.get("/api/leave-management/settings/")
        self.assertEqual(first.status_code, 200)

        with CaptureQueriesContext(connection) as ctx:
            second = self.client.get("/api/leave-management/settings/")

        self.assertEqual(second.data, first.data)
        self.assertEqual(len(ctx.captured_queries), 0)

    def test_update_invalidates_cache(self):
        self.client.get("/api/leave-management/settings/")  # populate cache
        settings_obj = GlobalSettings.objects.get(pk=1)

        update = self.client.patch(
            f"/api/leave-management/settings/{settings_obj.pk}/",
            {"default_yearly_leave_days": 30},
        )
        self.assertEqual(update.status_code, 200, update.data)

        after = self.client.get("/api/leave-management/settings/")
        results = after.data["results"] if "results" in after.data else after.data
        self.assertEqual(float(results[0]["default_yearly_leave_days"]), 30.0)
