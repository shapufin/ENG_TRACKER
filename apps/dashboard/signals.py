"""
Calendar workspace signals for automatic workspace creation.

This module contains Django signals to automatically create a CalendarWorkspace
when a new Team is created, ensuring every team has a corresponding calendar.
"""

import logging
from decimal import Decimal
from django.db.models.signals import post_save, post_delete, pre_delete, pre_save
from django.dispatch import receiver
from apps.users.models import Team
from apps.dashboard.models import CalendarWorkspace
from apps.dashboard.models.calendar import PublicHoliday

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Team)
def create_team_calendar_workspace(sender, instance, created, **kwargs):
    """
    Automatically create a CalendarWorkspace when a new Team is created.
    The workspace will be linked to the team and have a code based on the team code.
    """
    if created:
        workspace_code = f"{instance.code}_calendar"
        workspace_name = f"{instance.name} Calendar"

        workspace, workspace_created = CalendarWorkspace.objects.get_or_create(
            code=workspace_code,
            defaults={
                'name': workspace_name,
                'team': instance,
                'is_public': False,
                'color': '#3b82f6',
                'default_view': 'month',
                'show_overtime': True,
                'show_standby': True,
                'show_vacation': True,
                'show_holidays': True,
            }
        )
        # A workspace kept after its team was deleted (it held holidays) is
        # detached; re-creating the team under the same code must reattach it.
        if not workspace_created and workspace.team_id is None:
            # The new team is a new audience: drop the old team's sharing.
            workspace.team = instance
            workspace.is_public = False
            workspace.save(update_fields=['team', 'is_public'])
            workspace.allowed_users.clear()


@receiver(pre_delete, sender=Team)
def remove_team_calendar_workspace(sender, instance, **kwargs):
    """Drop the team's auto-created workspace so it is not left orphaned.

    A workspace that already holds holidays is kept (it would otherwise take
    that data with it); the FK's SET_NULL detaches it from the deleted team.
    """
    workspace = CalendarWorkspace.objects.filter(
        team=instance, code=f"{instance.code}_calendar"
    ).first()
    if workspace and not PublicHoliday.objects.filter(calendar=workspace).exists():
        workspace.delete()


def _restore_payroll_workday(h_date):
    """Restore normal working hours on a PayrollWorkday if no other global holiday exists on that date."""
    if PublicHoliday.objects.filter(calendar__isnull=True, date=h_date).exists():
        return
    try:
        from apps.plugins.models import Plugin
        if not Plugin.objects.filter(name='payroll', is_enabled=True).exists():
            return
    except Exception:
        return
    try:
        from plugins.payroll.models import PayrollWorkCalendar, PayrollWorkday
        is_weekend = h_date.weekday() >= 5
        calendars = PayrollWorkCalendar.objects.filter(year=h_date.year)
        for cal in calendars:
            PayrollWorkday.objects.filter(calendar=cal, date=h_date).update(
                is_holiday=False,
                holiday_name='',
                is_working_day=not is_weekend,
                standard_hours=Decimal('8') if not is_weekend else Decimal('0'),
            )
    except Exception:
        logger.warning('Payroll workday restore failed for %s', h_date, exc_info=True)


@receiver(pre_save, sender=PublicHoliday)
def capture_previous_holiday_state(sender, instance, **kwargs):
    """Capture previous date so if a holiday date changes, the old date is restored in Payroll."""
    if instance.pk:
        try:
            old = PublicHoliday.objects.filter(pk=instance.pk).values('date', 'calendar').first()
            if old:
                instance._previous_date = old['date']
                instance._previous_calendar = old['calendar']
        except Exception:
            pass


@receiver(post_save, sender=PublicHoliday)
def sync_public_holiday_to_payroll(sender, instance, **kwargs):
    """When a global public holiday is saved, mirror it to any existing PayrollWorkCalendar."""
    if instance.calendar is not None:
        prev_cal = getattr(instance, '_previous_calendar', None)
        prev_date = getattr(instance, '_previous_date', None)
        if prev_cal is None and prev_date:
            _restore_payroll_workday(prev_date)
        return

    # Handle date change: restore old date if it changed
    prev_date = getattr(instance, '_previous_date', None)
    if prev_date and prev_date != instance.date:
        _restore_payroll_workday(prev_date)

    try:
        from apps.plugins.models import Plugin
        if not Plugin.objects.filter(name='payroll', is_enabled=True).exists():
            return
    except Exception:
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
        # Never block saving a holiday, but a silent failure leaves HR and
        # Payroll calendars out of step.
        logger.warning('Payroll holiday mirror failed for %s', instance.date, exc_info=True)


@receiver(post_delete, sender=PublicHoliday)
def remove_public_holiday_from_payroll(sender, instance, **kwargs):
    """When a global public holiday is deleted, restore normal workday in PayrollWorkCalendar."""
    if instance.calendar is not None:
        return
    _restore_payroll_workday(instance.date)


