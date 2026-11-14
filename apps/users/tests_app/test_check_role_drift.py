"""check_role_drift: a role flag without its UserRole row (and the reverse) is reported; --fix backfills."""
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.permissions.models import Role, UserRole

User = get_user_model()


class CheckRoleDriftTests(TestCase):
    def setUp(self):
        for code, name in [('hr', 'HR'), ('italian_tl', 'Manager'), ('albanian_tl', 'Line Manager')]:
            Role.objects.get_or_create(code=code, defaults={'name': name})
        self.flagged = User.objects.create_user(username='drift_flagged', password='x')
        self.flagged.profile.is_hr_user = True
        self.flagged.profile.save()
        self.clean = User.objects.create_user(username='drift_clean', password='x')

    def _run(self, *args):
        out = StringIO()
        call_command('check_role_drift', *args, stdout=out)
        return out.getvalue()

    def test_report_names_flag_without_role_row(self):
        output = self._run()
        self.assertIn('drift_flagged', output)
        self.assertIn('hr', output)
        self.assertNotIn('drift_clean', output)

    def test_report_does_not_write(self):
        self._run()
        self.assertFalse(UserRole.objects.filter(user=self.flagged).exists())

    def test_fix_backfills_the_missing_role_row(self):
        self._run('--fix')
        self.assertTrue(UserRole.objects.filter(user=self.flagged, role__code='hr', is_active=True).exists())

    def test_no_drift_reports_zero(self):
        self._run('--fix')
        self.assertIn('0 user(s)', self._run())
