"""Team lifecycle plan, Phase 3: membership changes are multi-team safe, recorded and warned about."""
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.reports.models import AuditLog
from apps.users.models import Team, TeamMembership, UserProfile
from apps.users.models.core import TeamMembershipHistory

USERS = '/api/users/users/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class MembershipChangeTests(APITestCase):
    def setUp(self):
        self.admin = make_user('adm', is_staff=True)
        self.client.force_authenticate(self.admin)
        self.tl = make_user('tl')
        self.other_tl = make_user('otl')
        self.team_a = Team.objects.create(name='A', code='AAA', team_leader=self.tl)
        self.team_b = Team.objects.create(name='B', code='BBB', team_leader=self.other_tl)
        self.user = make_user('emp')
        self.user.profile.teams.add(self.team_a, self.team_b)
        self.url = f'{USERS}{self.user.pk}/update_user/'

    def _teams(self):
        return set(TeamMembership.objects.filter(user_profile=self.user.profile).values_list('team__code', flat=True))

    def test_removing_one_of_two_teams_keeps_the_other_and_records_history_and_audit(self):
        resp = self.client.patch(self.url, {'teams': [self.team_b.pk]}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._teams(), {'BBB'})
        history = TeamMembershipHistory.objects.get(user=self.user)
        self.assertEqual((history.team_code, history.username, history.removed_by), ('AAA', 'emp', self.admin))
        audit = AuditLog.objects.get(model_name='team', extra_data__operation='member_remove')
        self.assertEqual(audit.object_id, str(self.team_a.pk))
        self.assertEqual(audit.extra_data['username'], 'emp')

    def test_string_team_ids_are_coerced_so_unchanged_teams_write_nothing(self):
        resp = self.client.patch(
            self.url, {'teams': [str(self.team_a.pk), str(self.team_b.pk)]}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._teams(), {'AAA', 'BBB'})
        self.assertEqual(TeamMembershipHistory.objects.count(), 0)
        self.assertEqual(
            AuditLog.objects.filter(extra_data__operation__in=['member_add', 'member_remove']).count(), 0,
        )

    def test_adding_a_team_is_audited_and_unchanged_teams_write_nothing(self):
        team_c = Team.objects.create(name='C', code='CCC')
        self.client.patch(self.url, {'teams': [self.team_a.pk, self.team_b.pk, team_c.pk]}, format='json')
        self.assertEqual(AuditLog.objects.filter(extra_data__operation='member_add').count(), 1)
        self.client.patch(self.url, {'teams': [self.team_a.pk, self.team_b.pk, team_c.pk]}, format='json')
        self.assertEqual(AuditLog.objects.filter(extra_data__operation='member_add').count(), 1)
        self.assertEqual(TeamMembershipHistory.objects.count(), 0)

    def test_tl_link_remains_warning_and_scope_is_kept_by_default(self):
        self.user.profile.italian_tl = self.tl
        self.user.profile.save()
        resp = self.client.patch(self.url, {'teams': [self.team_b.pk]}, format='json')
        self.assertEqual([w['user_id'] for w in resp.data['warnings']], [self.tl.pk])
        self.assertEqual(resp.data['warnings'][0]['field'], 'italian_tl')
        self.assertEqual(resp.data['removed_team_leaders'], [self.tl.pk])
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.italian_tl_id, self.tl.pk)
        self.assertIn(self.user.pk, self.tl.profile.get_team_member_ids())  # the FK branch still grants scope

    def test_unassign_removed_tl_clears_the_link_and_scope_together(self):
        self.user.profile.italian_tl = self.tl
        self.user.profile.albanian_tl = self.other_tl  # leads a team the user keeps: must stay
        self.user.profile.save()
        resp = self.client.patch(
            self.url, {'teams': [self.team_b.pk], 'unassign_removed_tl': True}, format='json'
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['warnings'], [])
        self.user.profile.refresh_from_db()
        self.assertIsNone(self.user.profile.italian_tl_id)
        self.assertEqual(self.user.profile.albanian_tl_id, self.other_tl.pk)
        self.assertNotIn(self.user.pk, self.tl.profile.get_team_member_ids())
        self.assertTrue(AuditLog.objects.filter(extra_data__operation='tl_link_cleared').exists())

    def test_leader_of_a_remaining_team_is_not_flagged(self):
        self.user.profile.italian_tl = self.other_tl
        self.user.profile.save()
        resp = self.client.patch(self.url, {'teams': [self.team_b.pk]}, format='json')
        self.assertEqual(resp.data['warnings'], [])

    def test_records_are_untouched(self):
        client, _ = Client.objects.get_or_create(code='C1', defaults={'name': 'C1'})
        log = OvertimeLog.objects.create(user=self.user, client=client, date=date(2026, 9, 1), hours=2, status='pending')
        self.client.patch(self.url, {'teams': []}, format='json')
        self.assertEqual(self._teams(), set())
        log.refresh_from_db()
        self.assertEqual(log.status, 'pending')

    def test_legacy_single_team_and_clear_go_through_the_same_path(self):
        self.client.patch(self.url, {'team': self.team_b.pk}, format='json')
        self.assertEqual(self._teams(), {'BBB'})
        self.assertEqual(TeamMembershipHistory.objects.filter(team_code='AAA').count(), 1)
        self.client.patch(self.url, {'team': None}, format='json')
        self.assertEqual(self._teams(), set())
        self.assertEqual(TeamMembershipHistory.objects.filter(team_code='BBB').count(), 1)

    def test_bulk_update_reports_warnings_per_user_and_honours_unassign(self):
        self.user.profile.italian_tl = self.tl
        self.user.profile.save()
        payload = {'user_ids': [self.user.pk], 'teams': [self.team_b.pk]}
        resp = self.client.post(f'{USERS}bulk_update/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['warnings'][0]['member_username'], 'emp')
        self.assertEqual(resp.data['warnings'][0]['user_id'], self.tl.pk)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.italian_tl_id, self.tl.pk)

        self.user.profile.teams.add(self.team_a)
        payload['unassign_removed_tl'] = True
        resp = self.client.post(f'{USERS}bulk_update/', payload, format='json')
        self.assertEqual(resp.data['warnings'], [])
        self.user.profile.refresh_from_db()
        self.assertIsNone(self.user.profile.italian_tl_id)

    def test_create_user_with_teams_is_audited(self):
        resp = self.client.post(f'{USERS}create_user/', {
            'username': 'fresh', 'email': 'f@example.com', 'password': 'Str0ng-pass-123!',
            'teams': [self.team_a.pk],
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(AuditLog.objects.filter(
            extra_data__operation='member_add', extra_data__username='fresh'
        ).exists())


class ArchivedTeamLeaderTests(APITestCase):
    """Decision: an archived team keeps its leader (so restore works) but confers no TL status."""

    def test_leader_of_only_an_archived_team_is_not_a_team_leader(self):
        tl = make_user('tl')
        team = Team.objects.create(name='A', code='AAA', team_leader=tl)
        self.assertTrue(User.objects.get(pk=tl.pk).profile.is_team_leader)
        team.is_active = False
        team.save()
        self.assertFalse(User.objects.get(pk=tl.pk).profile.is_team_leader)

    def test_leader_of_an_archived_and_an_active_team_stays_a_team_leader(self):
        tl = make_user('tl')
        Team.objects.create(name='A', code='AAA', team_leader=tl, is_active=False)
        Team.objects.create(name='B', code='BBB', team_leader=tl)
        self.assertTrue(User.objects.get(pk=tl.pk).profile.is_team_leader)

    def test_archived_team_leader_stops_counting_for_team_scope_but_restore_brings_it_back(self):
        tl = make_user('tl')
        member = make_user('mem')
        team = Team.objects.create(name='A', code='AAA', team_leader=tl)
        member.profile.teams.add(team)
        self.assertIn(member.pk, tl.profile.get_team_member_ids())
        team.is_active = False
        team.save()
        TeamMembership.objects.filter(team=team).delete()
        self.assertEqual(tl.profile.get_team_member_ids(), set())
        team.is_active = True
        team.save()
        self.assertTrue(User.objects.get(pk=tl.pk).profile.is_team_leader)
