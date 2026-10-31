"""The Teams table shows archive blockers per row: one batched pass that must match the dialog's."""
from datetime import date

from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team, UserProfile
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from apps.users.services.team_lifecycle import archive_blockers, archive_blockers_bulk

TEAMS = '/api/users/teams/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def pending_overtime(user):
    client, _ = Client.objects.get_or_create(code='C1', defaults={'name': 'C1'})
    return OvertimeLog.objects.create(user=user, client=client, date=date(2026, 9, 1), hours=2, status='pending')


class ArchiveBlockersBulkTests(APITestCase):
    def setUp(self):
        self.admin = make_user('adm', is_staff=True)
        self.client.force_authenticate(self.admin)
        self.leader = make_user('lead')
        self.clean = Team.objects.create(name='Clean', code='CLN', team_leader=self.leader)

        self.parent = Team.objects.create(name='Parent', code='PAR')
        Team.objects.create(name='Child', code='CHD', parent_team=self.parent)

        self.pending = Team.objects.create(name='Pending', code='PND')
        self.orphan = make_user('orphan')
        self.orphan.profile.teams.add(self.pending)
        pending_overtime(self.orphan)

        self.covered = Team.objects.create(name='Covered', code='COV')
        self.keeps_other = make_user('keeps')
        self.keeps_other.profile.teams.add(self.covered, self.clean)
        pending_overtime(self.keeps_other)

        self.hbpr_leader = make_user('albtl')
        self.hbpr_team = Team.objects.create(name='Hbpr', code='HBP', team_leader=self.hbpr_leader)
        HbprAlbanianTlAssignment.objects.create(
            hbpr=make_user('hbpr'), albanian_tl=self.hbpr_leader,
            effective_from=date(2026, 1, 1), assigned_by=self.admin,
        )

        self.archived = Team.objects.create(name='Gone', code='GON', is_active=False)

    def test_bulk_matches_the_per_team_rules_for_every_team(self):
        teams = list(Team.objects.all())
        bulk = archive_blockers_bulk(teams)
        self.assertNotIn(self.archived.id, bulk)  # archived rows have nothing to archive
        for team in (t for t in teams if t.is_active):
            self.assertEqual(bulk[team.id], archive_blockers(team), team.code)

    def test_each_reason_shows_up_on_its_team(self):
        bulk = archive_blockers_bulk(list(Team.objects.all()))
        self.assertIn('sub-team', bulk[self.parent.id][0])
        self.assertIn('pending overtime', bulk[self.pending.id][0])
        self.assertIn('HBPR', bulk[self.hbpr_team.id][0])
        self.assertEqual(bulk[self.clean.id], [])
        self.assertEqual(bulk[self.covered.id], [])

    def test_list_returns_blockers_for_active_teams_only(self):
        resp = self.client.get(f'{TEAMS}?is_active=all')
        self.assertEqual(resp.status_code, 200)
        rows = {r['code']: r for r in resp.data['results']}
        self.assertEqual(rows['CLN']['archive_blockers'], [])
        self.assertIn('sub-team', rows['PAR']['archive_blockers'][0])
        self.assertIsNone(rows['GON']['archive_blockers'])

    def test_only_admins_get_blockers_they_carry_pending_counts_and_hbpr_status(self):
        # Pending counts are confidential (team confidentiality ruling): only the people who can archive see them.
        hr = make_user('hrviewer')
        hr.profile.is_hr_user = True
        hr.profile.save()
        for viewer in (make_user('plain'), self.leader, self.hbpr_leader, hr):
            self.client.force_authenticate(viewer)
            resp = self.client.get(TEAMS)
            self.assertEqual(resp.status_code, 200, viewer.username)
            for row in resp.data['results']:
                self.assertIsNone(row['archive_blockers'], (viewer.username, row['code']))
        self.client.force_authenticate(make_user('root', is_superuser=True))
        rows = {r['code']: r for r in self.client.get(TEAMS).data['results']}
        self.assertIn('sub-team', rows['PAR']['archive_blockers'][0])

    def test_detail_does_not_compute_blockers(self):
        resp = self.client.get(f'{TEAMS}{self.parent.pk}/')
        self.assertIsNone(resp.data['archive_blockers'])

    def test_list_query_count_does_not_grow_with_more_teams(self):
        def count():
            with CaptureQueriesContext(connection) as ctx:
                self.client.get(TEAMS)
            return len(ctx.captured_queries)

        before = count()
        for i in range(6):
            team = Team.objects.create(name=f'Extra {i}', code=f'EX{i}')
            user = make_user(f'extra{i}')
            user.profile.teams.add(team)
            pending_overtime(user)
        self.assertEqual(count(), before)
