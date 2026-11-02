"""Suggested team moves: someone works a client that nobody on their own team works."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.overtime.models import Client
from apps.users.models import Team, Tech, UserProfile
from apps.users.services.team_suggestions import suggest_team_moves

URL = '/api/users/teams/suggestions/'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


def mine(rows, user):
    """The suggestion row for ``user`` (None when there is none)."""
    return next((r for r in rows if r['user_id'] == user.id), None)


class SuggestTeamMovesTests(APITestCase):
    def setUp(self):
        self.acme = Client.objects.create(name='Acme', code='ACM')
        self.beta = Client.objects.create(name='Beta', code='BET')
        self.alpha = Team.objects.create(name='Alpha', code='ALP')
        self.gamma = Team.objects.create(name='Gamma', code='GAM')
        self.ana = make_user('ana')
        self.bob = make_user('bob')
        self.ana.profile.teams.add(self.alpha)
        self.bob.profile.teams.add(self.gamma)
        self.bob.profile.clients.add(self.acme)

    def test_client_nobody_on_own_team_works_points_at_the_team_that_does(self):
        self.ana.profile.clients.add(self.acme)
        row = mine(suggest_team_moves(), self.ana)
        self.assertEqual([t['id'] for t in row['current_teams']], [self.alpha.id])
        rec = row['recommendation']
        self.assertEqual(rec['team']['id'], self.gamma.id)
        self.assertEqual([c['code'] for c in rec['clients']], ['ACM'])
        self.assertEqual(rec['sharing'], 1)
        self.assertEqual(row['alternatives'], [])
        self.assertEqual(row['remaining_clients'], [])

    def test_non_team_roles_are_never_suggested(self):
        # HR/HBPR/CR/admin legitimately sit outside every team (data check rule 44a).
        hr = make_user('hrperson')
        hr.profile.role_codes = ['hr']
        hr.profile.save()
        hbpr = make_user('hbprperson')
        hbpr.profile.role_codes = ['hbpr']
        hbpr.profile.save()
        for person in (hr, hbpr):
            person.profile.teams.add(self.alpha)
            person.profile.clients.add(self.acme)
        rows = suggest_team_moves()
        self.assertIsNone(mine(rows, hr))
        self.assertIsNone(mine(rows, hbpr))

    def test_a_staff_member_does_not_count_as_a_teammate(self):
        # Staff/superusers are not candidates either; a system admin assigned to a client
        # must not hide a real move for the team.
        boss = make_user('boss', is_staff=True)
        boss.profile.teams.add(self.alpha)
        boss.profile.clients.add(self.acme)
        self.ana.profile.clients.add(self.acme)
        self.assertIsNotNone(mine(suggest_team_moves(), self.ana))

    def test_no_suggestion_when_a_teammate_already_works_the_client(self):
        mate = make_user('mate')
        mate.profile.teams.add(self.alpha)
        mate.profile.clients.add(self.acme)
        self.ana.profile.clients.add(self.acme)
        self.assertIsNone(mine(suggest_team_moves(), self.ana))

    def test_no_suggestion_when_no_team_has_anyone_on_the_client(self):
        self.ana.profile.clients.add(self.beta)
        self.assertIsNone(mine(suggest_team_moves(), self.ana))

    def test_someone_in_no_team_is_offered_the_teams_on_their_client(self):
        loner = make_user('loner')
        loner.profile.clients.add(self.acme)
        row = mine(suggest_team_moves(), loner)
        self.assertEqual(row['current_teams'], [])
        self.assertEqual(row['recommendation']['team']['id'], self.gamma.id)

    def test_best_team_comes_first(self):
        carl = make_user('carl')
        carl.profile.teams.add(self.gamma)
        carl.profile.clients.add(self.acme)
        dina = make_user('dina')
        dina.profile.teams.add(self.alpha)
        dina.profile.clients.add(self.beta)
        eve = make_user('eve')
        eve.profile.teams.add(self.alpha)
        eve.profile.clients.add(self.acme)
        newcomer = make_user('newcomer')
        newcomer.profile.clients.add(self.acme)
        row = mine(suggest_team_moves(), newcomer)
        self.assertEqual(row['recommendation']['team']['id'], self.gamma.id)
        self.assertEqual(row['recommendation']['sharing'], 2)
        self.assertEqual([(o['team']['id'], o['sharing']) for o in row['alternatives']], [(self.alpha.id, 1)])

    def test_archived_clients_teams_staff_and_inactive_users_are_left_out(self):
        old = Client.objects.create(name='Old', code='OLD', is_active=False)
        self.bob.profile.clients.add(old)
        self.ana.profile.clients.add(old)
        staff = make_user('staffer', is_staff=True)
        staff.profile.clients.add(self.acme)
        gone = make_user('gone')
        gone.is_active = False
        gone.save()
        gone.profile.clients.add(self.acme)
        Team.objects.filter(pk=self.gamma.pk).update(is_active=False)
        self.ana.profile.clients.add(self.acme)
        rows = suggest_team_moves()
        for user in (self.ana, staff, gone):
            self.assertIsNone(mine(rows, user), user.username)


class RecommendationLogicTests(APITestCase):
    """One row per person; the team covering most of their clients wins."""

    def setUp(self):
        self.acme = Client.objects.create(name='Acme', code='ACM')
        self.beta = Client.objects.create(name='Beta', code='BET')
        self.gamma_team = Team.objects.create(name='Gamma', code='GAM')
        self.delta = Team.objects.create(name='Delta', code='DEL')
        self.ana = make_user('ana')
        self.ana.profile.clients.add(self.acme, self.beta)

    def work(self, name, team, *clients):
        user = make_user(name)
        user.profile.teams.add(team)
        user.profile.clients.add(*clients)
        return user

    def test_a_person_with_two_uncovered_clients_gets_one_row_with_the_team_covering_both(self):
        self.work('g1', self.gamma_team, self.acme, self.beta)
        self.work('d1', self.delta, self.acme)
        self.work('d2', self.delta, self.acme)
        rows = [r for r in suggest_team_moves() if r['user_id'] == self.ana.id]
        self.assertEqual(len(rows), 1)
        rec = rows[0]['recommendation']
        self.assertEqual(rec['team']['id'], self.gamma_team.id)
        self.assertEqual([c['code'] for c in rec['clients']], ['ACM', 'BET'])
        self.assertEqual([o['team']['id'] for o in rows[0]['alternatives']], [self.delta.id])
        self.assertEqual(rows[0]['remaining_clients'], [])

    def test_clients_the_recommended_team_misses_are_reported_as_remaining(self):
        self.work('g1', self.gamma_team, self.acme)
        self.work('d1', self.delta, self.beta)
        self.work('d2', self.delta, self.beta)
        row = mine(suggest_team_moves(), self.ana)
        # Both teams cover one client; the larger Delta group wins the tie.
        self.assertEqual(row['recommendation']['team']['id'], self.delta.id)
        self.assertEqual([c['code'] for c in row['remaining_clients']], ['ACM'])

    def test_a_team_nobody_can_approve_loses_a_tie_on_coverage(self):
        from django.contrib.auth.models import User
        lead = User.objects.create_user('lead', password='x')
        Team.objects.filter(pk=self.delta.pk).update(team_leader=lead)
        self.work('g1', self.gamma_team, self.acme, self.beta)
        self.work('g2', self.gamma_team, self.acme, self.beta)
        self.work('d1', self.delta, self.acme, self.beta)
        row = mine(suggest_team_moves(), self.ana)
        self.assertEqual(row['recommendation']['team']['id'], self.delta.id)
        self.assertTrue(row['recommendation']['has_approver'])
        self.assertFalse(row['alternatives'][0]['has_approver'])


class InactiveTeammateTests(APITestCase):
    def setUp(self):
        self.acme = Client.objects.create(name='Acme', code='ACM')
        self.alpha = Team.objects.create(name='Alpha', code='ALP')
        self.gamma = Team.objects.create(name='Gamma', code='GAM')
        self.ana = make_user('ana')
        self.ana.profile.teams.add(self.alpha)
        self.ana.profile.clients.add(self.acme)
        self.bob = make_user('bob')
        self.bob.profile.teams.add(self.gamma)
        self.bob.profile.clients.add(self.acme)

    def deactivate(self, user):
        user.is_active = False
        user.save()

    def test_a_deactivated_teammate_does_not_hide_the_suggestion(self):
        gone = make_user('gone')
        gone.profile.teams.add(self.alpha)
        gone.profile.clients.add(self.acme)
        self.deactivate(gone)
        self.assertIsNotNone(mine(suggest_team_moves(), self.ana))

    def test_a_deactivated_member_is_not_counted_as_sharing(self):
        gone = make_user('gone')
        gone.profile.teams.add(self.gamma)
        gone.profile.clients.add(self.acme)
        self.deactivate(gone)
        rec = mine(suggest_team_moves(), self.ana)['recommendation']
        self.assertEqual((rec['team']['id'], rec['sharing']), (self.gamma.id, 1))


class SuggestionsEndpointTests(APITestCase):
    def test_admin_gets_rows_and_a_regular_user_is_refused(self):
        self.client.force_authenticate(make_user('adm', is_staff=True))
        resp = self.client.get(URL)
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, list)
        self.client.force_authenticate(make_user('plain'))
        self.assertEqual(self.client.get(URL).status_code, 403)


class OvertimeAndManagerTests(APITestCase):
    """Overtime decides which clients matter; Italian TLs follow their people and need no team."""

    def setUp(self):
        self.acme = Client.objects.create(name='Acme', code='ACM')
        self.beta = Client.objects.create(name='Beta', code='BET')
        self.gamma = Team.objects.create(name='Gamma', code='GAM')
        self.delta = Team.objects.create(name='Delta', code='DEL')
        self.ana = make_user('ana')
        self.ana.profile.clients.add(self.acme, self.beta)
        for name, team, client in (('g1', self.gamma, self.acme), ('d1', self.delta, self.beta)):
            user = make_user(name)
            user.profile.teams.add(team)
            user.profile.clients.add(client)

    def log(self, user, client, hours, days_ago=1):
        from datetime import timedelta
        from apps.overtime.models import OvertimeLog
        from core.utils.timezone_local import business_today
        return OvertimeLog.objects.create(
            user=user, client=client, hours=hours, status='approved',
            date=business_today() - timedelta(days=days_ago),
        )

    def test_the_client_the_person_really_logs_overtime_on_decides_the_team(self):
        # Both teams cover one client each; Ana's hours sit on Beta, so Delta wins.
        self.log(self.ana, self.beta, 12)
        row = mine(suggest_team_moves(), self.ana)
        self.assertEqual(row['recommendation']['team']['id'], self.delta.id)
        self.assertEqual(row['basis'], 'overtime')
        self.assertEqual(row['recommendation']['clients'][0]['hours'], 12.0)
        self.assertEqual([c['code'] for c in row['remaining_clients']], ['ACM'])

    def test_overtime_outside_the_window_or_not_approved_does_not_count(self):
        from apps.overtime.models import OvertimeLog
        self.log(self.ana, self.beta, 12, days_ago=400)
        old = self.log(self.ana, self.beta, 9)
        OvertimeLog.objects.filter(pk=old.pk).update(status='pending')
        row = mine(suggest_team_moves(), self.ana)
        self.assertEqual(row['basis'], 'assignment')
        self.assertEqual(row['person_hours'], 0)

    def test_people_with_overtime_come_first(self):
        quiet = make_user('aaa')
        quiet.profile.clients.add(self.acme)
        self.log(self.ana, self.acme, 5)
        rows = suggest_team_moves()
        self.assertEqual(rows[0]['user_id'], self.ana.id)

    def test_an_italian_tl_is_never_suggested_a_team_nor_counted_as_a_teammate(self):
        from apps.users.services.orphan_check import find_orphans
        boss = make_user('boss')
        boss.profile.is_italian_tl_role = True
        boss.profile.save()
        boss.profile.clients.add(self.acme)
        boss.profile.teams.add(self.delta)
        self.assertIsNone(mine(suggest_team_moves(), boss))
        # ...and the manager is not reported as "without a team" either.
        loner = make_user('loner2')
        loner.profile.is_italian_tl_role = True
        loner.profile.save()
        self.assertNotIn(loner.id, [u['id'] for u in find_orphans()['users_without_team']])
        # A TL on Delta/Acme must not make Delta look like it works Acme.
        row = mine(suggest_team_moves(), self.ana)
        self.assertIn(self.gamma.id, [row['recommendation']['team']['id']] + [a['team']['id'] for a in row['alternatives']])


class TechAwareSuggestionsTests(APITestCase):
    """Never suggest a team of a different tech."""

    def setUp(self):
        self.acme = Client.objects.create(name='Acme', code='ACM')
        self.team_infra = Team.objects.create(name='Infra Team', code='INF_T')
        self.team_db = Team.objects.create(name='DB Team', code='DB_T')
        self.tech_infra = Tech.objects.create(name='Infrastructure', code='INFRA')
        self.tech_db = Tech.objects.create(name='Database', code='DB')

        self.ana = make_user('ana')  # DB engineer
        self.ana.profile.techs.add(self.tech_db)
        self.ana.profile.clients.add(self.acme)

        self.bob = make_user('bob')  # Infra engineer in Infra Team
        self.bob.profile.techs.add(self.tech_infra)
        self.bob.profile.teams.add(self.team_infra)
        self.bob.profile.clients.add(self.acme)

        self.carl = make_user('carl')  # DB engineer in DB Team
        self.carl.profile.techs.add(self.tech_db)
        self.carl.profile.teams.add(self.team_db)
        self.carl.profile.clients.add(self.acme)

    def test_different_tech_team_is_never_suggested(self):
        # Even though Bob works on Acme in Infra Team, Ana (DB) is never suggested Infra Team.
        # She should only be suggested DB Team!
        row = mine(suggest_team_moves(), self.ana)
        self.assertIsNotNone(row)
        self.assertEqual(row['recommendation']['team']['id'], self.team_db.id)
        alt_team_ids = [alt['team']['id'] for alt in row['alternatives']]
        self.assertNotIn(self.team_infra.id, alt_team_ids)

    def test_no_suggestion_if_only_different_tech_team_works_the_client(self):
        # If DB team did not exist or Carl didn't work on Acme, Ana gets NO suggestions
        # because the only team on Acme is Infra (different tech).
        self.carl.profile.clients.remove(self.acme)
        row = mine(suggest_team_moves(), self.ana)
        self.assertIsNone(row)

    def test_untyped_user_receives_any_matching_team(self):
        # Untyped user (no tech assigned) falls back to any team working the client
        dan = make_user('dan')
        dan.profile.clients.add(self.acme)
        row = mine(suggest_team_moves(), dan)
        self.assertIsNotNone(row)
        rec_id = row['recommendation']['team']['id']
        self.assertIn(rec_id, [self.team_infra.id, self.team_db.id])

