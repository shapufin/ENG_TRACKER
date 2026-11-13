"""Who owns an overtime or standby row for a Line Manager or Manager (owner ruling, Option A).

- A decided row (approved or rejected) belongs to the leader who decided it, for as long
  as that person is a leader. Moving the employee to another leader does not move it.
- Any other row (pending, or decided by a non-leader, or with no approver) belongs to the
  employee's current leader.
- Every row has at most one owner, so a leader's export, metric or bundle never counts it
  twice. An employee with both links is owned through the Line Manager (``albanian_tl``)
  first, then the Manager (``italian_tl``).
"""
from django.db.models import Q

DECIDED_STATUSES = ('approved', 'rejected')
TL_ROLE_CODES = ('italian_tl', 'albanian_tl')


def leader_user_ids() -> set[int]:
    """Active users who can hold a leader queue: by role, legacy flag, link target or a lead
    of an ACTIVE team (the same sources as ``UserProfile.is_team_leader``).

    A deactivated or demoted approver, or one who only leads an archived team, is not in this
    set: they cannot open a leader queue, so owning their old decisions would hide those rows
    from everyone. Their decisions follow the employee's current leader (decided 2026-11-13).
    """
    from django.contrib.auth.models import User

    return set(
        User.objects.filter(is_active=True).filter(
            Q(profile__is_italian_tl_role=True)
            | Q(profile__is_albanian_tl_role=True)
            | Q(
                user_roles__is_active=True,
                user_roles__is_deleted=False,
                user_roles__role__code__in=TL_ROLE_CODES,
            )
            | Q(italian_team_members__isnull=False)
            | Q(albanian_team_members__isnull=False)
            | Q(led_teams__is_active=True, led_teams__is_deleted=False)
        ).values_list('id', flat=True).distinct()
    )


def owned_by_leader_q(leader_id: int, leaders: set[int] | None = None, prefix: str = '') -> Q:
    """Q selecting the rows that ``leader_id`` owns.

    ``prefix`` is the lookup path from the row model to its user (``''`` for the log
    models). ``leaders`` may be passed in when many leaders are resolved in one batch.
    """
    if leaders is None:
        leaders = leader_user_ids()
    other_leaders = leaders - {leader_id}

    decided = Q(**{f'{prefix}status__in': DECIDED_STATUSES})
    profile = f'{prefix}user__profile__'
    current_leader_is_me = Q(**{f'{profile}albanian_tl_id': leader_id}) | (
        Q(**{f'{profile}albanian_tl__isnull': True}) & Q(**{f'{profile}italian_tl_id': leader_id})
    )
    # Python twin: only a user in the leader set owns a row as its decider.
    decided_by_me = (
        decided & Q(**{f'{prefix}approved_by_id': leader_id}) if leader_id in leaders else Q(pk__in=[])
    )
    decided_by_other_leader = decided & Q(**{f'{prefix}approved_by_id__in': other_leaders})
    return decided_by_me | (current_leader_is_me & ~decided_by_other_leader)


def owner_leader_id(status, approved_by_id, albanian_tl_id, italian_tl_id, leaders) -> int | None:
    """Python twin of ``owned_by_leader_q``: the single leader that owns one row.

    Keep this in step with the Q above; ``test_owner_parity`` compares the two on
    every scenario. ``leaders`` is the set from :func:`leader_user_ids`.
    """
    if status in DECIDED_STATUSES and approved_by_id is not None and approved_by_id in leaders:
        return approved_by_id
    return albanian_tl_id if albanian_tl_id is not None else italian_tl_id


def owner_team_id(leader_team_ids, employee_team_ids) -> int | None:
    """The team a row sits in under its owner: the lowest team the employee is in now
    that the owner leads or manages, else the owner's lowest team, else None.

    ``leader_team_ids`` are the owner's snapshot teams (``leader_team_pairs``). Using one
    team per row is what stops a row from being counted in two teams of one leader.
    """
    shared = sorted(set(employee_team_ids) & set(leader_team_ids))
    if shared:
        return shared[0]
    return min(leader_team_ids) if leader_team_ids else None
