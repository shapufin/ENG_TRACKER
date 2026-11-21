"""Simulation: the clock moves into 2027 and everything that depends on the year is exercised on dummy data.

Cast: Old (hired 2020), Mid (hired mid-2026), New (hired Dec 2026), a Line Manager, HR, an admin.
Story: year-end carry-over on the first read of 2027, January leave booked before 2027 holidays exist,
holidays arrive (recount), payroll refuses then drafts January, the year closes and freezes 2026, a
recurring 1-on-1 crosses the new year, and in November 2027 HR is nagged about 2028.

Time is moved by patching the business clock and ``timezone.now``; nothing here touches real data.
"""
from contextlib import contextmanager
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import GlobalSettings, LeaveBalance, LeaveRequest
from apps.overtime.models import Client
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models import UserProfile
from apps.users.services.approval_periods import clear_closed_year_cache, close_year
from plugins.notifications.models import Notification
from plugins.payroll.models import PayrollConfiguration, PayrollRun, PayrollRuleSet, PayrollWorkCalendar, WageAssignment
from plugins.payroll.services.calendar_service import generate_workdays_for_year
from plugins.payroll.services.payroll_service import _get_month_workdays, generate_draft_run
from plugins.payroll.services.year_start import year_start_notice_tick
from plugins.tl_scorecard import one_on_one

User = get_user_model()
TZ = ZoneInfo('Europe/Tirane')
LEAVE = '/api/leave-management/requests/'
BALANCES = '/api/leave-management/balances/'


@contextmanager
def clock(year, month, day, hour=10):
    """Pretend it is this moment in the business timezone."""
    moment = datetime(year, month, day, hour, 0, tzinfo=TZ)

    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return moment.astimezone(tz) if tz else moment.replace(tzinfo=None)

    with mock.patch('core.utils.timezone_local.datetime', Frozen), \
            mock.patch('django.utils.timezone.now', lambda: moment.astimezone(dt_timezone.utc)):
        yield


def _api(user):
    api = APIClient()
    api.force_authenticate(user=User.objects.get(pk=user.pk))  # fresh, as a real request loads it
    return api


class Year2027Simulation(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        call_command('seed_payroll_rules', verbosity=0)
        for code in ('hr', 'albanian_tl', 'italian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})

    def setUp(self):
        self.config = PayrollConfiguration.get_singleton()
        settings_obj, _ = GlobalSettings.objects.get_or_create(pk=1)
        settings_obj.carry_over_enabled = True
        settings_obj.carry_over_expiry_month, settings_obj.carry_over_expiry_day = 3, 31
        settings_obj.save()

        self.hr = User.objects.create_user(username='s_hr', password='x')
        assign_role(self.hr, 'hr')
        self.admin = User.objects.create_user(username='s_admin', password='x', is_staff=True)
        self.lm = User.objects.create_user(username='s_lm', password='x')
        UserProfile.objects.get_or_create(user=self.lm)
        assign_role(self.lm, 'albanian_tl')
        self.old = self._person('s_old', date(2020, 3, 1), used=10)
        self.mid = self._person('s_mid', date(2026, 6, 15), used=3)
        self.new = self._person('s_new', date(2026, 12, 1), used=0)

    def _person(self, username, hired, used):
        user = User.objects.create_user(username=username, password='x')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.hire_date, profile.albanian_tl = hired, self.lm
        profile.save()
        profile.refresh_from_db()
        self.assertEqual(profile.hire_date, hired, 'fixture: hire date must persist')
        LeaveBalance.objects.update_or_create(
            user=user, leave_type='vacation', year=2026, is_carry_over=False,
            defaults={'total_days': 22, 'used_days': used, 'accrual_start_date': hired},
        )
        WageAssignment.objects.create(
            user=user, gross_monthly_wage=Decimal('100000'), effective_from=date(2020, 1, 1), is_active=True,
        )
        return user

    # -- invariants ---------------------------------------------------------------------------

    def _assert_balances_match_requests(self, user, label):
        """pending/used of every 2027 row equal the requests behind them (the counters never drift)."""
        rows = {b.is_carry_over: b for b in LeaveBalance.objects.filter(user=user, leave_type='vacation')
                .exclude(year=2026, is_carry_over=False)}
        expected = {False: {'pending': Decimal('0'), 'approved': Decimal('0')},
                    True: {'pending': Decimal('0'), 'approved': Decimal('0')}}
        for leave in LeaveRequest.objects.filter(user=user, request_type='vacation', status__in=('pending', 'approved')):
            carry = Decimal(leave.carry_days or 0)
            if leave.balance_id:
                expected[False][leave.status] += Decimal(leave.days_counted) - carry
            if leave.carry_balance_id:
                expected[True][leave.status] += carry
        for is_carry, row in rows.items():
            row.refresh_from_db()
            self.assertEqual(row.pending_days, expected[is_carry]['pending'], f'{label}: pending of {row}')
            self.assertEqual(row.used_days, expected[is_carry]['approved'], f'{label}: used of {row}')

    def _holiday(self, name, day):
        with self.captureOnCommitCallbacks(execute=True):
            return PublicHoliday.objects.create(name=name, date=day)

    # -- the story ----------------------------------------------------------------------------

    def test_the_turn_of_the_year(self):
        # November 2026: nothing for 2027 exists yet, HR hears about it.
        with clock(2026, 11, 2):
            year_start_notice_tick()
        self.assertTrue(Notification.objects.filter(user=self.hr, dedupe_key__startswith='hr-year-start:2027').exists())

        with clock(2026, 12, 31):
            self.assertEqual(LeaveBalance.objects.filter(is_carry_over=True).count(), 0)  # no rollover yet

        with clock(2027, 1, 4):
            # 1. The first read of 2027 rolls the year over: unused 2026 days become carry-over.
            _api(self.admin).get(BALANCES)  # the admin balances list is the first read of the year
            carry = {b.user_id: b for b in LeaveBalance.objects.filter(is_carry_over=True)}
            self.assertEqual(carry[self.old.pk].total_days, Decimal('12'))   # 22 - 10 used
            self.assertEqual(carry[self.mid.pk].total_days, Decimal('9'))    # 12 accrued - 3 used
            self.assertEqual(carry[self.new.pk].total_days, Decimal('2'))    # 2 accrued - 0 used
            self.assertTrue(all(c.expires_at == date(2027, 3, 31) for c in carry.values()))
            self.assertEqual(GlobalSettings.objects.get(pk=1).carry_over_applied_year, 2027)
            _api(self.old).get(BALANCES + 'user_balance_summary/')  # idempotent: a second read changes nothing
            self.assertEqual(LeaveBalance.objects.filter(is_carry_over=True).count(), 3)

            for person in (self.old, self.mid, self.new):  # each person's first visit creates their 2027 row
                _api(person).get(BALANCES + 'user_balance_summary/')

            # 2. 2027 accrual restarts with the monthly model (1.8 days/month, rounded up):
            # 4 days into January is 0.23 of a month, so every person has accrued 1 day.
            current = {u.pk: LeaveBalance.objects.get(user=u, year=2027, is_carry_over=False)
                       for u in (self.old, self.mid, self.new)}
            self.assertEqual(current[self.old.pk].get_monthly_accrued_days(), Decimal('1'))
            self.assertEqual(current[self.mid.pk].get_monthly_accrued_days(), Decimal('1'))
            self.assertEqual(current[self.new.pk].get_monthly_accrued_days(), Decimal('1'))
            # The yearly entitlement is still a full 12 months in the new year for a 2026 hire.
            self.assertEqual(current[self.mid.pk].get_yearly_entitlement(), Decimal('22'))
            self.assertEqual(current[self.old.pk].used_days, Decimal('0'))   # a fresh year

            # 3. Old books 11-15 January before any 2027 holiday exists: carry is used first.
            created = _api(self.old).post(LEAVE, {
                'start_date': '2027-01-11', 'end_date': '2027-01-15', 'request_type': 'vacation', 'reason': 's',
            }, format='json')
            self.assertEqual(created.status_code, 201, created.data)
            leave = LeaveRequest.objects.get(pk=created.data['id'])
            self.assertEqual((float(leave.days_counted), float(leave.carry_days)), (5.0, 5.0))
            self._assert_balances_match_requests(self.old, 'booked')

            # 4. HR adds 2027 holidays late: 1 Jan (past) and 12 Jan (inside the booking).
            self._holiday("New Year's Day", date(2027, 1, 1))
            self._holiday('Late holiday', date(2027, 1, 12))
            leave.refresh_from_db()
            self.assertEqual((float(leave.days_counted), float(leave.carry_days)), (4.0, 4.0))
            self._assert_balances_match_requests(self.old, 'holiday recount')

            # 5. The line manager approves; carry takes the usage.
            self.assertEqual(_api(self.lm).post(f'{LEAVE}{leave.pk}/approve/', {}, format='json').status_code, 200)
            carry_old = LeaveBalance.objects.get(user=self.old, is_carry_over=True)
            self.assertEqual((carry_old.used_days, carry_old.pending_days), (Decimal('4'), Decimal('0')))
            self._assert_balances_match_requests(self.old, 'approved')

            # 6. Payroll: January is refused until the 2027 calendar marks the holidays, then drafted.
            run = PayrollRun.objects.create(
                year=2027, month=1, status='draft',
                rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'), created_by=self.hr,
            )
            with self.assertRaises(ValidationError):
                generate_draft_run(run, [self.old])
            calendar = PayrollWorkCalendar.objects.create(country=self.config.country, year=2027, is_active=True)
            generate_workdays_for_year(calendar)
            self.assertEqual(len(generate_draft_run(run, [self.old, self.mid, self.new])), 3)
            # January 2027 has 21 weekdays; 1 Jan and 12 Jan are holidays, so 19 working days.
            self.assertEqual(_get_month_workdays(self.config, 2027, 1)['working_days'], 19)

            # 7. The year closes: 2026 is frozen for overtime, leave stays open.
            close_year(2026)
            self.addCleanup(clear_closed_year_cache)
            client = Client.objects.create(name='C', code='C')
            late = _api(self.old).post('/api/overtime/logs/', {
                'client': client.pk, 'date': '2026-12-20', 'start_time': '19:00', 'end_time': '21:00',
                'description': 'late',
            }, format='json')
            self.assertEqual(late.status_code, 400, late.data)

            # 8. A weekly Friday 1-on-1 crosses the new year; 1 January (a holiday) moves it.
            from plugins.tl_scorecard.models import OneOnOnePlan
            plan = OneOnOnePlan.objects.create(
                leader=self.lm, employee=self.mid, cadence='weekly', cadence_day_of_week=4,
                effective_from=date(2026, 12, 28),
            )
            slot = one_on_one.next_slot(plan, today=date(2027, 1, 4))
            self.assertEqual(slot.due_on, date(2027, 1, 8))  # the 1 Jan Friday is skipped, not "overdue"
            self.assertEqual(slot.status, 'upcoming')

        # A full cycle later (November 2027) HR is told 2028 is missing.
        with clock(2027, 11, 2):
            year_start_notice_tick()
        self.assertTrue(Notification.objects.filter(user=self.hr, dedupe_key__startswith='hr-year-start:2028').exists())
