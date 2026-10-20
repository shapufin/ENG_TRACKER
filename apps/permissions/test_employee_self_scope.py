"""An employee's scope is self only, apart from the team calendar (launch review S-rows).

Request statuses, pending counts, approval queues, per-person aggregates and
team-leader management data never reach an employee about someone else.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.users.models import Team, TeamMembership, UserProfile


def _user(username, **flags):
    user = User.objects.create_user(username, f'{username}@example.com', 'pw-Strong-123')
    UserProfile.objects.update_or_create(user=user, defaults=flags)
    return user


class EmployeeSelfScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = _user('s_staff')
        cls.staff.is_staff = True
        cls.staff.save()
        cls.employee = _user('s_emp')
        cls.mate = _user('s_mate')
        cls.admin_mate = _user('s_admin_mate')
        cls.admin_mate.is_superuser = True
        cls.admin_mate.save()
        team = Team.objects.create(name='Scope team', code='SCOPE')
        for member in (cls.employee, cls.mate, cls.admin_mate):
            TeamMembership.objects.create(user_profile=member.profile, team=team)

    def _get(self, user, url):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.get(url)

    def test_user_stats_is_not_open_to_an_employee(self):
        # Company-wide headcount, TL counts and "users without a TL" are TL management data.
        self.assertEqual(self._get(self.employee, '/api/users/users/stats/').status_code, 403)

    def test_user_stats_still_serves_staff(self):
        response = self._get(self.staff, '/api/users/users/stats/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('total_users', response.json())

    def test_team_calendar_user_list_does_not_name_admins(self):
        from apps.dashboard.models import CalendarWorkspace

        workspace = CalendarWorkspace.objects.get(code='SCOPE_calendar')
        response = self._get(
            self.employee, f'/api/dashboard/calendar-workspaces/{workspace.id}/workspace_users/')
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        self.assertIn(self.mate.id, {row['id'] for row in rows})
        for row in rows:
            self.assertNotIn('is_staff', row)
            self.assertNotIn('is_superuser', row)
