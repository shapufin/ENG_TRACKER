"""PERF-11: LeaveRequest filter indexes, and no index that duplicates another."""
from django.db import models
from django.test import SimpleTestCase

from apps.dashboard.models import CalendarWorkspace
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from plugins.payroll.models import PayrollLine
from plugins.skills.models import UserSkill
from plugins.ticket_kpi.models import MonthlyKPI


def _index_fields(model):
    return [tuple(index.fields) for index in model._meta.indexes]


class LeaveRequestIndexTests(SimpleTestCase):
    def test_status_start_date_and_user_start_date_are_indexed(self):
        fields = _index_fields(LeaveRequest)
        self.assertIn(('status', 'start_date'), fields)
        self.assertIn(('user', 'start_date'), fields)


class NoRedundantIndexTests(SimpleTestCase):
    """An explicit Index that repeats an FK's own index or a unique constraint is pure write cost."""

    def _unique_sets(self, model):
        opts = model._meta
        sets = [tuple(c.fields) for c in opts.constraints
                if isinstance(c, models.UniqueConstraint) and not c.condition]
        return sets + [tuple(u) for u in opts.unique_together]

    def test_no_index_duplicates_a_unique_constraint(self):
        for model in (PayrollLine, UserSkill, MonthlyKPI):
            clash = set(_index_fields(model)) & set(self._unique_sets(model))
            self.assertFalse(clash, f'{model.__name__} indexes duplicate a unique constraint: {clash}')

    def test_no_single_column_index_on_an_indexed_foreign_key(self):
        for model in (OvertimeLog, PayrollLine, CalendarWorkspace):
            for fields in _index_fields(model):
                if len(fields) != 1:
                    continue
                field = model._meta.get_field(fields[0])
                self.assertFalse(
                    field.is_relation and field.db_index,
                    f'{model.__name__}.{fields[0]} is a foreign key and already has an index',
                )
