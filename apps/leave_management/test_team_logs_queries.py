"""team_logs must not run queries per row (Team Overview speed, 2026-11-27)."""
from datetime import date, timedelta
from uuid import uuid4

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.permissions.services.role_service import assign_role
from apps.users.models import Team, TeamMembership

from .models import LeaveBalance, LeaveRequest

URL = '/api/leave-management/requests/team_logs/'


def _weekdays(start, count):
    """The first ``count`` Mon-Fri dates on or after ``start`` (leave must cover a business day)."""
    days, day = [], start
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    return days


class TeamLogsQueryCountTests(TestCase):
    def setUp(self):
        cache.clear()
        self.tl = User.objects.create_user(username=f'tlq-tl-{uuid4().hex[:6]}', password='pass')
        assign_role(self.tl, 'albanian_tl')
        self.team = Team.objects.create(name='TLQ Team', code=f'TLQ{uuid4().hex[:6]}', team_leader=self.tl)
        self.year = timezone.now().year
        self.members = []
        for i in range(2):
            member = User.objects.create_user(username=f'tlq-m{i}-{uuid4().hex[:6]}', password='pass')
            member.profile.albanian_tl = self.tl  # link-only scope (workflow-invariants item 64)
            member.profile.save()
            TeamMembership.objects.create(user_profile=member.profile, team=self.team, is_primary_team=True)
            self.members.append(member)
        self.api = APIClient()
        self.api.force_authenticate(user=self.tl)

    def _add_request(self, member, day, with_balance=True):
        balance = None
        if with_balance:
            balance, _ = LeaveBalance.objects.get_or_create(
                user=member, leave_type='vacation', year=self.year,
                defaults={'total_days': 22},
            )
        return LeaveRequest.objects.create(
            user=member, start_date=day, end_date=day, request_type='vacation',
            reason='Team logs query budget', status='pending', balance=balance,
        )

    def _query_count(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.api.get(URL)
        self.assertEqual(response.status_code, 200, response.data)
        return len(ctx.captured_queries), response

    def test_query_count_does_not_grow_with_rows(self):
        for i, member in enumerate(self.members):
            self._add_request(member, _weekdays(date(self.year, 3, 2), 2)[i])
        few, _ = self._query_count()

        # A third linked member with no LeaveBalance row at all.
        nobal = User.objects.create_user(username=f'tlq-nobal-{uuid4().hex[:6]}', password='pass')
        nobal.profile.albanian_tl = self.tl
        nobal.profile.save()
        TeamMembership.objects.create(user_profile=nobal.profile, team=self.team, is_primary_team=True)
        for i in range(6):
            self._add_request(nobal, _weekdays(date(self.year, 4, 1), 6)[i], with_balance=False)
        many, response = self._query_count()

        self.assertEqual(few, many, f'{few} queries (2 rows) vs {many} (8 rows)')
        rows = response.data.get('results', response.data)
        self.assertEqual(len(rows), 8)
        no_balance = [r for r in rows if r['balance_id'] is None]
        self.assertEqual(len(no_balance), 6)
        self.assertTrue(all(r['user_leave_balance'] == 0 for r in no_balance))
