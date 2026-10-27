"""Team lifecycle plan, Phase 4: a team's calendar workspace is detached, never auto-deleted."""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday, UserCalendarPreference
from apps.dashboard.services.workspace_retention import RETENTION_DAYS, purge_detached_workspaces
from apps.reports.models import AuditLog
from apps.users.models import Team, TeamMembership, UserProfile

WORKSPACES = '/api/dashboard/calendar-workspaces/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class DetachOnTeamDeleteTests(TestCase):
    def test_empty_workspace_survives_team_delete_detached(self):
        team = Team.objects.create(name='Gone', code='GON')
        workspace = CalendarWorkspace.objects.get(team=team)
        team.delete()
        workspace.refresh_from_db()
        self.assertIsNone(workspace.team_id)
        self.assertIsNotNone(workspace.detached_at)

    def test_holidays_and_preferences_survive(self):
        team = Team.objects.create(name='Gone', code='GON')
        workspace = CalendarWorkspace.objects.get(team=team)
        user = make_user('u')
        PublicHoliday.objects.create(calendar=workspace, name='H', date=date(2026, 12, 25), is_global=False)
        UserCalendarPreference.objects.create(user=user, calendar=workspace)
        team.delete()
        self.assertEqual(PublicHoliday.objects.filter(calendar=workspace).count(), 1)
        self.assertEqual(UserCalendarPreference.objects.filter(calendar=workspace).count(), 1)

    def test_recreating_the_team_reattaches_and_clears_detached_at(self):
        team = Team.objects.create(name='Back', code='BCK')
        workspace = CalendarWorkspace.objects.get(team=team)
        team.delete()
        again = Team.objects.create(name='Back', code='BCK')
        workspace.refresh_from_db()
        self.assertEqual(workspace.team_id, again.pk)
        self.assertIsNone(workspace.detached_at)


class PurgeDetachedWorkspacesTests(TestCase):
    def _detached(self, code, age_days):
        team = Team.objects.create(name=code, code=code)
        workspace = CalendarWorkspace.objects.get(team=team)
        team.delete()
        CalendarWorkspace.objects.filter(pk=workspace.pk).update(detached_at=timezone.now() - timedelta(days=age_days))
        return workspace

    def test_old_empty_workspace_is_purged_and_audited(self):
        workspace = self._detached('OLD', RETENTION_DAYS + 1)
        self.assertEqual(purge_detached_workspaces(), 1)
        self.assertFalse(CalendarWorkspace.objects.filter(pk=workspace.pk).exists())
        self.assertTrue(AuditLog.objects.filter(
            model_name='calendarworkspace', object_id=str(workspace.pk), extra_data__operation='purge'
        ).exists())

    def test_recent_workspace_is_kept(self):
        workspace = self._detached('NEW', RETENTION_DAYS - 1)
        self.assertEqual(purge_detached_workspaces(), 0)
        self.assertTrue(CalendarWorkspace.objects.filter(pk=workspace.pk).exists())

    def test_workspace_with_holidays_is_never_purged(self):
        workspace = self._detached('HOL', RETENTION_DAYS + 100)
        PublicHoliday.objects.create(calendar=workspace, name='H', date=date(2026, 12, 25), is_global=False)
        self.assertEqual(purge_detached_workspaces(), 0)

    def test_workspace_with_an_active_preference_is_kept_but_inactive_one_is_not_a_blocker(self):
        workspace = self._detached('PRF', RETENTION_DAYS + 1)
        pref = UserCalendarPreference.objects.create(user=make_user('u'), calendar=workspace, is_active=True)
        self.assertEqual(purge_detached_workspaces(), 0)
        pref.is_active = False
        pref.save()
        self.assertEqual(purge_detached_workspaces(), 1)

    def test_linked_workspace_is_never_purged_and_dry_run_deletes_nothing(self):
        team = Team.objects.create(name='Live', code='LIV')
        CalendarWorkspace.objects.filter(team=team).update(detached_at=timezone.now() - timedelta(days=999))
        old = self._detached('OLD', RETENTION_DAYS + 1)
        self.assertEqual(purge_detached_workspaces(dry_run=True), 1)
        self.assertTrue(CalendarWorkspace.objects.filter(pk=old.pk).exists())
        self.assertEqual(purge_detached_workspaces(), 1)
        self.assertTrue(CalendarWorkspace.objects.filter(team=team).exists())


class ArchivedTeamWorkspaceVisibilityTests(APITestCase):
    def setUp(self):
        self.admin = make_user('adm', is_staff=True)
        self.member = make_user('mem')
        self.peer = make_user('peer')
        self.team = Team.objects.create(name='Arc', code='ARC', calendar_group='grp')
        self.peer_team = Team.objects.create(name='Peer', code='PER', calendar_group='grp')
        self.peer.profile.teams.add(self.peer_team)
        self.member.profile.teams.add(self.team)
        self.workspace = CalendarWorkspace.objects.get(team=self.team)
        self.workspace.allowed_users.add(self.member)

    def _archive(self):
        TeamMembership.objects.filter(team=self.team).delete()
        Team.objects.filter(pk=self.team.pk).update(is_active=False)

    def _ids(self, user, path=''):
        self.client.force_authenticate(user)
        data = self.client.get(WORKSPACES + path, {'page_size': 100}).data
        rows = data['results'] if isinstance(data, dict) else data
        return {row['id'] for row in rows}

    def test_archived_team_workspace_is_hidden_from_members_peers_and_the_picker(self):
        self.assertIn(self.workspace.pk, self._ids(self.member))
        self.assertIn(self.workspace.pk, self._ids(self.peer, 'my_teams_workspaces/'))
        self._archive()
        self.assertNotIn(self.workspace.pk, self._ids(self.member))  # even as an explicit allowed user
        self.assertNotIn(self.workspace.pk, self._ids(self.peer))
        self.assertNotIn(self.workspace.pk, self._ids(self.peer, 'my_teams_workspaces/'))

    def test_staff_still_see_it_with_its_state(self):
        self._archive()
        self.client.force_authenticate(self.admin)
        rows = self.client.get(WORKSPACES, {'page_size': 100}).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        row = next(r for r in rows if r['id'] == self.workspace.pk)
        self.assertFalse(row['team_is_active'])

    def test_staff_can_list_only_detached_workspaces(self):
        self.team.delete()
        self.client.force_authenticate(self.admin)
        rows = self.client.get(WORKSPACES, {'detached': 'true', 'page_size': 100}).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        self.assertEqual([r['id'] for r in rows], [self.workspace.pk])
        self.assertIsNotNone(rows[0]['detached_at'])
