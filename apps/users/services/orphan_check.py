"""Read-only report of records nothing points at: the mistakes manual team setup invites.

Nothing here writes. Archived teams and clients, inactive users, staff/superusers and users whose
role does not belong in a team (HR, HBPR, Control Room, admin) are never reported.
"""
from django.contrib.auth.models import User
from django.db.models import Count, Q

from apps.overtime.models import Client
from apps.permissions.models import UserRole
from apps.users.models import Team

# Roles whose holders legitimately sit outside every team.
NON_TEAM_ROLES = ('hr', 'hbpr', 'cr_admin', 'admin')


def _users_without_team():
    # Same three sources as the Admin Users role tabs: the role cache, the legacy HR flag
    # (the legacy update path sets it without touching the cache) and the UserRole rows.
    outside_team = Q(profile__is_hr_user=True) | Q(
        pk__in=UserRole.objects.filter(is_active=True, role__code__in=NON_TEAM_ROLES).values('user_id')
    )
    for role in NON_TEAM_ROLES:
        outside_team |= Q(profile__role_codes__icontains=role)
    users = (
        User.objects.filter(is_active=True, is_staff=False, is_superuser=False)
        .exclude(outside_team)
        # Single-condition excludes: "has a membership in an ACTIVE team", per related row.
        .exclude(profile__teams__is_active=True)
        .exclude(led_teams__is_active=True)
        .order_by('username')
    )
    return [
        {'id': u.id, 'username': u.username, 'full_name': u.get_full_name() or u.username}
        for u in users
    ]


def _team_rows(queryset):
    return [
        {'id': t.id, 'name': t.name, 'code': t.code, 'members_count': t.member_total}
        for t in queryset.annotate(member_total=Count('members', distinct=True)).order_by('name')
    ]


def find_orphans():
    teams = Team.objects.active()
    clients = Client.objects.filter(is_active=True, assigned_users__isnull=True).order_by('name')
    return {
        'users_without_team': _users_without_team(),
        'teams_without_leader': _team_rows(teams.filter(team_leader__isnull=True)),
        'empty_teams': _team_rows(teams.filter(members__isnull=True)),
        'unassigned_clients': [{'id': c.id, 'name': c.name, 'code': c.code} for c in clients],
    }
