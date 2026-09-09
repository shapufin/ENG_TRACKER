# Generated manually to restore team memberships lost in migration 0008

import logging

from django.db import migrations

logger = logging.getLogger(__name__)


def restore_team_memberships(apps, schema_editor):
    """
    Restore team memberships by assigning all users to SIAE_TEAM.
    This is a temporary fix since original team data was lost when
    migration 0008 removed the team FK without migrating the data.
    """
    UserProfile = apps.get_model('users', 'UserProfile')
    Team = apps.get_model('users', 'Team')
    TeamMembership = apps.get_model('users', 'TeamMembership')

    # Ensure SIAE_TEAM exists (fresh test databases may not have it)
    siae_team, created = Team.objects.get_or_create(
        code='siae',
        defaults={'name': 'SIAE Team', 'calendar_group': 'it'}
    )
    if created:
        logger.info("Created missing SIAE_TEAM (code='siae')")

    # Assign all users to SIAE_TEAM
    count = 0
    for profile in UserProfile.objects.all().iterator():
        # Check if user already has this team membership
        if not TeamMembership.objects.filter(user_profile=profile, team=siae_team).exists():
            TeamMembership.objects.create(
                user_profile=profile,
                team=siae_team,
                is_primary_team=True,
                joined_date=profile.hire_date
            )
            count += 1
            logger.info("Created TeamMembership for %s", profile.user.username)

    logger.info("Restored %d team memberships to SIAE_TEAM", count)


def reverse_restore_team_memberships(apps, schema_editor):
    """
    Reverse: Remove all team memberships created by this migration.
    """
    TeamMembership = apps.get_model('users', 'TeamMembership')
    # Remove all team memberships (this is a destructive reverse)
    TeamMembership.objects.all().delete()
    logger.info("Removed all team memberships")


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_teammembership_and_more'),
    ]

    operations = [
        migrations.RunPython(restore_team_memberships, reverse_restore_team_memberships),
    ]
