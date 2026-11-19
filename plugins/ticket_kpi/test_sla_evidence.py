"""SLA breach is recorded only from evidence in the file, never guessed.

True/False only when a mapped (or unmistakably named) column says so; otherwise None.
Synthetic data only.
"""
import pandas as pd
from django.test import SimpleTestCase

from plugins.ticket_kpi.mapping_engine import ColumnMapper

BASE_MAPPING = {
    'ticket_id': 'Number', 'title': 'Short description', 'status': 'State',
    'created_at': 'Opened', 'resolved_at': 'Resolved',
}


def run(extra, mapping=None, transforms=None, opened='2026-03-06 17:00', resolved='2026-03-09 09:00', compute_sla=True):
    """One ticket through the engine; ``extra`` is an ordered {header: value} of SLA-ish columns."""
    row = {'Number': 'INC1', 'Short description': 't', 'State': 'Resolved', 'Opened': opened, 'Resolved': resolved}
    row.update(extra)
    df = pd.DataFrame([row])
    records, errors, _ = ColumnMapper().process_file(
        df, {**BASE_MAPPING, **(mapping or {})}, transforms or {}, compute_sla=compute_sla)
    assert not errors, errors
    return records[0].get('sla_breached')


class NoEvidenceNoVerdictTests(SimpleTestCase):
    def test_informational_sla_column_is_not_a_breach(self):
        for header, value in (('SLA Tier', 'Standard'), ('SLA Plan', 'Gold'), ('SLA Target', '4h'),
                              ('SLA Category', 'Tier 1'), ('SLA Priority', 'P1')):
            self.assertIsNone(run({header: value}), header)

    def test_friday_to_monday_without_a_column_stays_unknown(self):
        self.assertIsNone(run({}))  # 64 calendar hours, 2 working hours

    def test_a_slow_low_priority_ticket_without_a_column_stays_unknown(self):
        self.assertIsNone(run({'Priority': 'P4'}, opened='2026-03-02 09:00', resolved='2026-03-05 09:00'))

    def test_compute_sla_off_records_nothing(self):
        self.assertIsNone(run({'SLA Breached': 'Yes'}, compute_sla=False))


class ImplicitColumnTests(SimpleTestCase):
    def test_order_does_not_matter(self):
        self.assertIs(run({'SLA Priority': 'P1', 'SLA Breached': 'No'}), False)
        self.assertIs(run({'SLA Breached': 'No', 'SLA Priority': 'P1'}), False)

    def test_sla_breached_yes_is_a_breach(self):
        self.assertIs(run({'SLA Breached': 'Yes'}), True)

    def test_positive_headers_invert(self):
        self.assertIs(run({'Made SLA': 'Yes'}), False)
        self.assertIs(run({'Made SLA': 'No'}), True)
        self.assertIs(run({'SLA Met': 'true'}), False)


class ExplicitColumnTests(SimpleTestCase):
    def mapped(self, header, value, **kw):
        return run({header: value}, mapping={'sla_breached': header}, **kw)

    def test_the_mapped_column_is_read(self):
        self.assertIs(self.mapped('Breached', 'Yes'), True)
        self.assertIs(self.mapped('Breached', 'No'), False)
        self.assertIs(self.mapped('Overdue', 'True'), True)
        self.assertIs(self.mapped('Within Target', 'Yes'), False)
        self.assertIs(self.mapped('Within Target', 'No'), True)

    def test_the_mapped_column_beats_an_earlier_sla_column(self):
        self.assertIs(run({'SLA Breached': 'Yes', 'Overdue': 'No'}, mapping={'sla_breached': 'Overdue'}), False)

    def test_not_met_means_breached(self):
        self.assertIs(self.mapped('SLA Not Met', 'Yes'), True)
        self.assertIs(self.mapped('SLA Not Met', 'No'), False)

    def test_unambiguous_words_need_no_polarity(self):
        self.assertIs(self.mapped('SLA Status', 'Breached'), True)
        self.assertIs(self.mapped('SLA Status', 'Met'), False)
        self.assertIs(self.mapped('SLA Status', 'Within SLA'), False)

    def test_an_unknown_value_is_unknown_never_breached(self):
        self.assertIsNone(self.mapped('SLA Status', 'Standard'))
        self.assertIsNone(self.mapped('SLA Status', ''))

    def test_a_yes_no_in_a_header_without_polarity_is_unknown(self):
        self.assertIsNone(self.mapped('SLA Flag', 'Yes'))

    def test_a_value_transform_decides_the_polarity(self):
        t = {'sla_breached': {'yes': 'met', 'no': 'breached'}}
        self.assertIs(self.mapped('SLA Flag', 'Yes', transforms=t), False)
        self.assertIs(self.mapped('SLA Flag', 'No', transforms=t), True)

    def test_a_header_with_other_words_is_not_polarity(self):
        # "Token" contains "ok", "Metric" contains "met": whole words only.
        self.assertIsNone(self.mapped('SLA Metric', 'Yes'))
        self.assertIsNone(self.mapped('SLA Token', 'Yes'))
