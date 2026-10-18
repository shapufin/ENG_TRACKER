"""Team tab: the per-member summary a TL reads for their own team.

Carries wage and leave data, so the access rules are the point: a TL sees
their own scoreable members, staff may name a leader, and an HBPR never gets
it (not even for an in-scope Albanian TL).
"""
import sys
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission
from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .models import EPRCycle, IdleFlag, Meeting, PIPRecord
from .testing import make_user
from .viewsets import TLScorecardViewSet


class TeamMembersBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        for code in ('italian_tl', 'albanian_tl', 'hbpr'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        for code in ('italian_tl', 'hbpr'):
            PluginPermission.objects.get(plugin_name='tl_scorecard', action='view') \
                .allowed_roles.add(Role.objects.get(code=code))

        self.today = date.today()
        self.year = self.today.year

        self.tl = make_user('team_tl', first_name='Ana', last_name='Lead')
        assign_role(self.tl, 'italian_tl')
        self.other_tl = make_user('team_other_tl')
        assign_role(self.other_tl, 'italian_tl')

        self.member = make_user('team_member', first_name='Bora', last_name='Zeta')
        self.member.profile.italian_tl = self.tl
        self.member.profile.save()

        self.al_tl = make_user('team_al_tl')
        assign_role(self.al_tl, 'albanian_tl')
        self.al_tl.profile.italian_tl = self.tl
        self.al_tl.profile.save()

        self.stranger = make_user('team_stranger')
        self.stranger.profile.italian_tl = self.other_tl
        self.stranger.profile.save()

        self.hbpr = make_user('team_hbpr')
        assign_role(self.hbpr, 'hbpr')
        # In-scope Albanian TL for the HBPR (assignment is the only grant).
        self.assigned_al_tl = make_user('team_assigned_al_tl')
        assign_role(self.assigned_al_tl, 'albanian_tl')
        HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.assigned_al_tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )
        self.staff = make_user('team_staff', is_staff=True)
        self.employee = make_user('team_employee')

    def _get(self, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': 'team_members'})(request)

    def _member_row(self, response):
        return next(row for row in self._rows(response) if row['id'] == self.member.id)

    def _rows(self, response):
        data = response.data
        return data['results'] if isinstance(data, dict) and 'results' in data else data


class TeamMemberScopeTests(TeamMembersBase):
    def test_a_tl_gets_exactly_their_scoreable_members(self):
        response = self._get(self.tl)
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in self._rows(response)]
        self.assertEqual(ids, [self.member.id])

    def test_a_tl_cannot_pass_another_tls_leader_id(self):
        self.assertEqual(self._get(self.tl, leader_id=self.other_tl.id).status_code, 403)

    def test_hbpr_only_user_is_forbidden_without_leader_id(self):
        self.assertEqual(self._get(self.hbpr).status_code, 403)

    def test_hbpr_only_user_is_forbidden_even_for_an_in_scope_al_tl(self):
        response = self._get(self.hbpr, leader_id=self.assigned_al_tl.id)
        self.assertEqual(response.status_code, 403)

    def test_staff_may_name_a_leader(self):
        response = self._get(self.staff, leader_id=self.tl.id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in self._rows(response)], [self.member.id])

    def test_an_employee_without_team_leadership_is_refused(self):
        self.assertEqual(self._get(self.employee).status_code, 403)


class TeamMemberWageTests(TeamMembersBase):
    def _wage(self, user, amount, effective_from, effective_to=None):
        from plugins.payroll.models import WageAssignment

        return WageAssignment.objects.create(
            user=user, gross_monthly_wage=Decimal(amount),
            effective_from=effective_from, effective_to=effective_to,
        )

    def test_tl_sees_the_current_wage_for_a_member(self):
        self._wage(self.member, '1234.00', self.today.replace(day=1) - timedelta(days=40))
        wage = self._member_row(self._get(self.tl))['wage']
        self.assertEqual(wage['status'], 'ok')
        self.assertEqual(wage['gross_monthly'], '1234.00')
        self.assertNotIn('note', wage)
        self.assertNotIn('created_by', wage)

    def test_wage_starting_after_this_month_is_missing(self):
        next_month = (self.today.replace(day=28) + timedelta(days=5)).replace(day=1)
        self._wage(self.member, '900.00', next_month)
        wage = self._member_row(self._get(self.tl))['wage']
        self.assertEqual(wage['status'], 'missing')
        self.assertIsNone(wage['gross_monthly'])

    def test_overlapping_wages_are_a_conflict_not_missing(self):
        first_of_month = self.today.replace(day=1)
        self._wage(self.member, '1000.00', first_of_month - timedelta(days=60))
        self._wage(self.member, '2000.00', first_of_month - timedelta(days=20))
        wage = self._member_row(self._get(self.tl))['wage']
        self.assertEqual(wage['status'], 'conflict')
        self.assertIsNone(wage['gross_monthly'])

    def test_wage_is_unavailable_when_payroll_is_not_importable(self):
        with mock.patch.dict(sys.modules, {'plugins.payroll.models': None}):
            wage = self._member_row(self._get(self.tl))['wage']
        self.assertEqual(wage['status'], 'unavailable')
        self.assertIsNone(wage['gross_monthly'])


class TeamMemberDetailTests(TeamMembersBase):
    def test_leave_epr_and_governance_are_summarised_per_member(self):
        LeaveBalance.objects.create(
            user=self.member, leave_type='vacation', year=self.year,
            total_days=Decimal('20.0'), used_days=Decimal('5.0'), pending_days=Decimal('2.0'),
        )
        # Advance to next Monday so the 2-day span reliably falls on business days
        days_ahead = (7 - self.today.weekday()) % 7 or 7
        start = self.today + timedelta(days=days_ahead)
        LeaveRequest.objects.create(
            user=self.member, request_type='vacation', start_date=start,
            end_date=start + timedelta(days=1), status='approved', reason='private',
        )
        EPRCycle.objects.create(
            user=self.member, year=self.year,
            goal_setting_completed_at=None, mid_year_completed_at=None,
        )
        PIPRecord.objects.create(employee=self.member, tl=self.tl, start_date=self.today)
        IdleFlag.objects.create(employee=self.member, flagged_by=self.tl, flagged_on=self.today)

        row = self._member_row(self._get(self.tl))
        self.assertEqual(row['leave']['total_days'], '20.0')
        self.assertEqual(row['leave']['used_days'], '5.0')
        self.assertEqual(row['leave']['pending_days'], '2.0')
        self.assertEqual(row['leave']['available_days'], '13.0')
        self.assertEqual(len(row['leave']['upcoming']), 1)
        self.assertNotIn('reason', row['leave']['upcoming'][0])
        self.assertEqual(row['epr']['next_stage'], 'goal_setting')
        self.assertTrue(row['governance']['open_pip'])
        self.assertEqual(row['governance']['pip_status'], 'draft')
        self.assertEqual(row['governance']['open_idle_flags'], 1)
        self.assertEqual(row['governance']['open_absences'], 0)
        self.assertFalse(row['governance']['pending_promotion'])

    def test_last_one_on_one_is_visible_to_the_leader(self):
        Meeting.objects.create(
            organizer=self.tl, counterparty=self.member, meeting_type='one_on_one',
            occurred_on=self.today - timedelta(days=7), recorded_by=self.tl,
        )
        row = self._member_row(self._get(self.tl))
        self.assertEqual(row['meetings']['last_one_on_one_on'], (self.today - timedelta(days=7)).isoformat())

    def test_last_one_on_one_is_visible_to_staff(self):
        Meeting.objects.create(
            organizer=self.tl, counterparty=self.member, meeting_type='one_on_one',
            occurred_on=self.today - timedelta(days=7), recorded_by=self.tl,
        )
        row = self._member_row(self._get(self.staff, leader_id=self.tl.id))
        self.assertIsNotNone(row['meetings']['last_one_on_one_on'])


class TeamMemberQueryBudgetTests(TeamMembersBase):
    # Tables the team action itself reads. Permission and team-scope lookups
    # (plugin_permissions, user_roles, roles, teams, team_memberships,
    # user_profiles) are shared with every scorecard endpoint and are not counted.
    TEAM_TABLES = ('tl_scorecard_', 'leave_', 'payroll_wageassignment')

    def _add_members(self, count):
        for index in range(count):
            member = make_user(f'budget_member_{count}_{index}')
            member.profile.italian_tl = self.tl
            member.profile.save()

    def _queries(self):
        """SQL of one request by a freshly loaded leader, so per-object caches on
        the profile (scoreable member ids) cannot hide a cost."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from django.contrib.auth.models import User

        leader = User.objects.select_related('profile').get(pk=self.tl.pk)
        with CaptureQueriesContext(connection) as ctx:
            response = self._get(leader)
        self.assertEqual(response.status_code, 200)
        return [q['sql'] for q in ctx.captured_queries]

    def _team_owned(self, sqls):
        return [sql for sql in sqls if any(table in sql for table in self.TEAM_TABLES)]

    def test_query_count_does_not_grow_with_member_count(self):
        small = self._queries()
        self._add_members(5)
        large = self._queries()
        self.assertEqual(len(small), len(large))
        self.assertEqual(len(self._team_owned(small)), len(self._team_owned(large)))

    def test_team_owned_queries_stay_within_spec_budget(self):
        # Spec: <= ~10 queries. The team action itself uses 2: one member query
        # carrying every per-member figure as a correlated subquery, and one
        # list query for upcoming leave.
        self._add_members(5)
        owned = self._team_owned(self._queries())
        self.assertLessEqual(len(owned), 10)
        self.assertEqual(len(owned), 2)

    def test_endpoint_total_is_twelve(self):
        # 12 = 1 plugin-enabled check + 2 team-owned + 5 permission/role lookups + 4 team-scope lookups
        # shared with the other scorecard endpoints.
        self.assertEqual(len(self._queries()), 12)
