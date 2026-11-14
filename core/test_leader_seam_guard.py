"""Leader authority must not be decided on a raw link or the ``is_team_leader`` shortcut.

Team-leader scope is link-only (item 64): a leader's people are decided by
``get_team_member_ids()`` / ``owned_by_leader_q``, and the role is a grant
(``has_role``). Two shapes bypass that seam and are the ones a new change most
likely reaches for:

* ``.is_team_leader`` attribute reads, which mix flags, grants and links;
* raw ``italian_tl`` / ``albanian_tl`` keyword filters (``filter``, ``exclude``,
  ``Q``, ``get``) outside the link helpers.

Existing uses are recorded in ``BASELINE`` (a ratchet, audithandover.md S5c). A
file may keep its count but never gain one: adding a new raw use fails this test
and points at the helper to use. When an existing use is removed, lower its
count so the ratchet tightens. Tests, migrations and ``tests_app`` are exempt.
"""

import ast
import re
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

REPO_ROOT = Path(settings.BASE_DIR)
SCANNED = ("apps", "core", "plugins")

LEADER_LINK_KEYWORD = re.compile(
    r"^(profile__)?(italian_tl|albanian_tl)(_id)?(__(in|isnull|exact|id|id__in))?$"
)
FILTER_CALLS = {"filter", "exclude", "Q", "get"}

# posix path -> number of violations allowed in that file (ratchet, never raise).
BASELINE = {
    "apps/dashboard/admin_overview.py": 2,
    "apps/leave_management/viewsets.py": 1,
    "apps/reports/viewsets.py": 2,
    "apps/users/serializers.py": 1,
    "apps/users/viewsets.py": 11,
    "apps/users/models/core.py": 4,
    "apps/users/services/hbpr_assignments.py": 4,
    "apps/users/services/team_lifecycle.py": 6,
    "apps/users/services/user_deactivation.py": 3,
    "apps/users/services/user_deletion.py": 6,
    "apps/users/management/commands/audit_team_only_scope.py": 1,
    "apps/users/management/commands/seed_e2e_data.py": 1,
    "apps/permissions/services/permission_service.py": 2,
    "core/mixins/permissions.py": 6,
    "plugins/engagement/services.py": 2,
    "plugins/organigrama/viewsets.py": 3,
    "plugins/skills/signals.py": 1,
    "plugins/ticket_kpi/viewsets.py": 5,
    "plugins/year_close/services/archive_view.py": 1,
    "plugins/tl_scorecard/viewsets/scorecard.py": 2,
    "plugins/skills/services/matrix.py": 2,
    "plugins/skills/services/team_query.py": 2,
    "plugins/organigrama/services/tree_builder.py": 14,
    "plugins/control_room/services/scope_service.py": 4,
}


def _production_files():
    for folder in SCANNED:
        for path in (REPO_ROOT / folder).rglob("*.py"):
            if (
                "migrations" in path.parts
                or "tests" in path.parts
                or "tests_app" in path.parts
                or path.name.startswith("test_")
                or path.name in {"tests.py", "conftest.py"}
                or ".claude" in path.parts
            ):
                continue
            yield path


def _call_name(node):
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return ""


def violations(tree):
    """Yield (lineno, what) for each seam bypass in a parsed module."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == "is_team_leader":
            if isinstance(node.ctx, ast.Load):
                yield node.lineno, ".is_team_leader read"
        elif isinstance(node, ast.Call) and _call_name(node) in FILTER_CALLS:
            for kw in node.keywords:
                if kw.arg and LEADER_LINK_KEYWORD.match(kw.arg):
                    yield node.lineno, f"raw leader-link filter {kw.arg}="


def _counts():
    counts = {}
    for path in _production_files():
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        found = list(violations(tree))
        if found:
            counts[path.relative_to(REPO_ROOT).as_posix()] = found
    return counts


class LeaderSeamGuardTests(SimpleTestCase):
    def test_no_new_leader_authority_bypass(self):
        problems = []
        for rel, found in _counts().items():
            allowed = BASELINE.get(rel, 0)
            if len(found) > allowed:
                details = "; ".join(f"line {line}: {what}" for line, what in found)
                problems.append(f"{rel} has {len(found)} (allowed {allowed}): {details}")
        self.assertEqual(
            problems, [],
            "New raw leader-authority check. Use get_team_member_ids() / owned_by_leader_q "
            "for scope and has_role() for the grant. Only then raise BASELINE, and say why.\n"
            + "\n".join(problems),
        )

    def test_guard_detects_both_shapes(self):
        tree = ast.parse(
            "x = profile.is_team_leader\n"
            "y = User.objects.filter(profile__italian_tl=u)\n"
            "z = Q(albanian_tl_id__in=ids)\n"
            "w = Other.objects.filter(team=t)\n"
        )
        kinds = [what for _, what in violations(tree)]
        self.assertEqual(len(kinds), 3, kinds)
