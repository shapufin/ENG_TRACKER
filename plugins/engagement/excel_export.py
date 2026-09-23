"""
Excel workbook builder for TL engagement KPI exports.

Self-contained within this plugin: only openpyxl + this plugin's own
`services` module are used (no cross-plugin imports — see the "Plugin
removal safety" invariant). The weighted-mean math is shared with the
`summary`/`trend` API actions via `services.weighted_mean` /
`weighted_avg_tta_hours` so the workbook can't silently drift from what the
UI shows. Produces the year-end KPI evidence file a team leader downloads
from the engagement page: a styled summary, a score/TTA trend chart, an
aging bar chart, and a per-team-month breakdown with conditional score
coloring.
"""
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.utils import get_column_letter

from .services import AGING_BUCKETS, REQUEST_TYPES, weighted_avg_tta_hours, weighted_mean

HEADER_FILL = PatternFill(start_color="1D4ED8", end_color="1D4ED8", fill_type="solid")
HEADER_FONT = Font(bold=True, color="FFFFFF")
TITLE_FONT = Font(bold=True, size=14, color="0F172A")
SCORE_GOOD_FILL = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
SCORE_WARN_FILL = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
SCORE_BAD_FILL = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
THIN_SIDE = Side(style="thin", color="E2E8F0")
THIN_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)
TYPE_COLORS = {"leave": "1D4ED8", "overtime": "059669", "standby": "F59E0B"}


def _score_fill(score):
    if score is None:
        return None
    if score >= 80:
        return SCORE_GOOD_FILL
    if score >= 50:
        return SCORE_WARN_FILL
    return SCORE_BAD_FILL


def _style_header_row(ws, row=1, last_col=2):
    for col in range(1, last_col + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = THIN_BORDER


def _autofit(ws, widths):
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width


def _aggregate(rows):
    """Same weighting rules as the `summary` API action (shared via `services`)."""
    if not rows:
        return None

    team_size = sum(r.team_size for r in rows)
    active_submitters = sum(r.active_submitters for r in rows)
    resubmission_count = sum(r.resubmission_count for r in rows)
    decisions_during_leave = sum(r.decisions_during_leave for r in rows)

    total_decided = sum(sum(m.get("decided", 0) for m in r.metrics.values()) for r in rows)
    total_approved = sum(sum(m.get("approved", 0) for m in r.metrics.values()) for r in rows)
    approval_rate_pct = round((total_approved / total_decided) * 100, 2) if total_decided else None

    return {
        "team_size": team_size,
        "active_submitters": active_submitters,
        "approval_rate_pct": approval_rate_pct,
        "resubmission_count": resubmission_count,
        "decisions_during_leave": decisions_during_leave,
        "avg_tta_hours": weighted_avg_tta_hours(rows),
        "engagement_score": weighted_mean((r.engagement_score, r.team_size) for r in rows),
        "score_speed": weighted_mean((r.score_speed, r.team_size) for r in rows),
        "score_approval_rate": weighted_mean((r.score_approval_rate, r.team_size) for r in rows),
        "score_activity": weighted_mean((r.score_activity, r.team_size) for r in rows),
        "score_consistency": weighted_mean((r.score_consistency, r.team_size) for r in rows),
        "computed_at": max((r.computed_at for r in rows if r.computed_at), default=None),
    }


def _group_by_month(rows):
    by_month = {}
    for row in rows:
        bucket = by_month.setdefault(row.month, {"rows": [], "decisions_during_leave": 0})
        bucket["rows"].append(row)
        bucket["decisions_during_leave"] += row.decisions_during_leave

    results = []
    for month in sorted(by_month):
        bucket = by_month[month]
        results.append({
            "month": month,
            "engagement_score": weighted_mean(
                (r.engagement_score, r.team_size or 1) for r in bucket["rows"]
            ),
            "avg_tta_hours": weighted_avg_tta_hours(bucket["rows"]),
            "decisions_during_leave": bucket["decisions_during_leave"],
        })
    return results


def _build_summary_sheet(ws, target_rows, scope, period_label):
    ws.title = "Summary"
    ws["A1"] = "TL Engagement Report"
    ws["A1"].font = TITLE_FONT
    ws["A2"] = f"Scope: {'Full year' if scope == 'year' else 'Month'} — {period_label}"
    ws["A2"].font = Font(color="475569")

    if not target_rows:
        ws["A4"] = "No engagement snapshots have been computed yet for this scope."
        ws["A4"].font = Font(italic=True, color="475569")
        _autofit(ws, [50])
        return

    agg = _aggregate(target_rows) or {}
    rows_data = [
        ("Engagement Score", agg.get("engagement_score")),
        ("Team size" if scope == "month" else "Team-months", agg.get("team_size")),
        ("Active submitters", agg.get("active_submitters")),
        ("Approval rate (%)", agg.get("approval_rate_pct")),
        ("Avg time-to-approve (hours)", agg.get("avg_tta_hours")),
        ("Resubmissions", agg.get("resubmission_count")),
        ("Decisions made while TL on leave", agg.get("decisions_during_leave")),
        ("Speed score", agg.get("score_speed")),
        ("Approval-rate score", agg.get("score_approval_rate")),
        ("Activity score", agg.get("score_activity")),
        ("Consistency score", agg.get("score_consistency")),
    ]

    header_row = 4
    ws.cell(row=header_row, column=1, value="Metric")
    ws.cell(row=header_row, column=2, value="Value")
    _style_header_row(ws, row=header_row, last_col=2)

    r = header_row + 1
    for label, value in rows_data:
        ws.cell(row=r, column=1, value=label).border = THIN_BORDER
        cell = ws.cell(row=r, column=2, value=value)
        cell.border = THIN_BORDER
        cell.alignment = Alignment(horizontal="center")
        if label == "Engagement Score":
            fill = _score_fill(value)
            if fill:
                cell.fill = fill
        r += 1

    if agg.get("decisions_during_leave"):
        r += 1
        ws.cell(row=r, column=1, value="Dedication note").font = Font(bold=True, color="059669")
        r += 1
        ws.cell(row=r, column=1, value=(
            f"This leader made {agg['decisions_during_leave']} approval decision(s) for their "
            "team while on their own approved leave, evidence of above-and-beyond engagement."
        ))
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        ws.cell(row=r, column=1).alignment = Alignment(wrap_text=True)

    _autofit(ws, [34, 16])


def _build_trend_sheet(ws, trend_rows):
    ws.title = "Trend"
    monthly = _group_by_month(trend_rows)

    ws.cell(row=1, column=1, value="Month")
    ws.cell(row=1, column=2, value="Engagement Score")
    ws.cell(row=1, column=3, value="Avg TTA (hours)")
    ws.cell(row=1, column=4, value="Decisions during leave")
    _style_header_row(ws, row=1, last_col=4)

    for idx, point in enumerate(monthly, start=2):
        ws.cell(row=idx, column=1, value=point["month"].strftime("%b %Y"))
        ws.cell(row=idx, column=2, value=point["engagement_score"])
        ws.cell(row=idx, column=3, value=point["avg_tta_hours"])
        ws.cell(row=idx, column=4, value=point["decisions_during_leave"])
    _autofit(ws, [14, 18, 16, 20])

    if len(monthly) < 2:
        return

    last_row = len(monthly) + 1
    score_chart = LineChart()
    score_chart.title = "Engagement Score"
    score_chart.y_axis.title = "Score (0-100)"
    score_chart.x_axis.title = "Month"
    score_data = Reference(ws, min_col=2, min_row=1, max_row=last_row)
    cats = Reference(ws, min_col=1, min_row=2, max_row=last_row)
    score_chart.add_data(score_data, titles_from_data=True)
    score_chart.set_categories(cats)
    score_chart.series[0].graphicalProperties.line.solidFill = "1D4ED8"

    tta_chart = LineChart()
    tta_data = Reference(ws, min_col=3, min_row=1, max_row=last_row)
    tta_chart.add_data(tta_data, titles_from_data=True)
    tta_chart.series[0].graphicalProperties.line.solidFill = "059669"
    tta_chart.y_axis.axId = 200
    tta_chart.y_axis.title = "Avg TTA (hours)"
    tta_chart.y_axis.crosses = "max"

    # openpyxl's documented secondary-axis recipe: both charts share one
    # x-axis id, and both y-axes cross that shared axis — rather than the
    # earlier attempt of pointing the secondary y-axis's crossAx straight at
    # the primary y-axis, which isn't the pattern Excel expects.
    score_chart.y_axis.crossAx = 500
    tta_chart.y_axis.crossAx = 500
    score_chart.x_axis.axId = 500
    tta_chart.x_axis.axId = 500

    score_chart += tta_chart
    ws.add_chart(score_chart, "F2")


def _build_aging_sheet(ws, target_rows):
    ws.title = "Approval Aging"
    totals = {bucket: {t: 0 for t in REQUEST_TYPES} for bucket in AGING_BUCKETS}
    for row in target_rows:
        for type_key, type_metrics in row.metrics.items():
            for bucket in AGING_BUCKETS:
                totals[bucket][type_key] += type_metrics.get("aging", {}).get(bucket, 0)

    ws.cell(row=1, column=1, value="Aging bucket")
    for col, type_key in enumerate(REQUEST_TYPES, start=2):
        ws.cell(row=1, column=col, value=type_key.capitalize())
    _style_header_row(ws, row=1, last_col=1 + len(REQUEST_TYPES))

    for idx, bucket in enumerate(AGING_BUCKETS, start=2):
        ws.cell(row=idx, column=1, value=bucket)
        for col, type_key in enumerate(REQUEST_TYPES, start=2):
            ws.cell(row=idx, column=col, value=totals[bucket][type_key])
    _autofit(ws, [14, 12, 12, 12])

    last_row = len(AGING_BUCKETS) + 1
    chart = BarChart()
    chart.type = "col"
    chart.grouping = "clustered"
    chart.title = "Decided requests by aging bucket"
    data = Reference(ws, min_col=2, max_col=1 + len(REQUEST_TYPES), min_row=1, max_row=last_row)
    cats = Reference(ws, min_col=1, min_row=2, max_row=last_row)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    for series, type_key in zip(chart.series, REQUEST_TYPES):
        series.graphicalProperties.solidFill = TYPE_COLORS[type_key]
    ws.add_chart(chart, "F2")


def _build_team_breakdown_sheet(ws, target_rows):
    ws.title = "Team Breakdown"
    headers = [
        "Team", "Leader", "Month", "Team size", "Engagement score", "Approval rate (%)",
        "Resubmissions", "Decisions during leave",
    ]
    for col, label in enumerate(headers, start=1):
        ws.cell(row=1, column=col, value=label)
    _style_header_row(ws, row=1, last_col=len(headers))

    for idx, row in enumerate(sorted(target_rows, key=lambda r: (r.month, r.team.name)), start=2):
        ws.cell(row=idx, column=1, value=row.team.name)
        ws.cell(row=idx, column=2, value=row.leader.get_full_name() or row.leader.username)
        ws.cell(row=idx, column=3, value=row.month.strftime("%b %Y"))
        ws.cell(row=idx, column=4, value=row.team_size)
        score_cell = ws.cell(row=idx, column=5, value=row.engagement_score)
        fill = _score_fill(row.engagement_score)
        if fill:
            score_cell.fill = fill
        ws.cell(row=idx, column=6, value=row.approval_rate_pct)
        ws.cell(row=idx, column=7, value=row.resubmission_count)
        ws.cell(row=idx, column=8, value=row.decisions_during_leave)
        for col in range(1, len(headers) + 1):
            ws.cell(row=idx, column=col).border = THIN_BORDER
    _autofit(ws, [20, 20, 12, 10, 14, 16, 14, 18])


def build_workbook(target_rows, trend_rows, scope, period_label):
    """Build the full engagement KPI workbook.

    ``target_rows``: the exact rows in the requested export scope (one
    month's rows, or a full year's rows) — used for Summary/Aging/Team
    Breakdown.
    ``trend_rows``: the (possibly wider) window used only for the Trend
    sheet's chart, e.g. 6 trailing months for a single-month export.
    """
    wb = Workbook()
    _build_summary_sheet(wb.active, target_rows, scope, period_label)
    _build_trend_sheet(wb.create_sheet("Trend"), trend_rows)
    _build_aging_sheet(wb.create_sheet("Approval Aging"), target_rows)
    _build_team_breakdown_sheet(wb.create_sheet("Team Breakdown"), target_rows)
    return wb
