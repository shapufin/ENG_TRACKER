"""PERF-01: booting Django must not emit the "database during app initialization" warning."""
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase


class BootWarningTests(SimpleTestCase):
    def test_manage_check_is_clean_under_runtime_warning_as_error(self):
        root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [sys.executable, '-W', 'error::RuntimeWarning', 'manage.py', 'check'],
            cwd=root, capture_output=True, text=True, timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stderr[-1500:])
