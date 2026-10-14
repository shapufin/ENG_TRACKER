"""Phase 5 (PERF-01/02/03): exact totals and flat query counts on member lists."""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team, TeamMembership, Tech, TechLevel, UserTech


def _month_day():
    return timezone.localdate().replace(day=1)


class MyTeamMembersTests(APITestCase):
    URL = '/api/users/users/my_team_members/'

    def setUp(self):
        self.tl = User.objects.create_user(username='p5-tl', password='x')
        self.tl.profile.is_albanian_tl_role = True
        self.tl.profile.save(update_fields=['is_albanian_tl_role', 'updated_at'])
        self.al_tl = User.objects.create_user(username='p5-altl', password='x', first_name='Al', last_name='Tl')
        self.team = Team.objects.create(name='P5 Team', code='P5T', team_leader=self.tl)
        self.client_obj = Client.objects.create(name='P5 Client', code='P5C')
        self.tech = Tech.objects.create(name='P5 Tech', code='P5TECH')
        self.level = TechLevel.objects.create(tech=self.tech, name='L1', code='L1', rank=1)
        self.api = self.client
        self.api.force_authenticate(self.tl)

    def _member(self, name, ot=(), standby=()):
        user = User.objects.create_user(username=name, password='x')
        prof = user.profile
        prof.albanian_tl = self.al_tl
        prof.italian_tl = self.al_tl
        prof.save()
        TeamMembership.objects.create(user_profile=prof, team=self.team, is_primary_team=True)
        UserTech.objects.create(user_profile=prof, tech=self.tech, level=self.level)
        for hours in ot:
            OvertimeLog.objects.create(
                user=user, client=self.client_obj, date=_month_day(), hours=hours, status='approved',
            )
        for hours in standby:
            StandbyLog.objects.create(user=user, date=_month_day(), hours=hours, status='approved')
        return user

    def test_totals_are_exact_with_multiple_logs_of_both_kinds(self):
        member = self._member('p5-m1', ot=(Decimal('1.00'), Decimal('2.00')),
                              standby=(Decimal('3.00'), Decimal('4.00'), Decimal('5.00')))
        resp = self.api.get(self.URL)
        self.assertEqual(resp.status_code, 200, resp.data)
        row = next(r for r in resp.data if r['user']['id'] == member.id)
        self.assertEqual(Decimal(str(row['current_month_overtime_hours'])), Decimal('3.00'))
        self.assertEqual(Decimal(str(row['current_month_standby_hours'])), Decimal('12.00'))

    def test_pending_and_other_month_logs_are_excluded(self):
        member = self._member('p5-m2', ot=(Decimal('1.00'),))
        OvertimeLog.objects.create(
            user=member, client=self.client_obj, date=_month_day(), hours=Decimal('9.00'), status='pending',
        )
        OvertimeLog.objects.create(
            user=member, client=self.client_obj, date=date(2020, 1, 5), hours=Decimal('9.00'), status='approved',
        )
        resp = self.api.get(self.URL)
        row = next(r for r in resp.data if r['user']['id'] == member.id)
        self.assertEqual(Decimal(str(row['current_month_overtime_hours'])), Decimal('1.00'))
        self.assertEqual(Decimal(str(row['current_month_standby_hours'])), Decimal('0.00'))

    def _count(self):
        with CaptureQueriesContext(connection) as ctx:
            resp = self.api.get(self.URL)
        self.assertEqual(resp.status_code, 200, resp.data)
        return len(ctx.captured_queries), len(resp.data)

    def test_query_count_does_not_grow_with_members(self):
        self._member('p5-q1', ot=(Decimal('1.00'),), standby=(Decimal('1.00'),))
        one, n_one = self._count()
        for i in range(2, 6):
            self._member(f'p5-q{i}', ot=(Decimal('1.00'),), standby=(Decimal('1.00'),))
        five, n_five = self._count()
        self.assertGreaterEqual(n_five, 5)
        self.assertEqual(one, five, f'N+1: {one} queries for {n_one} rows vs {five} for {n_five}')


class ProfileListQueryTests(APITestCase):
    """PERF-02/03: profile lists, italian_team_members and team members are flat."""

    def setUp(self):
        self.admin = User.objects.create_user(username='p5l-admin', password='x', is_staff=True, is_superuser=True)
        self.al = User.objects.create_user(username='p5l-al', password='x', first_name='A', last_name='L')
        self.it = User.objects.create_user(username='p5l-it', password='x', first_name='I', last_name='T')
        self.team = Team.objects.create(name='P5L Team', code='P5L', team_leader=self.it)
        self.tech = Tech.objects.create(name='P5L Tech', code='P5LT')
        self.level = TechLevel.objects.create(tech=self.tech, name='L1', code='L1', rank=1)
        self.n = 0
        self.client.force_authenticate(self.admin)

    def _add(self):
        self.n += 1
        user = User.objects.create_user(username=f'p5l-u{self.n}', password='x')
        prof = user.profile
        prof.albanian_tl = self.al
        prof.italian_tl = self.it
        prof.save()
        TeamMembership.objects.create(user_profile=prof, team=self.team, is_primary_team=True)
        UserTech.objects.create(user_profile=prof, tech=self.tech, level=self.level)
        return user

    def _flat(self, url):
        self._add()
        with CaptureQueriesContext(connection) as ctx:
            r1 = self.client.get(url)
        self.assertEqual(r1.status_code, 200, getattr(r1, 'data', None))
        one = len(ctx.captured_queries)
        for _ in range(4):
            self._add()
        with CaptureQueriesContext(connection) as ctx:
            self.client.get(url)
        five = len(ctx.captured_queries)
        self.assertEqual(one, five, f'{url}: {one} queries (N=1) vs {five} (N=5)')

    def test_profile_list_is_flat(self):
        self._flat('/api/users/profiles/')

    def test_italian_team_members_is_flat(self):
        self._flat(f'/api/users/users/italian_team_members/?italian_tl_id={self.it.id}')

    def test_team_members_is_flat(self):
        self._flat(f'/api/users/teams/{self.team.id}/members/')


class PrefetchedSemanticsTests(APITestCase):
    """The prefetch-aware branches must answer exactly like the query fallbacks."""

    def test_control_room_access_flag_and_tl_flags_survive_prefetch(self):
        from plugins.control_room.models import ControlRoomAccess

        admin = User.objects.create_user(username='p5s-admin', password='x', is_staff=True, is_superuser=True)
        active = User.objects.create_user(username='p5s-active', password='x')
        inactive = User.objects.create_user(username='p5s-inactive', password='x')
        plain = User.objects.create_user(username='p5s-plain', password='x')
        lead = User.objects.create_user(username='p5s-lead', password='x')
        ControlRoomAccess.objects.create(user=active, is_active=True)
        ControlRoomAccess.objects.create(user=inactive, is_active=False)
        plain.profile.italian_tl = lead
        plain.profile.save()

        self.client.force_authenticate(admin)
        resp = self.client.get('/api/users/profiles/')
        self.assertEqual(resp.status_code, 200)
        rows = {r['user']['username']: r['user'] for r in resp.data['results']}
        self.assertTrue(rows['p5s-active']['has_control_room_access'])
        self.assertFalse(rows['p5s-inactive']['has_control_room_access'])
        self.assertFalse(rows['p5s-plain']['has_control_room_access'])
        # lead only qualifies through the prefetched italian_team_members relation
        self.assertTrue(rows['p5s-lead']['is_italian_tl_role'])
        self.assertTrue(rows['p5s-lead']['is_team_leader'])
        self.assertFalse(rows['p5s-plain']['is_team_leader'])
