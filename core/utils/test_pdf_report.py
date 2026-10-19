"""Shared ReportLab kit: every helper builds a valid PDF and never trusts cell text."""
import io

from django.test import TestCase
from pypdf import PdfReader

from core.utils import pdf_report


def _build(*, cells=None, series=None):
    buffer = io.BytesIO()
    doc, story, _styles = pdf_report.new_report(
        buffer,
        title='Report <b>T</b> & co',
        subtitle='Sub & more',
        generated_by='Ana <i>x</i>',
        period_label='September 2026',
    )
    pdf_report.cover_block(
        story,
        title='Cover & title',
        subtitle='Team <b>one</b>',
        kpis=[
            ('1:1 compliance', '50.0%', 'warning'),
            ('Escalations', '0', 'success'),
            ('Promotion ratio', '—', 'muted'),
        ],
    )
    pdf_report.section_title(story, 'Meetings & reviews')
    pdf_report.paragraph(story, 'Body with <b>markup</b> & ampersand')
    pdf_report.data_table(
        story,
        ['Name', 'Value'],
        cells if cells is not None else [['A & <b>B</b>', 3], ['Missing', None]],
        numeric_cols=(1,),
    )
    categories = ['Jun 2026', 'Jul 2026', 'Aug 2026']
    values = series if series is not None else {'a': [1.0, None, 3.0], 'b': [None, 2.0, 2.0]}
    pdf_report.line_chart(story, categories=categories, series=values, y_max=5, y_suffix='%')
    pdf_report.bar_chart(story, categories=categories, series=values)
    pdf_report.bar_chart(story, categories=categories, series=values, horizontal=True)
    pdf_report.donut_chart(story, parts={'Junior': 2, 'Mid': 0, 'Senior': 1})
    doc.build(story)
    return buffer.getvalue()


class PdfReportKitTests(TestCase):
    def test_every_helper_builds_a_pdf(self):
        self.assertTrue(_build().startswith(b'%PDF'))

    def test_markup_and_ampersands_in_cells_do_not_raise_and_render_literally(self):
        data = _build(cells=[['A & <b>B</b>', 3]])
        text = ' '.join(page.extract_text() for page in PdfReader(io.BytesIO(data)).pages)
        self.assertIn('A & <b>B</b>', text)

    def test_none_series_values_render_as_gaps_without_raising(self):
        self.assertTrue(_build(series={'only': [None, None, None]}).startswith(b'%PDF'))

    def test_donut_with_no_members_does_not_raise(self):
        buffer = io.BytesIO()
        doc, story, _styles = pdf_report.new_report(
            buffer, title='t', subtitle='s', generated_by='g', period_label='p',
        )
        pdf_report.donut_chart(story, parts={'Junior': 0, 'Mid': 0})
        doc.build(story)
        self.assertTrue(buffer.getvalue().startswith(b'%PDF'))
