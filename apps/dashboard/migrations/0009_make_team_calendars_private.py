"""Make team-linked calendar workspaces private.

The ``create_team_calendar_workspace`` signal previously created every team
calendar with ``is_public=True``. Combined with
``CalendarWorkspace.get_accessible_for_user`` (which grants access to all
public calendars), this leaked every team's calendar — and via the workspace
permission mixin, every team's overtime/standby/leave entries and balances —
to every authenticated user, regardless of team membership or explicit
sharing.

Team calendar visibility is already scoped correctly through:
  - team membership (``my_teams_workspaces`` direct-team branch),
  - ``calendar_group`` sharing (teams with the same group see each other),
  - explicit ``allowed_users`` grants,
  - the TL subtree branch (``get_team_member_ids``).

This migration reverses the signal's wrong default for existing team-linked
workspaces. ``is_public`` remains available for genuinely company-wide
calendars (e.g. a global holiday calendar) that an admin enables
intentionally. It is reversible.
"""
from django.db import migrations


def make_team_calendars_private(apps, schema_editor):
    CalendarWorkspace = apps.get_model('dashboard', 'CalendarWorkspace')
    CalendarWorkspace.objects.filter(
        team__isnull=False,
        is_public=True,
    ).update(is_public=False)


def restore_team_calendars_public(apps, schema_editor):
    # Reversal restores the previous (buggy) default: team-linked calendars
    # become public again. Only used if this migration is rolled back.
    CalendarWorkspace = apps.get_model('dashboard', 'CalendarWorkspace')
    CalendarWorkspace.objects.filter(
        team__isnull=False,
        is_public=False,
    ).update(is_public=True)


class Migration(migrations.Migration):

    dependencies = [
        ('dashboard', '0008_calendarentry_calendar_en_status_5177f7_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(
            make_team_calendars_private,
            reverse_code=restore_team_calendars_public,
        ),
    ]
