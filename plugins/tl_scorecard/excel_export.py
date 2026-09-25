"""
Excel workbook builder for TL Scorecard evidence exports.

Same intent and library choice as `plugins/engagement/excel_export.py`
(xlsxwriter, not openpyxl, for native styling) — this is evidence a TL
hands to a reviewer, not a raw data dump. Self-contained within this
plugin: only xlsxwriter + this plugin's own `services` output (already-
computed `dict`s passed in) are used — no cross-plugin imports, see the
"Plugin removal safety" invariant.

Sheets: Summary (scorecard metrics), KPI Coverage (status per KPI),
Governance (open PIPs/absences/pending promotions/EPR cycle progress).
"""
import io

import xlsxwriter

PRIMARY = "#1D4ED8"
SUCCESS = "#059669"
WARNING = "#F59E0B"
DANGER = "#DC2626"
INK = "#0F172A"
MUTED = "#475569"

STATUS_COLORS = {
    "measured": SUCCESS,
    "approximate": WARNING,
    "planned": "#6366F1",
    "blocked": DANGER,
    "excluded": MUTED,
}


class _Formats:
    def __init__(self, wb):
        self.title = wb.add_format({
            "bold": True, "font_size": 20, "font_color": "white", "bg_color": PRIMARY,
            "valign": "vcenter", "indent": 1,
        })
        self.subtitle = wb.add_format({
            "italic": True, "font_size": 11, "font_color": "white", "bg_color": PRIMARY,
            "valign": "vcenter", "indent": 1,
        })
        self.header = wb.add_format({
            "bold": True, "font_color": "white", "bg_color": INK, "align": "center",
            "valign": "vcenter", "border": 1, "border_color": "#E2E8F0",
        })
        self.label = wb.add_format({"font_color": MUTED, "border": 1, "border_color": "#E2E8F0"})
        self.value = wb.add_format({
            "font_color": INK, "bold": True, "align": "center", "border": 1, "border_color": "#E2E8F0",
        })
        self.cell = wb.add_format({"border": 1, "border_color": "#E2E8F0", "text_wrap": True, "valign": "top"})
        self.cell_center = wb.add_format({"border": 1, "border_color": "#E2E8F0", "align": "center"})
        self.empty = wb.add_format({"italic": True, "font_color": MUTED})


def _status_formats(wb):
    return {
        status: wb.add_format({
            "bold": True, "align": "center", "font_color": "white", "bg_color": color,
            "border": 1, "border_color": "#E2E8F0",
        })
        for status, color in STATUS_COLORS.items()
    }


def _build_summary_sheet(wb, fmt, scorecard, period_label):
    ws = wb.add_worksheet("Summary")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 36)
    ws.set_column("B:B", 18)

    ws.merge_range("A1:B1", "TL Scorecard Report", fmt.title)
    ws.set_row(0, 30)
    ws.merge_range("A2:B2", f"Period: {period_label} — Team size: {scorecard['team_size']}", fmt.subtitle)
    ws.set_row(1, 20)

    rows_data = [
        ("Leave decided within 2 days", scorecard["leave"]["pct_within_2_days"], "pct"),
        ("Pending leave at month-end", scorecard["leave"]["pending_at_month_end"], "int"),
        ("OT approval turnaround (days)", scorecard["overtime"]["avg_turnaround_days"], "num"),
        ("1-on-1 compliance", scorecard["meetings"]["one_on_one_compliance_pct"], "pct"),
        ("TL-Italy syncs", scorecard["meetings"]["tl_sync_count"], "int"),
        ("Team meetings with HRBP", scorecard["meetings"]["team_meetings_with_hrbp"], "int"),
        ("Management reviews (YTD)", scorecard["review_deliveries_ytd"], "int"),
        ("Open idle flags", scorecard["idle"]["open_count"], "int"),
        ("Absences unaddressed >5 days", scorecard["absences"]["breached_5_day_sla"], "int"),
        ("PIPs pending HR approval", scorecard["pip"]["pending_approval_count"], "int"),
        ("Promotion ratio", scorecard["promotion"]["promoted_pct"], "pct"),
        ("Escalation risks", scorecard["escalation_count"], "int"),
    ]

    header_row = 3
    ws.write(header_row, 0, "Metric", fmt.header)
    ws.write(header_row, 1, "Value", fmt.header)

    r = header_row + 1
    for label, value, kind in rows_data:
        ws.write(r, 0, label, fmt.label)
        if value is None:
            ws.write(r, 1, "—", fmt.value)
        elif kind == "pct":
            ws.write(r, 1, f"{value}%", fmt.value)
        else:
            ws.write(r, 1, value, fmt.value)
        r += 1


def _build_kpi_coverage_sheet(wb, fmt, kpi_coverage):
    ws = wb.add_worksheet("KPI Coverage")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 44)
    ws.set_column("B:B", 14)
    ws.set_column("C:C", 50)

    status_fmt = _status_formats(wb)
    headers = ["KPI", "Status", "Note"]
    for col, label in enumerate(headers):
        ws.write(0, col, label, fmt.header)

    for idx, entry in enumerate(kpi_coverage, start=1):
        ws.write(idx, 0, entry["kpi"], fmt.cell)
        ws.write(idx, 1, entry["status"].capitalize(), status_fmt.get(entry["status"], fmt.value))
        ws.write(idx, 2, entry["note"], fmt.cell)


def _build_governance_sheet(wb, fmt, governance):
    ws = wb.add_worksheet("Governance")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 26)
    ws.set_column("B:D", 20)

    row = 0

    def _table(title, headers, records, field_getters):
        nonlocal row
        ws.merge_range(row, 0, row, len(headers) - 1, title, fmt.header)
        row += 1
        for col, label in enumerate(headers):
            ws.write(row, col, label, fmt.label)
        row += 1
        if not records:
            ws.write(row, 0, "None open", fmt.empty)
            row += 2
            return
        for record in records:
            for col, getter in enumerate(field_getters):
                ws.write(row, col, getter(record), fmt.cell_center)
            row += 1
        row += 1

    _table(
        "Open PIPs", ["Employee", "Status", "Start date", "HR approved"], governance["open_pips"],
        [lambda r: r["employee"], lambda r: r["status"], lambda r: r["start_date"], lambda r: "Yes" if r["approved"] else "No"],
    )
    _table(
        "Open absences", ["Employee", "Absence date", "Reason"], governance["open_absences"],
        [lambda r: r["employee"], lambda r: r["absence_date"], lambda r: r["reason"] or "—"],
    )
    _table(
        "Pending promotion nominations", ["Employee", "Nominated on"], governance["pending_promotions"],
        [lambda r: r["employee"], lambda r: r["nominated_on"]],
    )
    _table(
        "EPR cycles in progress", ["Employee", "Goal setting", "Mid-year", "Final review", "Goals"],
        governance["epr_cycles"],
        [
            lambda r: r["employee"],
            lambda r: "Done" if r["goal_setting_done"] else "Pending",
            lambda r: "Done" if r["mid_year_done"] else "Pending",
            lambda r: "Done" if r["final_review_done"] else "Pending",
            lambda r: r["goal_count"],
        ],
    )


def build_workbook_bytes(scorecard, kpi_coverage, governance, period_label):
    """Build the tl_scorecard evidence workbook and return raw .xlsx bytes."""
    buffer = io.BytesIO()
    wb = xlsxwriter.Workbook(buffer, {"in_memory": True})
    wb.set_properties({
        "title": f"TL Scorecard Report — {period_label}",
        "subject": "TL Scorecard KPIs",
        "author": "Engineering Tracker",
        "comments": "Generated live from tl_scorecard data.",
    })
    fmt = _Formats(wb)
    _build_summary_sheet(wb, fmt, scorecard, period_label)
    _build_kpi_coverage_sheet(wb, fmt, kpi_coverage)
    _build_governance_sheet(wb, fmt, governance)
    wb.close()
    return buffer.getvalue()
