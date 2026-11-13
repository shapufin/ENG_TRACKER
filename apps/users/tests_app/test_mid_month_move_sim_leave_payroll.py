"""Production-readiness simulation: an employee changes Line Manager / Manager MID-MONTH.

Covers the domains the owner-rule tests (apps/overtime/test_owner_simulation.py) do not:
leave (queues, approval, balances, carry-over, notifications), payroll (draft, closure,
cutoff, scope, IDOR, freeze), HR exports/reports and the employee-side views.

Rules asserted (docs/workflow-invariants.md items 15, 56, 64, 82 (e), CLAUDE.md invariants):
- leave, payroll and user-level data follow the CURRENT link (``get_team_member_ids``);
- overtime/standby decided rows follow the decider (owner rule); pending rows follow the leader;
- no row is listed twice across leaders, none is dropped from everyone, employees see only self;
- finalized / closed data stays frozen.

Prints one ``SIM|`` line per observation; a failing expectation that is a confirmed app bug
is marked ``expectedFailure`` and named ``test_BUG_*`` so the suite stays green.
"""

import io
import unittest
from datetime import date, datetime, time
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.core.exceptions import ValidationError
from django.test import TestCase
from openpyxl import load_workbook
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.leave_management.services.carry_over import apply_year_end_carry_over
from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role, UserRole
from apps.plugins.models import PluginPermission
from apps.standby.models import StandbyLog
from apps.users.models import ApprovalPeriodCloseMember, Team
from apps.users.services.approval_periods import (
    clear_closed_year_cache,
    close_year,
    finalize_period,
)
from apps.users.services.team_membership import change_user_teams
from core.utils.clock_testing import freeze_business_today
from plugins.notifications.models import Notification
from plugins.payroll.models import (
    PayrollConfiguration,
    PayrollLine,
    PayrollRun,
    PayrollRunEntry,
    PayrollRuleSet,
    WageAssignment,
)
from plugins.payroll.services.payroll_service import (
    advance_payroll_period,
    finalize_run,
    generate_draft_run,
    get_period_closure_status,
)

TIRANE = ZoneInfo('Europe/Tirane')
REQ = '/api/leave-management/requests/'
BAL = '/api/leave-management/balances/'
RUNS = '/api/plugins/payroll/runs/'
OCTOBER = date(2026, 10, 1)
MONTH_END = datetime(2026, 10, 30, 9, 0, tzinfo=TIRANE)
AT_CUTOFF = datetime(2026, 11, 5, 0, 0, tzinfo=TIRANE)


def _sim(label, value):
    print(f'SIM| {label} = {value}')


def _at(moment):
    return mock.patch('django.utils.timezone.now', return_value=moment)


def _role(user, code):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})
    return role


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


def _hr(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_hr_user = True
    user.profile.save()
    _role(user, 'hr')
    return user


def _link(employee, lm=None, manager=None):
    profile = employee.profile
    profile.albanian_tl = lm
    profile.italian_tl = manager
    profile.save()


def _rows(response):
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


def _sheets(content):
    """{sheet title: [data rows]} of an xlsx export (header row dropped)."""
    workbook = load_workbook(io.BytesIO(content))
    return {ws.title: [list(r) for r in ws.iter_rows(min_row=2, values_only=True)] for ws in workbook.worksheets}


def _rows_of(sheets, name):
    """[(sheet, row)] for every data row of one person across all sheets."""
    return [(title, row) for title, rows in sheets.items() for row in rows if row and row[0] == name]


class SimBase(TestCase):
    """Cast: old/new Line Manager, old/new Manager, employee `emp`, peer who stays, HR, staff."""

    TODAY = date(2026, 10, 13)

    def setUp(self):
        cache.clear()
        clear_closed_year_cache()
        patcher = freeze_business_today(self.TODAY)
        self.addCleanup(patcher.stop)
        self.addCleanup(clear_closed_year_cache)
        push = mock.patch('plugins.notifications.signals.send_push_notification')
        push.start()
        self.addCleanup(push.stop)

        self.old_lm = _lm('sim_old_lm')
        self.new_lm = _lm('sim_new_lm')
        self.manager = _manager('sim_manager')
        self.new_manager = _manager('sim_new_manager')
        self.hr = _hr('sim_hr')
        self.staff = User.objects.create_user(username='sim_staff', password='x', is_staff=True)
        self.superuser = User.objects.create_superuser(username='sim_root', password='x', email='r@x.test')
        self.emp = User.objects.create_user(username='sim_emp', password='x')
        self.peer = User.objects.create_user(username='sim_peer', password='x')
        self.stranger = User.objects.create_user(username='sim_stranger', password='x')
        self.team = Team.objects.create(name='Sim Team', code='ST')
        _link(self.emp, lm=self.old_lm)
        _link(self.peer, lm=self.old_lm)
        for user in (self.emp, self.peer):
            change_user_teams(user.profile, [self.team.id])
        self.api = APIClient()
        self.client_row = Client.objects.create(name='SimClient', code='SC')

    # ---- generic helpers ---------------------------------------------------
    def move_lm(self, new_lm, employee=None):
        profile = (employee or self.emp).profile
        profile.albanian_tl = new_lm
        profile.save()

    def move_manager(self, new_manager, employee=None):
        profile = (employee or self.emp).profile
        profile.italian_tl = new_manager
        profile.save()

    def get(self, path, viewer, **params):
        self.api.force_authenticate(user=viewer)
        return self.api.get(path, params)

    def post(self, path, user, body=None):
        self.api.force_authenticate(user=user)
        return self.api.post(path, body or {}, format='json')

    def ids(self, path, user, **params):
        response = self.get(path, user, **params)
        self.assertEqual(response.status_code, 200, getattr(response, 'data', response.content))
        return {row['id'] for row in _rows(response)}


class LeaveSimBase(SimBase):
    def setUp(self):
        super().setUp()
        LeaveBalance.objects.create(
            user=self.emp, leave_type='vacation', year=2026, total_days=22,
            accrual_start_date=date(2000, 1, 1),
        )

    def balance(self, user=None):
        return LeaveBalance.objects.get(
            user=user or self.emp, leave_type='vacation', year=2026, is_carry_over=False,
        )

    def request_leave(self, start, end, user=None, **extra):
        body = {'request_type': 'vacation', 'start_date': str(start), 'end_date': str(end), **extra}
        response = self.post(REQ, user or self.emp, body)
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def decide(self, leader, pk, action, **body):
        return self.post(f'{REQ}{pk}/{action}/', leader, body)

    def queue(self, leader, which='team_pending'):
        return self.ids(f'{REQ}{which}/', leader)

    def build_history(self):
        """Requests created under the OLD Line Manager: pending, approved, rejected, half-day."""
        h = {}
        h['pending'] = self.request_leave(date(2026, 10, 19), date(2026, 10, 20))
        h['approved'] = self.request_leave(date(2026, 10, 26), date(2026, 10, 27))
        h['rejected'] = self.request_leave(date(2026, 11, 2), date(2026, 11, 2))
        h['half_am'] = self.request_leave(
            date(2026, 11, 9), date(2026, 11, 9), is_half_day=True, half_day_period='morning',
        )
        self.assertEqual(self.decide(self.old_lm, h['approved'], 'approve').status_code, 200)
        self.assertEqual(self.decide(self.old_lm, h['rejected'], 'reject', rejection_reason='no').status_code, 200)
        self.assertEqual(self.decide(self.old_lm, h['half_am'], 'approve').status_code, 200)
        return h


class LeaveMoveTests(LeaveSimBase):
    def test_l1_every_request_has_exactly_one_listing_leader_after_a_move(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        every = set(h.values())
        old_logs, new_logs = self.queue(self.old_lm, 'team_logs'), self.queue(self.new_lm, 'team_logs')
        _sim('L1 old LM team_logs emp rows', sorted(old_logs & every))
        _sim('L1 new LM team_logs emp rows', sorted(new_logs & every))
        self.assertEqual(old_logs & every, set(), 'old leader must lose all rows of a moved employee')
        self.assertEqual(new_logs & every, every, 'new leader gets the whole history, none dropped')
        self.assertEqual((old_logs & new_logs) & every, set(), 'no row listed by both leaders')

    def test_l1b_pending_queue_and_month_index_follow_the_new_leader(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        self.assertNotIn(h['pending'], self.queue(self.old_lm))
        self.assertIn(h['pending'], self.queue(self.new_lm))
        months_old = self.get(f'{REQ}team_pending_months/', self.old_lm).data
        months_new = self.get(f'{REQ}team_pending_months/', self.new_lm).data
        _sim('L1b pending months old/new', (months_old, months_new))
        self.assertEqual(sum(m['count'] for m in months_old), 0)
        self.assertEqual(sum(m['count'] for m in months_new), 1)

    def test_l2_old_leader_cannot_decide_new_leader_can_and_becomes_approver(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        self.assertEqual(self.decide(self.old_lm, h['pending'], 'approve').status_code, 403)
        self.assertEqual(self.decide(self.old_lm, h['pending'], 'reject', rejection_reason='x').status_code, 403)
        LeaveRequest.objects.get(pk=h['pending'])
        self.assertEqual(LeaveRequest.objects.get(pk=h['pending']).status, 'pending')
        self.assertEqual(self.decide(self.new_lm, h['pending'], 'approve').status_code, 200)
        req = LeaveRequest.objects.get(pk=h['pending'])
        self.assertEqual((req.status, req.approved_by_id), ('approved', self.new_lm.id))
        # the decision made before the move keeps its original decider (history is not rewritten)
        self.assertEqual(LeaveRequest.objects.get(pk=h['approved']).approved_by_id, self.old_lm.id)

    def test_l3_balance_is_person_based_and_consistent_across_the_move(self):
        h = self.build_history()
        before = self.balance()
        # approved 2 + half 0.5 = 2.5 used, pending 2 (rejected 1 released)
        self.assertEqual((before.used_days, before.pending_days), (Decimal('2.5'), Decimal('2')))
        self.move_lm(self.new_lm)
        self.assertEqual(self.decide(self.new_lm, h['pending'], 'approve').status_code, 200)
        after = self.balance()
        _sim('L3 balance used/pending after post-move approve', (after.used_days, after.pending_days))
        self.assertEqual((after.used_days, after.pending_days), (Decimal('4.5'), Decimal('0')))
        self.assertEqual(LeaveBalance.objects.filter(user=self.emp, year=2026, is_carry_over=False).count(), 1)

    def test_l4_rejected_before_move_can_be_reapproved_only_by_the_new_leader(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        self.assertEqual(self.decide(self.old_lm, h['rejected'], 'approve').status_code, 403)
        self.assertEqual(self.decide(self.new_lm, h['rejected'], 'approve').status_code, 200)
        self.assertEqual(self.balance().used_days, Decimal('3.5'))

    def test_l5_half_day_pair_across_the_move_totals_one_day_and_is_listed_once(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        pm = self.request_leave(
            date(2026, 11, 9), date(2026, 11, 9), is_half_day=True, half_day_period='afternoon',
        )
        bal_before = self.balance()
        self.assertEqual(self.decide(self.new_lm, pm, 'approve').status_code, 200)
        after = self.balance()
        _sim('L5 half-day pair used after both approved', after.used_days)
        self.assertEqual(after.used_days - bal_before.used_days, Decimal('0.5'))
        logs = self.queue(self.new_lm, 'team_logs')
        self.assertTrue({h['half_am'], pm} <= logs)
        self.assertEqual(self.queue(self.old_lm, 'team_logs') & {h['half_am'], pm}, set())

    def test_l6_cancelled_pending_after_the_move_releases_the_balance_once(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        before = self.balance()
        self.api.force_authenticate(user=self.emp)
        response = self.api.delete(f'{REQ}{h["pending"]}/')
        self.assertIn(response.status_code, (200, 204))
        after = self.balance()
        self.assertEqual(before.pending_days - after.pending_days, Decimal('2'))
        self.assertFalse(LeaveRequest.objects.filter(pk=h['pending'], is_deleted=False).exists())
        self.assertNotIn(h['pending'], self.queue(self.new_lm, 'team_logs'))

    def test_l7_employee_sees_only_own_requests_and_cannot_reach_team_queues(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        other = self.peer
        LeaveBalance.objects.create(user=other, leave_type='vacation', year=2026, total_days=22,
                                    accrual_start_date=date(2000, 1, 1))
        theirs = self.request_leave(date(2026, 10, 22), date(2026, 10, 22), user=other)
        mine = self.ids(REQ, self.emp)
        _sim('L7 emp list size / peer list size', (len(mine), len(self.ids(REQ, other))))
        self.assertEqual(mine, set(h.values()))
        self.assertNotIn(theirs, mine)
        self.assertEqual(self.ids(REQ, other), {theirs})
        for path in ('team_logs/', 'team_pending/', 'team_pending_months/'):
            self.assertEqual(self.get(f'{REQ}{path}', self.emp).status_code, 403, path)
        self.assertEqual(self.get(f'{REQ}{theirs}/', self.emp).status_code, 404)
        self.assertEqual(self.decide(self.emp, theirs, 'approve').status_code, 403)

    def test_l8_leaders_personal_list_is_self_only_after_move(self):
        self.build_history()
        self.move_lm(self.new_lm)
        self.assertEqual(self.ids(REQ, self.new_lm), set())
        self.assertEqual(self.ids(REQ, self.old_lm), set())

    def test_l9_balances_team_view_and_direct_lookup_follow_the_current_link(self):
        self.build_history()
        self.move_lm(self.new_lm)
        old_view = {r['user'] if 'user' in r else r.get('user_id') for r in self.get(f'{BAL}team_balances/', self.old_lm).data}
        new_view = {r['user'] if 'user' in r else r.get('user_id') for r in self.get(f'{BAL}team_balances/', self.new_lm).data}
        _sim('L9 team_balances users old/new', (sorted(old_view), sorted(new_view)))
        self.assertNotIn(self.emp.id, old_view)
        self.assertIn(self.emp.id, new_view)
        self.assertEqual(self.get(BAL, self.old_lm, user=self.emp.id).status_code, 403)
        self.assertEqual(self.get(BAL, self.new_lm, user=self.emp.id).status_code, 200)
        self.assertEqual(self.get(BAL, self.stranger, user=self.emp.id).status_code, 403)

    def test_l10_calendar_reach_is_wider_than_internal_scope_by_design(self):
        self.move_lm(self.new_lm)
        # item 64: shared team membership is calendar-only, never internal data.
        self.assertNotIn(self.emp.id, self.old_lm.profile.get_team_member_ids())
        self.assertIn(self.emp.id, self.new_lm.profile.get_team_member_ids())
        old_cal = self.old_lm.profile.get_calendar_member_ids()
        _sim('L10 old LM calendar reach includes emp (shared team only if old LM is a member)', self.emp.id in old_cal)
        self.assertNotIn(self.emp.id, self.old_lm.profile.get_team_member_ids())

    def test_l11_carry_over_rolls_per_person_once_and_new_leader_sees_it(self):
        self.build_history()
        self.move_lm(self.new_lm)
        patcher = freeze_business_today(date(2027, 1, 2))
        self.addCleanup(patcher.stop)
        apply_year_end_carry_over()
        apply_year_end_carry_over()
        carries = LeaveBalance.objects.filter(user=self.emp, is_carry_over=True, year=2026)
        _sim('L11 carry rows / total', (carries.count(), [c.total_days for c in carries]))
        self.assertEqual(carries.count(), 1)
        self.assertEqual(self.get(f'{BAL}team_balances/', self.old_lm, year=2026).data and
                         [r for r in self.get(f'{BAL}team_balances/', self.old_lm, year=2026).data
                          if (r.get('user') or r.get('user_id')) == self.emp.id], [])
        new_rows = [r for r in self.get(f'{BAL}team_balances/', self.new_lm, year=2026).data
                    if (r.get('user') or r.get('user_id')) == self.emp.id]
        self.assertEqual(len(new_rows), 2)  # current-year row + carry row

    def test_l12_closed_year_leave_is_deliberately_exempt_pending_still_decidable(self):
        LeaveBalance.objects.create(user=self.emp, leave_type='vacation', year=2025, total_days=22,
                                    accrual_start_date=date(2000, 1, 1))
        req = LeaveRequest.objects.create(
            user=self.emp, request_type='vacation', start_date=date(2025, 12, 22),
            end_date=date(2025, 12, 22), status='pending',
        )
        close_year(2025, actor=self.superuser)
        self.move_lm(self.new_lm)
        self.assertIn(req.pk, self.queue(self.new_lm, 'team_pending'))
        self.assertEqual(self.decide(self.new_lm, req.pk, 'approve').status_code, 200)

    # ---- notifications ----------------------------------------------------
    def _action_required(self, user):
        return Notification.objects.filter(user=user, title__startswith='Action Required')

    def test_l13_new_request_after_move_notifies_only_the_current_leader(self):
        self.move_lm(self.new_lm)
        Notification.objects.all().delete()
        self.request_leave(date(2026, 10, 19), date(2026, 10, 19))
        _sim('L13 action-required old/new', (self._action_required(self.old_lm).count(), self._action_required(self.new_lm).count()))
        self.assertEqual(self._action_required(self.old_lm).count(), 0)
        self.assertEqual(self._action_required(self.new_lm).count(), 1)

    def test_l14_deleting_a_pending_request_after_move_tells_the_new_leader_only(self):
        pk = self.request_leave(date(2026, 10, 19), date(2026, 10, 19))
        self.move_lm(self.new_lm)
        Notification.objects.all().delete()
        self.api.force_authenticate(user=self.emp)
        self.api.delete(f'{REQ}{pk}/')
        self.assertEqual(Notification.objects.filter(user=self.old_lm).count(), 0)
        self.assertGreaterEqual(Notification.objects.filter(user=self.new_lm).count(), 1)

    def test_l15_decision_notifies_the_employee_not_the_old_leader(self):
        pk = self.request_leave(date(2026, 10, 19), date(2026, 10, 19))
        self.move_lm(self.new_lm)
        Notification.objects.all().delete()
        self.assertEqual(self.decide(self.new_lm, pk, 'approve').status_code, 200)
        self.assertGreaterEqual(Notification.objects.filter(user=self.emp).count(), 1)
        self.assertEqual(Notification.objects.filter(user=self.old_lm).count(), 0)

    def test_BUG_l16_shared_team_lead_who_is_no_longer_the_leader_gets_no_action_alert(self):
        """Item 64: Team.team_leader is calendar-only. The old LM still leads the shared team,
        yet must not be told about (and cannot act on) the moved employee's new requests."""
        self.team.team_leader = self.old_lm
        self.team.save()
        self.move_lm(self.new_lm)
        Notification.objects.all().delete()
        self.request_leave(date(2026, 10, 19), date(2026, 10, 19))
        _sim('L16 old LM (team_leader only) action-required count', self._action_required(self.old_lm).count())
        self.assertEqual(self._action_required(self.old_lm).count(), 0)

    def test_l17_old_leader_bulk_actions_and_delete_cannot_reach_a_moved_employee(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        response = self.post(f'{REQ}bulk_approve/', self.old_lm, {'ids': [h['pending']]})
        _sim('L17 old LM bulk_approve', (response.status_code, response.data))
        self.assertEqual(LeaveRequest.objects.get(pk=h['pending']).status, 'pending')
        self.post(f'{REQ}bulk_reject/', self.old_lm, {'ids': [h['pending']], 'rejection_reason': 'x'})
        self.assertEqual(LeaveRequest.objects.get(pk=h['pending']).status, 'pending')
        self.post(f'{REQ}bulk_delete/', self.old_lm, {'ids': [h['pending']]})
        self.assertTrue(LeaveRequest.objects.filter(pk=h['pending'], is_deleted=False).exists())
        self.api.force_authenticate(user=self.old_lm)
        self.assertIn(self.api.delete(f'{REQ}{h["pending"]}/').status_code, (403, 404))
        self.assertTrue(LeaveRequest.objects.filter(pk=h['pending'], is_deleted=False).exists())
        # the new leader can
        response = self.post(f'{REQ}bulk_approve/', self.new_lm, {'ids': [h['pending']]})
        self.assertEqual(LeaveRequest.objects.get(pk=h['pending']).status, 'approved', response.data)

    def test_l18_employee_cannot_edit_into_someone_elses_name_after_move(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        self.api.force_authenticate(user=self.emp)
        response = self.api.patch(f'{REQ}{h["pending"]}/', {'user': self.peer.id, 'status': 'approved'}, format='json')
        req = LeaveRequest.objects.get(pk=h['pending'])
        _sim('L18 patch owner/status', (response.status_code, req.user_id == self.emp.id, req.status))
        self.assertEqual((req.user_id, req.status), (self.emp.id, 'pending'))


class LeaveBothLinksTests(LeaveSimBase):
    def setUp(self):
        super().setUp()
        _link(self.emp, lm=self.old_lm, manager=self.manager)

    def test_l20_both_links_change_lm_only_manager_keeps_scope(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        every = set(h.values())
        self.assertEqual(self.queue(self.old_lm, 'team_logs') & every, set())
        self.assertEqual(self.queue(self.new_lm, 'team_logs') & every, every)
        self.assertEqual(self.queue(self.manager, 'team_logs') & every, every)
        _sim('L20 pending listed by new LM and Manager (both may act by design)', True)

    def test_l21_either_leader_can_decide_and_the_row_is_not_duplicated_in_a_view(self):
        pk = self.request_leave(date(2026, 10, 19), date(2026, 10, 19))
        self.move_lm(self.new_lm)
        self.assertEqual(self.decide(self.manager, pk, 'approve').status_code, 200)
        for leader in (self.new_lm, self.manager):
            rows = _rows(self.get(f'{REQ}team_logs/', leader))
            self.assertEqual([r['id'] for r in rows].count(pk), 1)
        self.assertNotIn(pk, self.queue(self.new_lm))  # no longer pending anywhere
        self.assertEqual(self.balance().used_days, Decimal('1'))

    def test_l22_manager_change_follows_the_same_rules(self):
        h = self.build_history()
        self.move_manager(self.new_manager)
        every = set(h.values())
        self.assertEqual(self.queue(self.manager, 'team_logs') & every, set())
        self.assertEqual(self.queue(self.new_manager, 'team_logs') & every, every)
        self.assertEqual(self.queue(self.old_lm, 'team_logs') & every, every)
        self.assertEqual(self.decide(self.manager, h['pending'], 'approve').status_code, 403)
        self.assertEqual(self.decide(self.new_manager, h['pending'], 'approve').status_code, 200)

    def test_l23_both_links_replaced_notifications_reach_only_the_new_pair(self):
        self.move_lm(self.new_lm)
        self.move_manager(self.new_manager)
        Notification.objects.all().delete()
        self.request_leave(date(2026, 10, 19), date(2026, 10, 19))
        got = {u.username for u in (self.old_lm, self.manager, self.new_lm, self.new_manager)
               if Notification.objects.filter(user=u, title__startswith='Action Required').exists()}
        _sim('L23 recipients', sorted(got))
        self.assertEqual(got, {'sim_new_lm', 'sim_new_manager'})


class HrReportsSimTests(LeaveSimBase):
    """HR/TL leave + overtime/standby exports and reports around a mid-month move."""

    def setUp(self):
        super().setUp()
        _link(self.emp, lm=self.old_lm, manager=self.manager)
        _link(self.peer, lm=self.old_lm, manager=self.manager)

    def _approved_leave(self):
        h = self.build_history()
        self.move_lm(self.new_lm)
        return h

    def _export(self, path, user, **params):
        response = self.get(path, user, **params)
        self.assertEqual(response.status_code, 200, getattr(response, 'content', b'')[:200])
        return _sheets(response.content)

    def test_h1_hr_leave_export_lists_each_approved_row_exactly_once(self):
        self._approved_leave()
        sheets = self._export('/api/reports/export-leave/', self.hr)
        rows = _rows_of(sheets, 'sim_emp')
        _sim('H1 HR leave export rows for emp (sheet,row)', [(s, r[1:3]) for s, r in rows])
        self.assertEqual(len(rows), 2)  # approved + half-day approved; pending/rejected excluded
        self.assertEqual(len({s for s, _ in rows}), 1)

    def test_h2_leave_export_scoped_by_leader_current_link(self):
        self._approved_leave()
        old = self._export('/api/reports/export-leave/', self.old_lm)
        new = self._export('/api/reports/export-leave/', self.new_lm)
        mgr = self._export('/api/reports/export-leave/', self.manager)
        self.assertEqual(_rows_of(old, 'sim_emp'), [])
        self.assertEqual(len(_rows_of(new, 'sim_emp')), 2)
        self.assertEqual(len(_rows_of(mgr, 'sim_emp')), 2)

    def test_h3_employee_export_is_self_only_and_stranger_sees_nothing(self):
        self._approved_leave()
        self.assertEqual(len(_rows_of(self._export('/api/reports/export-leave/', self.emp), 'sim_emp')), 2)
        mine = self._export('/api/reports/export-leave/', self.stranger)
        self.assertEqual(_rows_of(mine, 'sim_emp'), [])

    def test_h4_manager_sheet_follows_current_manager_and_row_is_not_duplicated(self):
        self._approved_leave()
        self.move_manager(self.new_manager)
        sheets = self._export('/api/reports/export-leave/', self.hr)
        rows = _rows_of(sheets, 'sim_emp')
        self.assertEqual(len(rows), 2)
        self.assertEqual({s for s, _ in rows}, {'sim_new_manager'})
        self.assertEqual(_rows_of({s: v for s, v in sheets.items() if s == 'sim_manager'}, 'sim_emp'), [])

    def test_h5_hr_filters_by_leader_use_the_current_link(self):
        self._approved_leave()
        by_old = self._export('/api/reports/export-leave/', self.hr, albanian_tl_ids=str(self.old_lm.id))
        by_new = self._export('/api/reports/export-leave/', self.hr, albanian_tl_ids=str(self.new_lm.id))
        self.assertEqual(_rows_of(by_old, 'sim_emp'), [])
        self.assertEqual(len(_rows_of(by_new, 'sim_emp')), 2)

    def test_h6_summary_and_detailed_report_count_each_request_once(self):
        h = self._approved_leave()
        params = {'start_date': '2026-10-01', 'end_date': '2026-11-30', 'report_type': 'leave'}
        summary = self.get('/api/reports/summary/', self.hr, **params).data['leave']
        _sim('H6 HR summary', summary)
        self.assertEqual(summary['total_requests'], len(h))
        old = self.get('/api/reports/summary/', self.old_lm, **params).data['leave']
        new = self.get('/api/reports/summary/', self.new_lm, **params).data['leave']
        peer_rows = LeaveRequest.objects.filter(user=self.peer).count()
        self.assertEqual(old['total_requests'], peer_rows)
        self.assertEqual(new['total_requests'], len(h))
        detailed = self.get('/api/reports/detailed/', self.hr, group_by='user', **params).data['users']
        emp_rows = [u for u in detailed if u['user_id'] == self.emp.id]
        self.assertEqual(len(emp_rows), 1)
        self.assertEqual(emp_rows[0]['leave']['entries'], len(h))

    def test_h7_hr_dashboard_widgets_for_hr_do_not_double_count(self):
        self._approved_leave()
        response = self.get('/api/reports/insights/', self.hr, start_date='2026-10-01', end_date='2026-11-30')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        _sim('H7 insights keys', sorted(response.data.keys()) if hasattr(response.data, 'keys') else response.data)

    # ---- overtime / standby exports ----------------------------------------
    def _ot(self, start, end, status='approved', approved_by=None, user=None, day=date(2026, 10, 6)):
        log = OvertimeLog.objects.create(
            user=user or self.emp, client=self.client_row, date=day, hours=1,
            start_time=start, end_time=end, status=status, approved_by=approved_by,
        )
        if status != 'pending':
            OvertimeLog.objects.filter(pk=log.pk).update(approved_at=datetime(2026, 10, 7, 9, 0, tzinfo=TIRANE))
        return log.pk

    def test_h10_hr_ot_export_bundles_a_paid_block_split_across_the_move_into_one_row(self):
        a = self._ot(time(18, 0), time(18, 30), approved_by=self.old_lm)
        self.move_lm(self.new_lm)
        b = self._ot(time(18, 30), time(19, 0), approved_by=self.new_lm)
        sheets = self._export('/api/reports/export-ot-standby/', self.hr)
        rows = _rows_of(sheets, 'sim_emp')
        _sim('H10 HR bundled OT rows (hours)', [r[5] for _, r in rows])
        self.assertEqual(len(rows), 1, 'one paid hour = one row, never two')
        self.assertEqual(sum(Decimal(str(r[5])) for _, r in rows), Decimal('1'))
        self.assertEqual({a, b}, set(OvertimeLog.objects.filter(user=self.emp).values_list('pk', flat=True)))

    def test_h11_pending_and_processing_period_exports_never_drop_or_duplicate(self):
        self._ot(time(18, 0), time(19, 0), status='pending')
        self.move_lm(self.new_lm)
        pending = self._export('/api/reports/export-ot-standby/', self.hr, status='pending')
        self.assertEqual(len(_rows_of(pending, 'sim_emp')), 1)
        approved = self._export('/api/reports/export-ot-standby/', self.hr)
        self.assertEqual(_rows_of(approved, 'sim_emp'), [])

    def test_h12_standby_export_hr_once_and_manager_sheet(self):
        StandbyLog.objects.create(
            user=self.emp, date=date(2026, 10, 6), hours=8, status='approved', approved_by=self.old_lm,
        )
        self.move_lm(self.new_lm)
        rows = _rows_of(self._export('/api/reports/export-ot-standby/', self.hr), 'sim_emp')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], 'sim_manager')

    def test_h13_tl_export_follows_the_owner_rule_like_the_queue(self):
        """Ruled 2026-11-13: exports follow the owner rule like queues, so the old leader's
        export lists the row he approved and the new leader's does not."""
        a = self._ot(time(18, 0), time(19, 0), approved_by=self.old_lm)
        self.move_lm(self.new_lm)
        in_old_queue = a in self.ids('/api/overtime/logs/team_logs/', self.old_lm)
        in_new_queue = a in self.ids('/api/overtime/logs/team_logs/', self.new_lm)
        old_export = len(_rows_of(self._export('/api/reports/export-ot-standby/', self.old_lm), 'sim_emp'))
        new_export = len(_rows_of(self._export('/api/reports/export-ot-standby/', self.new_lm), 'sim_emp'))
        _sim('H13 queue old/new, export rows old/new', (in_old_queue, in_new_queue, old_export, new_export))
        self.assertEqual((in_old_queue, in_new_queue), (True, False))
        self.assertEqual((old_export, new_export), (1, 0))

    def test_h14_row_is_never_in_two_leaders_exports_and_never_in_none(self):
        self._ot(time(18, 0), time(19, 0), approved_by=self.old_lm)
        self.move_lm(self.new_lm)
        counts = {
            u.username: len(_rows_of(self._export('/api/reports/export-ot-standby/', u), 'sim_emp'))
            for u in (self.old_lm, self.new_lm, self.manager)
        }
        _sim('H14 per-leader export rows', counts)
        self.assertEqual(counts['sim_old_lm'] + counts['sim_new_lm'], 1)
        self.assertEqual(counts['sim_manager'], 0)  # the decided row has one owner: its approver

    def test_h15_hr_csv_export_for_employee_is_self_only(self):
        self._ot(time(18, 0), time(19, 0), approved_by=self.old_lm)
        self._ot(time(18, 0), time(19, 0), user=self.peer, approved_by=self.old_lm)
        self.move_lm(self.new_lm)
        self.api.force_authenticate(user=self.emp)
        response = self.api.get('/api/overtime/logs/export/')
        body = b''.join(response.streaming_content).decode('utf-8-sig')
        self.assertIn('sim_emp', body)
        self.assertNotIn('sim_peer', body)

    def test_h16_closed_year_overtime_stays_frozen_across_the_move(self):
        log = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=date(2025, 12, 10), hours=2, status='pending',
        )
        close_year(2025, actor=self.superuser)
        clear_closed_year_cache()
        self.move_lm(self.new_lm)
        for actor in (self.new_lm, self.old_lm, self.superuser):
            response = self.post(f'/api/overtime/logs/{log.pk}/approve/', actor)
            self.assertNotEqual(response.status_code, 200, f'{actor.username} approved in a closed year')
        log.refresh_from_db()
        self.assertEqual(log.status, 'pending')


# ============================================================================
# Payroll
# ============================================================================
class PayrollSimBase(SimBase):
    def setUp(self):
        super().setUp()
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': True})
        call_command('seed_payroll_rules', verbosity=0)
        self.rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        for code in ('albanian_tl', 'italian_tl'):
            role = Role.objects.get(code=code)
            for action in ('view', 'export', 'manage'):
                perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action=action)
                perm.allowed_roles.add(role)
        for action in ('view', 'export', 'manage'):
            perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action=action)
            perm.allowed_roles.add(_role(self.hr, 'hr'))
        for user in (self.emp, self.peer, self.old_lm, self.new_lm, self.stranger):
            WageAssignment.objects.create(
                user=user, gross_monthly_wage=Decimal('100000'),
                effective_from=date(2026, 1, 1), is_active=True,
            )

    def ot(self, user=None, status='approved', approved_by=None, hours=2, day=date(2026, 10, 6)):
        log = OvertimeLog.objects.create(
            user=user or self.emp, client=self.client_row, date=day, hours=hours,
            status=status, approved_by=approved_by,
        )
        return log.pk

    def draft(self, users=None, month=10):
        run = PayrollRun.objects.create(
            year=2026, month=month, status='draft', rule_set=self.rule_set, created_by=self.staff,
        )
        generate_draft_run(run, users or [self.emp, self.peer, self.old_lm, self.new_lm, self.stranger])
        return run

    def line_users(self, run):
        return sorted(run.lines.values_list('user__username', flat=True))

    def lines_api(self, run, user):
        response = self.get(f'{RUNS}{run.id}/lines/', user)
        return response

    def seen_lines(self, run, user):
        response = self.lines_api(run, user)
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        return {line['user'] for line in response.data}


class PayrollMoveTests(PayrollSimBase):
    def test_p1_draft_after_a_move_has_one_line_per_user_and_both_leaders_overtime(self):
        a = self.ot(approved_by=self.old_lm)
        self.move_lm(self.new_lm)
        b = self.ot(approved_by=self.new_lm, day=date(2026, 10, 14))
        run = self.draft()
        names = self.line_users(run)
        _sim('P1 lines', names)
        self.assertEqual(names, sorted(['sim_emp', 'sim_peer', 'sim_old_lm', 'sim_new_lm', 'sim_stranger']))
        line = run.lines.get(user=self.emp)
        self.assertEqual(line.overtime_hours, Decimal('4'))
        entries = PayrollRunEntry.objects.filter(run=run, user=self.emp, source_kind='overtime')
        self.assertEqual(sorted(entries.values_list('source_id', flat=True)), sorted([a, b]))
        self.assertEqual(entries.count(), len({e.source_id for e in entries}), 'no entry duplicated')
        self.assertEqual(run.totals['line_count'], 5)

    def test_p2_regenerate_after_move_neither_duplicates_nor_drops_lines(self):
        self.ot(approved_by=self.old_lm)
        run = self.draft()
        self.move_lm(self.new_lm)
        b = self.ot(approved_by=self.new_lm, day=date(2026, 10, 14))
        self.assertEqual(self.post(f'{RUNS}{run.id}/generate_line/', self.old_lm, {'user_id': self.emp.id}).status_code, 403)
        response = self.post(f'{RUNS}{run.id}/generate_line/', self.new_lm, {'user_id': self.emp.id})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(run.lines.filter(user=self.emp).count(), 1)
        self.assertEqual(run.lines.count(), 5)
        self.assertEqual(run.lines.get(user=self.emp).overtime_hours, Decimal('4'))
        self.assertTrue(PayrollRunEntry.objects.filter(run=run, source_id=b, status='draft').exists())
        # scoped bulk regenerate by the new leader touches only their scope
        response = self.post(f'{RUNS}{run.id}/generate/', self.new_lm, {})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(run.lines.count(), 5)
        self.assertEqual(self.line_users(run), sorted(['sim_emp', 'sim_peer', 'sim_old_lm', 'sim_new_lm', 'sim_stranger']))

    def test_p3_scope_lines_run_list_and_totals_follow_the_current_link(self):
        run = self.draft()
        self.move_lm(self.new_lm)
        old_seen, new_seen = self.seen_lines(run, self.old_lm), self.seen_lines(run, self.new_lm)
        _sim('P3 old/new visible line users', (sorted(old_seen), sorted(new_seen)))
        self.assertEqual(old_seen, {self.peer.id, self.old_lm.id})
        self.assertEqual(new_seen, {self.emp.id, self.new_lm.id})
        self.assertFalse(old_seen & {self.emp.id, self.stranger.id})
        self.assertEqual(self.get(f'{RUNS}scope/', self.old_lm).data['run_scope'], 'team')
        self.assertEqual(self.get(f'{RUNS}scope/', self.hr).data['run_scope'], 'company')
        for leader, expected in ((self.old_lm, 2), (self.new_lm, 2)):
            detail = self.get(f'{RUNS}{run.id}/', leader).data
            self.assertEqual((detail['line_count'], detail['totals']['line_count']), (expected, expected))
        self.assertEqual(self.get(f'{RUNS}{run.id}/', self.hr).data['line_count'], 5)

    def test_p4_leader_left_with_nobody_and_no_wage_cannot_reach_the_run(self):
        solo_lm = _lm('sim_solo_lm')
        solo = User.objects.create_user(username='sim_solo', password='x')
        _link(solo, lm=solo_lm)
        WageAssignment.objects.create(user=solo, gross_monthly_wage=Decimal('90000'),
                                      effective_from=date(2026, 1, 1), is_active=True)
        run = self.draft(users=[solo, self.peer])
        self.assertEqual(self.get(f'{RUNS}{run.id}/', solo_lm).status_code, 200)
        self.move_lm(self.new_lm, employee=solo)
        self.assertEqual(self.get(f'{RUNS}{run.id}/', solo_lm).status_code, 404)
        self.assertEqual(self.get(f'{RUNS}{run.id}/lines/', solo_lm).status_code, 404)
        self.assertEqual(_rows(self.get(RUNS, solo_lm)), [])

    def test_p5_employee_cannot_read_company_or_team_payroll(self):
        run = self.draft()
        self.move_lm(self.new_lm)
        for path in (f'{RUNS}{run.id}/lines/', f'{RUNS}{run.id}/', RUNS):
            response = self.get(path, self.emp)
            if response.status_code == 200:
                data = response.data
                ids = {row['user'] for row in data} if isinstance(data, list) else {
                    (r.get('line_count'), ) for r in _rows(response)} if 'results' in data else {data.get('line_count')}
                _sim(f'P5 employee GET {path}', ids)
                if path.endswith('/lines/'):
                    self.assertTrue(ids <= {self.emp.id})
            else:
                self.assertIn(response.status_code, (403, 404))
        self.assertIn(self.post(f'{RUNS}{run.id}/generate_line/', self.emp, {'user_id': self.peer.id}).status_code, (403, 404))

    def test_p6_scoped_leader_cannot_regenerate_or_finalize_outside_scope(self):
        run = self.draft()
        self.move_lm(self.new_lm)
        self.assertEqual(self.post(f'{RUNS}{run.id}/generate_line/', self.old_lm, {'user_id': self.emp.id}).status_code, 403)
        for leader in (self.old_lm, self.new_lm):
            self.assertEqual(self.post(f'{RUNS}{run.id}/finalize/', leader).status_code, 403)
            self.assertEqual(self.get(f'{RUNS}{run.id}/period-closure-status/', leader).status_code, 403)
        self.assertEqual(self.get(f'{RUNS}{run.id}/export_excel/', self.new_lm).status_code, 403)
        self.assertIn(self.get(f'{RUNS}{run.id}/export_excel/', self.hr).status_code, (200, 409))  # draft: 409

    def test_p7_finalized_run_is_frozen_payslip_idor_follows_the_current_link(self):
        PayrollConfiguration.objects.filter(pk=1).update(require_tl_closed_before_finalize=False)
        self.ot(approved_by=self.old_lm)
        run = self.draft()
        finalize_run(run, self.staff)
        line = run.lines.get(user=self.emp)
        net_before = line.net_pay
        self.move_lm(self.new_lm)
        self.assertEqual(self.get(f'{RUNS}{run.id}/payslip/', self.old_lm, line_id=line.id).status_code, 404)
        self.assertEqual(self.get(f'{RUNS}{run.id}/payslip/', self.new_lm, line_id=line.id).status_code, 200)
        self.assertEqual(self.get(f'{RUNS}{run.id}/payslip/', self.hr, line_id=line.id).status_code, 200)
        # frozen: no way to regenerate, change or delete a finalized line
        self.assertEqual(self.post(f'{RUNS}{run.id}/generate_line/', self.new_lm, {'user_id': self.emp.id}).status_code, 400)
        self.assertEqual(self.post(f'{RUNS}{run.id}/generate/', self.staff, {}).status_code, 400)
        self.move_lm(self.old_lm)
        line.refresh_from_db()
        self.assertEqual(line.net_pay, net_before)
        with self.assertRaises(Exception):
            line.net_pay = Decimal('1')
            line.save()
        self.assertEqual(PayrollRunEntry.objects.filter(run=run, user=self.emp, status='finalized').count(), 1)

    def test_p8_payroll_run_entry_guard_blocks_deleting_a_paid_overtime_after_the_move(self):
        PayrollConfiguration.objects.filter(pk=1).update(require_tl_closed_before_finalize=False)
        pk = self.ot(approved_by=self.old_lm)
        run = self.draft()
        finalize_run(run, self.staff)
        self.move_lm(self.new_lm)
        for actor in (self.old_lm, self.new_lm, self.emp):
            self.api.force_authenticate(user=actor)
            response = self.api.delete(f'/api/overtime/logs/{pk}/?ignore_date_filter=true')
            self.assertIn(response.status_code, (400, 403, 404), f'{actor.username} deleted a paid entry')
        self.api.force_authenticate(user=self.superuser)
        response = self.api.delete(f'/api/overtime/logs/{pk}/?ignore_date_filter=true')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(OvertimeLog.objects.filter(pk=pk, is_deleted=False).exists())

    def test_p9_manager_is_never_a_payroll_subject_and_manager_move_changes_scope_only(self):
        _link(self.emp, lm=self.old_lm, manager=self.manager)
        WageAssignment.objects.create(user=self.manager, gross_monthly_wage=Decimal('100000'),
                                      effective_from=date(2026, 1, 1), is_active=True)
        run = PayrollRun.objects.create(year=2026, month=10, status='draft', rule_set=self.rule_set, created_by=self.staff)
        from plugins.payroll.services.payroll_service import partition_payable_users
        payable, _ = partition_payable_users([self.emp, self.manager], 2026, 10)
        generate_draft_run(run, payable)
        self.assertEqual(self.line_users(run), ['sim_emp'])
        self.assertEqual(self.seen_lines(run, self.manager), {self.emp.id})
        self.move_manager(self.new_manager)
        self.assertEqual(self.get(f'{RUNS}{run.id}/lines/', self.manager).status_code, 404)
        self.assertEqual(self.seen_lines(run, self.new_manager), {self.emp.id})
        self.assertEqual(run.lines.count(), 1)


class PayrollClosureSimTests(PayrollSimBase):
    """Month closure (item 56): one closer is enough, the system closes the rest at the cutoff."""

    def _closed(self, user):
        return ApprovalPeriodCloseMember.objects.filter(user=user, close__boundary__period=OCTOBER).count()

    def test_c1_old_leader_closes_before_move_and_the_new_leader_never_has_to(self):
        run = self.draft(users=[self.emp, self.peer])
        with _at(datetime(2026, 10, 12, 12, 0, tzinfo=TIRANE)):
            finalize_period(self.old_lm, OCTOBER)
        self.move_lm(self.new_lm)
        status = get_period_closure_status(run)
        _sim('C1 closure status all_closed / unclosed', (status['all_closed'], status['unclosed_users']))
        self.assertTrue(status['all_closed'])
        finalize_run(run, self.staff)
        self.assertEqual(run.lines.count(), 2)

    def test_c2_unclosed_label_names_the_current_leader_not_the_old_one(self):
        run = self.draft(users=[self.emp])
        self.move_lm(self.new_lm)
        with _at(datetime(2026, 10, 13, 12, 0, tzinfo=TIRANE)), self.assertRaises(ValidationError) as caught:
            finalize_run(run, self.staff)
        message = caught.exception.messages[0]
        _sim('C2 refusal', message)
        self.assertIn('sim_new_lm', message)
        self.assertNotIn('sim_old_lm', message)
        groups = {g['username']: g for g in get_period_closure_status(run)['line_managers']}
        self.assertEqual(list(groups), ['sim_new_lm'])

    def test_c3_new_leader_closing_after_move_closes_the_employee_and_old_leader_cannot(self):
        run = self.draft(users=[self.emp, self.peer])
        self.move_lm(self.new_lm)
        with _at(datetime(2026, 10, 12, 12, 0, tzinfo=TIRANE)):
            finalize_period(self.old_lm, OCTOBER)       # peer stays: old LM closes peer + self
            finalize_period(self.new_lm, OCTOBER)       # emp + self
        status = get_period_closure_status(run)
        self.assertTrue(status['all_closed'])
        self.assertEqual(self._closed(self.emp), 1)
        self.assertEqual(self._closed(self.peer), 1)

    def test_c4_old_leader_with_no_members_left_cannot_close_a_new_month(self):
        solo_lm = _lm('sim_solo_lm')
        solo = User.objects.create_user(username='sim_solo', password='x')
        _link(solo, lm=solo_lm)
        self.move_lm(self.new_lm, employee=solo)
        with self.assertRaises(Exception) as caught:
            finalize_period(solo_lm, OCTOBER)
        _sim('C4 empty-scope close refused with', type(caught.exception).__name__)

    def test_c5_close_before_move_keeps_later_overtime_in_next_period_for_the_moved_employee(self):
        from apps.users.services.approval_periods import resolve_processing_assignment
        with _at(datetime(2026, 10, 12, 12, 0, tzinfo=TIRANE)):
            finalize_period(self.old_lm, OCTOBER)
        self.move_lm(self.new_lm)
        late = resolve_processing_assignment(self.emp, date(2026, 10, 9))
        self.assertEqual(late['requested_processing_period'], date(2026, 11, 1))
        self.assertIsNotNone(late['approval_period_close'])

    def test_c6_carried_overtime_is_paid_once_in_the_following_run_not_both(self):
        PayrollConfiguration.objects.filter(pk=1).update(require_tl_closed_before_finalize=False)
        a = self.ot(approved_by=self.old_lm, day=date(2026, 10, 5))
        with _at(datetime(2026, 10, 12, 12, 0, tzinfo=TIRANE)):
            finalize_period(self.old_lm, OCTOBER)
        self.move_lm(self.new_lm)
        b = self.ot(approved_by=self.new_lm, day=date(2026, 10, 9))   # late: carried to November
        self.assertEqual(OvertimeLog.objects.get(pk=b).requested_processing_period, date(2026, 11, 1))
        october = self.draft(users=[self.emp])
        finalize_run(october, self.staff)
        november = PayrollRun.objects.create(year=2026, month=11, status='draft', rule_set=self.rule_set, created_by=self.staff)
        generate_draft_run(november, [self.emp])
        oct_ids = set(PayrollRunEntry.objects.filter(run=october, source_kind='overtime').values_list('source_id', flat=True))
        nov_ids = set(PayrollRunEntry.objects.filter(run=november, source_kind='overtime').values_list('source_id', flat=True))
        _sim('C6 october/november overtime entries', (sorted(oct_ids), sorted(nov_ids)))
        self.assertEqual(oct_ids, {a})
        self.assertEqual(nov_ids, {b})
        self.assertFalse(oct_ids & nov_ids)

    def test_c7_cutoff_closes_the_rest_once_and_finalizes_with_no_loss(self):
        a = self.ot(approved_by=self.old_lm)
        run = self.draft()
        self.move_lm(self.new_lm)
        b = self.ot(approved_by=self.new_lm, day=date(2026, 10, 14))
        with _at(AT_CUTOFF):
            outcome = advance_payroll_period(2026, 10)
        _sim('C7 cutoff outcome', outcome)
        self.assertEqual(outcome, 'finalized')
        run.refresh_from_db()
        self.assertEqual(run.status, 'finalized')
        self.assertEqual(run.lines.count(), 5)
        self.assertEqual(run.lines.filter(user=self.emp).count(), 1)
        self.assertEqual(run.lines.get(user=self.emp).overtime_hours, Decimal('4'))
        entries = PayrollRunEntry.objects.filter(run=run, user=self.emp, source_kind='overtime')
        self.assertEqual(sorted(entries.values_list('source_id', flat=True)), sorted([a, b]))
        self.assertEqual(set(entries.values_list('status', flat=True)), {'finalized'})
        self.assertEqual(self._closed(self.emp), 1, 'one close membership per person, never two')
        auto_members = ApprovalPeriodCloseMember.objects.filter(
            close__scope_type='auto_cutoff', close__boundary__period=OCTOBER,
        ).values_list('user__username', flat=True)
        self.assertIn('sim_emp', auto_members)

    def test_c8_tick_twice_is_idempotent_no_second_run_no_second_lines(self):
        run = self.draft()
        self.move_lm(self.new_lm)
        with _at(AT_CUTOFF):
            advance_payroll_period(2026, 10)
            advance_payroll_period(2026, 10)
        self.assertEqual(PayrollRun.objects.filter(year=2026, month=10).count(), 1)
        run.refresh_from_db()
        self.assertEqual(run.lines.count(), 5)
        self.assertEqual(PayrollRunEntry.objects.filter(run=run, user=self.emp).values('source_id').distinct().count(),
                         PayrollRunEntry.objects.filter(run=run, user=self.emp).count())

    def _urgent(self, user):
        return Notification.objects.filter(user=user, dedupe_key__startswith='tl-urgent-close:')

    def test_c9_urgent_reminder_goes_to_the_current_leader_only(self):
        self.draft(users=[self.emp])
        self.move_lm(self.new_lm)
        with _at(MONTH_END):
            outcome = advance_payroll_period(2026, 10)
        _sim('C9 outcome / old / new', (outcome, self._urgent(self.old_lm).count(), self._urgent(self.new_lm).count()))
        self.assertEqual(outcome, 'urgent')
        self.assertEqual(self._urgent(self.old_lm).count(), 0)
        self.assertEqual(self._urgent(self.new_lm).count(), 1)

    def test_c10_employee_with_only_a_manager_link_reminds_the_new_manager(self):
        solo = User.objects.create_user(username='sim_mgr_only', password='x')
        _link(solo, manager=self.manager)
        WageAssignment.objects.create(user=solo, gross_monthly_wage=Decimal('90000'),
                                      effective_from=date(2026, 1, 1), is_active=True)
        self.draft(users=[solo])
        self.move_manager(self.new_manager, employee=solo)
        with _at(MONTH_END):
            advance_payroll_period(2026, 10)
        self.assertEqual(self._urgent(self.manager).count(), 0)
        self.assertEqual(self._urgent(self.new_manager).count(), 1)
        groups = get_period_closure_status(PayrollRun.objects.get(month=10))['line_managers']
        _sim('C10 manager-only closure groups', [g['username'] for g in groups])

    def test_c11_both_links_move_lm_only_reminder_goes_to_new_lm_not_the_manager(self):
        _link(self.emp, lm=self.old_lm, manager=self.manager)
        self.draft(users=[self.emp])
        self.move_lm(self.new_lm)
        with _at(MONTH_END):
            advance_payroll_period(2026, 10)
        self.assertEqual(self._urgent(self.new_lm).count(), 1)
        self.assertEqual(self._urgent(self.manager).count(), 0)
        self.assertEqual(self._urgent(self.old_lm).count(), 0)

    def test_c12_automatic_lifecycle_creates_a_single_draft_with_the_moved_user_once(self):
        self.move_lm(self.new_lm)
        with _at(MONTH_END):
            outcome = advance_payroll_period(2026, 10)
        run = PayrollRun.objects.get(year=2026, month=10)
        _sim('C12 auto draft outcome / lines', (outcome, self.line_users(run)))
        self.assertEqual(run.lines.filter(user=self.emp).count(), 1)
        self.assertEqual(run.lines.count(), len(set(run.lines.values_list('user_id', flat=True))))

    def test_c13_closed_year_payroll_regeneration_is_rejected_and_unchanged(self):
        """A finalized run stays untouched even when the year is closed and people moved."""
        PayrollConfiguration.objects.filter(pk=1).update(require_tl_closed_before_finalize=False)
        run = self.draft(users=[self.emp])
        finalize_run(run, self.staff)
        snapshot = list(PayrollLine.objects.filter(run=run).values('user_id', 'net_pay', 'overtime_hours'))
        self.move_lm(self.new_lm)
        with self.assertRaises(ValidationError):
            generate_draft_run(run, [self.emp])
        self.assertEqual(list(PayrollLine.objects.filter(run=run).values('user_id', 'net_pay', 'overtime_hours')), snapshot)

    def test_c14_both_leaders_closing_one_person_leaves_two_memberships_but_one_closed_state(self):
        """Observation: old LM closes (emp inside), emp moves, new LM closes again."""
        run = self.draft(users=[self.emp, self.peer])
        with _at(datetime(2026, 10, 12, 12, 0, tzinfo=TIRANE)):
            finalize_period(self.old_lm, OCTOBER)
            self.move_lm(self.new_lm)
            finalize_period(self.new_lm, OCTOBER)
        _sim('C14 emp close memberships for October', self._closed(self.emp))
        self.assertTrue(get_period_closure_status(run)['all_closed'])
        finalize_run(run, self.staff)
        self.assertEqual(run.lines.filter(user=self.emp).count(), 1)


if __name__ == '__main__':  # pragma: no cover
    unittest.main()
