"""
Tree builder for the Organigrama plugin.

Builds a people-centric org tree from two sources:
1. People hierarchy (primary): UserProfile.italian_tl + albanian_tl FKs.
2. Technology classification (secondary): UserProfile.techs.

Tree structure:
  Italian TL (root, type=person)
  └── Albanian TL (type=person)
      ├── Tech node (type=tech, if assignments exist)
      │   └── Employee (type=person)
      └── Employee (type=person, direct child if no Tech assignment)

Scoping reuses UserProfile.get_team_member_ids() for TL scope, matching
the overtime/standby/analytics permission model.
"""
import logging
from typing import Dict, List, Any, Set

from django.contrib.auth.models import User
from django.db.models import Q

from apps.users.models.core import Tech, UserProfile

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
    """Build a person node."""
    return {
        "type": "person",
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name() or user.username,
        "role_badge": role_badge(profile),
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
        .distinct()
        .order_by("username")
    )


def _get_albanian_tls_for_italian(italian_tl: User) -> List[User]:
    """Get active Albanian TLs reporting to a specific Italian TL."""
    return list(
        User.objects.filter(profile__italian_tl=italian_tl, is_active=True)
        .select_related("profile", "profile__italian_tl")
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
    """
    if not italian_tls:
        return {}
    italian_ids = [it.id for it in italian_tls]
    albanian_tls = list(
        User.objects.filter(
            profile__italian_tl_id__in=italian_ids, is_active=True
        )
        .select_related("profile", "profile__italian_tl")
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
        .prefetch_related("teams", "techs")
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
    teams/Tech prefetch) with no per-node grouping queries.
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

    for it_user in italian_tls:
        it_node = _person_node(it_user, it_user.profile)
        total_nodes += 1

        for al_user in albanian_tls_by_italian.get(it_user.id, []):
            al_node = _person_node(al_user, al_user.profile)
            total_nodes += 1

            employees = employees_by_albanian.get(al_user.id, [])
            grouped = _assign_employees_to_techs(employees)
            for tech_node in grouped["tech_nodes"]:
                al_node["children"].append(tech_node)
                total_nodes += 1 + len(tech_node["children"])
            for direct_emp in grouped["direct"]:
                al_node["children"].append(direct_emp)
                total_nodes += 1

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
                .prefetch_related("techs")
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
        visible_ids = profile.get_team_member_ids()
        employees = list(
            UserProfile.objects.filter(
                user_id__in=visible_ids, user__is_active=True
            )
            .exclude(user=user)
            .select_related("user", "albanian_tl", "italian_tl")
            .prefetch_related("techs")
            .distinct()
            .order_by("user__username")
        )

        al_node = _person_node(user, profile)
        total_nodes += 1
        total_nodes += _attach_members(al_node, employees)
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
        .prefetch_related("techs")
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
