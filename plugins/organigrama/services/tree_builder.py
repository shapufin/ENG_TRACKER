"""
Tree builder for the Organigrama plugin.

Builds a people-centric org tree from two sources:
1. People hierarchy (primary): UserProfile.italian_tl + albanian_tl FKs.
2. Technology classification (secondary): UserProfile.techs.

Tree structure (build_full_tree — the admin/HR company-wide view):
  Manager (root, type=person)
  └── Line Manager (type=person)
      ├── Manager node (nested, only if an employee's own italian_tl
      │   FK differs from the Line Manager's own manager above)
      │   └── Employee (type=person)
      ├── Tech node (type=tech, if assignments exist)
      │   └── Employee (type=person)
      └── Employee (type=person, direct child if no Tech assignment)

build_subtree()'s Line Manager case (a logged-in Line Manager viewing their
own chart) does NOT match the shape above: a Line Manager can cover
several teams that each have a different Manager, and must never be
the tree's root above one, so it produces one root PER distinct Manager
TL instead — each `Manager -> Line Manager (repeated per branch) ->
that branch's employees only`.

Scoping reuses UserProfile.get_team_member_ids() for TL scope, matching
the overtime/standby/analytics permission model.
"""
import logging
from typing import Dict, List, Any, Set

from django.contrib.auth.models import User
from django.db.models import Q

from apps.users.models.core import Tech, UserProfile
from apps.users.services.hbpr_scope import get_hbpr_scope, is_hbpr
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
    Manager/Line Manager detection logic cannot drift between call sites.
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


def _has_role_q(role_code: str) -> Q:
    """Match UserProfile.is_italian_tl/is_albanian_tl's role check as a
    queryable Q on the User model: the legacy boolean flag, OR an active grant through the
    Role/UserRole system (the authoritative source — role_codes on the
    profile is only a denormalized cache of it, see
    apps/permissions/services/role_service.py). Checking the boolean flag
    alone misses anyone whose role only comes from Role/UserRole.
    """
    flag_field = f"profile__is_{role_code}_role"
    return Q(**{flag_field: True}) | Q(
        user_roles__role__code=role_code, user_roles__is_active=True
    )


def _profile_has_role_q(role_code: str) -> Q:
    """Match role check as a queryable Q on the UserProfile model."""
    flag_field = f"is_{role_code}_role"
    return Q(**{flag_field: True}) | Q(
        user__user_roles__role__code=role_code, user__user_roles__is_active=True
    )


def _get_italian_tls() -> List[User]:
    """Get all active Managers (role-flagged)."""
    return list(
        User.objects.filter(_has_role_q("italian_tl"), is_active=True)
        .select_related("profile")
        .prefetch_related(
            "profile__tech_assignments__tech", "profile__tech_assignments__level"
        )
        .distinct()
        .order_by("username")
    )


def _get_albanian_tls_for_italian(italian_tl: User) -> List[User]:
    """Get active Line Managers reporting to a specific Manager.

    Must filter on the Line Manager role, not just ``italian_tl`` being
    set — regular employees can have their own ``italian_tl`` FK too (each
    team has its own Manager), and without this filter an employee with
    no Line Manager role would be misidentified as one and wrongly promoted
    into the tree as a peer of real Line Managers, directly under the
    Manager root.
    """
    return list(
        User.objects.filter(
            _has_role_q("albanian_tl"),
            profile__italian_tl=italian_tl,
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
    """Active employee profiles linked to a Line Manager (``albanian_tl`` FK only).

    Team membership (``led_teams``) is calendar-only and never places a person
    on the org chart (workflow-invariants item 64).
    """
    return list(
        UserProfile.objects.filter(albanian_tl=albanian_tl, user__is_active=True)
        .exclude(user=albanian_tl)
        .select_related("user", "albanian_tl", "italian_tl")
        .order_by("user__username")
    )


def _batch_get_albanian_tls(
    italian_tls: List[User],
) -> Dict[int, List[User]]:
    """Batch-fetch all active Line Managers for multiple Managers (1 query).

    Returns a mapping of {italian_tl_id: [albanian_tl_users]}.

    Must filter on the Line Manager role, not just ``italian_tl`` being
    set — see ``_get_albanian_tls_for_italian`` for why: regular employees
    can have their own ``italian_tl`` FK too, and without this filter one
    would be misidentified as a Line Manager and wrongly promoted into the
    tree as a root-adjacent node.
    """
    if not italian_tls:
        return {}
    italian_ids = [it.id for it in italian_tls]
    albanian_tls = list(
        User.objects.filter(
            _has_role_q("albanian_tl"),
            profile__italian_tl_id__in=italian_ids,
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
    """Batch-fetch all active employees for multiple Line Managers (2 queries).

    Employees are matched by the direct ``albanian_tl`` FK only (item 64);
    team membership never places someone under a Line Manager. Returns a
    mapping of {albanian_tl_id: [employee_profiles]}.
    """
    if not albanian_tls:
        return {}
    al_ids = [al.id for al in albanian_tls]

    employees = list(
        UserProfile.objects.filter(
            albanian_tl_id__in=al_ids,
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

    by_albanian: Dict[int, List[UserProfile]] = {al_id: [] for al_id in al_ids}
    for profile in employees:
        by_albanian.setdefault(profile.albanian_tl_id, []).append(profile)
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

    Company Hierarchy Architecture:
    1. Manager is ALWAYS top-level (roots).
    2. Line Manager is the bridge beneath the Manager.
    3. Employees under a Line Manager are grouped by their effective Manager:
       emp.italian_tl_id or (emp.albanian_tl.profile.italian_tl_id).
       - Employees whose Manager is IT_A are nested under IT_A -> AL_TL -> (Techs/Direct).
       - Employees whose Manager is IT_B are nested under IT_B -> AL_TL -> (Techs/Direct).
       - If a Line Manager manages employees across multiple Managers, the Line Manager
         bridges each respective team under that Manager.
       - Manager is NEVER a child of a Line Manager.

    Batched queries:
    1. All active Managers with tech prefetch
    2. All active Line Managers with tech prefetch
    3. All active employees under these TLs with teams/tech prefetch
    """
    roots: List[Dict[str, Any]] = []
    total_nodes = 0

    # Query 1: all Managers
    italian_tls = _get_italian_tls()
    it_id_set = {it.id for it in italian_tls}

    # Query 2: all active Line Managers
    albanian_tls = list(
        User.objects.filter(_has_role_q("albanian_tl"), is_active=True)
        .select_related("profile", "profile__italian_tl")
        .prefetch_related(
            "profile__tech_assignments__tech", "profile__tech_assignments__level"
        )
        .distinct()
        .order_by("username")
    )
    al_id_set = {al.id for al in albanian_tls}
    al_by_id: Dict[int, User] = {al.id: al for al in albanian_tls}

    # Query 3: all active employees reporting to any Line Manager or Manager
    employees = list(
        UserProfile.objects.filter(
            Q(albanian_tl_id__in=al_id_set)
            | Q(italian_tl_id__in=it_id_set),
            user__is_active=True,
        )
        .exclude(user_id__in=al_id_set | it_id_set)
        .select_related("user", "albanian_tl", "italian_tl")
        .prefetch_related(
            "teams", "techs", "tech_assignments__tech", "tech_assignments__level"
        )
        .distinct()
        .order_by("user__username")
    )

    by_it_and_al: Dict[tuple, List[UserProfile]] = {}
    direct_to_it: Dict[int, List[UserProfile]] = {}
    by_al_no_it: Dict[int, List[UserProfile]] = {}

    for profile in employees:
        al_id = profile.albanian_tl_id
        if al_id not in al_id_set:
            al_id = None

        # Determine effective Manager:
        # 1. Direct FK on employee
        # 2. Or fallback to Line Manager's own italian_tl FK
        it_id = profile.italian_tl_id
        if it_id is None and al_id is not None and al_id in al_by_id:
            it_id = al_by_id[al_id].profile.italian_tl_id

        if it_id is not None and al_id is not None:
            by_it_and_al.setdefault((it_id, al_id), []).append(profile)
        elif it_id is not None and al_id is None:
            direct_to_it.setdefault(it_id, []).append(profile)
        elif al_id is not None and it_id is None:
            by_al_no_it.setdefault(al_id, []).append(profile)

    attached_al_ids: Set[int] = set()

    for it_user in italian_tls:
        it_node = _person_node(it_user, it_user.profile)
        total_nodes += 1

        # Relevant Line Managers for this Manager:
        # 1. Line Managers with employees reporting to this Manager
        # 2. Line Managers whose own manager is this Manager
        relevant_al_ids = {
            al_id for (it_id, al_id) in by_it_and_al.keys() if it_id == it_user.id
        }
        for al in albanian_tls:
            if al.profile.italian_tl_id == it_user.id:
                relevant_al_ids.add(al.id)

        for al_id in sorted(relevant_al_ids, key=lambda aid: al_by_id[aid].username):
            al_user = al_by_id[al_id]
            al_node = _person_node(al_user, al_user.profile)
            total_nodes += 1
            attached_al_ids.add(al_id)

            emps = by_it_and_al.get((it_user.id, al_id), [])
            total_nodes += _attach_members(al_node, emps)
            it_node["children"].append(al_node)

        if it_user.id in direct_to_it:
            total_nodes += _attach_members(it_node, direct_to_it[it_user.id])

        roots.append(it_node)

    # Any Line Managers without a Manager
    unattached_als = [al for al in albanian_tls if al.id not in attached_al_ids]
    for al in sorted(unattached_als, key=lambda u: u.username):
        al_node = _person_node(al, al.profile)
        total_nodes += 1
        emps = by_al_no_it.get(al.id, [])
        total_nodes += _attach_members(al_node, emps)
        roots.append(al_node)

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


def build_subtree(user: User) -> Dict[str, Any]:
    """Build a subtree scoped to a TL (Manager or Line Manager).

    Scoping reuses ``UserProfile.get_team_member_ids()`` — the same primitive
    used by overtime/standby/analytics — so the org chart's visibility matches
    the rest of the platform. For a Manager the managed set is chained:
    their direct reports (Line Managers) plus each Line Manager's own managed
    users, so the full reporting chain renders while never leaking users
    outside the canonical scope.
    """
    profile = user.profile
    total_nodes = 0
    roots: List[Dict[str, Any]] = []

    if profile.is_italian_tl:
        # Find all Line Managers reporting to this Manager or bridging employees reporting to this Manager
        direct_al_ids = set(
            User.objects.filter(
                _has_role_q("albanian_tl"),
                profile__italian_tl=user,
                is_active=True,
            ).values_list("id", flat=True)
        )
        bridging_al_ids = set(
            UserProfile.objects.filter(
                italian_tl=user,
                user__is_active=True,
                albanian_tl__isnull=False,
            )
            .values_list("albanian_tl_id", flat=True)
            .distinct()
        )
        all_al_ids = direct_al_ids | bridging_al_ids

        albanian_tls = list(
            User.objects.filter(
                _has_role_q("albanian_tl"), id__in=all_al_ids, is_active=True
            )
            .select_related("profile", "profile__italian_tl")
            .prefetch_related(
                "profile__tech_assignments__tech", "profile__tech_assignments__level"
            )
            .distinct()
            .order_by("username")
        )
        al_id_set = {al.id for al in albanian_tls}

        employees = list(
            UserProfile.objects.filter(
                Q(italian_tl=user)
                | Q(albanian_tl_id__in=direct_al_ids, italian_tl__isnull=True),
                user__is_active=True,
            )
            .exclude(user=user)
            .exclude(user_id__in=al_id_set)
            .select_related("user", "albanian_tl", "italian_tl")
            .prefetch_related(
                "teams", "techs", "tech_assignments__tech", "tech_assignments__level"
            )
            .distinct()
            .order_by("user__username")
        )

        by_al: Dict[int, List[UserProfile]] = {al_id: [] for al_id in al_id_set}
        direct_to_it: List[UserProfile] = []

        for emp in employees:
            if emp.italian_tl_id is not None and emp.italian_tl_id != user.id:
                continue

            al_id = emp.albanian_tl_id
            if al_id in al_id_set:
                by_al[al_id].append(emp)
            else:
                direct_to_it.append(emp)

        it_node = _person_node(user, profile)
        total_nodes += 1
        for al_user in albanian_tls:
            al_node = _person_node(al_user, al_user.profile)
            total_nodes += 1
            total_nodes += _attach_members(al_node, by_al.get(al_user.id, []))
            it_node["children"].append(al_node)

        if direct_to_it:
            total_nodes += _attach_members(it_node, direct_to_it)

        roots.append(it_node)

    elif profile.is_albanian_tl:
        # Line Manager: visible set = own managed users (employees + team members).
        # One Line Manager can be shared across teams that each have a
        # DIFFERENT Manager (Manager is senior — confirmed org model).
        # The Line Manager must never appear as the tree's root above an
        # Manager — including here, in their OWN "my org chart" view.
        # Each Manager they report to (their own manager, or a
        # different one via a team whose employees report elsewhere)
        # becomes its own root, with the Line Manager nested under it,
        # showing only that team's employees.
        visible_ids = profile.get_team_member_ids()
        employees = list(
            UserProfile.objects.filter(
                user_id__in=visible_ids, user__is_active=True
            )
            .exclude(user=user)
            .exclude(_profile_has_role_q("italian_tl"))
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

        # Only Managers with actual employees under this Line Manager
        # become roots — a Manager the Line Manager merely reports to,
        # with nobody currently assigned under that specific line, would
        # otherwise show as a disconnected, childless box.
        it_ids = set(by_italian.keys())
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

        if unresolved or not roots:
            # No Manager resolvable anywhere (the Line Manager has no
            # manager either), or the Line Manager currently has no
            # employees under any Manager at all — fall back to the
            # Line Manager as root rather than showing an empty tree.
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

    Returns Tech nodes containing the employee plus their Line Manager teammates
    who share at least one active Tech assignment. Only Techs the employee
    has are rendered. If the employee has no Techs, returns an empty list
    (caller falls back to placing the employee as a direct child).
    """
    employee_tech_ids = {
        t.id for t in employee_profile.techs.all() if t.is_active
    }
    if not employee_tech_ids or not al_tl:
        return []

    # Scope: Line Manager's managed members (canonical scope primitive).
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
    """Build the chain from an employee up to their Manager (root).

    The chain walks: employee → albanian_tl → italian_tl (via the
    Line Manager's profile.italian_tl FK, not the employee's own FK).

    Tech siblings: if the employee has active Tech assignments, they are
    grouped under Tech nodes alongside Line Manager teammates who share the same
    Tech. Employees without Tech appear as direct children of their Line Manager.
    Only Techs the employee has are rendered; teammates without a shared
    Tech are not shown.
    """
    if not hasattr(user, "profile"):
        return {"roots": [], "scope": "chain", "total_nodes": 0}
    profile = user.profile
    total_nodes = 0
    roots: List[Dict[str, Any]] = []

    al_tl = profile.albanian_tl
    # Get Manager: prefer employee's own FK, fall back to Line Manager's FK
    it_tl = profile.italian_tl
    if not it_tl and al_tl:
        it_tl = al_tl.profile.italian_tl if hasattr(al_tl, 'profile') else None

    if it_tl:
        # Build: Manager → Line Manager → (Tech groups | self)
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
            # No Line Manager, employee reports directly to Manager
            self_node = _person_node(user, profile)
            total_nodes += 1
            it_node["children"].append(self_node)

        roots.append(it_node)
    elif al_tl:
        # No Manager, but has Line Manager
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


def hbpr_visible_user_ids(user: User) -> set:
    """Users an HBPR may see: assigned Line Managers, their teams, and the
    Manager above each (shown so the chart keeps its root)."""
    scope = get_hbpr_scope(user)
    ids = set(scope.user_ids)
    ids.update(
        UserProfile.objects.filter(user_id__in=scope.tl_ids, italian_tl__isnull=False)
        .values_list("italian_tl_id", flat=True)
    )
    ids.update(
        UserProfile.objects.filter(user_id__in=scope.member_ids, italian_tl__isnull=False)
        .values_list("italian_tl_id", flat=True)
    )
    return ids


def _prune_to_ids(nodes: List[Dict[str, Any]], allowed: set) -> List[Dict[str, Any]]:
    """Keep person nodes in ``allowed`` and any node with a kept descendant."""
    kept = []
    for node in nodes:
        children = _prune_to_ids(node["children"], allowed)
        if children or (node["type"] == "person" and node["id"] in allowed):
            kept.append({**node, "children": children})
    return kept


def _count_nodes(nodes: List[Dict[str, Any]]) -> int:
    return sum(1 + _count_nodes(n["children"]) for n in nodes)


def build_hbpr_tree(user: User) -> Dict[str, Any]:
    """The company tree narrowed to an HBPR's assigned Line Managers."""
    roots = _prune_to_ids(build_full_tree()["roots"], hbpr_visible_user_ids(user))
    return {"roots": roots, "scope": "subtree", "total_nodes": _count_nodes(roots)}


def build_scoped_tree(user: User) -> Dict[str, Any]:
    """
    Build the org tree scoped to the requesting user's role.

    - Admin/superuser/HR → full tree
    - Manager / Line Manager → own subtree
    - Employee → own chain to root
    """
    if not hasattr(user, "profile"):
        return {"roots": [], "scope": "chain", "total_nodes": 0}
    profile = user.profile

    if user.is_superuser or user.is_staff or profile.is_hr:
        return build_full_tree()
    elif profile.is_italian_tl or profile.is_albanian_tl:
        return build_subtree(user)
    elif is_hbpr(user):
        return build_hbpr_tree(user)
    else:
        return build_chain(user)
