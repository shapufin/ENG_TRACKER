"""What deactivating a team leader leaves behind.

Deactivation changes nothing else on purpose: ``Team.team_leader`` and members' TL links stay,
so reactivating the user restores everything. This only reports who is left pointing at them.
"""
from django.db.models import Q

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
    pending = _pending_requests_of_linked_members(user)
    if pending:
        warnings.append(
            f'{pending} pending request{"" if pending == 1 else "s"} from members who link to {user.username}: '
            'they go to the other leader or nobody until reassigned.'
        )
    hbpr = _open_hbpr_assignments(user)
    if hbpr:
        warnings.append(
            f'{user.username} has {hbpr} open HBPR assignment{"" if hbpr == 1 else "s"}: '
            'the HBPR loses this scope when the Line Manager is deactivated; end or reassign it.'
        )
    return warnings


def _pending_requests_of_linked_members(user):
    """Pending overtime, standby and leave rows of members whose TL link points at ``user``."""
    from apps.leave_management.models import LeaveRequest
    from apps.overtime.models import OvertimeLog
    from apps.standby.models import StandbyLog

    linked = Q(user__profile__albanian_tl=user) | Q(user__profile__italian_tl=user)
    return sum(
        model.objects.filter(linked, status='pending').count()
        for model in (OvertimeLog, StandbyLog, LeaveRequest)
    )


def _open_hbpr_assignments(user):
    from apps.users.models.hbpr import HbprAlbanianTlAssignment
    from apps.users.services.hbpr_assignments import unfinished_q

    return HbprAlbanianTlAssignment.objects.filter(unfinished_q(), albanian_tl=user).count()
