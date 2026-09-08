"""
Calendar workspace signals for automatic workspace creation.

This module contains Django signals to automatically create a CalendarWorkspace
when a new Team is created, ensuring every team has a corresponding calendar.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.users.models import Team
from apps.dashboard.models import CalendarWorkspace


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
