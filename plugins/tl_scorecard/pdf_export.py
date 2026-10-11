"""TL scorecard summary as a PDF report.

Built only on `core.utils.pdf_report`. The numbers come from the same
`report_kpis.kpi_rows` the XLSX Summary uses, so the two files cannot disagree.
Wording follows docs/hbpr-and-scorecard.md: the HBPR free text is the
"Partnership log", never "evidence".
"""
import io
from datetime import date

from core.utils import pdf_report as pdf

from .report_kpis import NO_DATA, TARGETS, format_value, kpi_rows, reviews_target

TONE_FOR_STATUS = {'On track': 'success', 'Watch': 'warning', 'Off track': 'danger'}
EPR_STAGE_LABELS = {'goal_setting': 'Goal setting', 'mid_year': 'Mid-year', 'final_review': 'Final review'}


def _month_label(iso: str) -> str:
    return date.fromisoformat(iso).strftime('%b %Y')


def _dash(value):
    return NO_DATA if value is None else value


def _cover(story, scorecard, leader_name, period_label, rows):
    tiles = [
        (row['metric'], format_value(row['value'], row['kind']), TONE_FOR_STATUS.get(row['status'], 'muted'))
        for row in rows if row['target'] is not None
    ]
    pdf.cover_block(
        story,
        title=leader_name,
        subtitle=f"Scorecard for {period_label} · Team size {scorecard['team_size']}",
        kpis=tiles,
    )
    pdf.paragraph(
        story,
        'Targets: 1:1 compliance 100%; management reviews 12 a year (pro-rata to the month); '
        f"promotion {TARGETS['promotion_pct']:g}% a year; PIPs pending approval, absences over "
        '5 days and escalations 0. Green is on track, amber is watch, red is off track.',
    )
    pdf.section_title(story, 'Summary')
    summary_rows = [
        [row['area'], row['metric'], format_value(row['value'], row['kind']),
         format_value(row['target'], row['kind']) if row['target'] is not None else NO_DATA,
         row['status']]
        for row in rows
    ]
    pdf.data_table(
        story, ['Area', 'Metric', 'Value', 'Target', 'Status'], summary_rows,
        col_widths=[28, 80, 22, 25, 23], numeric_cols=(2, 3),
    )


def _meetings_section(story, trend):
    months = [_month_label(point['month']) for point in trend]
    pdf.section_title(story, 'Meetings & reviews')
    pdf.bar_chart(
        story, categories=months,
        series={
            'TL-Italy syncs': [p['meetings']['tl_sync_count'] for p in trend],
            'Team meetings with HRBP': [p['meetings']['team_meetings_with_hrbp'] for p in trend],
        },
    )
    one_on_one = [p['meetings']['one_on_one_compliance_pct'] for p in trend]
    if any(value is not None for value in one_on_one):
        pdf.line_chart(
            story, categories=months, series={'1:1 compliance': one_on_one},
            y_max=100, y_suffix='%',
        )
    pdf.line_chart(
        story, categories=months,
        series={
            'Management reviews (YTD)': [p['review_deliveries_ytd'] for p in trend],
            'Pro-rata target': [reviews_target(p['month']) for p in trend],
        },
    )
    pdf.data_table(
        story,
        ['Month', 'TL-Italy syncs', 'Team meetings with HRBP', 'Reviews (YTD)', '1:1 compliance'],
        [
            [
                _month_label(p['month']),
                p['meetings']['tl_sync_count'],
                p['meetings']['team_meetings_with_hrbp'],
                p['review_deliveries_ytd'],
                _dash(None if p['meetings']['one_on_one_compliance_pct'] is None
                      else f"{p['meetings']['one_on_one_compliance_pct']}%"),
            ]
            for p in trend
        ],
        numeric_cols=(1, 2, 3, 4),
    )


def _epr_section(story, scorecard, epr):
    year = date.fromisoformat(scorecard['month']).year
    stages = epr['stages']
    pdf.section_title(story, f'EPR progress {year}')
    pdf.bar_chart(
        story, horizontal=True, y_max=100, y_suffix='%',
        categories=[EPR_STAGE_LABELS[stage] for stage in stages],
        series={'On time': [stages[stage]['pct_on_time'] for stage in stages]},
    )
    pdf.data_table(
        story, ['Stage', 'Due date', 'Completed on time', 'Team size', 'On time'],
        [
            [
                EPR_STAGE_LABELS[stage], stages[stage]['due_date'],
                stages[stage]['completed_on_time'], stages[stage]['team_size'],
                _dash(None if stages[stage]['pct_on_time'] is None
                      else f"{stages[stage]['pct_on_time']}%"),
            ]
            for stage in stages
        ],
        numeric_cols=(2, 3, 4),
    )


def _risks_section(story, scorecard):
    pdf.section_title(story, 'Team risks & seniority')
    risks = [
        ('Open idle flags', scorecard['idle']['open_count']),
        ('Open absences', scorecard['absences']['open_count']),
        ('Absences over 5 days', scorecard['absences']['breached_5_day_sla']),
        ('PIPs pending HR approval', scorecard['pip']['pending_approval_count']),
        ('Escalation risks', scorecard['escalation_count']),
    ]
    pdf.bar_chart(
        story, horizontal=True,
        categories=[label for label, _count in risks],
        series={'Count': [count for _label, count in risks]},
    )
    seniority = scorecard['seniority']
    pdf.donut_chart(story, parts={
        'Junior': seniority['junior'], 'Mid': seniority['mid'],
        'Senior': seniority['senior'], 'Not set': seniority['unset'],
    })


def _governance_section(story, governance):
    pdf.section_title(story, 'Governance records')
    tables = [
        ('Open PIPs', ['Employee', 'Status', 'Start date', 'HR approved'],
         [[r['employee'], r['status'], r['start_date'], 'Yes' if r['approved'] else 'No']
          for r in governance['open_pips']]),
        ('Open absences', ['Employee', 'Absence date', 'Reason'],
         [[r['employee'], r['absence_date'], r['reason'] or NO_DATA]
          for r in governance['open_absences']]),
        ('Pending promotion nominations', ['Employee', 'Nominated on'],
         [[r['employee'], r['nominated_on']] for r in governance['pending_promotions']]),
        ('EPR cycles', ['Employee', 'Goal setting', 'Mid-year', 'Final review', 'Goals'],
         [[r['employee'],
           'Done' if r['goal_setting_done'] else 'Pending',
           'Done' if r['mid_year_done'] else 'Pending',
           'Done' if r['final_review_done'] else 'Pending',
           r['goal_count']]
          for r in governance['epr_cycles']]),
    ]
    for title, headers, rows in tables:
        pdf.paragraph(story, title)
        pdf.data_table(story, headers, rows or [['None open'] + [''] * (len(headers) - 1)],
                       numeric_cols=(len(headers) - 1,) if title == 'EPR cycles' else ())


def _partnership_section(story, hbpr_evidence):
    pdf.section_title(story, 'Partnership log')
    pdf.data_table(
        story, ['Kind', 'Date', 'Shared summary', 'Action items'],
        [[row['kind_display'], row['occurred_on'], row['shared_summary'] or NO_DATA,
          row['action_items'] or NO_DATA] for row in hbpr_evidence],
        col_widths=[34, 22, 62, 60],
    )


def build_scorecard_pdf(scorecard, trend, governance, epr, period_label, leader_name,
                        generated_by, hbpr_evidence=None, include_leave_overtime=True) -> bytes:
    """The TL scorecard PDF. `trend` and `scorecard` are already one-on-one masked
    for the viewer; `epr` is `services.epr_metrics` for the same team and year."""
    buffer = io.BytesIO()
    doc, story, _styles = pdf.new_report(
        buffer,
        title='TL Scorecard Report',
        subtitle=leader_name,
        generated_by=generated_by,
        period_label=period_label,
    )
    rows = kpi_rows(scorecard, include_leave_overtime=include_leave_overtime)
    _cover(story, scorecard, leader_name, period_label, rows)
    _meetings_section(story, trend)
    _epr_section(story, scorecard, epr)
    _risks_section(story, scorecard)
    _governance_section(story, governance)
    if hbpr_evidence:
        _partnership_section(story, hbpr_evidence)
    doc.build(story)
    return buffer.getvalue()
