"""
Excel workbook builder for TL engagement KPI exports.

Built on xlsxwriter (not openpyxl) specifically for its native chart
styling, data-bar conditional formatting, and gradient fills — the export
is year-end KPI evidence a team leader hands to a reviewer, so it needs to
look like a real report, not a raw data dump. Self-contained within this
plugin: only xlsxwriter + this plugin's own `services` module are used (no
cross-plugin imports — see the "Plugin removal safety" invariant). The
aggregation math is shared with the `summary` API action via
`services.aggregate_rows` so the workbook can't silently drift from what
the UI shows.

Sheets: Summary (styled KPI panel + score data bar), Trend (dual-axis
line chart), Approval Aging (styled column chart). No per-team breakdown
table — a TL's own export is implicitly scoped to their own team(s)
already, so a repeat listing of "team / leader" adds nothing.
"""
import io

import xlsxwriter

from .services import (
    AGING_BUCKETS,
    COMPONENT_WEIGHTS,
    REQUEST_TYPES,
    aggregate_rows,
    weighted_avg_tta_hours,
    weighted_mean,
)
from .sla import SLA_WORKING_DAYS

PRIMARY = "#1D4ED8"
SUCCESS = "#059669"
WARNING = "#F59E0B"
DANGER = "#DC2626"
INK = "#0F172A"
MUTED = "#475569"
RULE = "#E2E8F0"
CANVAS = "#F8FAFC"
TYPE_COLORS = {"leave": PRIMARY, "overtime": SUCCESS, "standby": WARNING}
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]


def _print_setup(ws, title_rows=None):
    ws.set_landscape()
    ws.set_paper(9)  # A4
    ws.fit_to_pages(1, 0)
    if title_rows:
        ws.repeat_rows(*title_rows)


def _group_by_month(rows):
    by_month = {}
    for row in rows:
        bucket = by_month.setdefault(row.month, {"rows": [], "decisions_during_leave": 0, "decisions_on_holidays": 0})
        bucket["rows"].append(row)
        bucket["decisions_during_leave"] += row.decisions_during_leave
        bucket["decisions_on_holidays"] += row.decisions_on_holidays

    results = []
    for month in sorted(by_month):
        bucket = by_month[month]
        m_rows = bucket["rows"]
        sub = sum(r.metrics.get(tk, {}).get("submitted", 0) for r in m_rows for tk in REQUEST_TYPES)
        dec = sum(r.metrics.get(tk, {}).get("decided", 0) for r in m_rows for tk in REQUEST_TYPES)
        app = sum(r.metrics.get(tk, {}).get("approved", 0) for r in m_rows for tk in REQUEST_TYPES)
        rej = sum(r.metrics.get(tk, {}).get("rejected", 0) for r in m_rows for tk in REQUEST_TYPES)
        results.append({
            "month": month,
            "engagement_score": weighted_mean(
                (r.engagement_score, r.team_size or 1) for r in m_rows
            ),
            "avg_tta_hours": weighted_avg_tta_hours(m_rows),
            "score_speed": weighted_mean((r.score_speed, r.team_size or 1) for r in m_rows),
            "score_approval_rate": weighted_mean((r.score_approval_rate, r.team_size or 1) for r in m_rows),
            "score_responsiveness": weighted_mean((r.score_responsiveness, r.team_size or 1) for r in m_rows),
            "score_consistency": weighted_mean((r.score_consistency, r.team_size or 1) for r in m_rows),
            "decisions_during_leave": bucket["decisions_during_leave"],
            "decisions_on_holidays": bucket["decisions_on_holidays"],
            "submitted": sub,
            "decided": dec,
            "approved": app,
            "rejected": rej,
            "pending": max(0, sub - dec),
        })
    return results


class _Formats:
    """Cell formats, built once per workbook against its own format cache."""

    def __init__(self, wb):
        self.title = wb.add_format({
            "bold": True, "font_size": 18, "font_color": "white", "bg_color": PRIMARY,
            "valign": "vcenter", "indent": 1,
        })
        self.subtitle = wb.add_format({
            "italic": True, "font_size": 10, "font_color": "white", "bg_color": PRIMARY,
            "valign": "vcenter", "indent": 1,
        })
        self.section = wb.add_format({
            "bold": True, "font_size": 11, "font_color": INK, "bottom": 2, "bottom_color": PRIMARY,
        })
        self.header = wb.add_format({
            "bold": True, "font_color": "white", "bg_color": INK, "align": "center",
            "valign": "vcenter", "border": 1, "border_color": RULE,
        })
        self.label = wb.add_format({"font_color": MUTED, "border": 1, "border_color": RULE})
        self.value = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1,
            "border_color": RULE, "num_format": "#,##0",
        })
        self.value_dec = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1,
            "border_color": RULE, "num_format": "0.0",
        })
        self.value_pct = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1,
            "border_color": RULE, "num_format": '0.0"%"',
        })
        self.value_hours = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1,
            "border_color": RULE, "num_format": '0.0"h"',
        })
        self.delta_up = wb.add_format({
            "bold": True, "align": "center", "font_color": "#166534", "bg_color": "#DCFCE7",
            "border": 1, "border_color": RULE, "num_format": "+0.0;-0.0;0.0",
        })
        self.delta_zero = wb.add_format({
            "bold": True, "align": "center", "font_color": MUTED, "bg_color": "#F1F5F9",
            "border": 1, "border_color": RULE, "num_format": "+0.0;-0.0;0.0",
        })
        self.delta_down = wb.add_format({
            "bold": True, "align": "center", "font_color": "#991B1B", "bg_color": "#FEE2E2",
            "border": 1, "border_color": RULE, "num_format": "+0.0;-0.0;0.0",
        })
        self.note = wb.add_format({
            "italic": True, "font_color": "#166534", "bg_color": "#ECFDF5", "border": 1,
            "border_color": "#A7F3D0", "text_wrap": True, "valign": "vcenter",
        })
        self.empty = wb.add_format({"italic": True, "font_color": MUTED})
        self.dash = wb.add_format({"font_color": MUTED, "align": "center", "border": 1, "border_color": RULE})
        self.cell = wb.add_format({"border": 1, "border_color": RULE})
        self.cell_center = wb.add_format({"border": 1, "border_color": RULE, "align": "center"})
        self.cell_dec = wb.add_format({
            "border": 1, "border_color": RULE, "align": "center", "num_format": "0.0",
        })
        self.cell_pct = wb.add_format({
            "border": 1, "border_color": RULE, "align": "center", "num_format": '0.0"%"',
        })

        # Pastel score-bucket fills (high contrast ink on light tint, readable under data bars).
        self.score_good = wb.add_format({
            "bold": True, "align": "center", "font_color": "#166534", "bg_color": "#DCFCE7",
            "border": 1, "border_color": RULE, "num_format": "0.0",
        })
        self.score_warn = wb.add_format({
            "bold": True, "align": "center", "font_color": "#92400E", "bg_color": "#FEF3C7",
            "border": 1, "border_color": RULE, "num_format": "0.0",
        })
        self.score_bad = wb.add_format({
            "bold": True, "align": "center", "font_color": "#991B1B", "bg_color": "#FEE2E2",
            "border": 1, "border_color": RULE, "num_format": "0.0",
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
    _print_setup(ws, (3, 3))
    ws.freeze_panes(4, 0)
    ws.set_column("A:A", 38)
    ws.set_column("B:B", 18)
    ws.set_column("C:C", 22)

    ws.merge_range("A1:C1", "TL Engagement Report", fmt.title)
    ws.set_row(0, 30)
    scope_label = "Full year" if scope == "year" else "Month"
    ws.merge_range("A2:C2", f"Scope: {scope_label} — {period_label}", fmt.subtitle)
    ws.set_row(1, 20)

    if not target_rows:
        ws.write("A4", "No engagement snapshots have been computed yet for this scope.", fmt.empty)
        return

    agg = aggregate_rows(target_rows) or {}
    sla_note = f"Leave 0d / OT {SLA_WORKING_DAYS['overtime']}d / SB {SLA_WORKING_DAYS['standby']}d"
    rows_data = [
        ("Engagement Score", agg.get("engagement_score"), "score", "80+ Healthy / 50-79 Watch"),
        ("Team size" if scope == "month" else "Team-months", agg.get("team_size"), "int",
         "Active direct reports" if scope == "month" else "Team-month snapshots"),
        ("Active submitters", agg.get("active_submitters"), "int", "Submitted in period"),
        ("Approval rate", agg.get("approval_rate_pct"), "pct", "Approved / decided"),
        ("Avg time-to-approve", agg.get("avg_tta_hours"), "hours", "Submission to decision"),
        ("Resubmissions", agg.get("resubmission_count"), "int", "Rejected requests later resubmitted"),
        ("Decisions made while TL on leave", agg.get("decisions_during_leave"), "int", "Evidence only"),
        ("Requests judged against SLA", agg.get("judgeable"), "int", sla_note),
        ("Decided within deadline", agg.get("on_time"), "int", "On-time decisions"),
        ("Breaches (late or pending past deadline)", agg.get("breaches"), "int", "Target: 0"),
        ("Pending past deadline", agg.get("pending_past_deadline"), "int", "Target: 0"),
        ("Decisions made on public holidays (evidence)", agg.get("decisions_on_holidays"), "int", "Evidence only"),
        ("Within-deadline score", agg.get("score_speed"), "score100",
         f"Weight: {round(COMPONENT_WEIGHTS['speed'] * 100)}%"),
        ("Approval-rate score", agg.get("score_approval_rate"), "score100",
         f"Weight: {round(COMPONENT_WEIGHTS['approval'] * 100)}%"),
        ("Responsiveness score", agg.get("score_responsiveness"), "score100",
         f"Weight: {round(COMPONENT_WEIGHTS['responsiveness'] * 100)}%"),
        ("Consistency score", agg.get("score_consistency"), "score100",
         f"Weight: {round(COMPONENT_WEIGHTS['consistency'] * 100)}%"),
    ]

    header_row = 3
    for col, label in enumerate(["Metric", "Value", "Benchmark / Notes"]):
        ws.write(header_row, col, label, fmt.header)

    r = header_row + 1
    score_rows = []
    for label, value, kind, bench in rows_data:
        ws.write(r, 0, label, fmt.label)
        if kind == "pct":
            ws.write(r, 1, value, fmt.value_pct) if value is not None else ws.write(r, 1, "—", fmt.dash)
        elif kind == "hours":
            ws.write(r, 1, value, fmt.value_hours) if value is not None else ws.write(r, 1, "—", fmt.dash)
        elif kind in ("score", "score100"):
            ws.write(r, 1, value if value is not None else "—", fmt.score_fill(value) or fmt.dash)
            score_rows.append(r)
        else:
            ws.write(r, 1, value if value is not None else "—", fmt.value if value is not None else fmt.dash)
        ws.write(r, 2, bench, fmt.label)
        r += 1

    for score_row in score_rows:
        ws.conditional_format(score_row, 1, score_row, 1, {
            "type": "data_bar",
            "bar_color": "#93C5FD",
            "min_type": "num", "min_value": 0,
            "max_type": "num", "max_value": 100,
        })

    # Per-request-type breakdown table below Summary
    r += 1
    ws.write(r, 0, "Breakdown by request type", fmt.section)
    r += 1
    type_headers = ["Request type", "Submitted", "Decided", "Approved", "Rejected", "On time", "Breaches", "Avg TTA (h)"]
    ws.set_column("D:H", 13)
    for col, lbl in enumerate(type_headers):
        ws.write(r, col, lbl, fmt.header)
    r += 1
    for tk in REQUEST_TYPES:
        sub = sum(row.metrics.get(tk, {}).get("submitted", 0) for row in target_rows)
        dec = sum(row.metrics.get(tk, {}).get("decided", 0) for row in target_rows)
        app = sum(row.metrics.get(tk, {}).get("approved", 0) for row in target_rows)
        rej = sum(row.metrics.get(tk, {}).get("rejected", 0) for row in target_rows)
        ont = sum(row.metrics.get(tk, {}).get("on_time", 0) for row in target_rows)
        br = sum(row.metrics.get(tk, {}).get("breaches", 0) for row in target_rows)
        tta = weighted_mean(
            (row.metrics.get(tk, {}).get("avg_tta_hours"), row.metrics.get(tk, {}).get("decided", 0))
            for row in target_rows
        )
        ws.write(r, 0, tk.capitalize(), fmt.label)
        for col_i, val in enumerate((sub, dec, app, rej, ont, br), start=1):
            ws.write_number(r, col_i, val, fmt.value)
        ws.write(r, 7, tta, fmt.value_hours) if tta is not None else ws.write(r, 7, "—", fmt.dash)
        r += 1

    if agg.get("decisions_during_leave"):
        r += 1
        note = (
            f"Dedication: this leader made {agg['decisions_during_leave']} approval decision(s) "
            "for their team while on their own approved leave — evidence of above-and-beyond engagement."
        )
        ws.merge_range(r, 0, r, 7, note, fmt.note)
        ws.set_row(r, 30)


def _build_trend_sheet(wb, fmt, trend_rows):
    ws = wb.add_worksheet("Trend")
    ws.hide_gridlines(2)
    _print_setup(ws, (3, 3))
    ws.freeze_panes(4, 0)
    monthly = _group_by_month(trend_rows)

    headers = [
        "Month", "Engagement Score", "MoM Change", "Avg TTA (hours)",
        "Speed Score", "Approval Score", "Responsiveness", "Consistency",
        "Decisions on Leave",
    ]
    ws.merge_range(0, 0, 0, len(headers) - 1, "Engagement Trend & Component Drivers", fmt.title)
    ws.set_row(0, 30)
    ws.merge_range(1, 0, 1, len(headers) - 1, "Linear trends with month-over-month score delta (no spline overshoot).", fmt.subtitle)
    ws.set_row(1, 20)
    for col, label in enumerate(headers):
        ws.write(3, col, label, fmt.header)
    ws.set_column(0, 0, 13)
    ws.set_column(1, 8, 16)

    prev_score = None
    for offset, point in enumerate(monthly):
        r = 4 + offset
        ws.write(r, 0, point["month"].strftime("%b %Y"), fmt.cell_center)
        sc = point["engagement_score"]
        if sc is not None:
            ws.write(r, 1, sc, fmt.score_fill(sc) or fmt.dash)
        else:
            ws.write_blank(r, 1, None, fmt.dash)
        if sc is not None and prev_score is not None:
            delta = round(sc - prev_score, 1)
            delta_fmt = fmt.delta_up if delta > 0 else (fmt.delta_down if delta < 0 else fmt.delta_zero)
            ws.write_number(r, 2, delta, delta_fmt)
        else:
            ws.write(r, 2, "—", fmt.dash)
        prev_score = sc
        tta = point["avg_tta_hours"]
        if tta is not None:
            ws.write(r, 3, tta, fmt.cell_dec)
        else:
            ws.write_blank(r, 3, None, fmt.dash)
        for c_off, key in enumerate(("score_speed", "score_approval_rate", "score_responsiveness", "score_consistency"), start=4):
            val = point[key]
            if val is not None:
                ws.write(r, c_off, val, fmt.cell_dec)
            else:
                ws.write_blank(r, c_off, None, fmt.dash)
        ws.write_number(r, 8, point["decisions_during_leave"], fmt.cell_center)

    if len(monthly) < 2:
        return

    first_row = 4
    last_row = 4 + len(monthly) - 1

    # Chart 1: Column (Engagement Score) + Line on Y2 (Avg TTA) — linear, clear direction of change.
    score_chart = wb.add_chart({"type": "column"})
    score_chart.add_series({
        "name": "Engagement Score",
        "categories": ["Trend", first_row, 0, last_row, 0],
        "values": ["Trend", first_row, 1, last_row, 1],
        "fill": {"color": SERIES[0]},
        "gap": 60,
        "data_labels": {"value": True, "num_format": "0.0"},
    })
    score_chart.set_y_axis({"name": "Score (0-100)", "min": 0, "max": 100})
    score_chart.set_x_axis({"name": "Month"})

    tta_chart = wb.add_chart({"type": "line"})
    tta_chart.add_series({
        "name": "Avg TTA (hours)",
        "categories": ["Trend", first_row, 0, last_row, 0],
        "values": ["Trend", first_row, 3, last_row, 3],
        "line": {"color": SERIES[1], "width": 2.5},
        "marker": {"type": "diamond", "size": 6, "fill": {"color": "white"}, "border": {"color": SERIES[1]}},
        "y2_axis": True,
        "smooth": False,
    })
    tta_chart.set_y2_axis({"name": "Avg TTA (hours)", "min": 0})
    score_chart.combine(tta_chart)
    score_chart.show_blanks_as("gap")
    score_chart.set_title({"name": "Engagement Score vs Avg Time-to-Approve"})
    score_chart.set_size({"width": 760, "height": 360})
    score_chart.set_style(11)
    score_chart.set_legend({"position": "bottom"})
    score_chart.set_plotarea({"fill": {"color": CANVAS}})
    ws.insert_chart("K4", score_chart)

    # Chart 2: Four component sub-scores (linear lines, blank gaps never plotted as zero)
    sub_keys = ("score_speed", "score_approval_rate", "score_responsiveness", "score_consistency")
    comp_series = [
        (col_idx, colour)
        for col_idx, colour, key in zip((4, 5, 6, 7), SERIES, sub_keys)
        if any(p[key] is not None for p in monthly)
    ]
    if comp_series:
        comp_chart = wb.add_chart({"type": "line"})
        for col_idx, colour in comp_series:
            comp_chart.add_series({
                "name": ["Trend", 3, col_idx],
                "categories": ["Trend", first_row, 0, last_row, 0],
                "values": ["Trend", first_row, col_idx, last_row, col_idx],
                "line": {"color": colour, "width": 2.25},
                "marker": {"type": "circle", "size": 5, "fill": {"color": "white"}, "border": {"color": colour}},
                "smooth": False,
            })
        comp_chart.show_blanks_as("gap")
        comp_chart.set_title({"name": "Score Component Drivers (0-100)"})
        comp_chart.set_x_axis({"name": "Month"})
        comp_chart.set_y_axis({"name": "Sub-score (0-100)", "min": 0, "max": 100})
        comp_chart.set_size({"width": 760, "height": 340})
        comp_chart.set_style(11)
        comp_chart.set_legend({"position": "bottom"})
        comp_chart.set_plotarea({"fill": {"color": CANVAS}})
        ws.insert_chart("K23", comp_chart)


def _build_aging_sheet(wb, fmt, target_rows):
    ws = wb.add_worksheet("Approval Aging")
    ws.hide_gridlines(2)
    _print_setup(ws, (3, 3))
    ws.freeze_panes(4, 0)
    totals = {bucket: {t: 0 for t in REQUEST_TYPES} for bucket in AGING_BUCKETS}
    for row in target_rows:
        for type_key, type_metrics in row.metrics.items():
            for bucket in AGING_BUCKETS:
                totals[bucket][type_key] += type_metrics.get("aging", {}).get(bucket, 0)

    grand_total = sum(totals[b][t] for b in AGING_BUCKETS for t in REQUEST_TYPES)
    headers = ["Aging bucket", "Leave", "Overtime", "Standby", "Total", "Share %"]
    ws.merge_range(0, 0, 0, len(headers) - 1, "Approval Aging Distribution", fmt.title)
    ws.set_row(0, 30)
    ws.merge_range(1, 0, 1, len(headers) - 1, "Decided requests by time-to-approve bucket.", fmt.subtitle)
    ws.set_row(1, 20)
    for col, label in enumerate(headers):
        ws.write(3, col, label, fmt.header)
    ws.set_column(0, 0, 16)
    ws.set_column(1, 5, 13)

    for idx, bucket in enumerate(AGING_BUCKETS):
        r = 4 + idx
        row_total = sum(totals[bucket][t] for t in REQUEST_TYPES)
        share = round((row_total / grand_total) * 100, 1) if grand_total else 0.0
        ws.write(r, 0, bucket, fmt.cell_center)
        for col, type_key in enumerate(REQUEST_TYPES, start=1):
            ws.write_number(r, col, totals[bucket][type_key], fmt.cell_center)
        ws.write_number(r, 4, row_total, fmt.value)
        ws.write_number(r, 5, share, fmt.cell_pct)

    first_row = 4
    last_row = 4 + len(AGING_BUCKETS) - 1
    chart = wb.add_chart({"type": "column", "subtype": "stacked"})
    for col, type_key in enumerate(REQUEST_TYPES, start=1):
        chart.add_series({
            "name": type_key.capitalize(),
            "categories": ["Approval Aging", first_row, 0, last_row, 0],
            "values": ["Approval Aging", first_row, col, last_row, col],
            "fill": {"color": TYPE_COLORS[type_key]},
            "gap": 45,
            "data_labels": {"value": True, "num_format": '#,##0;;""'},
        })
    chart.set_title({"name": "Decided requests by time-to-approve (stacked)"})
    chart.set_x_axis({"name": "Aging bucket"})
    chart.set_y_axis({"name": "Requests"})
    chart.set_size({"width": 720, "height": 360})
    chart.set_style(11)
    chart.set_legend({"position": "bottom"})
    chart.set_plotarea({"fill": {"color": CANVAS}})
    ws.insert_chart("H4", chart)


def _build_volume_sheet(wb, fmt, trend_rows):
    ws = wb.add_worksheet("Monthly Volume")
    ws.hide_gridlines(2)
    _print_setup(ws, (3, 3))
    ws.freeze_panes(4, 0)
    monthly = _group_by_month(trend_rows)
    headers = ["Month", "Submitted", "Decided", "Approved", "Rejected", "Undecided"]
    ws.merge_range(0, 0, 0, len(headers) - 1, "Monthly Request Volume & Status", fmt.title)
    ws.set_row(0, 30)
    ws.merge_range(1, 0, 1, len(headers) - 1, "Decided vs undecided (pending or cancelled) requests.", fmt.subtitle)
    ws.set_row(1, 20)
    for col, label in enumerate(headers):
        ws.write(3, col, label, fmt.header)
    ws.set_column(0, 5, 15)

    for idx, point in enumerate(monthly):
        r = 4 + idx
        ws.write(r, 0, point["month"].strftime("%b %Y"), fmt.cell_center)
        for col, key in enumerate(("submitted", "decided", "approved", "rejected", "pending"), start=1):
            ws.write_number(r, col, point[key], fmt.cell_center)

    if not monthly:
        return
    first_row = 4
    last_row = 4 + len(monthly) - 1
    stacked = wb.add_chart({"type": "column", "subtype": "stacked"})
    for col, colour in ((3, SUCCESS), (4, DANGER), (5, WARNING)):
        stacked.add_series({
            "name": ["Monthly Volume", 3, col],
            "categories": ["Monthly Volume", first_row, 0, last_row, 0],
            "values": ["Monthly Volume", first_row, col, last_row, col],
            "fill": {"color": colour},
            "gap": 50,
        })
    sub_line = wb.add_chart({"type": "line"})
    sub_line.add_series({
        "name": ["Monthly Volume", 3, 1],
        "categories": ["Monthly Volume", first_row, 0, last_row, 0],
        "values": ["Monthly Volume", first_row, 1, last_row, 1],
        "line": {"color": INK, "width": 2.0, "dash_type": "dash"},
        "marker": {"type": "circle", "size": 5, "fill": {"color": "white"}, "border": {"color": INK}},
    })
    stacked.combine(sub_line)
    stacked.set_title({"name": "Monthly Decisions & Undecided vs Submitted"})
    stacked.set_x_axis({"name": "Month"})
    stacked.set_y_axis({"name": "Requests", "min": 0})
    stacked.set_size({"width": 720, "height": 360})
    stacked.set_style(11)
    stacked.set_legend({"position": "bottom"})
    stacked.set_plotarea({"fill": {"color": CANVAS}})
    ws.insert_chart("H4", stacked)


def build_workbook_bytes(target_rows, trend_rows, scope, period_label):
    """Build the engagement KPI workbook and return it as raw .xlsx bytes.

    ``target_rows``: the exact rows in the requested export scope (one
    month's rows, or a full year's rows) — used for Summary/Aging.
    ``trend_rows``: the (possibly wider) window used only for the Trend/Volume
    sheets, e.g. 6 trailing months for a single-month export.
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
    _build_volume_sheet(wb, fmt, trend_rows)
    wb.close()
    return buffer.getvalue()
