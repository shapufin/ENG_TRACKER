"""
Phase 3 tests: dashboard API (summary, trend, roster).

Tests use APIRequestFactory + direct viewset calls (same pattern as
Phase 2 and ticket_kpi).

Covers:
- Summary: aggregate stats, coverage by team, empty scope = no data.
- Trend: daily planned vs approved hours.
- Roster: user/team/standby details, overnight flag, search.
- Permission enforcement: no access = 403, out-of-scope team = 403.
- Status modes: pending_approved, approved_only, all.
- Date validation: date_from > date_to = 400.
- Empty scope is NOT global scope (the critical invariant).
"""
from datetime import date, timedelta
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from apps.standby.models.core import StandbyLog
from apps.users.models.core import Team, TeamMembership, UserProfile
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.viewsets import ControlRoomDashboardViewSet


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def _make_team(name, code):
    return Team.objects.create(name=name, code=code)


def _assign_cr_admin(user):
    """Assign the cr_admin role (seeded by migration 0003) to a user."""
    role = Role.objects.get(code='cr_admin')
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})
    return user


def _make_standby(user, day, hours=4, status='pending', start=None, end=None):
    return StandbyLog.objects.create(
        user=user,
        date=day,
        hours=hours,
        status=status,
        start_time=start,
        end_time=end,
    )


class DashboardBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = _make_user('admin1', is_staff=True)

        # Teams
        self.team_a = _make_team('Team A', 'A')
        self.team_b = _make_team('Team B', 'B')

        # Users in Team A
        self.u1 = _make_user('u1')
        self.u2 = _make_user('u2')
        TeamMembership.objects.create(user_profile=self.u1.profile, team=self.team_a)
        TeamMembership.objects.create(user_profile=self.u2.profile, team=self.team_a)

        # User in Team B
        self.u3 = _make_user('u3')
        TeamMembership.objects.create(user_profile=self.u3.profile, team=self.team_b)

        # Standby logs
        today = date.today()
        self.day1 = today.isoformat()
        self.day2 = (today + timedelta(days=1)).isoformat()
        self.day_end = (today + timedelta(days=6)).isoformat()

        _make_standby(self.u1, today, hours=4, status='pending')
        _make_standby(self.u2, today, hours=6, status='approved')
        _make_standby(self.u3, today, hours=8, status='pending')
        _make_standby(self.u1, today + timedelta(days=1), hours=4, status='approved')

    def _summary(self, user, **params):
        url = '/api/plugins/control_room/dashboard/summary/'
        request = self.factory.get(url, params)
        force_authenticate(request, user=user)
        return ControlRoomDashboardViewSet.as_view({'get': 'summary'})(request)

    def _trend(self, user, **params):
        url = '/api/plugins/control_room/dashboard/trend/'
        request = self.factory.get(url, params)
        force_authenticate(request, user=user)
        return ControlRoomDashboardViewSet.as_view({'get': 'trend'})(request)

    def _roster(self, user, **params):
        url = '/api/plugins/control_room/dashboard/roster/'
        request = self.factory.get(url, params)
        force_authenticate(request, user=user)
        return ControlRoomDashboardViewSet.as_view({'get': 'roster'})(request)


class DashboardSummaryTests(DashboardBase):
    def test_admin_sees_all_teams(self):
        resp = self._summary(self.admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['scope']['is_global'])
        # 2 created teams + SIAE_TEAM auto-created by test setup = 3
        self.assertEqual(resp.data['summary']['team_count'], 3)
        self.assertEqual(resp.data['summary']['covered_team_count'], 2)

    def test_admin_summary_hours(self):
        resp = self._summary(self.admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        # u1: 4+4=8, u2: 6, u3: 8 = 22 total
        self.assertEqual(resp.data['summary']['planned_hours'], 22.0)
        # approved: u2(6) + u1 day2(4) = 10
        self.assertEqual(resp.data['summary']['approved_hours'], 10.0)
        # pending: u1 day1(4) + u3(8) = 12
        self.assertEqual(resp.data['summary']['pending_hours'], 12.0)

    def test_admin_coverage_by_team(self):
        resp = self._summary(self.admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        coverage = {c['team_name']: c for c in resp.data['coverage_by_team']}
        self.assertIn('Team A', coverage)
        self.assertIn('Team B', coverage)
        self.assertEqual(coverage['Team A']['member_count'], 2)
        self.assertEqual(coverage['Team A']['covered_member_count'], 2)
        self.assertEqual(coverage['Team B']['member_count'], 1)

    def test_admin_filter_by_team(self):
        resp = self._summary(
            self.admin, date_from=self.day1, date_to=self.day_end,
            team_ids=f'{self.team_a.id}',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['summary']['team_count'], 1)
        self.assertEqual(resp.data['coverage_by_team'][0]['team_name'], 'Team A')

    def test_admin_filter_by_multiple_teams(self):
        """team_ids comma-separated param filters to multiple teams."""
        resp = self._summary(
            self.admin, date_from=self.day1, date_to=self.day_end,
            team_ids=f'{self.team_a.id},{self.team_b.id}',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['summary']['team_count'], 2)
        team_names = {c['team_name'] for c in resp.data['coverage_by_team']}
        self.assertIn('Team A', team_names)
        self.assertIn('Team B', team_names)

    def test_admin_filter_by_missing_team_returns_bad_request(self):
        resp = self._summary(
            self.admin, date_from=self.day1, date_to=self.day_end,
            team_ids='999999',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('do not exist', resp.data['error'])

    def test_admin_status_mode_approved_only(self):
        resp = self._summary(
            self.admin, date_from=self.day1, date_to=self.day_end,
            status_mode='approved_only',
        )
        self.assertEqual(resp.status_code, 200)
        # Only approved: u2(6) + u1 day2(4) = 10
        self.assertEqual(resp.data['summary']['planned_hours'], 10.0)
        self.assertEqual(resp.data['summary']['approved_hours'], 10.0)
        self.assertEqual(resp.data['summary']['pending_hours'], 0.0)

    def test_admin_status_mode_all(self):
        resp = self._summary(
            self.admin, date_from=self.day1, date_to=self.day_end,
            status_mode='all',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['summary']['planned_hours'], 22.0)


class DashboardScopeTests(DashboardBase):
    def setUp(self):
        super().setUp()
        self.cr_user = _make_user('crops')
        self.no_access = _make_user('noaccess')

    def test_no_access_user_gets_403(self):
        resp = self._summary(self.no_access, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 403)

    def test_empty_scope_user_sees_no_data(self):
        """CRITICAL: empty scope = no data, NOT global."""
        ControlRoomAccess.objects.create(user=self.cr_user)
        resp = self._summary(self.cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['summary']['team_count'], 0)
        self.assertEqual(resp.data['summary']['planned_hours'], 0.0)
        self.assertEqual(resp.data['coverage_by_team'], [])

    def test_empty_scope_still_validates_dates(self):
        ControlRoomAccess.objects.create(user=self.cr_user)
        resp = self._summary(
            self.cr_user, date_from='not-a-date', date_to=self.day_end
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Invalid date format', resp.data['error'])

    def test_scoped_user_sees_only_scoped_team(self):
        access = ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._summary(self.cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['scope']['is_global'])
        self.assertEqual(resp.data['summary']['team_count'], 1)
        self.assertEqual(resp.data['coverage_by_team'][0]['team_name'], 'Team A')
        # Team A hours: u1(4+4) + u2(6) = 14
        self.assertEqual(resp.data['summary']['planned_hours'], 14.0)

    def test_scoped_user_cannot_access_unscoped_team(self):
        access = ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        resp = self._summary(
            self.cr_user, date_from=self.day1, date_to=self.day_end,
            team_ids=f'{self.team_b.id}',
        )
        self.assertEqual(resp.status_code, 403)

    def test_invalid_team_id_returns_bad_request(self):
        ControlRoomAccess.objects.create(user=self.cr_user)
        resp = self._summary(
            self.cr_user, date_from=self.day1, date_to=self.day_end,
            team_id='not-an-id',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('team_id', resp.data['error'])

    def test_invalid_team_ids_list_returns_bad_request(self):
        ControlRoomAccess.objects.create(user=self.cr_user)
        resp = self._summary(
            self.cr_user, date_from=self.day1, date_to=self.day_end,
            team_ids='1,not-an-id,3',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('team_ids', resp.data['error'])

    def test_invalid_status_mode_returns_bad_request(self):
        ControlRoomAccess.objects.create(user=self.cr_user)
        resp = self._summary(
            self.cr_user, date_from=self.day1, date_to=self.day_end,
            status_mode='unknown',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('status_mode', resp.data['error'])

    def test_invalid_include_rejected_returns_bad_request(self):
        """include_rejected must be 'true' or 'false'; anything else is 400."""
        ControlRoomAccess.objects.create(user=self.cr_user)
        resp = self._summary(
            self.cr_user, date_from=self.day1, date_to=self.day_end,
            include_rejected='maybe',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('include_rejected', resp.data['error'])

    def test_multi_team_scope_aggregates_all_scoped_teams(self):
        """A user scoped to multiple teams sees aggregated data from all
        scoped teams, and only those teams."""
        access = ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_b)

        resp = self._summary(self.cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        # team_a: u1 (4h+4h=8h), u2 (6h); team_b: u3 (8h). Total = 22h planned.
        # Approved: u2 (6h) + u1 day2 (4h) = 10h.
        self.assertEqual(resp.data['summary']['planned_hours'], 22.0)
        self.assertEqual(resp.data['summary']['approved_hours'], 10.0)
        # Coverage should include both scoped teams.
        team_names = [c['team_name'] for c in resp.data['coverage_by_team']]
        self.assertIn('Team A', team_names)
        self.assertIn('Team B', team_names)
        self.assertEqual(len(team_names), 2)  # exactly the two scoped teams

    def test_cross_scope_roster_excludes_unscoped_team_users(self):
        """A user scoped to team_a only must NOT see team_b users in the
        roster, even if those users have standby logs in the date range."""
        access = ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)

        resp = self._roster(self.cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        roster_usernames = [r['username'] for r in resp.data['results']]
        self.assertIn('u1', roster_usernames)
        self.assertIn('u2', roster_usernames)
        # u3 is in team_b — must NOT appear.
        self.assertNotIn('u3', roster_usernames)

    def test_only_date_from_preserves_requested_start(self):
        ControlRoomAccess.objects.create(user=self.cr_user)
        ControlRoomTeamScope.objects.create(access=ControlRoomAccess.objects.get(user=self.cr_user), team=self.team_a)
        resp = self._summary(self.cr_user, date_from=self.day2)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['date_from'], self.day2)

    def test_inactive_access_user_gets_403(self):
        ControlRoomAccess.objects.create(user=self.cr_user, is_active=False)
        resp = self._summary(self.cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 403)

    def test_deactivated_django_user_gets_403(self):
        """§15.2: Deactivated Django user is denied even with active access."""
        ControlRoomAccess.objects.create(user=self.cr_user, is_active=True)
        self.cr_user.is_active = False
        self.cr_user.save()
        resp = self._summary(self.cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 403)


class DashboardTrendTests(DashboardBase):
    def test_trend_admin(self):
        resp = self._trend(self.admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, list)
        self.assertTrue(len(resp.data) >= 1)
        # First day: 4+6+8=18 planned, 6 approved
        day1 = resp.data[0]
        self.assertEqual(day1['planned_hours'], 18.0)
        self.assertEqual(day1['approved_hours'], 6.0)
        self.assertEqual(day1['standby_people'], 3)

    def test_trend_empty_scope(self):
        cr_user = _make_user('crops')
        ControlRoomAccess.objects.create(user=cr_user)
        resp = self._trend(cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])


class DashboardRosterTests(DashboardBase):
    def test_roster_admin(self):
        resp = self._roster(self.admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        # Paginated response shape: {count, page, page_size, total_pages, results}
        self.assertIsInstance(resp.data, dict)
        self.assertIn('results', resp.data)
        self.assertEqual(resp.data['count'], 4)  # 4 standby logs
        self.assertEqual(len(resp.data['results']), 4)
        self.assertEqual(resp.data['page'], 1)
        self.assertEqual(resp.data['page_size'], 50)
        self.assertEqual(resp.data['total_pages'], 1)

    def test_roster_includes_team_names(self):
        resp = self._roster(self.admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results']
        u1_row = [r for r in rows if r['username'] == 'u1'][0]
        self.assertIn('Team A', u1_row['team_names'])

    def test_roster_includes_overnight_flag(self):
        from datetime import time
        _make_standby(
            self.u1, date.today() + timedelta(days=2),
            hours=8, status='pending',
            start=time(22, 0), end=time(6, 0),
        )
        resp = self._roster(self.admin, date_from=self.day1, date_to=self.day_end)
        rows = resp.data['results']
        overnight = [r for r in rows if r['is_overnight']]
        self.assertTrue(len(overnight) >= 1)

    def test_roster_search(self):
        resp = self._roster(
            self.admin, date_from=self.day1, date_to=self.day_end, search='u1',
        )
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['results']
        self.assertTrue(all(r['username'] == 'u1' for r in rows))
        self.assertTrue(len(rows) >= 1)

    def test_roster_empty_scope(self):
        cr_user = _make_user('crops')
        ControlRoomAccess.objects.create(user=cr_user)
        resp = self._roster(cr_user, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 0)
        self.assertEqual(resp.data['results'], [])
        self.assertEqual(resp.data['total_pages'], 0)

    def test_roster_pagination_bounds(self):
        # 4 total items, page_size=2 → 2 pages of 2 items each.
        resp = self._roster(
            self.admin,
            date_from=self.day1,
            date_to=self.day_end,
            page='2',
            page_size='2',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 4)
        self.assertEqual(resp.data['page'], 2)
        self.assertEqual(resp.data['page_size'], 2)
        self.assertEqual(resp.data['total_pages'], 2)
        self.assertEqual(len(resp.data['results']), 2)

    def test_roster_pagination_beyond_end(self):
        # Requesting a page past the end returns empty results but keeps count.
        resp = self._roster(
            self.admin,
            date_from=self.day1,
            date_to=self.day_end,
            page='99',
            page_size='2',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 4)
        self.assertEqual(len(resp.data['results']), 0)

    def test_roster_invalid_page_size(self):
        resp = self._roster(
            self.admin,
            date_from=self.day1,
            date_to=self.day_end,
            page_size='0',
        )
        self.assertEqual(resp.status_code, 400)

    def test_roster_page_size_500_accepted(self):
        """Frontend sends page_size=500 for client-side aggregation."""
        resp = self._roster(
            self.admin,
            date_from=self.day1,
            date_to=self.day_end,
            page_size='500',
        )
        self.assertEqual(resp.status_code, 200)

    def test_roster_page_size_above_limit_rejected(self):
        resp = self._roster(
            self.admin,
            date_from=self.day1,
            date_to=self.day_end,
            page_size='501',
        )
        self.assertEqual(resp.status_code, 400)

    def test_roster_invalid_page(self):
        resp = self._roster(
            self.admin,
            date_from=self.day1,
            date_to=self.day_end,
            page='not-a-number',
        )
        self.assertEqual(resp.status_code, 400)


class DashboardValidationTests(DashboardBase):
    def test_invalid_date_format(self):
        resp = self._summary(self.admin, date_from='not-a-date', date_to=self.day_end)
        self.assertEqual(resp.status_code, 400)

    def test_date_from_after_date_to(self):
        resp = self._summary(
            self.admin,
            date_from=(date.today() + timedelta(days=10)).isoformat(),
            date_to=self.day1,
        )
        self.assertEqual(resp.status_code, 400)

    def test_default_date_range_when_not_provided(self):
        """When no dates provided, defaults to today + 6 days."""
        resp = self._summary(self.admin)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('date_from', resp.data)
        self.assertIn('date_to', resp.data)


class DashboardCRAdminScopeTests(DashboardBase):
    """A cr_admin without a ControlRoomAccess record sees the dashboard
    scoped to their own team memberships (the team they are part of)."""

    def setUp(self):
        super().setUp()
        self.cr_admin = _assign_cr_admin(_make_user('cradmin'))

    def test_cr_admin_without_access_record_can_open_dashboard(self):
        """No 403: cr_admin role alone grants dashboard access."""
        TeamMembership.objects.create(
            user_profile=self.cr_admin.profile, team=self.team_a
        )
        resp = self._summary(self.cr_admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)

    def test_cr_admin_sees_only_own_team_data(self):
        """cr_admin in team_a sees Team A standby only (u1+u2), not Team B (u3)."""
        TeamMembership.objects.create(
            user_profile=self.cr_admin.profile, team=self.team_a
        )
        resp = self._summary(self.cr_admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['scope']['is_global'])
        self.assertEqual(resp.data['summary']['team_count'], 1)
        self.assertEqual(resp.data['coverage_by_team'][0]['team_name'], 'Team A')
        # Team A hours: u1(4+4) + u2(6) = 14
        self.assertEqual(resp.data['summary']['planned_hours'], 14.0)

    def test_cr_admin_no_memberships_sees_no_data(self):
        """Empty membership set = empty scope = no data (NOT global)."""
        resp = self._summary(self.cr_admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['summary']['team_count'], 0)
        self.assertEqual(resp.data['summary']['planned_hours'], 0.0)
        self.assertEqual(resp.data['coverage_by_team'], [])

    def test_cr_admin_cannot_access_unscoped_team(self):
        """cr_admin in team_a cannot filter to team_b (out of scope)."""
        TeamMembership.objects.create(
            user_profile=self.cr_admin.profile, team=self.team_a
        )
        resp = self._summary(
            self.cr_admin, date_from=self.day1, date_to=self.day_end,
            team_ids=f'{self.team_b.id}',
        )
        self.assertEqual(resp.status_code, 403)

    def test_cr_admin_with_access_record_takes_precedence(self):
        """A ControlRoomAccess record wins over own memberships for cr_admin."""
        TeamMembership.objects.create(
            user_profile=self.cr_admin.profile, team=self.team_a
        )
        access = ControlRoomAccess.objects.create(user=self.cr_admin)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_b)
        resp = self._summary(self.cr_admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['summary']['team_count'], 1)
        self.assertEqual(resp.data['coverage_by_team'][0]['team_name'], 'Team B')

    def test_cr_admin_roster_excludes_unscoped_team_users(self):
        TeamMembership.objects.create(
            user_profile=self.cr_admin.profile, team=self.team_a
        )
        resp = self._roster(self.cr_admin, date_from=self.day1, date_to=self.day_end)
        self.assertEqual(resp.status_code, 200)
        roster_usernames = [r['username'] for r in resp.data['results']]
        self.assertIn('u1', roster_usernames)
        self.assertIn('u2', roster_usernames)
        self.assertNotIn('u3', roster_usernames)
