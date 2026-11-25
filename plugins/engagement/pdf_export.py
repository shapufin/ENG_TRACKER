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
from core.utils.timezone_local import business_tz

from .excel_export import _group_by_month
from .services import AGING_BUCKETS, COMPONENT_WEIGHTS, REQUEST_TYPES, aggregate_rows, monthly_rollup, weighted_mean

TYPE_LABELS = {'leave': 'Leave', 'overtime': 'Overtime', 'standby': 'Standby'}
SUB_SCORES = (
    ('speed', 'Within-deadline speed', 'score_speed'),
    ('approval', 'Approval rate', 'score_approval_rate'),
    ('responsiveness', 'Responsiveness', 'score_responsiveness'),
    ('consistency', 'Consistency', 'score_consistency'),
)


def _footnote():
    return f"Times computed in {business_tz()}. Leader's own requests and deactivated users are excluded."


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


def _trend_delta_label(trend_rows, target_month, target_score):
    """MoM delta badge when the target month itself is scored cleanly."""
    if target_score is None or target_month is None:
        return None
    scored = [p for p in monthly_rollup(trend_rows) if p['engagement_score'] is not None]
    if len(scored) < 2 or scored[-1]['month'] != target_month:
        return None
    diff = round(scored[-1]['engagement_score'] - scored[-2]['engagement_score'], 1)
    sign = '+' if diff >= 0 else ''
    prev_label = scored[-2]['month'].strftime('%b')
    return f'{sign}{diff:.1f} pts vs {prev_label}'


def _cover(story, scope, leader_name, period_label, rows, trend_rows):
    agg = aggregate_rows(rows) or {}
    on_time_pct = agg.get('on_time_pct')
    score = agg.get('engagement_score')
    target_month = max((r.month for r in rows), default=None) if scope == 'month' else None
    delta_label = _trend_delta_label(trend_rows, target_month, score)
    pdf.cover_block(
        story,
        title=leader_name,
        subtitle=f"{'Full year' if scope == 'year' else 'Month'} · {period_label}",
        kpis=[
            ('Engagement score', _score_text(score), _score_tone(score), delta_label),
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

    pdf.combo_chart(
        story,
        categories=labels,
        area_series=('Engagement score', column(points, 'engagement_score')),
        line_series=('Avg TTA (hours)', column(points, 'avg_tta_hours')),
        y_max=100,
        y2_suffix='h',
        thresholds=[(80, 'Healthy 80', 'success'), (50, 'Watch 50', 'warning')],
        title='Engagement Score & Approval Speed (Avg TTA)',
        subtitle='Composite score (0-100, left axis) against average time-to-approve (hours, right axis).',
    )
    weights = ', '.join(f'{label} {round(COMPONENT_WEIGHTS[name] * 100)}%' for name, label, _ in SUB_SCORES)
    pdf.line_chart(
        story,
        categories=labels,
        y_max=100,
        series={label: column(rollup, key) for _, label, key in SUB_SCORES},
        thresholds=[(80, '80', 'success')],
        title='Score Component Drivers (0-100)',
        subtitle=f'Weighted blend: {weights}.',
    )


def _volume_section(story, scope, rows):
    months = _months_in_scope(scope, rows)
    if not months:
        return
    labels = [month.strftime('%b' if scope == 'year' else '%b %y') for month in months]
    present = _by_month(rows)
    pdf.section_title(story, 'Request volume & decision status')

    submitted, approved, rejected, pending = [], [], [], []
    summary_rows = []
    for month in months:
        m_rows = present.get(month, [])
        sub = sum(_metric_sum(m_rows, tk, 'submitted') for tk in REQUEST_TYPES)
        dec = sum(_metric_sum(m_rows, tk, 'decided') for tk in REQUEST_TYPES)
        app = sum(_metric_sum(m_rows, tk, 'approved') for tk in REQUEST_TYPES)
        rej = sum(_metric_sum(m_rows, tk, 'rejected') for tk in REQUEST_TYPES)
        pen = max(0, sub - dec)
        submitted.append(sub if m_rows else None)
        approved.append(app if m_rows else 0)
        rejected.append(rej if m_rows else 0)
        pending.append(pen if m_rows else 0)
        if m_rows:
            agg = aggregate_rows(m_rows) or {}
            summary_rows.append([
                month.strftime('%b %Y'),
                sub,
                dec,
                app,
                rej,
                pen,
                _pct_text(agg.get('on_time_pct')),
                _hours_text(agg.get('avg_tta_hours')),
                _score_text(agg.get('engagement_score')),
            ])

    pdf.stacked_bar_chart(
        story,
        categories=labels,
        series={'Approved': approved, 'Rejected': rejected, 'Undecided': pending},
        colors_override=['success', 'danger', 'warning'],
        overlay_line=('Submitted', submitted),
        integer_y=True,
        title='Monthly Requests by Outcome vs Submitted Total',
        subtitle='Decided vs undecided (pending or cancelled) across Leave, Overtime, and Standby.',
    )
    if summary_rows:
        pdf.data_table(
            story,
            ['Month', 'Subm', 'Dec', 'Appr', 'Rej', 'Undec', 'On time', 'Avg TTA', 'Score'],
            summary_rows,
            col_widths=[26, 15, 15, 15, 15, 15, 25, 26, 26],
            numeric_cols=(1, 2, 3, 4, 5, 6, 7, 8),
        )


def _unified_type_table(story, rows):
    """Single full-width 4-column comparison table (Metric | Leave | Overtime | Standby)."""
    def total(tk, field):
        return _metric_sum(rows, tk, field)

    def avg_tta(tk):
        return _hours_text(weighted_mean(
            (row.metrics.get(tk, {}).get('avg_tta_hours'), row.metrics.get(tk, {}).get('decided', 0))
            for row in rows
        ))

    def single_pct(tk, field):
        if len(rows) != 1:
            return None
        return _hours_text(rows[0].metrics.get(tk, {}).get(field))

    table_rows = [
        ['Submitted'] + [total(tk, 'submitted') for tk in REQUEST_TYPES],
        ['Decided'] + [total(tk, 'decided') for tk in REQUEST_TYPES],
        ['Approved'] + [total(tk, 'approved') for tk in REQUEST_TYPES],
        ['Rejected'] + [total(tk, 'rejected') for tk in REQUEST_TYPES],
        ['On time'] + [total(tk, 'on_time') for tk in REQUEST_TYPES],
        ['Breaches'] + [total(tk, 'breaches') for tk in REQUEST_TYPES],
        ['Pending past deadline'] + [total(tk, 'pending_past_deadline') for tk in REQUEST_TYPES],
        ['Avg time-to-approve'] + [avg_tta(tk) for tk in REQUEST_TYPES],
        ['P50 time-to-approve'] + [single_pct(tk, 'p50_tta_hours') for tk in REQUEST_TYPES],
        ['P90 time-to-approve'] + [single_pct(tk, 'p90_tta_hours') for tk in REQUEST_TYPES],
    ]
    pdf.data_table(
        story,
        ['Metric', 'Leave', 'Overtime', 'Standby'],
        table_rows,
        col_widths=[70, 36, 36, 36],
        numeric_cols=(1, 2, 3),
    )


def _month_block(story, label, rows, *, section_header=None):
    block = []
    if section_header:
        pdf.section_title(block, section_header)
    pdf.sub_section(block, label)
    if len(rows) > 1:
        pdf.paragraph(block, 'Several teams: percentiles are shown only for single-team months.')
    _unified_type_table(block, rows)
    pdf.bar_chart(
        block,
        categories=list(AGING_BUCKETS),
        series={
            TYPE_LABELS[type_key]: [
                sum(row.metrics.get(type_key, {}).get('aging', {}).get(bucket, 0) for row in rows)
                for bucket in AGING_BUCKETS
            ]
            for type_key in REQUEST_TYPES
        },
        height_mm=44,
        integer_y=True,
        show_values=True,
        title=f'{label} — Decided requests by time to approve',
    )
    pdf.keep_together(story, block)


def _detail_section(story, scope, rows, period_label):
    if not rows:
        pdf.section_title(story, 'Monthly detail')
        pdf.paragraph(story, f'No data recorded for {period_label}.')
        return
    if scope == 'month':
        _month_block(story, period_label, rows, section_header='Monthly detail')
        return
    by_month = _by_month(rows)
    empty_months = []
    first = True
    for month in _months_in_scope(scope, rows):
        if month in by_month:
            _month_block(
                story, month.strftime('%B %Y'), by_month[month],
                section_header='Monthly detail' if first else None,
            )
            first = False
        else:
            empty_months.append(month.strftime('%B'))
    if empty_months:
        pdf.paragraph(story, f"Months with no recorded snapshots: {', '.join(empty_months)}.")


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
    _cover(story, scope, leader_name, period_label, target_rows, trend_rows)
    _trend_section(story, scope, trend_rows)
    _volume_section(story, scope, trend_rows)
    _detail_section(story, scope, target_rows, period_label)
    pdf.paragraph(story, _footnote())
    doc.build(story)
    return buffer.getvalue()
