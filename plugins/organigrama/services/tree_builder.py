"""
Tree builder for the Organigrama plugin.

Builds a people-centric org tree from two sources:
1. People hierarchy (primary): UserProfile.italian_tl + albanian_tl FKs.
2. Technology classification (secondary): UserProfile.techs.

Tree structure (build_full_tree — the admin/HR company-wide view):
  Italian TL (root, type=person)
  └── Albanian TL (type=person)
      ├── Italian TL node (nested, only if an employee's own italian_tl
      │   FK differs from the Albanian TL's own manager above)
      │   └── Employee (type=person)
      ├── Tech node (type=tech, if assignments exist)
      │   └── Employee (type=person)
      └── Employee (type=person, direct child if no Tech assignment)

build_subtree()'s Albanian-TL case (a logged-in Albanian TL viewing their
own chart) does NOT match the shape above: an Albanian TL can cover
several teams that each have a different Italian TL, and must never be
the tree's root above one, so it produces one root PER distinct Italian
TL instead — each `Italian TL -> Albanian TL (repeated per branch) ->
that branch's employees only`.

Scoping reuses UserProfile.get_team_member_ids() for TL scope, matching
the overtime/standby/analytics permission model.
"""
import logging
from typing import Dict, List, Any, Set

from django.contrib.auth.models import User
from django.db.models import Q

from apps.users.models.core import Tech, UserProfile
from apps.users.services.tech_assignments import format_assignments

logger = logging.getLogger(__name__)


def role_badge(profile: UserProfile) -> str:
    """Determine the role badge for a user profile.

    Uses the already-loaded role flags / ``role_codes`` cache instead of the
    ``is_italian_tl`` / ``is_albanian_tl`` properties, which issue
    ``.exists()`` queries per call and would cause an N+1 when building a tree
    with many person nodes.

    This is the single source of truth for TL/HR/admin classification across
    the tree builder and the subtree ViewSet — both delegate here so the
    Italian/Albanian TL detection logic cannot drift between call sites.
    """
    role_codes = profile.role_codes or []
    if profile.is_italian_tl_role or "italian_tl" in role_codes:
        return "italian_tl"
    if profile.is_albanian_tl_role or "albanian_tl" in role_codes:
        return "albanian_tl"
    if profile.is_hr_user or "hr" in role_codes:
        return "hr"
    if profile.user.is_superuser or profile.user.is_staff:
        return "admin"
    return "employee"


# Back-compat alias for any internal callers still importing the private name.
_role_badge = role_badge


def _person_node(user: User, profile: UserProfile) -> Dict[str, Any]:
    """Build a person node.

    ``tech_levels`` are display strings ("Infrastructure L3") read from the
    ``tech_assignments`` prefetch — callers MUST prefetch
    ``profile__tech_assignments__tech`` / ``__level`` or this is an N+1.
    """
    return {
        "type": "person",
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name() or user.username,
        "role_badge": role_badge(profile),
        "tech_levels": format_assignments(profile),
        "children": [],
    }


def _tech_node(tech: Tech) -> Dict[str, Any]:
    """Build a technology grouping node."""
    return {
        "type": "tech",
        "id": tech.id,
        "name": tech.name,
        "code": tech.code,
        "children": [],
    }


def _get_italian_tls() -> List[User]:
    """Get all active Italian TLs (role-flagged)."""
    return list(
        User.objects.filter(profile__is_italian_tl_role=True, is_active=True)
        .select_related("profile")
        .prefetch_related(
            "profile__tech_assignments__tech", "profile__tech_assignments__level"
        )
        .distinct()
        .order_by("username")
    )


def _get_albanian_tls_for_italian(italian_tl: User) -> List[User]:
    """Get active Albanian TLs reporting to a specific Italian TL.

    Must filter on ``is_albanian_tl_role``, not just ``italian_tl`` being
    set — regular employees can have their own ``italian_tl`` FK too (each
    team has its own Italian TL), and without this filter an employee with
    no Albanian TL role would be misidentified as one and wrongly promoted
    into the tree as a peer of real Albanian TLs, directly under the
    Italian TL root.
    """
    return list(
        User.objects.filter(
            profile__italian_tl=italian_tl,
            profile__is_albanian_tl_role=True,
            is_active=True,
        )
        .select_related("profile", "profile__italian_tl")
        .prefetch_related(
            "profile__tech_assignments__tech", "profile__tech_assignments__level"
        )
        .distinct()
        .order_by("username")
    )


def _get_employees_for_albanian(albanian_tl: User) -> List[UserProfile]:
    """Get active employee profiles reporting to an Albanian TL (FK or real Team)."""
    # Direct FK assignments
    direct = UserProfile.objects.filter(
        albanian_tl=albanian_tl, user__is_active=True
    )
    # Team members of teams led by this TL
    led_team_ids = set(albanian_tl.led_teams.values_list("id", flat=True))
    if led_team_ids:
        # Combine via Q objects (avoids "cannot combine unique with non-unique")
        profiles = UserProfile.objects.filter(
            Q(albanian_tl=albanian_tl) | Q(teams__id__in=led_team_ids),
            user__is_active=True,
        ).exclude(user=albanian_tl).distinct()
    else:
        profiles = direct.exclude(user=albanian_tl)
    return list(
        profiles.select_related("user", "albanian_tl", "italian_tl")
        .order_by("user__username")
    )


def _batch_get_albanian_tls(
    italian_tls: List[User],
) -> Dict[int, List[User]]:
    """Batch-fetch all active Albanian TLs for multiple Italian TLs (1 query).

    Returns a mapping of {italian_tl_id: [albanian_tl_users]}.

    Must filter on ``is_albanian_tl_role``, not just ``italian_tl`` being
    set — see ``_get_albanian_tls_for_italian`` for why: regular employees
    can have their own ``italian_tl`` FK too, and without this filter one
    would be misidentified as an Albanian TL and wrongly promoted into the
    tree as a root-adjacent node.
    """
    if not italian_tls:
        return {}
    italian_ids = [it.id for it in italian_tls]
    albanian_tls = list(
        User.objects.filter(
            profile__italian_tl_id__in=italian_ids,
            profile__is_albanian_tl_role=True,
            is_active=True,
        )
        .select_related("profile", "profile__italian_tl")
        .prefetch_related(
            "profile__tech_assignments__tech", "profile__tech_assignments__level"
        )
        .distinct()
        .order_by("username")
    )
    by_italian: Dict[int, List[User]] = {}
    for al in albanian_tls:
        it_id = al.profile.italian_tl_id
        if it_id is not None:
            by_italian.setdefault(it_id, []).append(al)
    return by_italian


def _batch_get_employees(
    albanian_tls: List[User],
) -> Dict[int, List[UserProfile]]:
    """Batch-fetch all active employees for multiple Albanian TLs (2 queries).

    Employees are matched via direct ``albanian_tl`` FK or membership in a team
    led by one of the Albanian TLs. Returns a mapping of
    {albanian_tl_id: [employee_profiles]}.

    Grouping: a profile is assigned to its ``albanian_tl`` FK when that FK is
    one of the supplied Albanian TLs; otherwise it is assigned to the team
    leader of the first matching led-team it belongs to.
    """
    if not albanian_tls:
        return {}
    al_ids = [al.id for al in albanian_tls]
    al_id_set = set(al_ids)

    employees = list(
        UserProfile.objects.filter(
            Q(albanian_tl_id__in=al_ids) | Q(teams__team_leader_id__in=al_ids),
            user__is_active=True,
        )
        .exclude(user_id__in=al_ids)
        .select_related("user", "albanian_tl", "italian_tl")
        .prefetch_related(
            "teams", "techs", "tech_assignments__tech", "tech_assignments__level"
        )
        .distinct()
        .order_by("user__username")
    )

    # Build team_id -> leader_id map from the prefetched teams so we can group
    # team-membership-only employees (no albanian_tl FK) under their leader.
    team_to_leader: Dict[int, int] = {}
    for profile in employees:
        for team in profile.teams.all():
            if team.team_leader_id in al_id_set:
                team_to_leader.setdefault(team.id, team.team_leader_id)

    by_albanian: Dict[int, List[UserProfile]] = {al_id: [] for al_id in al_ids}
    for profile in employees:
        leader_id = profile.albanian_tl_id
        if leader_id not in al_id_set:
            # Fall back to team-leader mapping.
            for team in profile.teams.all():
                mapped = team_to_leader.get(team.id)
                if mapped is not None:
                    leader_id = mapped
                    break
        if leader_id in al_id_set:
            by_albanian.setdefault(leader_id, []).append(profile)
    return by_albanian


def _assign_employees_to_techs(
    employees: List[UserProfile],
) -> Dict[str, List[Dict[str, Any]]]:
    """Group employees under their active Tech assignments.

    Users without a Tech remain direct children. A multi-Tech user appears
    under each assigned Tech, while the scope still comes from TL authority.
    """
    tech_profiles: Dict[int, List[UserProfile]] = {}
    tech_objects: Dict[int, Tech] = {}
    for profile in employees:
        for tech in profile.techs.all():
            if not tech.is_active:
                continue
            tech_objects[tech.id] = tech
            tech_profiles.setdefault(tech.id, []).append(profile)

    assigned_profile_ids: Set[int] = set()
    tech_nodes: List[Dict[str, Any]] = []
    for tech in sorted(tech_objects.values(), key=lambda item: item.name):
        node = _tech_node(tech)
        for profile in tech_profiles[tech.id]:
            node["children"].append(_person_node(profile.user, profile))
            assigned_profile_ids.add(profile.id)
        tech_nodes.append(node)
    direct = [
        _person_node(profile.user, profile)
        for profile in employees
        if profile.id not in assigned_profile_ids
    ]
    return {"tech_nodes": tech_nodes, "direct": direct}


def build_full_tree() -> Dict[str, Any]:
    """Build the full company tree (for admin/HR).

    Batched to avoid N+1: 1 (italian_tls) + 1 (albanian_tls) + 2 (employees +
    teams/Tech prefetch) + 1 (any "foreign" Italian TLs an Albanian TL's
    employees report to, across the whole tree) with no per-node queries.
    """
    roots: List[Dict[str, Any]] = []
    total_nodes = 0

    # Query 1: all Italian TLs
    italian_tls = _get_italian_tls()

    # Query 2: all Albanian TLs grouped by italian_tl_id
    albanian_tls_by_italian = _batch_get_albanian_tls(italian_tls)
    all_albanian_tls: List[User] = []
    for al_list in albanian_tls_by_italian.values():
        all_albanian_tls.extend(al_list)

    # Query 3: all employees grouped by Albanian TL (+ Tech prefetch)
    employees_by_albanian = _batch_get_employees(all_albanian_tls)

    # Query 4: any Italian TL an employee's own italian_tl FK points to,
    # batched across every Albanian TL up front — _attach_employees_by_italian_tl
    # would otherwise issue one query per Albanian TL that has such employees.
    foreign_it_ids: Set[int] = {
        emp.italian_tl_id
        for employees in employees_by_albanian.values()
        for emp in employees
        if emp.italian_tl_id is not None
    }
    italian_tls_by_id = _fetch_italian_tls_by_id(foreign_it_ids)

    for it_user in italian_tls:
        it_node = _person_node(it_user, it_user.profile)
        total_nodes += 1

        for al_user in albanian_tls_by_italian.get(it_user.id, []):
            al_node = _person_node(al_user, al_user.profile)
            total_nodes += 1

            employees = employees_by_albanian.get(al_user.id, [])
            total_nodes += _attach_employees_by_italian_tl(
                al_node, al_user, employees,
                already_shown_it_id=it_user.id,
                italian_tls_by_id=italian_tls_by_id,
            )

            it_node["children"].append(al_node)

        roots.append(it_node)

    return {"roots": roots, "scope": "full", "total_nodes": total_nodes}


def _attach_members(
    node: Dict[str, Any],
    employees: List[UserProfile],
) -> int:
    """Attach employees grouped by Tech, retaining direct unassigned users."""
    grouped = _assign_employees_to_techs(employees)
    added = 0
    for tech_node in grouped["tech_nodes"]:
        node["children"].append(tech_node)
        added += 1 + len(tech_node["children"])
    for direct_emp in grouped["direct"]:
        node["children"].append(direct_emp)
        added += 1
    return added


def _fetch_italian_tls_by_id(italian_tl_ids: Set[int]) -> Dict[int, User]:
    """Batched, not per-employee's .italian_tl — that lacks the
    tech_assignments prefetch _person_node's format_assignments needs.
    """
    if not italian_tl_ids:
        return {}
    return {
        u.id: u
        for u in User.objects.filter(id__in=italian_tl_ids)
        .select_related("profile")
        .prefetch_related(
            "profile__tech_assignments__tech", "profile__tech_assignments__level"
        )
    }


def _attach_employees_by_italian_tl(
    al_node: Dict[str, Any],
    al_user: User,
    employees: List[UserProfile],
    already_shown_it_id: int,
    italian_tls_by_id: Dict[int, User],
) -> int:
    """Nest an Albanian TL's employees under their own Italian TL.

    Used by build_full_tree(), inside its per-(Italian TL, Albanian TL)
    loop. One Albanian TL can be shared across teams that each have a
    DIFFERENT Italian TL (Italian TL is senior — confirmed org model).
    Employees whose own ``italian_tl`` FK differs from
    ``already_shown_it_id`` (the Italian TL already shown one level up —
    the Albanian TL's own manager, in this caller) get a nested person-node
    for their own Italian TL. Employees with no ``italian_tl`` FK, or whose
    FK matches ``already_shown_it_id``, attach directly (grouped by Tech) —
    this is both the common case and avoids a redundant duplicate node for
    an Italian TL already visible one level up.

    ``italian_tls_by_id``: a map pre-batched across every Albanian TL in the
    caller's loop, so this function never issues its own query — see
    build_full_tree()'s "Query 4" for why.
    """
    total_nodes = 0
    by_italian: Dict[int, List[UserProfile]] = {}
    direct: List[UserProfile] = []
    italian_tl_ids: Set[int] = set()
    for emp_profile in employees:
        it_tl_id = emp_profile.italian_tl_id
        if it_tl_id is None or it_tl_id in (already_shown_it_id, al_user.id):
            direct.append(emp_profile)
            continue
        italian_tl_ids.add(it_tl_id)
        by_italian.setdefault(it_tl_id, []).append(emp_profile)

    if italian_tl_ids:
        for it_id in sorted(by_italian, key=lambda i: italian_tls_by_id[i].username):
            it_tl_user = italian_tls_by_id[it_id]
            it_tl_node = _person_node(it_tl_user, it_tl_user.profile)
            total_nodes += 1
            total_nodes += _attach_members(it_tl_node, by_italian[it_id])
            al_node["children"].append(it_tl_node)

    total_nodes += _attach_members(al_node, direct)
    return total_nodes


def build_subtree(user: User) -> Dict[str, Any]:
    """Build a subtree scoped to a TL (Italian or Albanian).

    Scoping reuses ``UserProfile.get_team_member_ids()`` — the same primitive
    used by overtime/standby/analytics — so the org chart's visibility matches
    the rest of the platform. For an Italian TL the managed set is chained:
    their direct reports (Albanian TLs) plus each Albanian TL's own managed
    users, so the full reporting chain renders while never leaking users
    outside the canonical scope.
    """
    profile = user.profile
    total_nodes = 0
    roots: List[Dict[str, Any]] = []

    if profile.is_italian_tl:
        # Italian TL: visible set = own managed users (Albanian TLs + direct).
        visible_ids = profile.get_team_member_ids()
        albanian_tls = list(
            User.objects.filter(
                id__in=visible_ids,
                is_active=True,
                profile__is_albanian_tl_role=True,
            )
            .select_related("profile", "profile__italian_tl")
            .distinct()
            .order_by("username")
        )

        # Chain: each Albanian TL's managed users become the employee set.
        emp_to_al: Dict[int, int] = {}
        all_emp_ids: Set[int] = set()
        for al_user in albanian_tls:
            for uid in al_user.profile.get_team_member_ids():
                if uid == al_user.id:
                    continue
                emp_to_al.setdefault(uid, al_user.id)
                all_emp_ids.add(uid)

        al_ids = [al.id for al in albanian_tls]
        employees = (
            list(
                UserProfile.objects.filter(
                    user_id__in=all_emp_ids, user__is_active=True
                )
                .select_related("user", "albanian_tl", "italian_tl")
                .prefetch_related(
                    "techs", "tech_assignments__tech", "tech_assignments__level"
                )
                .distinct()
                .order_by("user__username")
            )
            if all_emp_ids
            else []
        )
        employees_by_albanian: Dict[int, List[UserProfile]] = {
            al_id: [] for al_id in al_ids
        }
        for emp_profile in employees:
            leader_id = emp_to_al.get(emp_profile.user_id)
            if leader_id is not None:
                employees_by_albanian.setdefault(leader_id, []).append(emp_profile)

        it_node = _person_node(user, profile)
        total_nodes += 1
        for al_user in albanian_tls:
            al_node = _person_node(al_user, al_user.profile)
            total_nodes += 1
            total_nodes += _attach_members(
                al_node,
                employees_by_albanian.get(al_user.id, []),
            )
            it_node["children"].append(al_node)
        roots.append(it_node)

    elif profile.is_albanian_tl:
        # Albanian TL: visible set = own managed users (employees + team members).
        # One Albanian TL can be shared across teams that each have a
        # DIFFERENT Italian TL (Italian TL is senior — confirmed org model).
        # The Albanian TL must never appear as the tree's root above an
        # Italian TL — including here, in their OWN "my org chart" view.
        # Each Italian TL they report to (their own manager, or a
        # different one via a team whose employees report elsewhere)
        # becomes its own root, with the Albanian TL nested under it,
        # showing only that team's employees.
        visible_ids = profile.get_team_member_ids()
        employees = list(
            UserProfile.objects.filter(
                user_id__in=visible_ids, user__is_active=True
            )
            .exclude(user=user)
            .select_related("user", "albanian_tl", "italian_tl")
            .prefetch_related("techs", "tech_assignments__tech", "tech_assignments__level")
            .distinct()
            .order_by("user__username")
        )

        own_it_tl_id = profile.italian_tl_id
        by_italian: Dict[int, List[UserProfile]] = {}
        unresolved: List[UserProfile] = []
        for emp_profile in employees:
            it_tl_id = emp_profile.italian_tl_id or own_it_tl_id
            if it_tl_id is None or it_tl_id == user.id:
                unresolved.append(emp_profile)
                continue
            by_italian.setdefault(it_tl_id, []).append(emp_profile)

        it_ids = set(by_italian.keys())
        if own_it_tl_id is not None:
            # Show the Albanian TL's own reporting line even when none of
            # their employees happen to sit under it.
            it_ids.add(own_it_tl_id)
            by_italian.setdefault(own_it_tl_id, [])

        italian_tls_by_id = _fetch_italian_tls_by_id(it_ids)
        for it_id in sorted(
            (i for i in it_ids if i in italian_tls_by_id),
            key=lambda i: italian_tls_by_id[i].username,
        ):
            it_tl_user = italian_tls_by_id[it_id]
            it_node = _person_node(it_tl_user, it_tl_user.profile)
            total_nodes += 1
            al_branch = _person_node(user, profile)
            total_nodes += 1
            total_nodes += _attach_members(al_branch, by_italian[it_id])
            it_node["children"].append(al_branch)
            roots.append(it_node)

        # An italian_tl id that couldn't be resolved (stale FK / deleted
        # user) has no row to key a root on — fold its employees into the
        # unresolved group below instead of raising KeyError.
        for it_id in it_ids:
            if it_id not in italian_tls_by_id:
                unresolved.extend(by_italian.get(it_id, []))

        if unresolved:
            # No Italian TL resolvable anywhere (the Albanian TL has no
            # manager either) — fall back to the Albanian TL as root for
            # this leftover group rather than dropping them from the tree.
            al_node = _person_node(user, profile)
            total_nodes += 1
            total_nodes += _attach_members(al_node, unresolved)
            roots.append(al_node)

    return {"roots": roots, "scope": "subtree", "total_nodes": total_nodes}


def _build_chain_tech_siblings(
    employee_profile: UserProfile,
    al_tl: User,
) -> List[Dict[str, Any]]:
    """Build Tech-grouped children for an employee's chain view.

    Returns Tech nodes containing the employee plus their AL-TL teammates
    who share at least one active Tech assignment. Only Techs the employee
    has are rendered. If the employee has no Techs, returns an empty list
    (caller falls back to placing the employee as a direct child).
    """
    employee_tech_ids = {
        t.id for t in employee_profile.techs.all() if t.is_active
    }
    if not employee_tech_ids or not al_tl:
        return []

    # Scope: AL TL's managed members (canonical scope primitive).
    member_ids = al_tl.profile.get_team_member_ids()
    if not member_ids:
        return []

    # Fetch active profiles in scope that share at least one tech with employee.
    colleagues = list(
        UserProfile.objects.filter(
            user_id__in=member_ids,
            user__is_active=True,
            techs__id__in=employee_tech_ids,
        )
        .select_related("user", "albanian_tl", "italian_tl")
        .prefetch_related("techs", "tech_assignments__tech", "tech_assignments__level")
        .distinct()
        .order_by("user__username")
    )
    if not colleagues:
        return []

    # Group by Tech — only techs the employee has.
    tech_objects: Dict[int, Tech] = {}
    tech_profiles: Dict[int, List[UserProfile]] = {}
    for col in colleagues:
        for tech in col.techs.all():
            if not tech.is_active or tech.id not in employee_tech_ids:
                continue
            tech_objects[tech.id] = tech
            tech_profiles.setdefault(tech.id, []).append(col)

    tech_nodes: List[Dict[str, Any]] = []
    for tech in sorted(tech_objects.values(), key=lambda item: item.name):
        node = _tech_node(tech)
        for col_profile in tech_profiles[tech.id]:
            node["children"].append(_person_node(col_profile.user, col_profile))
        tech_nodes.append(node)
    return tech_nodes


def build_chain(user: User) -> Dict[str, Any]:
    """Build the chain from an employee up to their Italian TL (root).

    The chain walks: employee → albanian_tl → italian_tl (via the
    Albanian TL's profile.italian_tl FK, not the employee's own FK).

    Tech siblings: if the employee has active Tech assignments, they are
    grouped under Tech nodes alongside AL-TL teammates who share the same
    Tech. Employees without Tech appear as direct children of their AL TL.
    Only Techs the employee has are rendered; teammates without a shared
    Tech are not shown.
    """
    if not hasattr(user, "profile"):
        return {"roots": [], "scope": "chain", "total_nodes": 0}
    profile = user.profile
    total_nodes = 0
    roots: List[Dict[str, Any]] = []

    al_tl = profile.albanian_tl
    # Get Italian TL: prefer employee's own FK, fall back to Albanian TL's FK
    it_tl = profile.italian_tl
    if not it_tl and al_tl:
        it_tl = al_tl.profile.italian_tl if hasattr(al_tl, 'profile') else None

    if it_tl:
        # Build: Italian TL → Albanian TL → (Tech groups | self)
        it_node = _person_node(it_tl, it_tl.profile)
        total_nodes += 1

        if al_tl and al_tl != it_tl:
            al_node = _person_node(al_tl, al_tl.profile)
            total_nodes += 1

            tech_nodes = _build_chain_tech_siblings(profile, al_tl)
            if tech_nodes:
                for tn in tech_nodes:
                    al_node["children"].append(tn)
                    total_nodes += 1 + len(tn["children"])
            else:
                # No tech → employee is a direct child
                self_node = _person_node(user, profile)
                total_nodes += 1
                al_node["children"].append(self_node)

            it_node["children"].append(al_node)
        else:
            # No Albanian TL, employee reports directly to Italian TL
            self_node = _person_node(user, profile)
            total_nodes += 1
            it_node["children"].append(self_node)

        roots.append(it_node)
    elif al_tl:
        # No Italian TL, but has Albanian TL
        al_node = _person_node(al_tl, al_tl.profile)
        total_nodes += 1

        tech_nodes = _build_chain_tech_siblings(profile, al_tl)
        if tech_nodes:
            for tn in tech_nodes:
                al_node["children"].append(tn)
                total_nodes += 1 + len(tn["children"])
        else:
            self_node = _person_node(user, profile)
            total_nodes += 1
            al_node["children"].append(self_node)

        roots.append(al_node)
    else:
        # No TL assignments — just self
        self_node = _person_node(user, profile)
        total_nodes += 1
        roots.append(self_node)

    return {"roots": roots, "scope": "chain", "total_nodes": total_nodes}


def build_scoped_tree(user: User) -> Dict[str, Any]:
    """
    Build the org tree scoped to the requesting user's role.

    - Admin/superuser/HR → full tree
    - Italian TL / Albanian TL → own subtree
    - Employee → own chain to root
    """
    if not hasattr(user, "profile"):
        return {"roots": [], "scope": "chain", "total_nodes": 0}
    profile = user.profile

    if user.is_superuser or user.is_staff or profile.is_hr:
        return build_full_tree()
    elif profile.is_italian_tl or profile.is_albanian_tl:
        return build_subtree(user)
    else:
        return build_chain(user)
