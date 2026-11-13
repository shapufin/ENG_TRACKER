"""Year-close overtime and standby sheets follow the owner rule (Option A, 2026-11-13).

Each overtime or standby row lands in exactly one bundle: the one of the leader who owns
it. User-level files (leave, payslips) keep their existing one-bundle-per-user placement.
"""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team
from apps.users.services.team_membership import change_user_teams
from plugins.year_close.services.builder import bundles_for_year

YEAR = 2026


def _lm(username):
    from apps.permissions.models import Role, UserRole

    user = User.objects.create_user(username=username, password='x')
    user.profile.is_albanian_tl_role = True
    user.profile.save()
    role, _ = Role.objects.get_or_create(code='albanian_tl', defaults={'name': 'albanian_tl'})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})
    return user


class YearCloseOwnerRuleTests(TestCase):
    def setUp(self):
        self.old_lm = _lm('yc_old_lm')
        self.new_lm = _lm('yc_new_lm')
        self.team_old = Team.objects.create(name='YC Old', code='YCO')
        self.team_new = Team.objects.create(name='YC New', code='YCN')
        change_user_teams(self.old_lm.profile, [self.team_old.id])
        change_user_teams(self.new_lm.profile, [self.team_new.id])
        self.emp = User.objects.create_user(username='yc_emp', password='x')
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.save()
        change_user_teams(self.emp.profile, [self.team_old.id])
        self.client_row = Client.objects.create(name='YC', code='YC')
        self.decided = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=date(YEAR, 3, 2), hours=2,
            status='approved', approved_by=self.old_lm,
        )
        self.pending = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=date(YEAR, 3, 3), hours=3, status='pending',
        )
        self.standby = StandbyLog.objects.create(
            user=self.emp, date=date(YEAR, 3, 4), hours=8, status='approved', approved_by=self.old_lm,
        )
        self.emp.profile.albanian_tl = self.new_lm
        self.emp.profile.save()
        change_user_teams(self.emp.profile, [self.team_new.id])

    def _bundle_rows(self):
        found = {'overtime': {}, 'standby': {}}
        for bundle in bundles_for_year(YEAR):
            for kind, ids in bundle.get('ot_ids', {}).items():
                for row_id in ids:
                    found[kind].setdefault(row_id, []).append(bundle['leader_name'])
        return found

    def test_decided_overtime_sits_in_the_approvers_bundle(self):
        self.assertEqual(self._bundle_rows()['overtime'][self.decided.pk], ['yc_old_lm'])

    def test_pending_overtime_sits_in_the_current_leaders_bundle(self):
        self.assertEqual(self._bundle_rows()['overtime'][self.pending.pk], ['yc_new_lm'])

    def test_standby_follows_the_same_rule(self):
        self.assertEqual(self._bundle_rows()['standby'][self.standby.pk], ['yc_old_lm'])

    def test_every_row_is_in_exactly_one_bundle(self):
        rows = self._bundle_rows()
        for kind in ('overtime', 'standby'):
            for row_id, owners in rows[kind].items():
                self.assertEqual(len(owners), 1, (kind, row_id, owners))

    def test_a_leader_with_no_team_keeps_their_decision_out_of_the_new_leaders_bundle(self):
        change_user_teams(self.old_lm.profile, [])
        leaders = {bundle['leader_name'] for bundle in bundles_for_year(YEAR)
                   for row_id in bundle.get('ot_ids', {}).get('overtime', []) if row_id == self.decided.pk}
        self.assertEqual(leaders, {'yc_old_lm'})

    def test_rows_without_an_owner_team_are_named_in_the_readiness_warnings(self):
        from plugins.year_close.services.readiness import check_year_readiness

        change_user_teams(self.old_lm.profile, [])
        change_user_teams(self.emp.profile, [])
        warnings = check_year_readiness(YEAR)['warnings']
        self.assertTrue(
            any('Unassigned' in warning and '2' in warning for warning in warnings), warnings,
        )
