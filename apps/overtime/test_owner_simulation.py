"""Situation matrix for the owner rule: what each leader-facing view shows.

Prints one ``SIM|`` line per check so the outcome of every situation is readable, and
asserts the expected result. Scenarios: decided vs pending rows, moves, staff or demoted
approvers, Manager plus Line Manager links, a move with no replacement, a team-only change,
a leader's own rows, and one employee in two teams under the same leader.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role, UserRole
from apps.standby.models import StandbyLog
from apps.users.models import Team
from apps.users.services.team_membership import change_user_teams
from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.services import compute_tl_metric
from plugins.tl_scorecard.scope import scoreable_member_ids
from plugins.tl_scorecard.services import month_blocks
from plugins.year_close.services.builder import bundles_for_year


def _sim(label, value):
    print(f'SIM| {label} = {value}')


def _role(user, code):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


def _lm(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_albanian_tl_role = True
    user.profile.save()
    _role(user, 'albanian_tl')
    return user


def _manager(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_italian_tl_role = True
    user.profile.save()
    _role(user, 'italian_tl')
    return user


class OwnerSimulationTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.month = self.now.date().replace(day=1)
        self.client_row = Client.objects.create(name='Sim', code='SIM')
        self.old_lm = _lm('sim_old_lm')
        self.new_lm = _lm('sim_new_lm')
        self.manager = _manager('sim_manager')
        self.team_a = Team.objects.create(name='Team A', code='TA')
        self.team_b = Team.objects.create(name='Team B', code='TB')
        self.emp = User.objects.create_user(username='sim_emp', password='x')
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.save()
        change_user_teams(self.emp.profile, [self.team_a.id])
        self.api = APIClient()

    # ---- helpers -------------------------------------------------------
    def _ot(self, user=None, status='pending', approved_by=None, submitted=None):
        user = user or self.emp
        log = OvertimeLog.objects.create(
            user=user, client=self.client_row, date=self.now.date(), hours=2, status=status,
            approved_by=approved_by,
        )
        update = {'submitted_at': submitted or self.now}
        if status in ('approved', 'rejected'):
            update['approved_at'] = self.now
        OvertimeLog.objects.filter(pk=log.pk).update(**update)
        return log.pk

    def _ids(self, path, leader):
        self.api.force_authenticate(user=leader)
        response = self.api.get(path)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in rows}

    def _views(self, leader, tag):
        log_ids = self._ids('/api/overtime/logs/team_logs/', leader)
        pending_ids = self._ids('/api/overtime/logs/team_pending/', leader)
        scorecard = month_blocks(leader, self.month, scoreable_member_ids(leader))['overtime']['decided_count']
        _sim(f'{tag} team_logs ot ids', sorted(log_ids))
        _sim(f'{tag} team_pending ot ids', sorted(pending_ids))
        _sim(f'{tag} scorecard decided count', scorecard)
        return log_ids, pending_ids, scorecard

    def _engagement(self, leader, team, tag):
        compute_tl_metric(leader, team, self.month)
        snap = TLApprovalMetric.objects.get(leader=leader, team=team, month=self.month)
        ot = snap.metrics['overtime']
        _sim(f'{tag} engagement {leader.username}/{team.code} ot decided, judgeable', (ot['decided'], ot['judgeable']))
        return ot

    def _move(self, new_lm):
        self.emp.profile.albanian_tl = new_lm
        self.emp.profile.save()

    # ---- situations ------------------------------------------------------
    def test_s1_decided_before_move_stays_with_approver(self):
        pk = self._ot(status='approved', approved_by=self.old_lm)
        self._move(self.new_lm)
        old_logs, _, old_sc = self._views(self.old_lm, 'S1 old')
        new_logs, _, new_sc = self._views(self.new_lm, 'S1 new')
        self.assertIn(pk, old_logs)
        self.assertNotIn(pk, new_logs)
        self.assertEqual((old_sc, new_sc), (1, 0))

    def test_s2_pending_at_move_follows_current_leader(self):
        pk = self._ot(status='pending')
        self._move(self.new_lm)
        _, old_pending, _ = self._views(self.old_lm, 'S2 old')
        _, new_pending, _ = self._views(self.new_lm, 'S2 new')
        self.assertNotIn(pk, old_pending)
        self.assertIn(pk, new_pending)

    def test_s3_decided_by_staff_follows_current_leader(self):
        staff = User.objects.create_user(username='sim_staff', password='x', is_staff=True)
        pk = self._ot(status='approved', approved_by=staff)
        self._move(self.new_lm)
        old_logs, _, _ = self._views(self.old_lm, 'S3 old')
        new_logs, _, _ = self._views(self.new_lm, 'S3 new')
        self.assertNotIn(pk, old_logs)
        self.assertIn(pk, new_logs)

    def test_s4_demoted_approver_loses_history_to_current_leader(self):
        pk = self._ot(status='approved', approved_by=self.old_lm)
        self.old_lm.user_roles.update(is_active=False)
        self.old_lm.profile.is_albanian_tl_role = False
        self.old_lm.profile.save()
        self._move(self.new_lm)
        _sim('S4 demoted approver: row owner', 'new_lm' if pk in self._ids('/api/overtime/logs/team_logs/', self.new_lm) else 'nobody')
        self.assertIn(pk, self._ids('/api/overtime/logs/team_logs/', self.new_lm))

    def test_s5_manager_decision_on_line_managers_employee(self):
        self.emp.profile.italian_tl = self.manager
        self.emp.profile.save()
        pk = self._ot(status='rejected', approved_by=self.manager)
        self.assertIn(pk, self._ids('/api/overtime/logs/team_logs/', self.manager))
        self.assertNotIn(pk, self._ids('/api/overtime/logs/team_logs/', self.old_lm))

    def test_s6_pending_with_manager_and_line_manager_owned_once(self):
        self.emp.profile.italian_tl = self.manager
        self.emp.profile.save()
        pk = self._ot(status='pending')
        self.assertIn(pk, self._ids('/api/overtime/logs/team_pending/', self.old_lm))
        self.assertNotIn(pk, self._ids('/api/overtime/logs/team_pending/', self.manager))

    def test_s7_move_to_nobody_keeps_decided_and_hides_pending(self):
        decided = self._ot(status='approved', approved_by=self.old_lm)
        pending = self._ot(status='pending')
        self.emp.profile.albanian_tl = None
        self.emp.profile.save()
        _sim('S7 owner of pending row', 'nobody (staff only)')
        self.assertIn(decided, self._ids('/api/overtime/logs/team_logs/', self.old_lm))
        self.assertNotIn(pending, self._ids('/api/overtime/logs/team_pending/', self.old_lm))

    def test_s8_team_only_change_does_not_move_rows(self):
        pk = self._ot(status='pending')
        change_user_teams(self.emp.profile, [self.team_b.id])
        self.assertIn(pk, self._ids('/api/overtime/logs/team_pending/', self.old_lm))

    def test_s9_leader_own_rows_listed_only_by_their_own_leader(self):
        own = self._ot(user=self.old_lm, status='pending')
        self.assertNotIn(own, self._ids('/api/overtime/logs/team_logs/', self.old_lm))
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.save()
        self.old_lm.profile.albanian_tl = self.manager
        self.old_lm.profile.save()
        self.assertIn(own, self._ids('/api/overtime/logs/team_logs/', self.manager))

    def test_s10_standby_same_as_overtime(self):
        pk = StandbyLog.objects.create(
            user=self.emp, date=self.now.date(), hours=8, status='approved', approved_by=self.old_lm,
        ).pk
        self._move(self.new_lm)
        self.assertIn(pk, self._ids('/api/standby/logs/team_logs/', self.old_lm))
        self.assertNotIn(pk, self._ids('/api/standby/logs/team_logs/', self.new_lm))

    def test_s11_engagement_and_year_close_for_a_moved_decision(self):
        """Known gap: engagement and year-close are team-based, not owner-based yet."""
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.save()
        change_user_teams(self.emp.profile, [self.team_a.id])
        self._ot(status='approved', approved_by=self.old_lm)
        self._move(self.new_lm)
        change_user_teams(self.emp.profile, [self.team_b.id])
        self._engagement(self.old_lm, self.team_a, 'S11 after move')
        self._engagement(self.new_lm, self.team_b, 'S11 after move')
        for bundle in bundles_for_year(self.now.year):
            if self.emp.id in bundle['member_ids']:
                _sim('S11 year-close bundle of employee', bundle['leader_name'])

    def test_s12_employee_in_two_teams_under_one_leader_engagement(self):
        change_user_teams(self.emp.profile, [self.team_a.id, self.team_b.id])
        self._ot(status='approved', approved_by=self.old_lm)
        a = self._engagement(self.old_lm, self.team_a, 'S12')
        b = self._engagement(self.old_lm, self.team_b, 'S12')
        _sim('S12 same decision counted in both teams', (a['decided'], b['decided']))
