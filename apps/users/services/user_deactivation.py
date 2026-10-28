"""What deactivating a team leader leaves behind.

Deactivation changes nothing else on purpose: ``Team.team_leader`` and members' TL links stay,
so reactivating the user restores everything. This only reports who is left pointing at them.
"""
from apps.users.models import Team, UserProfile


def deactivation_warnings(user):
    """Human-readable lines naming the teams and members that depend on ``user`` as a leader."""
    warnings = []
    for team in Team.objects.filter(team_leader=user, is_active=True).order_by('name'):
        members = UserProfile.objects.filter(teams=team).exclude(user=user).count()
        warnings.append(
            f'{user.username} leads the active team "{team.name}" ({members} member{"" if members == 1 else "s"}): '
            'assign a new team leader.'
        )
    linked = UserProfile.objects.filter(italian_tl=user).union(UserProfile.objects.filter(albanian_tl=user)).count()
    if linked:
        warnings.append(
            f'{linked} member{"" if linked == 1 else "s"} still point to {user.username} through a TL link: '
            'reassign it or their requests have no active approver.'
        )
    return warnings
