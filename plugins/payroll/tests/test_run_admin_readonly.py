"""A finalized payroll run is evidence: the admin stops editing its period (plan Y2)."""
from unittest.mock import Mock

from django.contrib.admin.sites import AdminSite
from django.test import SimpleTestCase

from plugins.payroll.admin import PayrollRunAdmin
from plugins.payroll.models import PayrollRun


class PayrollRunAdminReadonlyTests(SimpleTestCase):
    def setUp(self):
        self.admin_view = PayrollRunAdmin(PayrollRun, AdminSite())
        self.locked = ('status', 'year', 'month', 'notes')

    def test_a_finalized_run_locks_status_period_and_notes(self):
        fields = self.admin_view.get_readonly_fields(Mock(), Mock(status='finalized'))
        for name in self.locked:
            self.assertIn(name, fields)

    def test_a_draft_run_keeps_them_editable(self):
        fields = self.admin_view.get_readonly_fields(Mock(), Mock(status='draft'))
        for name in self.locked:
            self.assertNotIn(name, fields)

    def test_the_add_form_is_unaffected(self):
        fields = self.admin_view.get_readonly_fields(Mock(), None)
        for name in self.locked:
            self.assertNotIn(name, fields)
