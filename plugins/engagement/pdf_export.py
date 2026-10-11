"""TL engagement report as a PDF (`?file_format=pdf` on the export action).

Built only on `core.utils.pdf_report`. Every number comes from the same snapshot
rows the workbook reads: `services.aggregate_rows` for the cover,
`excel_export._group_by_month` and `services.monthly_rollup` for the trend, and
plain sums of each snapshot's per-type metrics for volume and the monthly
tables. The PDF therefore cannot drift from the summary or the XLSX.
"""
import io
from datetime import date

from core.utils import pdf_report as pdf

from .excel_export import _group_by_month
from .services import AGING_BUCKETS, COMPONENT_WEIGHTS, REQUEST_TYPES, aggregate_rows, monthly_rollup, weighted_mean

TYPE_LABELS = {'leave': 'Leave', 'overtime': 'Overtime', 'standby': 'Standby'}
SUB_SCORES = (
    ('speed', 'Within-deadline speed', 'score_speed'),
    ('approval', 'Approval rate', 'score_approval_rate'),
    ('responsiveness', 'Responsiveness', 'score_responsiveness'),
    ('consistency', 'Consistency', 'score_consistency'),
)
FOOTNOTE = "Times computed in Europe/Tirane. Leader's own requests and deactivated users are excluded."


def _score_tone(value):
    """Same 80 / 50 cut-offs as `excel_export._Formats.score_fill`."""
    if value is None:
        return 'muted'
    if value >= 80:
        return 'success'
    if value >= 50:
        return 'warning'
    return 'danger'


def _score_text(value):
    return None if value is None else f'{value:.1f}'


def _pct_text(value):
    return None if value is None else f'{value:.1f}%'


def _hours_text(value):
    return None if value is None else f'{value:.1f} h'


def _by_month(rows):
    grouped = {}
    for row in rows:
        grouped.setdefault(row.month, []).append(row)
    return grouped


def _months_in_scope(scope, rows):
    """Full year (12 months) for a year export, otherwise the months present."""
    if scope == 'year' and rows:
        year = rows[0].month.year
        return [date(year, number, 1) for number in range(1, 13)]
    return sorted({row.month for row in rows})


def _metric_sum(rows, type_key, field):
    return sum(row.metrics.get(type_key, {}).get(field, 0) for row in rows)


def _cover(story, scope, leader_name, period_label, rows):
    agg = aggregate_rows(rows) or {}
    on_time_pct = agg.get('on_time_pct')
    score = agg.get('engagement_score')
    pdf.cover_block(
        story,
        title=leader_name,
        subtitle=f"{'Full year' if scope == 'year' else 'Month'} · {period_label}",
        kpis=[
            ('Engagement score', _score_text(score), _score_tone(score)),
            ('Approval rate', _pct_text(agg.get('approval_rate_pct')), 'ink'),
            ('Average time-to-approve', _hours_text(agg.get('avg_tta_hours')), 'ink'),
            ('On time (of judged requests)', _pct_text(on_time_pct), 'ink'),
            ('Breaches (late or pending past deadline)', agg.get('breaches'),
             'danger' if agg.get('breaches') else 'ink'),
            ('Pending past deadline', agg.get('pending_past_deadline'),
             'danger' if agg.get('pending_past_deadline') else 'ink'),
            ('Decisions made while TL on leave (evidence, not scored)', agg.get('decisions_during_leave'), 'muted'),
            ('Decisions made on public holidays (evidence, not scored)', agg.get('decisions_on_holidays'), 'muted'),
        ],
    )
    if not rows:
        pdf.paragraph(story, 'No engagement snapshots have been computed yet for this scope.')


def _trend_section(story, scope, rows):
    pdf.section_title(story, 'Engagement trend')
    months = _months_in_scope(scope, rows)
    if not months:
        pdf.paragraph(story, 'No data recorded for this scope.')
        return
    labels = [month.strftime('%b' if scope == 'year' else '%b %y') for month in months]
    points = {point['month']: point for point in _group_by_month(rows)}
    rollup = {point['month']: point for point in monthly_rollup(rows)}

    def column(source, key):
        return [source[month][key] if month in source else None for month in months]

    pdf.line_chart(story, categories=labels,
                   series={'Engagement score': column(points, 'engagement_score')}, y_max=100)
    pdf.line_chart(story, categories=labels, y_max=100,
                   series={label: column(rollup, key) for _, label, key in SUB_SCORES})
    weights = ', '.join(f'{label} {round(COMPONENT_WEIGHTS[name] * 100)}%' for name, label, _ in SUB_SCORES)
    pdf.paragraph(story, f'Engagement score is the weighted blend: {weights}. Sub-scores are 0-100.')
    pdf.bar_chart(story, categories=labels, series={'Avg time-to-approve (h)': column(points, 'avg_tta_hours')},
                  y_suffix='h')


def _volume_section(story, scope, rows):
    months = _months_in_scope(scope, rows)
    if not months:
        return
    labels = [month.strftime('%b' if scope == 'year' else '%b %y') for month in months]
    present = _by_month(rows)
    pdf.section_title(story, 'Volume')
    for type_key in REQUEST_TYPES:
        def monthly(field):
            return [_metric_sum(present[month], type_key, field) if month in present else None for month in months]

        pdf.paragraph(story, f'{TYPE_LABELS[type_key]}: requests submitted and decided per month.')
        pdf.bar_chart(story, categories=labels,
                      series={'Submitted': monthly('submitted'), 'Decided': monthly('decided')}, height_mm=45)


def _type_table(story, type_key, rows):
    def total(field):
        return _metric_sum(rows, type_key, field)

    avg_tta = weighted_mean(
        (row.metrics[type_key].get('avg_tta_hours'), row.metrics[type_key].get('decided', 0))
        for row in rows
    )
    single = rows[0].metrics[type_key] if len(rows) == 1 else {}
    pdf.data_table(
        story,
        [TYPE_LABELS[type_key], 'Value'],
        [
            ['Submitted', total('submitted')],
            ['Decided', total('decided')],
            ['Approved', total('approved')],
            ['Rejected', total('rejected')],
            ['On time', total('on_time')],
            ['Breaches', total('breaches')],
            ['Pending past deadline', total('pending_past_deadline')],
            ['Avg time-to-approve', _hours_text(avg_tta)],
            ['P50 time-to-approve', _hours_text(single.get('p50_tta_hours'))],
            ['P90 time-to-approve', _hours_text(single.get('p90_tta_hours'))],
        ],
        col_widths=[80, 40], numeric_cols=(1,),
    )


def _month_block(story, label, rows):
    block = []
    pdf.section_title(block, label)
    if len(rows) > 1:
        pdf.paragraph(block, 'Several teams: percentiles are shown only for single-team months.')
    for type_key in REQUEST_TYPES:
        _type_table(block, type_key, rows)
    pdf.paragraph(block, 'Decided requests by time to approve.')
    pdf.bar_chart(
        block, categories=list(AGING_BUCKETS),
        series={
            TYPE_LABELS[type_key]: [
                sum(row.metrics.get(type_key, {}).get('aging', {}).get(bucket, 0) for row in rows)
                for bucket in AGING_BUCKETS
            ]
            for type_key in REQUEST_TYPES
        },
        height_mm=45,
    )
    pdf.keep_together(story, block)


def _detail_section(story, scope, rows, period_label):
    pdf.section_title(story, 'Monthly detail')
    if not rows:
        pdf.paragraph(story, f'No data recorded for {period_label}.')
        return
    if scope == 'month':
        _month_block(story, period_label, rows)
        return
    by_month = _by_month(rows)
    for month in _months_in_scope(scope, rows):
        if month in by_month:
            _month_block(story, month.strftime('%B %Y'), by_month[month])
        else:
            pdf.paragraph(story, f"No data recorded for {month.strftime('%B')}.")
        if month.month % 2 == 0 and month.month < 12:
            pdf.page_break(story)


def build_report_pdf(target_rows, trend_rows, scope, period_label, leader_name, generated_by) -> bytes:
    """The engagement PDF. `target_rows` is the export scope (one month or a year);
    `trend_rows` is the window used for the trend and volume charts."""
    buffer = io.BytesIO()
    doc, story, _styles = pdf.new_report(
        buffer,
        title='TL Engagement Report',
        subtitle=leader_name,
        generated_by=generated_by,
        period_label=period_label,
    )
    _cover(story, scope, leader_name, period_label, target_rows)
    _trend_section(story, scope, trend_rows)
    _volume_section(story, scope, trend_rows)
    _detail_section(story, scope, target_rows, period_label)
    pdf.paragraph(story, FOOTNOTE)
    doc.build(story)
    return buffer.getvalue()
