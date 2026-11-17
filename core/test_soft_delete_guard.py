"""L3 (audit 2026-11-16): nothing soft-deletes today, and one careless call would leave "deleted" rows visible.

``BaseModel`` carries ``is_deleted`` but no manager filters it, and most queries do not either. So any new
``soft_delete()`` call, or any write of ``is_deleted=True``, must be a deliberate decision: add the file to
``ALLOWED`` below WITH a note on how every read of that model excludes deleted rows (and add backup/restore
and query tests for it). Owner ruling 2026-11-17: a guard test, not a migration to drop the flag.
"""
import ast
from pathlib import Path

from django.test import SimpleTestCase

ROOT = Path(__file__).resolve().parent.parent
# relative path -> why that file may soft-delete (and where reads are filtered)
ALLOWED: dict[str, str] = {}
SKIP_PARTS = {'migrations', 'tests', 'node_modules', 'venv', '.venv', '.claude', 'worktrees'}


def _sources():
    for top in ('apps', 'plugins', 'core'):
        for path in (ROOT / top).rglob('*.py'):
            rel = path.relative_to(ROOT)
            if SKIP_PARTS & set(rel.parts) or path.name.startswith('test'):
                continue
            yield rel.as_posix(), path


def _soft_delete_writes(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'soft_delete':
            yield node.lineno, 'soft_delete() call'
        elif isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Attribute) and t.attr == 'is_deleted' for t in node.targets
        ) and isinstance(node.value, ast.Constant) and node.value.value is True:
            yield node.lineno, 'is_deleted = True'
        elif isinstance(node, ast.keyword) and node.arg == 'is_deleted' and isinstance(node.value, ast.Constant) \
                and node.value.value is True:
            yield node.value.lineno, 'is_deleted=True argument'


class SoftDeleteGuardTests(SimpleTestCase):
    def test_no_unlisted_code_soft_deletes(self):
        offenders = []
        for rel, path in _sources():
            if rel == 'core/models/abstract.py' or rel in ALLOWED:
                continue
            tree = ast.parse(path.read_text(encoding='utf-8-sig'), filename=rel)
            offenders += [f'{rel}:{line} {what}' for line, what in _soft_delete_writes(tree)]
        self.assertEqual(
            offenders, [],
            'Soft delete is not supported by the app: most queries do not filter is_deleted. '
            'See the docstring of core/test_soft_delete_guard.py before adding one.',
        )

    def test_the_guard_sees_a_soft_delete_call(self):
        tree = ast.parse('obj.soft_delete(user)\nrow.is_deleted = True\nX(is_deleted=True)')
        self.assertEqual(len(list(_soft_delete_writes(tree))), 3)
