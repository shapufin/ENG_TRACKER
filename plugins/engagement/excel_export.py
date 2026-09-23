"""
Excel workbook builder for TL engagement KPI exports.

Built on xlsxwriter (not openpyxl) specifically for its native chart
styling, data-bar conditional formatting, and gradient fills — the export
is year-end KPI evidence a team leader hands to a reviewer, so it needs to
look like a real report, not a raw data dump. Self-contained within this
plugin: only xlsxwriter + this plugin's own `services` module are used (no
cross-plugin imports — see the "Plugin removal safety" invariant). The
weighted-mean math is shared with the `summary`/`trend` API actions via
`services.weighted_mean` / `weighted_avg_tta_hours` so the workbook can't
silently drift from what the UI shows.

Sheets: Summary (styled KPI panel + score data bar), Trend (dual-axis
line chart), Approval Aging (styled column chart). No per-team breakdown
table — a TL's own export is implicitly scoped to their own team(s)
already, so a repeat listing of "team / leader" adds nothing.
"""
import io

import xlsxwriter

from .services import AGING_BUCKETS, REQUEST_TYPES, weighted_avg_tta_hours, weighted_mean

PRIMARY = "#1D4ED8"
SUCCESS = "#059669"
WARNING = "#F59E0B"
DANGER = "#DC2626"
INK = "#0F172A"
MUTED = "#475569"
CANVAS = "#F8FAFC"
TYPE_COLORS = {"leave": PRIMARY, "overtime": SUCCESS, "standby": WARNING}


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


class _Formats:
    """Cell formats, built once per workbook against its own format cache."""

    def __init__(self, wb):
        self.title = wb.add_format({
            "bold": True, "font_size": 20, "font_color": "white", "bg_color": PRIMARY,
            "valign": "vcenter", "indent": 1,
        })
        self.subtitle = wb.add_format({
            "italic": True, "font_size": 11, "font_color": "white", "bg_color": PRIMARY,
            "valign": "vcenter", "indent": 1,
        })
        self.section = wb.add_format({
            "bold": True, "font_size": 12, "font_color": INK, "bottom": 2, "bottom_color": PRIMARY,
        })
        self.header = wb.add_format({
            "bold": True, "font_color": "white", "bg_color": INK, "align": "center",
            "valign": "vcenter", "border": 1, "border_color": "#E2E8F0",
        })
        self.label = wb.add_format({"font_color": MUTED, "border": 1, "border_color": "#E2E8F0"})
        self.value = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1,
            "border_color": "#E2E8F0",
        })
        self.value_pct = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1,
            "border_color": "#E2E8F0", "num_format": '0.0"%"',
        })
        self.value_hours = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1,
            "border_color": "#E2E8F0", "num_format": '0.0"h"',
        })
        self.note = wb.add_format({
            "italic": True, "font_color": SUCCESS, "bg_color": "#ECFDF5", "border": 1,
            "border_color": "#A7F3D0", "text_wrap": True, "valign": "vcenter",
        })
        self.empty = wb.add_format({"italic": True, "font_color": MUTED})
        self.cell = wb.add_format({"border": 1, "border_color": "#E2E8F0"})
        self.cell_center = wb.add_format({"border": 1, "border_color": "#E2E8F0", "align": "center"})

        # Score-bucket fills, built once and reused by every score row
        # instead of a fresh add_format() call per cell.
        self.score_good = wb.add_format({
            "bold": True, "align": "center", "font_color": "white", "bg_color": SUCCESS,
            "border": 1, "border_color": "#E2E8F0",
        })
        self.score_warn = wb.add_format({
            "bold": True, "align": "center", "font_color": "white", "bg_color": WARNING,
            "border": 1, "border_color": "#E2E8F0",
        })
        self.score_bad = wb.add_format({
            "bold": True, "align": "center", "font_color": "white", "bg_color": DANGER,
            "border": 1, "border_color": "#E2E8F0",
        })

    def score_fill(self, value):
        if value is None:
            return None
        if value >= 80:
            return self.score_good
        if value >= 50:
            return self.score_warn
        return self.score_bad


def _build_summary_sheet(wb, fmt, target_rows, scope, period_label):
    ws = wb.add_worksheet("Summary")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 34)
    ws.set_column("B:B", 18)

    ws.merge_range("A1:B1", "TL Engagement Report", fmt.title)
    ws.set_row(0, 30)
    scope_label = "Full year" if scope == "year" else "Month"
    ws.merge_range("A2:B2", f"Scope: {scope_label} — {period_label}", fmt.subtitle)
    ws.set_row(1, 20)

    if not target_rows:
        ws.write("A4", "No engagement snapshots have been computed yet for this scope.", fmt.empty)
        return

    agg = _aggregate(target_rows) or {}
    rows_data = [
        ("Engagement Score", agg.get("engagement_score"), "score"),
        ("Team size" if scope == "month" else "Team-months", agg.get("team_size"), "int"),
        ("Active submitters", agg.get("active_submitters"), "int"),
        ("Approval rate", agg.get("approval_rate_pct"), "pct"),
        ("Avg time-to-approve", agg.get("avg_tta_hours"), "hours"),
        ("Resubmissions", agg.get("resubmission_count"), "int"),
        ("Decisions made while TL on leave", agg.get("decisions_during_leave"), "int"),
        ("Speed score", agg.get("score_speed"), "score100"),
        ("Approval-rate score", agg.get("score_approval_rate"), "score100"),
        ("Activity score", agg.get("score_activity"), "score100"),
        ("Consistency score", agg.get("score_consistency"), "score100"),
    ]

    header_row = 3
    ws.write(header_row, 0, "Metric", fmt.header)
    ws.write(header_row, 1, "Value", fmt.header)

    r = header_row + 1
    score_rows = []
    for label, value, kind in rows_data:
        ws.write(r, 0, label, fmt.label)
        if kind == "pct":
            ws.write(r, 1, value, fmt.value_pct) if value is not None else ws.write(r, 1, "—", fmt.value)
        elif kind == "hours":
            ws.write(r, 1, value, fmt.value_hours) if value is not None else ws.write(r, 1, "—", fmt.value)
        elif kind in ("score", "score100"):
            ws.write(r, 1, value if value is not None else "—", fmt.score_fill(value) or fmt.value)
            score_rows.append(r)
        else:
            ws.write(r, 1, value if value is not None else "—", fmt.value)
        r += 1

    # Data-bar conditional formatting on every score row (composite +
    # the 4 sub-scores) — a real gradient fill Excel renders natively,
    # layered on top of the bucket color already written above.
    for score_row in score_rows:
        ws.conditional_format(score_row, 1, score_row, 1, {
            "type": "data_bar",
            "bar_color": PRIMARY,
            "min_type": "num", "min_value": 0,
            "max_type": "num", "max_value": 100,
        })

    if agg.get("decisions_during_leave"):
        r += 1
        note = (
            f"Dedication: this leader made {agg['decisions_during_leave']} approval decision(s) "
            "for their team while on their own approved leave — evidence of above-and-beyond engagement."
        )
        ws.merge_range(r, 0, r, 1, note, fmt.note)
        ws.set_row(r, 34)


def _build_trend_sheet(wb, fmt, trend_rows):
    ws = wb.add_worksheet("Trend")
    ws.hide_gridlines(2)
    monthly = _group_by_month(trend_rows)

    headers = ["Month", "Engagement Score", "Avg TTA (hours)", "Decisions during leave"]
    for col, label in enumerate(headers):
        ws.write(0, col, label, fmt.header)
    ws.set_column(0, 0, 14)
    ws.set_column(1, 3, 18)

    for idx, point in enumerate(monthly, start=1):
        ws.write(idx, 0, point["month"].strftime("%b %Y"), fmt.cell_center)
        ws.write(idx, 1, point["engagement_score"] if point["engagement_score"] is not None else "—", fmt.cell_center)
        ws.write(idx, 2, point["avg_tta_hours"] if point["avg_tta_hours"] is not None else "—", fmt.cell_center)
        ws.write(idx, 3, point["decisions_during_leave"], fmt.cell_center)

    if len(monthly) < 2:
        return

    last_row = len(monthly)
    score_chart = wb.add_chart({"type": "line"})
    score_chart.add_series({
        "name": "Engagement Score",
        "categories": ["Trend", 1, 0, last_row, 0],
        "values": ["Trend", 1, 1, last_row, 1],
        "line": {"color": PRIMARY, "width": 2.75},
        "marker": {"type": "circle", "size": 6, "fill": {"color": "white"}, "border": {"color": PRIMARY}},
        "smooth": True,
    })
    score_chart.set_y_axis({"name": "Score (0-100)", "min": 0, "max": 100})
    score_chart.set_x_axis({"name": "Month"})

    tta_chart = wb.add_chart({"type": "line"})
    tta_chart.add_series({
        "name": "Avg TTA (hours)",
        "categories": ["Trend", 1, 0, last_row, 0],
        "values": ["Trend", 1, 2, last_row, 2],
        "line": {"color": SUCCESS, "width": 2.25, "dash_type": "dash"},
        "marker": {"type": "diamond", "size": 6, "fill": {"color": "white"}, "border": {"color": SUCCESS}},
        "y2_axis": True,
        "smooth": True,
    })
    tta_chart.set_y2_axis({"name": "Avg TTA (hours)"})

    score_chart.combine(tta_chart)
    score_chart.set_title({"name": "Engagement Trend"})
    score_chart.set_size({"width": 760, "height": 380})
    score_chart.set_style(11)
    score_chart.set_legend({"position": "bottom"})
    score_chart.set_plotarea({"fill": {"color": CANVAS}})
    ws.insert_chart("F1", score_chart)


def _build_aging_sheet(wb, fmt, target_rows):
    ws = wb.add_worksheet("Approval Aging")
    ws.hide_gridlines(2)
    totals = {bucket: {t: 0 for t in REQUEST_TYPES} for bucket in AGING_BUCKETS}
    for row in target_rows:
        for type_key, type_metrics in row.metrics.items():
            for bucket in AGING_BUCKETS:
                totals[bucket][type_key] += type_metrics.get("aging", {}).get(bucket, 0)

    ws.write(0, 0, "Aging bucket", fmt.header)
    for col, type_key in enumerate(REQUEST_TYPES, start=1):
        ws.write(0, col, type_key.capitalize(), fmt.header)
    ws.set_column(0, 0, 14)
    ws.set_column(1, len(REQUEST_TYPES), 12)

    for idx, bucket in enumerate(AGING_BUCKETS, start=1):
        ws.write(idx, 0, bucket, fmt.cell_center)
        for col, type_key in enumerate(REQUEST_TYPES, start=1):
            ws.write(idx, col, totals[bucket][type_key], fmt.cell_center)

    last_row = len(AGING_BUCKETS)
    chart = wb.add_chart({"type": "column"})
    for col, type_key in enumerate(REQUEST_TYPES, start=1):
        chart.add_series({
            "name": type_key.capitalize(),
            "categories": ["Approval Aging", 1, 0, last_row, 0],
            "values": ["Approval Aging", 1, col, last_row, col],
            "fill": {"color": TYPE_COLORS[type_key]},
            "gap": 40,
            "data_labels": {"value": True},
        })
    chart.set_title({"name": "Decided requests by time-to-approve"})
    chart.set_x_axis({"name": "Aging bucket"})
    chart.set_y_axis({"name": "Requests"})
    chart.set_size({"width": 760, "height": 380})
    chart.set_style(37)
    chart.set_legend({"position": "bottom"})
    chart.set_plotarea({"fill": {"color": CANVAS}})
    ws.insert_chart("F1", chart)


def build_workbook_bytes(target_rows, trend_rows, scope, period_label):
    """Build the engagement KPI workbook and return it as raw .xlsx bytes.

    ``target_rows``: the exact rows in the requested export scope (one
    month's rows, or a full year's rows) — used for Summary/Aging.
    ``trend_rows``: the (possibly wider) window used only for the Trend
    sheet's chart, e.g. 6 trailing months for a single-month export.
    """
    buffer = io.BytesIO()
    wb = xlsxwriter.Workbook(buffer, {"in_memory": True})
    wb.set_properties({
        "title": f"TL Engagement Report — {period_label}",
        "subject": "TL Engagement Metrics",
        "author": "Engineering Tracker",
        "comments": "Generated from live TLApprovalMetric snapshots.",
    })
    fmt = _Formats(wb)
    _build_summary_sheet(wb, fmt, target_rows, scope, period_label)
    _build_trend_sheet(wb, fmt, trend_rows)
    _build_aging_sheet(wb, fmt, target_rows)
    wb.close()
    return buffer.getvalue()
