"""End-to-end timeline: 2026 leave -> year-end carry -> 31 March cutoff -> settings -> freeze.

Runs on a fresh test schema with the clock stepped through the year. Each step asserts
the balances, so the timeline doubles as a regression check for the whole carry-over flow.
"""

from datetime import date
from decimal import Decimal

from apps.dashboard.models.calendar import PublicHoliday
from apps.leave_management.models import LeaveBalance
from apps.leave_management.services.carry_over import apply_year_end_carry_over
from apps.leave_management.models import LeaveRequest
from apps.leave_management.test_carry_over import CarryOverTestBase, SETTINGS_URL


class CarryOverTimelineSimulation(CarryOverTestBase):
    def row(self, year, carry=False):
        return LeaveBalance.objects.get(user=self.user, year=year, is_carry_over=carry)

    def carry(self, year=2026):
        return LeaveBalance.objects.filter(
            user=self.user, year=year, is_carry_over=True,
        ).first()

    def test_full_year_timeline(self):
        log = []

        def step(label, cond, detail=''):
            log.append(('PASS' if cond else 'FAIL', label, detail))
            self.assertTrue(cond, f'{label} {detail}')

        # 2026: 22-day balance, one approved trip, one pending trip across a holiday.
        self.balance(2026, total=22)
        self.set_today(date(2026, 10, 13))
        a = self.request(date(2026, 11, 2), date(2026, 11, 6)).data['id']
        self.act(a, 'approve')
        step('2026 approved 5 days', self.row(2026).used_days == Decimal('5'))

        self.set_today(date(2026, 12, 1))
        PublicHoliday.objects.create(name='Dec holiday', date=date(2026, 12, 16), is_global=True)
        b_response = self.request(date(2026, 12, 14), date(2026, 12, 18))
        step('global holiday 16 Dec reduces pending trip to 4 days',
             b_response.status_code == 201 and self.row(2026).pending_days == Decimal('4'),
             f'status={b_response.status_code}')
        b = b_response.data['id']

        # 31 Dec -> 2 Jan: the closing year rolls over. Pending 4 is reserved, not carried.
        self.set_today(date(2027, 1, 2))
        counts = apply_year_end_carry_over()
        step('rollover creates carry = 22 - used 5 - pending 4 = 13',
             self.carry(2026).total_days == Decimal('13'), f'counts={counts}')
        step('carry expires 31 Mar 2027', self.carry(2026).expires_at == date(2027, 3, 31))

        # The pending trip is decided after New Year: carry does not change.
        self.set_today(date(2027, 1, 3))
        self.act(b, 'approve')
        step('approving the closed-year trip leaves carry at 13',
             self.carry(2026).total_days == Decimal('13'))

        # 2027 balance and a February trip that uses carry first.
        self.balance(2027, total=22)
        c_response = self.request(date(2027, 2, 1), date(2027, 2, 5))
        c = c_response.data['id']
        step('February trip uses 5 carry days', self.carry(2026).pending_days == Decimal('5'))

        # Holiday added after the trip exists: its counted days stay at 5.
        PublicHoliday.objects.create(name='Feb holiday', date=date(2027, 2, 3), is_global=True)
        self.act(c, 'approve')
        step('holiday added after booking does not change the 5 counted days',
             self.carry(2026).used_days == Decimal('5'))

        # Trip across 31 Mar: 29, 30, 31 Mar from carry; 1, 2 Apr from 2027.
        self.set_today(date(2027, 3, 20))
        d_response = self.request(date(2027, 3, 29), date(2027, 4, 2))
        d_req = LeaveRequest.objects.get(pk=d_response.data['id']) if d_response.status_code == 201 else None
        step('trip crossing 31 Mar: 3 carry days, 2 current-year days',
             d_req is not None
             and d_req.days_counted == 5 and d_req.carry_days == Decimal('3')
             and self.row(2027).pending_days == Decimal('2')
             and self.carry(2026).pending_days == Decimal('3'),
             f'status={d_response.status_code}')

        # Booking after expiry comes entirely from the 2027 balance.
        self.set_today(date(2027, 4, 1))
        e_response = self.request(date(2027, 4, 12), date(2027, 4, 16))
        step('trip after 31 Mar uses current year only',
             e_response.status_code == 201
             and self.carry(2026).pending_days == Decimal('3'))

        # Settings: move expiry to 30 Apr. Existing carry follows immediately.
        self.api.force_authenticate(user=self.staff)
        patch = self.api.patch(SETTINGS_URL.format(self.settings.pk), {
            'carry_over_expiry_month': 4, 'carry_over_expiry_day': 30,
        }, format='json')
        step('settings change to 30 Apr is accepted', patch.status_code == 200, f'{patch.status_code}')
        step('existing carry expiry follows the new setting',
             self.carry(2026).expires_at == date(2027, 4, 30))

        # 5 Apr trip is now inside the carry window, so carry is used again.
        self.set_today(date(2027, 4, 1))
        f_response = self.request(date(2027, 4, 5), date(2027, 4, 9))
        step('after the rule moved, April trip draws carry again',
             f_response.status_code == 201
             and LeaveBalance.objects.get(pk=self.carry(2026).pk).pending_days > Decimal('3'))

        # Back to 31 Mar for the rest of the year.
        self.api.force_authenticate(user=self.staff)
        patch = self.api.patch(SETTINGS_URL.format(self.settings.pk), {
            'carry_over_expiry_month': 3, 'carry_over_expiry_day': 31,
        }, format='json')
        step('settings restored to 31 Mar', patch.status_code == 200, f'{patch.status_code}')
        step('carry expiry back to 31 Mar', self.carry(2026).expires_at == date(2027, 3, 31))

        # Closed year: a late entry for 2026 is refused, the year is frozen.
        late = self.request(date(2026, 12, 21), date(2026, 12, 22))
        step('late entry into the closed 2026 year is refused', late.status_code == 400)

        # Switch carry-over off: the 2027 rollover creates nothing.
        self.settings.refresh_from_db()
        self.settings.carry_over_enabled = False
        self.settings.save()
        self.set_today(date(2028, 1, 2))
        apply_year_end_carry_over()
        step('switch off: no 2027 carry created at the next rollover',
             self.carry(2027) is None)

        for status, label, detail in log:
            print(f'{status}  {label}  {detail}')
        print(f'{sum(1 for r in log if r[0] == "PASS")}/{len(log)} timeline steps passed')
