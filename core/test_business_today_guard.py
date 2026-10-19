"""Production code must not ask "what day is it" from the server clock.

Django's TIME_ZONE is UTC, so ``date.today()``, a naive ``datetime.now()`` and
``timezone.localdate()`` / ``timezone.now().date()`` return the previous day for
the first one or two hours of each business day. Use
``core.utils.timezone_local.business_today()`` (or ``business_tz()``).

A call that is only time-of-day arithmetic or a file-name stamp may be listed in
``ALLOWED`` with its reason. Tests, migrations and ``tests`` packages are exempt.
"""

import ast
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

REPO_ROOT = Path(settings.BASE_DIR)
SCANNED = ("apps", "core", "plugins")

# file (posix, repo-relative) -> reason. Every call in the file is exempt.
ALLOWED = {
    "apps/overtime/models/core.py": "datetime.today() only anchors a time-of-day subtraction",
    "apps/overtime/serializers.py": "datetime.today() only anchors a time-of-day subtraction",
    "apps/standby/models/core.py": "datetime.today() only anchors a time-of-day subtraction",
    "apps/standby/serializers.py": "datetime.today() only anchors a time-of-day subtraction",
    "core/utils/time_overlap.py": "datetime.today() only anchors a time-of-day comparison",
    "apps/plugins/management/commands/remove_plugin.py": "operator-facing backup folder timestamp",
}


def _production_files():
    for folder in SCANNED:
        for path in (REPO_ROOT / folder).rglob("*.py"):
            name = path.name
            if (
                "migrations" in path.parts
                or "tests" in path.parts
                or "tests_app" in path.parts
                or name.startswith("test_")
                or name in {"tests.py", "conftest.py"}
            ):
                continue
            yield path


def _dotted(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def _naive_clock_calls(tree):
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _dotted(node.func)
        if name.endswith(("date.today", "datetime.today", "timezone.localdate")):
            yield node.lineno, name
        elif name.endswith("datetime.now") and not node.args and not node.keywords:
            yield node.lineno, name
        elif isinstance(node.func, ast.Attribute) and node.func.attr == "date" and isinstance(node.func.value, ast.Call):
            if _dotted(node.func.value.func).endswith("timezone.now"):
                yield node.lineno, "timezone.now().date"


class BusinessTodayGuardTests(SimpleTestCase):
    def test_no_naive_clock_in_production_code(self):
        offenders = []
        for path in _production_files():
            rel = path.relative_to(REPO_ROOT).as_posix()
            if rel in ALLOWED:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8-sig"))
            offenders += [f"{rel}:{line} {name}()" for line, name in _naive_clock_calls(tree)]
        self.assertEqual(
            offenders, [],
            "Use core.utils.timezone_local.business_today() instead:\n" + "\n".join(sorted(offenders)),
        )

    def test_allow_list_entries_still_exist_and_still_need_it(self):
        for rel in ALLOWED:
            path = REPO_ROOT / rel
            self.assertTrue(path.exists(), f"{rel} no longer exists; drop it from ALLOWED")
            hits = list(_naive_clock_calls(ast.parse(path.read_text(encoding="utf-8-sig"))))
            self.assertTrue(hits, f"{rel} has no naive clock call; drop it from ALLOWED")
