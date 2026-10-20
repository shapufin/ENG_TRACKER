"""Two-way synchronization service between HR PublicHolidays and Payroll Work Calendars."""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Optional

from django.db import transaction

from apps.dashboard.models.calendar import PublicHoliday

logger = logging.getLogger(__name__)


def sync_holidays_between_hr_and_payroll(year: Optional[int] = None) -> dict:
    """Bi-directionally synchronize global HR holidays and Payroll work calendar holidays.

    1. Any holiday in Payroll that is missing in HR (PublicHoliday with calendar=None)
       is copied to PublicHoliday so HR and leave management are aware of it.
    2. Any global PublicHoliday in HR is mirrored to PayrollWorkday across all
       work calendars for that year.
    3. If holiday names differ, the HR PublicHoliday name takes precedence.

    Returns:
        dict with counts of synced records.
    """
    try:
        from apps.plugins.models import Plugin
        if not Plugin.objects.filter(name='payroll', is_enabled=True).exists():
            logger.info("Payroll plugin is deactivated; skipping holiday sync to payroll.")
            return {'status': 'skipped', 'reason': 'payroll_plugin_disabled'}
    except Exception:
        pass

    try:
        from plugins.payroll.models import PayrollWorkCalendar, PayrollWorkday
    except ImportError:
        logger.warning("Payroll plugin not installed for holiday sync.")
        return {'status': 'skipped', 'reason': 'payroll_not_installed'}

    cals_qs = PayrollWorkCalendar.objects.filter(is_active=True)
    if year:
        cals_qs = cals_qs.filter(year=year)

    calendars = list(cals_qs)
    if not calendars and year:
        calendars = list(PayrollWorkCalendar.objects.filter(year=year))

    synced_to_hr = 0
    synced_to_payroll = 0
    total_holidays = 0

    with transaction.atomic():
        # Iterate over distinct calendar years
        years = {cal.year for cal in calendars}
        if not years and year:
            years = {year}

        for y in years:
            # 1. Backfill missing holidays from Payroll -> HR
            payroll_holidays = (
                PayrollWorkday.objects.filter(calendar__year=y, is_holiday=True)
                .values('date', 'holiday_name', 'calendar__country')
                .distinct()
            )

            for item in payroll_holidays:
                h_date = item['date']
                h_name = (item['holiday_name'] or '').strip()
                country = item['calendar__country'] or 'AL'
                if not h_name:
                    continue

                # Check if exists in PublicHoliday (global)
                existing_hr = PublicHoliday.objects.filter(calendar__isnull=True, date=h_date).first()
                if not existing_hr:
                    # get_or_create: another worker may have inserted the same
                    # global holiday since the check above (unique on date+country).
                    _, created = PublicHoliday.objects.get_or_create(
                        date=h_date,
                        calendar=None,
                        country_code=country,
                        defaults={
                            'name': h_name,
                            'is_global': True,
                            'description': 'Imported from Payroll Work Calendar',
                        },
                    )
                    if created:
                        synced_to_hr += 1

            # 2. Inherit/Mirror from HR -> Payroll
            hr_holidays = PublicHoliday.objects.filter(calendar__isnull=True, date__year=y)
            target_cals = [cal for cal in calendars if cal.year == y]

            for hr_h in hr_holidays:
                for cal in target_cals:
                    workday, created = PayrollWorkday.objects.get_or_create(
                        calendar=cal,
                        date=hr_h.date,
                        defaults={
                            'is_holiday': True,
                            'is_working_day': False,
                            'holiday_name': hr_h.name,
                            'standard_hours': Decimal('0'),
                        },
                    )
                    if not created:
                        updated = False
                        if not workday.is_holiday:
                            workday.is_holiday = True
                            workday.is_working_day = False
                            workday.standard_hours = Decimal('0')
                            updated = True
                        if workday.holiday_name != hr_h.name:
                            workday.holiday_name = hr_h.name
                            updated = True
                        if updated:
                            workday.save(
                                update_fields=['is_holiday', 'is_working_day', 'holiday_name', 'standard_hours']
                            )
                            synced_to_payroll += 1

            total_holidays += hr_holidays.count()

    logger.info(
        "Holiday sync completed: %d added to HR, %d updated in Payroll, %d total.",
        synced_to_hr,
        synced_to_payroll,
        total_holidays,
    )

    return {
        'status': 'success',
        'synced_to_hr': synced_to_hr,
        'synced_to_payroll': synced_to_payroll,
        'total_holidays': total_holidays,
    }
