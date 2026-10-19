"""
Excel workbook builder for TL Scorecard evidence exports.

Same intent and library choice as `plugins/engagement/excel_export.py`
(xlsxwriter, not openpyxl, for native styling) — this is evidence a TL
hands to a reviewer, not a raw data dump. Self-contained within this
plugin: only xlsxwriter + this plugin's own `services` output (already-
computed `dict`s passed in) are used — no cross-plugin imports, see the
"Plugin removal safety" invariant.

Sheets: Summary (KPI table with targets and status, from report_kpis),
Trend (optional: month table + chart, same masking as the Summary),
Governance (open PIPs/absences/pending promotions/EPR cycle progress),
HBPR partnership log (cadence meetings + EPR participation).
"""
import io
from datetime import date

import xlsxwriter

from core.utils.csv_safe import xlsx_safe

from .report_kpis import NO_DATA, kpi_rows
from core.utils.timezone_local import business_today

PRIMARY = "#1D4ED8"
INK = "#0F172A"
MUTED = "#475569"
RULE = "#E2E8F0"
# Categorical series colours: the validated dataviz slots 1-3 (light mode).
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]

# Status tones (fill, text): the same green/amber/red family the UI uses.
STATUS_TONES = {
    "On track": ("#DCFCE7", "#166534"),
    "Watch": ("#FEF3C7", "#92400E"),
    "Off track": ("#FEE2E2", "#991B1B"),
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
        self.section = wb.add_format({
            "bold": True, "font_size": 12, "font_color": INK, "bottom": 2, "bottom_color": PRIMARY,
        })
        self.header = wb.add_format({
            "bold": True, "font_color": "white", "bg_color": INK, "align": "center",
            "valign": "vcenter", "border": 1, "border_color": RULE,
        })
        self.label = wb.add_format({"font_color": MUTED, "border": 1, "border_color": RULE})
        self.cell = wb.add_format({"border": 1, "border_color": RULE, "text_wrap": True, "valign": "top"})
        self.cell_center = wb.add_format({"border": 1, "border_color": RULE, "align": "center"})
        self.empty = wb.add_format({"italic": True, "font_color": MUTED})
        self.dash = wb.add_format({
            "font_color": MUTED, "align": "center", "border": 1, "border_color": RULE,
        })
        self.pct = wb.add_format({
            "num_format": '0.0"%"', "font_color": INK, "bold": True, "align": "center",
            "border": 1, "border_color": RULE,
        })
        self.count = wb.add_format({
            "num_format": "0", "font_color": INK, "bold": True, "align": "center",
            "border": 1, "border_color": RULE,
        })
        self.num = wb.add_format({
            "num_format": "0.0", "font_color": INK, "bold": True, "align": "center",
            "border": 1, "border_color": RULE,
        })
        self.target_pct = wb.add_format({
            "num_format": '0.0"%"', "font_color": MUTED, "align": "center",
            "border": 1, "border_color": RULE,
        })
        self.target_count = wb.add_format({
            "num_format": "0", "font_color": MUTED, "align": "center",
            "border": 1, "border_color": RULE,
        })
        self.status = {
            status: wb.add_format({
                "bold": True, "align": "center", "bg_color": fill, "font_color": text,
                "border": 1, "border_color": RULE,
            })
            for status, (fill, text) in STATUS_TONES.items()
        }
        self.status_none = self.dash
        self.area = wb.add_format({"bold": True, "font_color": INK, "border": 1, "border_color": RULE})


_VALUE_FORMATS = {"pct": "pct", "count": "count", "num": "num"}


def _print_setup(ws, title_rows=None):
    ws.set_landscape()
    ws.set_paper(9)  # A4
    ws.fit_to_pages(1, 0)
    if title_rows:
        ws.repeat_rows(*title_rows)


def _build_summary_sheet(wb, fmt, scorecard, period_label, include_leave_overtime=True):
    ws = wb.add_worksheet("Summary")
    ws.hide_gridlines(2)
    _print_setup(ws, (3, 3))
    ws.set_column("A:A", 16)
    ws.set_column("B:B", 52)
    ws.set_column("C:D", 14)
    ws.set_column("E:E", 14)
    ws.freeze_panes(4, 0)

    ws.merge_range("A1:E1", "TL Scorecard Report", fmt.title)
    ws.set_row(0, 30)
    ws.merge_range(
        "A2:E2",
        f"Period: {period_label} · Team size: {scorecard['team_size']} · "
        f"Generated on {business_today().strftime('%d %b %Y')}",
        fmt.subtitle,
    )
    ws.set_row(1, 20)

    for col, label in enumerate(["Area", "Metric", "Value", "Target", "Status"]):
        ws.write(3, col, label, fmt.header)

    for offset, item in enumerate(kpi_rows(scorecard, include_leave_overtime=include_leave_overtime)):
        r = 4 + offset
        ws.write(r, 0, item["area"], fmt.area)
        ws.write(r, 1, item["metric"], fmt.label)
        if item["value"] is None:
            ws.write(r, 2, NO_DATA, fmt.dash)
        else:
            ws.write_number(r, 2, item["value"], getattr(fmt, _VALUE_FORMATS[item["kind"]]))
        if item["target"] is None:
            ws.write(r, 3, NO_DATA, fmt.dash)
        else:
            target_fmt = fmt.target_pct if item["kind"] == "pct" else fmt.target_count
            ws.write_number(r, 3, item["target"], target_fmt)
        ws.write(r, 4, item["status"], fmt.status.get(item["status"], fmt.status_none))


def _build_trend_sheet(wb, fmt, trend):
    """Month table plus a native column/line chart. `trend` is already masked."""
    ws = wb.add_worksheet("Trend")
    ws.hide_gridlines(2)
    _print_setup(ws, (1, 1))
    headers = [
        "Month", "1:1 compliance", "TL-Italy syncs", "Team meetings with HRBP",
        "Management reviews (YTD)", "Promotion ratio",
    ]
    ws.set_column(0, 0, 14)
    ws.set_column(1, 5, 18)
    for col, label in enumerate(headers):
        ws.write(0, col, label, fmt.header)

    for idx, point in enumerate(trend, start=1):
        meetings = point["meetings"]
        ws.write(idx, 0, date.fromisoformat(point["month"]).strftime("%b %Y"), fmt.cell_center)
        one_on_one = meetings["one_on_one_compliance_pct"]
        if one_on_one is None:
            ws.write(idx, 1, NO_DATA, fmt.dash)
        else:
            ws.write_number(idx, 1, one_on_one, fmt.pct)
        ws.write_number(idx, 2, meetings["tl_sync_count"], fmt.count)
        ws.write_number(idx, 3, meetings["team_meetings_with_hrbp"], fmt.count)
        ws.write_number(idx, 4, point["review_deliveries_ytd"], fmt.count)
        promoted = point["promotion"]["promoted_pct"]
        if promoted is None:
            ws.write(idx, 5, NO_DATA, fmt.dash)
        else:
            ws.write_number(idx, 5, promoted, fmt.pct)

    last_row = len(trend)
    if last_row < 2:
        return
    columns = wb.add_chart({"type": "column"})
    for col, colour in ((2, SERIES[0]), (3, SERIES[1])):
        columns.add_series({
            "name": ["Trend", 0, col],
            "categories": ["Trend", 1, 0, last_row, 0],
            "values": ["Trend", 1, col, last_row, col],
            "fill": {"color": colour},
            "gap": 80,
        })
    reviews = wb.add_chart({"type": "line"})
    reviews.add_series({
        "name": ["Trend", 0, 4],
        "categories": ["Trend", 1, 0, last_row, 0],
        "values": ["Trend", 1, 4, last_row, 4],
        "line": {"color": SERIES[2], "width": 2.5},
        "marker": {"type": "circle", "size": 6, "fill": {"color": "white"},
                   "border": {"color": SERIES[2]}},
    })
    columns.combine(reviews)
    columns.set_title({"name": "Meetings and reviews by month"})
    columns.set_y_axis({"name": "Count", "min": 0})
    columns.set_x_axis({"name": "Month"})
    columns.set_legend({"position": "bottom"})
    columns.set_size({"width": 760, "height": 360})
    ws.insert_chart("H1", columns)


def _build_governance_sheet(wb, fmt, governance):
    """Four banded, filterable tables. An empty table keeps a "None open" row."""
    ws = wb.add_worksheet("Governance")
    ws.hide_gridlines(2)
    _print_setup(ws)
    ws.set_column("A:A", 26)
    ws.set_column("B:E", 20)
    ws.merge_range("A1:E1", "Governance records", fmt.title)
    ws.set_row(0, 30)

    sections = [
        ("Open PIPs", "OpenPIPs",
         ["Employee", "Status", "Start date", "HR approved"], governance["open_pips"],
         [lambda r: r["employee"], lambda r: r["status"], lambda r: r["start_date"],
          lambda r: "Yes" if r["approved"] else "No"]),
        ("Open absences", "OpenAbsences",
         ["Employee", "Absence date", "Reason"], governance["open_absences"],
         [lambda r: r["employee"], lambda r: r["absence_date"], lambda r: r["reason"] or "—"]),
        ("Pending promotion nominations", "PendingPromotions",
         ["Employee", "Nominated on"], governance["pending_promotions"],
         [lambda r: r["employee"], lambda r: r["nominated_on"]]),
        ("EPR cycles", "EPRCycles",
         ["Employee", "Goal setting", "Mid-year", "Final review", "Goals"], governance["epr_cycles"],
         [
             lambda r: r["employee"],
             lambda r: "Done" if r["goal_setting_done"] else "Pending",
             lambda r: "Done" if r["mid_year_done"] else "Pending",
             lambda r: "Done" if r["final_review_done"] else "Pending",
             lambda r: r["goal_count"],
         ]),
    ]

    row = 2
    for title, table_name, headers, records, getters in sections:
        ws.write(row, 0, title, fmt.section)
        row += 1
        if records:
            data = [[xlsx_safe(getter(record)) for getter in getters] for record in records]
        else:
            data = [["None open"] + [""] * (len(headers) - 1)]
        ws.add_table(row, 0, row + len(data), len(headers) - 1, {
            "name": table_name,
            "style": "Table Style Medium 2",
            "columns": [{"header": header} for header in headers],
            "data": data,
        })
        row += len(data) + 3


def _build_hbpr_evidence_sheet(wb, fmt, evidence):
    """HBPR ↔ Albanian TL governance evidence.

    Cadence meetings and the mid-year / year-end EPR participation records the
    AL TL authored for the HBPR relationship. Employee one-on-one meetings are
    never part of this data set.
    """
    ws = wb.add_worksheet("HBPR partnership log")
    ws.hide_gridlines(2)
    _print_setup(ws, (1, 1))
    ws.set_column("A:A", 22)
    ws.set_column("B:B", 14)
    ws.set_column("C:C", 10)
    ws.set_column("D:D", 40)
    ws.set_column("E:E", 40)
    ws.set_column("F:F", 26)

    headers = [
        "Kind", "Occurred on", "Year", "Shared summary",
        "Action items", "Reference",
    ]
    ws.merge_range(0, 0, 0, len(headers) - 1, "HBPR ↔ Albanian TL partnership log", fmt.header)
    for col, label in enumerate(headers):
        ws.write(1, col, label, fmt.label)

    row = 2
    if not evidence:
        ws.write(row, 0, "No entries logged yet", fmt.empty)
        return
    for item in evidence:
        ws.write(row, 0, item["kind_display"], fmt.cell_center)
        ws.write(row, 1, item["occurred_on"], fmt.cell_center)
        ws.write(row, 2, item["reporting_year"] or "—", fmt.cell_center)
        ws.write(row, 3, xlsx_safe(item["shared_summary"]) or "—", fmt.cell)
        ws.write(row, 4, xlsx_safe(item["action_items"]) or "—", fmt.cell)
        ws.write(row, 5, xlsx_safe(item["reference_url"]) or "—", fmt.cell)
        row += 1


def build_workbook_bytes(scorecard, governance, period_label, hbpr_evidence=None, trend=None,
                         include_leave_overtime=True):
    """Build the tl_scorecard summary workbook and return raw .xlsx bytes.

    ``trend`` (optional) is the list of scorecard points, oldest first, with the
    same one-on-one masking the Summary gets. It adds the Trend sheet.
    """
    buffer = io.BytesIO()
    # Free text (absence reasons, names) must never become a formula or link.
    wb = xlsxwriter.Workbook(
        buffer,
        {"in_memory": True, "strings_to_formulas": False, "strings_to_urls": False},
    )
    wb.set_properties({
        "title": f"TL Scorecard Report — {period_label}",
        "subject": "TL Scorecard KPIs",
        "author": "Engineering Tracker",
        "comments": "Generated live from tl_scorecard data.",
    })
    fmt = _Formats(wb)
    _build_summary_sheet(wb, fmt, scorecard, period_label, include_leave_overtime)
    if trend:
        _build_trend_sheet(wb, fmt, trend)
    _build_governance_sheet(wb, fmt, governance)
    _build_hbpr_evidence_sheet(wb, fmt, hbpr_evidence or [])
    wb.close()
    return buffer.getvalue()
