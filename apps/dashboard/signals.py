"""
Calendar workspace signals for automatic workspace creation.

This module contains Django signals to automatically create a CalendarWorkspace
when a new Team is created, ensuring every team has a corresponding calendar.
"""

from decimal import Decimal
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from apps.users.models import Team
from apps.dashboard.models import CalendarWorkspace
from apps.dashboard.models.calendar import PublicHoliday


@receiver(post_save, sender=Team)
def create_team_calendar_workspace(sender, instance, created, **kwargs):
    """
    Automatically create a CalendarWorkspace when a new Team is created.
    The workspace will be linked to the team and have a code based on the team code.
    """
    if created:
        workspace_code = f"{instance.code}_calendar"
        workspace_name = f"{instance.name} Calendar"
        
        CalendarWorkspace.objects.get_or_create(
            code=workspace_code,
            defaults={
                'name': workspace_name,
                'team': instance,
                # Team calendars are NOT public by default. Visibility is
                # scoped via team membership + calendar_group (see
                # CalendarWorkspace.get_accessible_for_user and
                # my_teams_workspaces) and explicit allowed_users sharing.
                # is_public is reserved for genuinely company-wide calendars
                # (e.g. a global holiday calendar) that an admin sets
                # intentionally. Making team calendars public leaked every
                # team's calendar to every user.
                'is_public': False,
                'color': '#3b82f6',  # Default blue color
                'default_view': 'month',
                'show_overtime': True,
                'show_standby': True,
                'show_vacation': True,
                'show_holidays': True,
            }
        )


@receiver(post_save, sender=PublicHoliday)
def sync_public_holiday_to_payroll(sender, instance, **kwargs):
    """When a global public holiday is saved, mirror it to any existing PayrollWorkCalendar."""
    if instance.calendar is not None:
        return
    try:
        from plugins.payroll.models import PayrollWorkCalendar, PayrollWorkday
        calendars = PayrollWorkCalendar.objects.filter(year=instance.date.year)
        for cal in calendars:
            PayrollWorkday.objects.update_or_create(
                calendar=cal,
                date=instance.date,
                defaults={
                    'is_holiday': True,
                    'is_working_day': False,
                    'holiday_name': instance.name,
                    'standard_hours': Decimal('0'),
                },
            )
    except Exception:
        # If payroll app/tables are not installed or active, fail gracefully
        pass


@receiver(post_delete, sender=PublicHoliday)
def remove_public_holiday_from_payroll(sender, instance, **kwargs):
    """When a global public holiday is deleted, restore normal workday in PayrollWorkCalendar."""
    if instance.calendar is not None:
        return
    try:
        from plugins.payroll.models import PayrollWorkCalendar, PayrollWorkday
        # If another global holiday still exists on this date, retain holiday status
        if PublicHoliday.objects.filter(calendar__isnull=True, date=instance.date).exists():
            return
        is_weekend = instance.date.weekday() >= 5
        calendars = PayrollWorkCalendar.objects.filter(year=instance.date.year)
        for cal in calendars:
            PayrollWorkday.objects.filter(calendar=cal, date=instance.date).update(
                is_holiday=False,
                holiday_name='',
                is_working_day=not is_weekend,
                standard_hours=Decimal('8') if not is_weekend else Decimal('0'),
            )
    except Exception:
        pass

