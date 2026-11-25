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
            ('1:1 compliance', '50.0%', 'warning', '+5.0 pts vs Aug'),
            ('Escalations', '0', 'success'),
            ('Promotion ratio', '—', 'muted'),
        ],
    )
    pdf_report.section_title(story, 'Meetings & reviews')
    pdf_report.sub_section(story, 'Breakdown <b>details</b>')
    pdf_report.paragraph(story, 'Body with <b>markup</b> & ampersand')
    pdf_report.data_table(
        story,
        ['Name', 'Value'],
        cells if cells is not None else [['A & <b>B</b>', 3], ['Missing', None]],
        numeric_cols=(1,),
    )
    categories = ['Jun 2026', 'Jul 2026', 'Aug 2026']
    values = series if series is not None else {'a': [1.0, None, 3.0], 'b': [None, 2.0, 2.0]}
    pdf_report.line_chart(
        story,
        categories=categories,
        series=values,
        y_max=5,
        y_suffix='%',
        thresholds=[(4, 'Target', 'success')],
        fill_area=True,
        show_values=True,
        title='Trend chart',
    )
    pdf_report.bar_chart(
        story,
        categories=categories,
        series=values,
        integer_y=True,
        show_values=True,
        title='Vertical bars',
    )
    pdf_report.bar_chart(
        story,
        categories=['PIPs pending HR approval', 'Absences unaddressed over 5 days', 'Escalation risks'],
        series={'Count': [1, 0, 1]},
        horizontal=True,
        integer_y=True,
        show_values=True,
        bar_colors=['warning', 'danger', 'danger'],
        title='Horizontal bars',
    )
    pdf_report.stacked_bar_chart(
        story,
        categories=categories,
        series={'Approved': [3, 4, 2], 'Rejected': [1, 0, 1], 'Pending': [0, 1, 0]},
        colors_override=['#15803D', '#B91C1C', '#B45309'],
        overlay_line=('Submitted', [4, 5, 3]),
        integer_y=True,
        title='Stacked status',
    )
    pdf_report.combo_chart(
        story,
        categories=categories,
        area_series=('Score', [70.0, 82.0, 90.0]),
        line_series=('Avg TTA (h)', [12.0, 8.5, 5.0]),
        y_max=100,
        y2_suffix='h',
        thresholds=[(80, 'Healthy 80', 'success')],
        title='Combo score & TTA',
    )
    pdf_report.donut_chart(
        story,
        parts={'Junior': 2, 'Mid': 0, 'Senior': 1, 'Not set': 1},
        title='Seniority mix',
    )
    doc.build(story)
    return buffer.getvalue()


class PdfReportKitTests(TestCase):
    def test_every_helper_builds_a_pdf(self):
        data = _build()
        self.assertTrue(data.startswith(b'%PDF'))
        text = ' '.join(page.extract_text() for page in PdfReader(io.BytesIO(data)).pages)
        self.assertIn('Trend chart', text)
        self.assertIn('Combo score & TTA', text)
        self.assertIn('Stacked status', text)
        self.assertIn('Seniority mix', text)
        self.assertIn('+5.0 pts vs Aug', text)

    def test_markup_and_ampersands_in_cells_do_not_raise_and_render_literally(self):
        data = _build(cells=[['A & <b>B</b>', 3]])
        text = ' '.join(page.extract_text() for page in PdfReader(io.BytesIO(data)).pages)
        self.assertIn('A & <b>B</b>', text)
        self.assertIn('Breakdown <b>details</b>', text)

    def test_none_series_values_render_as_gaps_without_raising(self):
        self.assertTrue(_build(series={'only': [None, None, None]}).startswith(b'%PDF'))

    def test_integer_axis_ticks_produce_whole_numbers_only(self):
        for high, expected in [(1, [0, 1]), (3, [0, 1, 2, 3]), (11, [0, 3, 6, 9, 12])]:
            ticks = pdf_report._nice_ticks(0, high, integer=True)
            self.assertEqual(ticks, expected)
            self.assertTrue(all(isinstance(t, int) for t in ticks))

    def test_horizontal_chart_box_expands_for_long_labels(self):
        drawing = pdf_report._chart_drawing(55)
        x0, _y0, _w, _h = pdf_report._chart_box(
            drawing,
            horizontal=True,
            categories=['PIPs pending HR approval', 'Absences unaddressed over 5 days'],
        )
        self.assertGreaterEqual(x0, 90)

    def test_cover_block_uses_separate_label_and_value_flowables_to_avoid_overlap(self):
        from reportlab.platypus import Table

        story = []
        pdf_report.cover_block(
            story,
            title='Leader',
            subtitle='Period',
            kpis=[('Engagement score', '93.3', 'success'), ('Breaches', '0', 'ink'), ('Extra', '1', 'muted')],
        )
        outer = next(f for f in story if isinstance(f, Table))
        first_tile = outer._cellvalues[0][0]
        self.assertIsInstance(first_tile, Table)
        self.assertEqual(len(first_tile._cellvalues), 2)
        self.assertEqual(outer._cellvalues[1][1], '')

    def test_donut_with_no_members_does_not_raise(self):
        buffer = io.BytesIO()
        doc, story, _styles = pdf_report.new_report(
            buffer, title='t', subtitle='s', generated_by='g', period_label='p',
        )
        pdf_report.donut_chart(story, parts={'Junior': 0, 'Mid': 0})
        doc.build(story)
        self.assertTrue(buffer.getvalue().startswith(b'%PDF'))

    def test_nice_ticks_produces_clean_non_integer_steps(self):
        ticks = pdf_report._nice_ticks(0, 7.2, integer=False)
        self.assertEqual(ticks, [0.0, 2.0, 4.0, 6.0, 8.0])

    def test_thresholds_drawn_after_area_fill_and_overlay_splits_on_none(self):
        from reportlab.graphics.shapes import Drawing, Line, Polygon, PolyLine

        story = []
        pdf_report.line_chart(
            story,
            categories=['Jan', 'Feb', 'Mar'],
            series={'Score': [90, 85, 92]},
            y_max=100,
            fill_area=True,
            thresholds=[(80, 'Healthy 80', 'success')],
        )
        drawing = next(f for f in story if isinstance(f, Drawing))
        poly_idx = next(i for i, c in enumerate(drawing.contents) if isinstance(c, Polygon))
        thresh_idx = next(
            i for i, c in enumerate(drawing.contents)
            if isinstance(c, Line) and getattr(c, 'strokeDashArray', None) == [3, 3]
        )
        self.assertGreater(thresh_idx, poly_idx)

        story2 = []
        pdf_report.stacked_bar_chart(
            story2,
            categories=['Jan', 'Feb', 'Mar', 'Apr', 'May'],
            series={'Approved': [1, 0, 0, 2, 1]},
            overlay_line=('Submitted', [1, 2, None, 2, 3]),
        )
        drawing2 = next(f for f in story2 if isinstance(f, Drawing))
        polylines = [c for c in drawing2.contents if isinstance(c, PolyLine)]
        self.assertEqual(len(polylines), 2)
