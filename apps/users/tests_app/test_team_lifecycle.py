"""Team lifecycle plan, Phase 2: archive, restore, delete and purge."""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday
from apps.overtime.models import Client, OvertimeLog
from apps.reports.models import AuditLog
from apps.users.models import ClosedYear, Team, TeamMembership, UserProfile
from apps.users.services.approval_periods import clear_closed_year_cache
from apps.users.models.core import TeamMembershipHistory
from apps.users.services import team_lifecycle
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.engagement.models import TLApprovalMetric

TEAMS = '/api/users/teams/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def pending_overtime(user):
    client, _ = Client.objects.get_or_create(code='C1', defaults={'name': 'C1'})
    return OvertimeLog.objects.create(user=user, client=client, date=date(2026, 9, 1), hours=2, status='pending')


def make_request(user):
    request = RequestFactory().post('/x')
    request.user = user
    return request


class TeamLifecycleApiTests(APITestCase):
    def setUp(self):
        self.admin = make_user('adm', is_staff=True)
        self.client.force_authenticate(self.admin)
        self.leader = make_user('lead')
        self.member = make_user('mem')
        self.team = Team.objects.create(name='Alpha', code='ALP', team_leader=self.leader)
        self.member.profile.teams.add(self.team)

    # --- delete -----------------------------------------------------------------
    def test_delete_with_members_is_409_with_counts_and_changes_nothing(self):
        resp = self.client.delete(f'{TEAMS}{self.team.pk}/')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data['counts'], {'user_memberships': 1})
        self.assertIn('cascade_counts', resp.data)
        self.assertTrue(Team.objects.filter(pk=self.team.pk).exists())
        self.assertEqual(TeamMembership.objects.filter(team=self.team).count(), 1)

    def test_delete_blocked_by_control_room_scope_and_sub_team(self):
        TeamMembership.objects.filter(team=self.team).delete()
        access = ControlRoomAccess.objects.create(user=self.member)
        ControlRoomTeamScope.objects.create(access=access, team=self.team)
        Team.objects.create(name='Sub', code='SUB', parent_team=self.team)
        resp = self.client.delete(f'{TEAMS}{self.team.pk}/')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data['counts'], {'control_room_scopes': 1, 'sub_teams': 1})

    def test_delete_blocked_by_metric_with_numbers_but_not_by_an_empty_one(self):
        TeamMembership.objects.filter(team=self.team).delete()
        empty = TLApprovalMetric.objects.create(
            leader=self.leader, team=self.team, month=date(2026, 9, 1), team_size=0, computed_at=timezone.now()
        )
        self.assertEqual(self.client.delete(f'{TEAMS}{self.team.pk}/').status_code, 204)
        empty.refresh_from_db()
        self.assertIsNone(empty.team_id)  # kept as history

    def test_used_team_must_be_archived_before_delete(self):
        TeamMembership.objects.filter(team=self.team).delete()
        TLApprovalMetric.objects.create(
            leader=self.leader, team=self.team, month=date(2026, 9, 1), team_size=3, computed_at=timezone.now()
        )
        resp = self.client.delete(f'{TEAMS}{self.team.pk}/')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data['counts'], {'engagement_metrics': 1})

    def test_never_used_team_is_deleted_and_audited(self):
        fresh = Team.objects.create(name='Fresh', code='FRS')
        self.assertEqual(self.client.delete(f'{TEAMS}{fresh.pk}/').status_code, 204)
        self.assertFalse(Team.objects.filter(pk=fresh.pk).exists())
        self.assertTrue(AuditLog.objects.filter(model_name='team', extra_data__operation='delete').exists())

    def test_workspace_with_holidays_blocks_delete(self):
        fresh = Team.objects.create(name='Fresh', code='FRS')
        workspace = CalendarWorkspace.objects.get(team=fresh)
        PublicHoliday.objects.create(calendar=workspace, name='H', date=date(2026, 12, 25), is_global=False)
        resp = self.client.delete(f'{TEAMS}{fresh.pk}/')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data['counts'], {'calendar_workspaces': 1})

    # --- archive / unarchive ----------------------------------------------------
    def test_archive_hides_unassigns_writes_history_and_audit(self):
        self.member.profile.italian_tl = self.leader  # still reachable by a leader
        self.member.profile.save()
        resp = self.client.post(f'{TEAMS}{self.team.pk}/archive/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['members_unassigned'], 1)
        self.team.refresh_from_db()
        self.assertFalse(self.team.is_active)
        self.assertEqual(self.team.archived_by, self.admin)
        self.assertEqual(TeamMembership.objects.filter(team=self.team).count(), 0)
        history = TeamMembershipHistory.objects.get(team=self.team)
        self.assertEqual((history.username, history.team_code, history.reason), ('mem', 'ALP', 'team archived'))
        audit = AuditLog.objects.get(model_name='team', extra_data__operation='archive')
        self.assertEqual(audit.extra_data['members_unassigned'], 1)
        ids = [row['id'] for row in self.client.get(TEAMS, {'page_size': 100}).data['results']]
        self.assertNotIn(self.team.pk, ids)
        archived = self.client.get(TEAMS, {'is_active': 'false', 'page_size': 100}).data['results']
        self.assertEqual([row['id'] for row in archived], [self.team.pk])
        everything = self.client.get(TEAMS, {'is_active': 'all', 'page_size': 100}).data['results']
        self.assertIn(self.team.pk, [row['id'] for row in everything])
        self.assertEqual(self.client.get(f'{TEAMS}{self.team.pk}/').status_code, 200)  # still reachable

    def test_archive_blocked_by_pending_request_of_an_otherwise_orphaned_member(self):
        pending_overtime(self.member)
        resp = self.client.post(f'{TEAMS}{self.team.pk}/archive/')
        self.assertEqual(resp.status_code, 409)
        self.assertIn('pending overtime', resp.data['blockers'][0])
        self.team.refresh_from_db()
        self.assertTrue(self.team.is_active)
        self.assertEqual(TeamMembership.objects.filter(team=self.team).count(), 1)

    def test_pending_request_does_not_block_when_member_keeps_another_team(self):
        other = Team.objects.create(name='Other', code='OTH')
        self.member.profile.teams.add(other)
        pending_overtime(self.member)
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/archive/').status_code, 200)
        self.assertTrue(TeamMembership.objects.filter(team=other, user_profile=self.member.profile).exists())

    def test_pending_request_does_not_block_when_member_has_a_tl_link(self):
        self.member.profile.albanian_tl = self.leader
        self.member.profile.save()
        pending_overtime(self.member)
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/archive/').status_code, 200)

    def test_archive_blocked_by_active_sub_team(self):
        Team.objects.create(name='Sub', code='SUB', parent_team=self.team)
        resp = self.client.post(f'{TEAMS}{self.team.pk}/archive/')
        self.assertEqual(resp.status_code, 409)
        self.assertIn('sub-team', resp.data['blockers'][0])

    def test_archive_blocked_by_open_hbpr_assignment(self):
        from apps.users.models.hbpr import HbprAlbanianTlAssignment
        hbpr = make_user('hbpr')
        HbprAlbanianTlAssignment.objects.create(
            hbpr=hbpr, albanian_tl=self.leader, effective_from=date(2026, 1, 1), assigned_by=self.admin
        )
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        resp = self.client.post(f'{TEAMS}{self.team.pk}/archive/')
        self.assertEqual(resp.status_code, 409)
        self.assertIn('HBPR', resp.data['blockers'][0])

    def test_archive_twice_and_unarchive_active_are_409(self):
        self.member.profile.albanian_tl = self.leader
        self.member.profile.save()
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/archive/').status_code, 200)
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/archive/').status_code, 409)
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/unarchive/').status_code, 200)
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/unarchive/').status_code, 409)
        self.team.refresh_from_db()
        self.assertTrue(self.team.is_active)
        self.assertIsNone(self.team.archived_at)
        self.assertEqual(TeamMembership.objects.filter(team=self.team).count(), 0)  # not restored
        self.assertTrue(AuditLog.objects.filter(model_name='team', extra_data__operation='unarchive').exists())

    def test_is_active_is_read_only_on_update(self):
        resp = self.client.patch(f'{TEAMS}{self.team.pk}/', {'is_active': False}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.team.refresh_from_db()
        self.assertTrue(self.team.is_active)

    def test_non_admin_cannot_archive(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/archive/').status_code, 403)
        self.assertEqual(self.client.get(f'{TEAMS}{self.team.pk}/lifecycle/').status_code, 403)

    def test_lifecycle_summary(self):
        data = self.client.get(f'{TEAMS}{self.team.pk}/lifecycle/').data
        self.assertEqual(data['members_count'], 1)
        self.assertTrue(data['is_active'])
        self.assertEqual(data['counts'], {'user_memberships': 1})
        self.assertIn('Team must be archived', data['delete_blockers'][0])

    # --- archived team rejects new members ---------------------------------------
    def _archive(self):
        self.member.profile.albanian_tl = self.leader
        self.member.profile.save()
        self.assertEqual(self.client.post(f'{TEAMS}{self.team.pk}/archive/').status_code, 200)

    def test_archived_team_rejects_members_on_every_entry_point(self):
        self._archive()
        newcomer = make_user('new')
        create = self.client.post('/api/users/users/create_user/', {
            'username': 'created', 'email': 'c@example.com', 'password': 'Str0ng-pass-123!',
            'teams': [self.team.pk],
        }, format='json')
        self.assertEqual(create.status_code, 400, create.data)
        self.assertIn('archived', create.data['error'])
        self.assertFalse(User.objects.filter(username='created').exists())

        update = self.client.patch(f'/api/users/users/{newcomer.pk}/update_user/', {'teams': [self.team.pk]}, format='json')
        self.assertEqual(update.status_code, 400, update.data)
        legacy = self.client.patch(f'/api/users/users/{newcomer.pk}/update_user/', {'team': self.team.pk}, format='json')
        self.assertEqual(legacy.status_code, 400, legacy.data)

        bulk = self.client.post('/api/users/users/bulk_update/', {
            'user_ids': [newcomer.pk], 'teams': [self.team.pk],
        }, format='json')
        self.assertEqual(bulk.status_code, 400, bulk.data)
        self.assertFalse(TeamMembership.objects.filter(team=self.team).exists())

    def test_archived_team_cannot_be_a_new_parent(self):
        self._archive()
        child = Team.objects.create(name='Child', code='CHD')
        resp = self.client.patch(f'{TEAMS}{child.pk}/', {'parent_team_id': self.team.pk}, format='json')
        self.assertEqual(resp.status_code, 400)


class TeamPurgeTests(TestCase):
    def setUp(self):
        self.admin = make_user('adm', is_staff=True)
        self.team = Team.objects.create(name='Old', code='OLD')
        self.request = make_request(self.admin)
        team_lifecycle.archive_team(self.team, self.request)
        self.team.refresh_from_db()

    def test_active_team_is_not_purgeable(self):
        team = Team.objects.create(name='Live', code='LIV')
        self.assertEqual(team_lifecycle.purge_blockers(team), ['Team is not archived.'])

    def test_too_recent_team_is_refused(self):
        self.assertTrue(team_lifecycle.purge_team(self.team, self.request))
        self.assertTrue(Team.objects.filter(pk=self.team.pk).exists())

    def test_old_quiet_team_is_purged_and_audited_keeping_history(self):
        member = make_user('mem')
        TeamMembershipHistory.objects.create(
            team=self.team, team_name='Old', team_code='OLD', user=member, username='mem',
            removed_at=timezone.now() - timedelta(days=400),
        )
        TLApprovalMetric.objects.create(
            leader=member, team=self.team, month=date(2025, 1, 1), team_size=2,
            team_name='Old', team_code='OLD', computed_at=timezone.now(),
        )
        later = timezone.now() + timedelta(days=366)
        ClosedYear.objects.create(year=self.team.archived_at.year, closed_at=timezone.now())
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        self.assertEqual(team_lifecycle.purge_team(self.team, self.request, now=later), [])
        self.assertFalse(Team.objects.filter(pk=self.team.pk).exists())
        self.assertEqual(TLApprovalMetric.objects.get().team_name, 'Old')
        self.assertTrue(AuditLog.objects.filter(model_name='team', extra_data__operation='purge').exists())

    def test_new_membership_activity_blocks_purge(self):
        member = make_user('mem')
        TeamMembershipHistory.objects.create(
            team=self.team, team_name='Old', team_code='OLD', user=member, username='mem',
            removed_at=timezone.now() + timedelta(days=100),
        )
        later = timezone.now() + timedelta(days=366)
        self.assertIn('activity', ' '.join(team_lifecycle.purge_blockers(self.team, now=later)))

    def test_live_sub_team_blocks_purge(self):
        Team.objects.create(name='Sub', code='SUB', parent_team=self.team)
        later = timezone.now() + timedelta(days=366)
        self.assertIn('sub-team', ' '.join(team_lifecycle.purge_blockers(self.team, now=later)))


class ImporterArchivedTeamTests(TestCase):
    def test_importer_refuses_an_archived_team_code(self):
        from plugins.data_import.importers.users import UserImporter

        team = Team.objects.create(name='Gone', code='GON', is_active=False)
        with self.assertRaisesMessage(ValueError, 'archived'):
            UserImporter()._resolve_team({'team_code': team.code})
