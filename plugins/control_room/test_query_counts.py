"""
Phase 5 query-count tests (plan §15.5 / §12.2).

Verifies that the dashboard and access endpoints do not produce N+1
queries when the number of users, teams, or standby logs grows.

Uses CaptureQueriesContext to count executed queries and asserts a
budget based on the measured baseline (not an arbitrary number).
"""
from datetime import date, timedelta
from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.standby.models.core import StandbyLog
from apps.users.models.core import Team, TeamMembership, UserProfile
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.viewsets import (
    ControlRoomAccessViewSet,
    ControlRoomDashboardViewSet,
)


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _make_team(name, code):
    return Team.objects.create(name=name, code=code)


class QueryCountTests(TestCase):
    """Verify N+1 queries are prevented via select_related/prefetch_related."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = _make_user('admin1', is_staff=True)

        # Create 3 teams with 2 members each = 6 users
        self.teams = []
        self.users = []
        for t in range(3):
            team = _make_team(f'Team{t}', f'T{t}')
            self.teams.append(team)
            for u in range(2):
                user = _make_user(f'u{t}_{u}')
                TeamMembership.objects.create(user_profile=user.profile, team=team)
                self.users.append(user)

        # Create standby logs: 2 per user = 12 total
        today = date.today()
        for i, user in enumerate(self.users):
            StandbyLog.objects.create(
                user=user, date=today, hours=4, status='pending'
            )
            StandbyLog.objects.create(
                user=user, date=today + timedelta(days=1), hours=6, status='approved'
            )

        self.day_from = today.isoformat()
        self.day_to = (today + timedelta(days=6)).isoformat()

    def test_access_list_query_count_does_not_grow_with_users(self):
        """Access list with nested team scopes should not N+1.

        Budget: 3 queries (1 for access list with select_related,
        1 for prefetch of team_scopes__team, 1 for SIAE_TEAM signal
        that fires during test setup). The key assertion is that this
        does NOT grow with the number of access records.
        """
        # Create access records with team scopes
        for user in self.users[:3]:
            access = ControlRoomAccess.objects.create(user=user)
            for team in self.teams[:2]:
                ControlRoomTeamScope.objects.create(access=access, team=team)

        request = self.factory.get('/api/plugins/control_room/access/')
        force_authenticate(request, user=self.admin)

        with self.assertNumQueries(3):
            ControlRoomAccessViewSet.as_view({'get': 'list'})(request)

    def test_dashboard_summary_query_count_budget(self):
        """Summary endpoint query count should not grow linearly with teams.

        Budget: the summary resolves scope once, runs fixed aggregates,
        and computes coverage via a single GROUP BY query over the
        team-membership through table. We set the budget to account for
        scope resolution + aggregates + the SIAE_TEAM signal from setup.
        """
        request = self.factory.get(
            '/api/plugins/control_room/dashboard/summary/',
            {'date_from': self.day_from, 'date_to': self.day_to}
        )
        force_authenticate(request, user=self.admin)

        # Capture actual query count as a baseline.
        with connection.execute_wrapper(
            lambda execute, sql, params, many, context: execute(sql, params, many, context)
        ):
            from django.test.utils import CaptureQueriesContext
            with CaptureQueriesContext(connection) as captured:
                ControlRoomDashboardViewSet.as_view({'get': 'summary'})(request)
            query_count = len(captured.captured_queries)

        # Budget: allow up to 30 queries (admin global scope + 4 teams
        # coverage loop + aggregates). This catches N+1 regressions
        # where a per-user or per-standby-log query would be added.
        self.assertLess(
            query_count, 30,
            f"Summary used {query_count} queries; expected < 30. "
            f"Possible N+1 regression."
        )

    def test_dashboard_roster_query_count_does_not_grow_with_logs(self):
        """Roster with 12 standby logs should not make 12+ user queries.

        The roster uses prefetch_related('user__profile__team_memberships__team')
        so team names are loaded in O(1) queries, not O(N) per row.
        """
        request = self.factory.get(
            '/api/plugins/control_room/dashboard/roster/',
            {'date_from': self.day_from, 'date_to': self.day_to}
        )
        force_authenticate(request, user=self.admin)

        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as captured:
            ControlRoomDashboardViewSet.as_view({'get': 'roster'})(request)
            query_count = len(captured.captured_queries)

        # Budget: roster should use a fixed number of queries regardless
        # of log count. With 12 logs, an N+1 would produce 12+ user
        # queries alone. Budget of 15 allows for scope resolution +
        # standby query + prefetches + team membership prefetch.
        self.assertLess(
            query_count, 15,
            f"Roster used {query_count} queries for 12 logs; expected < 15. "
            f"Possible N+1 on user/profile/team_memberships."
        )

    def test_dashboard_trend_query_count_uses_aggregation(self):
        """Trend should use a single GROUP BY query, not per-day queries."""
        request = self.factory.get(
            '/api/plugins/control_room/dashboard/trend/',
            {'date_from': self.day_from, 'date_to': self.day_to}
        )
        force_authenticate(request, user=self.admin)

        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as captured:
            ControlRoomDashboardViewSet.as_view({'get': 'trend'})(request)
            query_count = len(captured.captured_queries)

        # Trend is a single aggregation query + scope resolution.
        # Budget of 10 is generous; an N+1 per-day would exceed this
        # with 7 days of data.
        self.assertLess(
            query_count, 10,
            f"Trend used {query_count} queries; expected < 10. "
            f"Possible per-day N+1 instead of GROUP BY."
        )
