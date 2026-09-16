"""Level-aware Tech assignment handling.

Single source of truth for reading, validating and writing
``UserProfile.techs`` now that the M2M carries a held level (``UserTech``).

Every write path funnels through here — the profile serializer, the admin
bulk update, create_user/update_user, and the Tech member dialog — so the
"a level must belong to its own Tech" rule and the legacy plain-ID payload
shape cannot drift between call sites.
"""
from django.db import transaction
from django.utils import timezone

from apps.users.models import Tech, TechLevel, UserTech


class TechAssignmentError(ValueError):
    """Raised for a malformed or invalid Tech assignment payload.

    Callers translate this into a 400 — DRF serializers re-raise it as a
    ValidationError, viewset actions return its message directly.
    """


def normalize_tech_payload(raw):
    """Normalize either accepted payload shape into a list of entries.

    Accepted forms, mixable within one list:

    - ``[1, 2]`` — the legacy plain-ID form. Still sent by the data-import
      users importer and by older frontend builds. Means "assign these
      Techs and leave any existing level alone".
    - ``[{"tech": 1, "level": 3}, {"tech": 2, "level": None}]`` — the
      level-aware form. An explicit ``level`` (including ``null``) is applied.

    Returns ``[{'tech_id': int, 'level_id': int|None, 'level_given': bool}]``.
    Raises ``TechAssignmentError`` on anything else.
    """
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise TechAssignmentError('techs must be an array.')

    entries = []
    seen = set()
    for item in raw:
        if isinstance(item, dict):
            if 'tech' not in item:
                raise TechAssignmentError('Each tech entry requires a "tech" id.')
            tech_id = _as_id(item['tech'], 'tech')
            level_given = 'level' in item
            raw_level = item.get('level')
            level_id = None if raw_level is None else _as_id(raw_level, 'level')
        elif isinstance(item, bool):
            # bool is an int subclass; reject before _as_id accepts it.
            raise TechAssignmentError('techs must contain Tech ids or objects.')
        elif isinstance(item, (int, str)):
            tech_id = _as_id(item, 'tech')
            level_given = False
            level_id = None
        else:
            raise TechAssignmentError('techs must contain Tech ids or objects.')

        if tech_id in seen:
            raise TechAssignmentError('techs must not contain duplicates.')
        seen.add(tech_id)
        entries.append({
            'tech_id': tech_id,
            'level_id': level_id,
            'level_given': level_given,
        })
    return entries


def _as_id(value, label):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise TechAssignmentError(f'{label} must be an integer id.')


def validate_tech_assignments(
    entries, *, profile=None, already_assigned_ids=None, check_inactive=True,
    for_new_user=False,
):
    """Validate normalized entries against the catalog.

    Checks, in order: every Tech exists; inactive Techs are only allowed when
    already assigned (the pre-existing rule, preserved verbatim); every level
    exists and belongs to the Tech it grades.

    The "already assigned" set comes from ``profile``, or from
    ``already_assigned_ids`` when the caller has it in hand — bulk update passes
    a pre-fetched set so validating N users costs one query, not N.

    ``check_inactive=False`` validates only shape, existence and level/Tech
    pairing. Use it when the inactive rule has to be applied per user
    afterwards; never as a way to skip the rule entirely.

    ``for_new_user`` only selects the wording of the inactive-Tech error. It is
    passed explicitly rather than inferred from an empty assignment set, because
    an existing user with no Techs is not a new user.
    """
    if not entries:
        return entries

    tech_ids = [entry['tech_id'] for entry in entries]
    techs = {tech.id: tech for tech in Tech.objects.filter(id__in=tech_ids)}
    missing = sorted(set(tech_ids) - set(techs))
    if missing:
        raise TechAssignmentError(f'Unknown Tech ids: {missing}')

    if check_inactive:
        if already_assigned_ids is None:
            already_assigned_ids = (
                set(profile.techs.values_list('id', flat=True))
                if profile is not None
                else set()
            )
        for tech_id, tech in techs.items():
            if tech.is_active or tech_id in already_assigned_ids:
                continue
            if for_new_user:
                raise TechAssignmentError(
                    'Cannot assign inactive Techs to new users. '
                    'Use the Tech member management dialog after creation.'
                )
            raise TechAssignmentError(
                f"Cannot assign inactive Tech '{tech.name}'. "
                f'Use the Tech member management dialog instead.'
            )

    level_ids = [entry['level_id'] for entry in entries if entry['level_id'] is not None]
    if level_ids:
        levels = {
            level.id: level
            for level in TechLevel.objects.filter(id__in=level_ids).select_related('tech')
        }
        missing_levels = sorted(set(level_ids) - set(levels))
        if missing_levels:
            raise TechAssignmentError(f'Unknown Tech level ids: {missing_levels}')
        for entry in entries:
            if entry['level_id'] is None:
                continue
            level = levels[entry['level_id']]
            if level.tech_id != entry['tech_id']:
                raise TechAssignmentError(
                    f"Level '{level.code}' belongs to {level.tech.code}, "
                    f"not {techs[entry['tech_id']].code}."
                )
    return entries


@transaction.atomic
def apply_tech_assignments(profile, entries, *, assigned_by=None):
    """Replace the profile's Tech assignments with ``entries``.

    Replace semantics, matching the ``.techs.set()`` call this supersedes:
    Techs absent from ``entries`` are unassigned.

    An entry that did not carry an explicit level keeps whatever level the
    existing row already had, so a legacy plain-ID payload never silently
    downgrades somebody to ungraded.
    """
    existing = {
        assignment.tech_id: assignment
        for assignment in UserTech.objects.filter(user_profile=profile)
    }
    wanted = {entry['tech_id']: entry for entry in entries}

    stale = set(existing) - set(wanted)
    if stale:
        UserTech.objects.filter(user_profile=profile, tech_id__in=stale).delete()

    now = timezone.now()
    for tech_id, entry in wanted.items():
        assignment = existing.get(tech_id)
        if assignment is None:
            UserTech.objects.create(
                user_profile=profile,
                tech_id=tech_id,
                level_id=entry['level_id'],
                assigned_at=now,
                assigned_by=assigned_by,
            )
            continue
        if entry['level_given'] and assignment.level_id != entry['level_id']:
            assignment.level_id = entry['level_id']
            assignment.assigned_at = now
            assignment.assigned_by = assigned_by
            assignment.save(update_fields=['level', 'assigned_at', 'assigned_by'])


def set_tech_assignments(profile, raw, *, assigned_by=None):
    """normalize + validate + apply, for callers holding a raw payload."""
    entries = validate_tech_assignments(
        normalize_tech_payload(raw), profile=profile
    )
    apply_tech_assignments(profile, entries, assigned_by=assigned_by)
    return entries


def serialize_assignments(profile):
    """Active Tech assignments with their level, ordered by Tech name.

    Uses the ``tech_assignments`` prefetch when the caller set one up, and
    otherwise falls back to a single ``select_related`` query. The fallback
    matters: ``UserSerializer`` is nested under several parents (profiles,
    ``TeamSerializer.team_leader``, …) and each reaches ``user.profile``, a
    reverse OneToOne that ``select_related('user')`` leaves cold. Without the
    fallback those paths would lazily fetch ``tech`` and ``level`` one row at a
    time. Prefetch ``tech_assignments__tech`` / ``__level`` on hot list
    endpoints anyway — the fallback is a floor, not a substitute.

    An inactive level is reported as ``None``: the person keeps the Tech, but
    a retired grade must not keep showing up as their current one.
    """
    cache = getattr(profile, '_prefetched_objects_cache', {})
    rows = (
        profile.tech_assignments.all()
        if 'tech_assignments' in cache
        else profile.tech_assignments.select_related('tech', 'level')
    )
    assignments = [
        assignment for assignment in rows
        if assignment.tech.is_active
    ]
    assignments.sort(key=lambda assignment: assignment.tech.name)
    return [
        {
            'id': assignment.tech.id,
            'name': assignment.tech.name,
            'code': assignment.tech.code,
            'level': _level_payload(assignment.level),
        }
        for assignment in assignments
    ]


def format_assignments(profile):
    """Active assignments as display strings, e.g. ``["Infrastructure L3"]``.

    For badge/label surfaces that want text rather than structure: the approval
    queues and the Control Room roster. Reads the ``tech_assignments`` prefetch,
    so callers MUST prefetch ``tech_assignments__tech`` and ``__level`` or this
    is an N+1.
    """
    return [
        f'{entry["name"]} {entry["level"]["code"]}' if entry['level'] else entry['name']
        for entry in serialize_assignments(profile)
    ]


def _level_payload(level):
    if level is None or not level.is_active:
        return None
    return {
        'id': level.id,
        'name': level.name,
        'code': level.code,
        'rank': level.rank,
    }
