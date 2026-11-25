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

from .report_kpis import NO_DATA, kpi_rows, reviews_target
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


def _build_summary_sheet(wb, fmt, scorecard, period_label, include_restricted=True, epr=None):
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

    items = kpi_rows(scorecard, include_restricted=include_restricted)
    for offset, item in enumerate(items):
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

    if epr and epr.get("stages"):
        stage_labels = {
            "goal_setting": "Goal setting", "mid_year": "Mid-year", "final_review": "Final review",
        }
        r = 4 + len(items) + 2
        year = scorecard["month"][:4]
        ws.write(r, 0, f"EPR progress ({year})", fmt.section)
        r += 1
        for col, label in enumerate(["Stage", "Due date", "Completed on time", "Team size", "On time %"]):
            ws.write(r, col, label, fmt.header)
        for stage_key, stage_data in epr["stages"].items():
            r += 1
            ws.write(r, 0, stage_labels.get(stage_key, stage_key), fmt.area)
            ws.write(r, 1, stage_data["due_date"], fmt.cell_center)
            ws.write_number(r, 2, stage_data["completed_on_time"], fmt.count)
            ws.write_number(r, 3, stage_data["team_size"], fmt.count)
            if stage_data["pct_on_time"] is None:
                ws.write(r, 4, NO_DATA, fmt.dash)
            else:
                ws.write_number(r, 4, stage_data["pct_on_time"], fmt.pct)


def _build_trend_sheet(wb, fmt, trend, include_restricted=True):
    """Month table plus two native charts (compliance + cadence/reviews). `trend` is already masked."""
    ws = wb.add_worksheet("Trend")
    ws.hide_gridlines(2)
    _print_setup(ws, (3, 3))
    headers = [
        "Month", "1:1 compliance", "Team meetings held", "Manager syncs",
        "Team meetings with HRBP", "Management reviews (YTD)", "Pro-rata target",
        "Promotion ratio",
    ]
    if include_restricted:
        headers.append("Onboarding 1-on-1s")
    last_col = len(headers) - 1
    ws.set_column(0, 0, 14)
    ws.set_column(1, last_col, 18)
    ws.freeze_panes(4, 0)

    ws.merge_range(0, 0, 0, last_col, "TL Scorecard — Monthly Trend", fmt.title)
    ws.set_row(0, 30)
    ws.merge_range(
        1, 0, 1, last_col,
        f"Months: {len(trend)} · Generated on {business_today().strftime('%d %b %Y')}",
        fmt.subtitle,
    )
    ws.set_row(1, 20)

    for col, label in enumerate(headers):
        ws.write(3, col, label, fmt.header)

    for offset, point in enumerate(trend):
        idx = 4 + offset
        meetings = point["meetings"]
        ws.write(idx, 0, date.fromisoformat(point["month"]).strftime("%b %Y"), fmt.cell_center)
        one_on_one = meetings["one_on_one_compliance_pct"]
        if one_on_one is None:
            ws.write(idx, 1, NO_DATA, fmt.dash)
        else:
            ws.write_number(idx, 1, one_on_one, fmt.pct)
        ws.write_number(idx, 2, meetings.get("team_meetings_held", 0), fmt.count)
        ws.write_number(idx, 3, meetings["tl_sync_count"], fmt.count)
        ws.write_number(idx, 4, meetings["team_meetings_with_hrbp"], fmt.count)
        ws.write_number(idx, 5, point["review_deliveries_ytd"], fmt.count)
        ws.write_number(idx, 6, reviews_target(point["month"], point.get("targets")), fmt.count)
        promoted = point["promotion"]["promoted_pct"]
        if promoted is None:
            ws.write(idx, 7, NO_DATA, fmt.dash)
        else:
            ws.write_number(idx, 7, promoted, fmt.pct)
        if include_restricted:
            onb = meetings.get("onboarding_pct")
            if onb is None:
                ws.write(idx, 8, NO_DATA, fmt.dash)
            else:
                ws.write_number(idx, 8, onb, fmt.pct)

    first_row = 4
    last_row = 3 + len(trend)
    if len(trend) < 2:
        return

    # Chart 1: Compliance & Promotion (%) — only add series that contain real data
    # so HBPR exports (masked 1:1) never draw a flat 0% line from "—" cells.
    pct_cols = []
    if any(p["meetings"]["one_on_one_compliance_pct"] is not None for p in trend):
        pct_cols.append((1, SERIES[0]))
    if include_restricted and any(p["meetings"].get("onboarding_pct") is not None for p in trend):
        pct_cols.append((8, SERIES[1]))
    if any(p["promotion"]["promoted_pct"] is not None for p in trend):
        pct_cols.append((7, SERIES[2]))
    if pct_cols:
        pct_chart = wb.add_chart({"type": "line"})
        for col, colour in pct_cols:
            pct_chart.add_series({
                "name": ["Trend", 3, col],
                "categories": ["Trend", first_row, 0, last_row, 0],
                "values": ["Trend", first_row, col, last_row, col],
                "line": {"color": colour, "width": 2.25},
                "marker": {"type": "circle", "size": 5, "fill": {"color": "white"},
                           "border": {"color": colour}},
                "smooth": False,
            })
        pct_chart.set_title({"name": "Compliance & Promotion (%)"})
        pct_chart.set_y_axis({"name": "%", "min": 0, "max": 100})
        pct_chart.set_x_axis({"name": "Month"})
        pct_chart.set_legend({"position": "bottom"})
        pct_chart.set_style(11)
        pct_chart.set_size({"width": 620, "height": 340})
        ws.insert_chart(f"A{last_row + 3}", pct_chart)

    # Chart 2: Meeting cadence (bars) + YTD management reviews vs target (lines)
    columns = wb.add_chart({"type": "column"})
    for col, colour in ((2, SERIES[0]), (3, SERIES[1]), (4, "#64748B")):
        columns.add_series({
            "name": ["Trend", 3, col],
            "categories": ["Trend", first_row, 0, last_row, 0],
            "values": ["Trend", first_row, col, last_row, col],
            "fill": {"color": colour},
            "gap": 80,
        })
    reviews = wb.add_chart({"type": "line"})
    for col, colour, dash in ((5, SERIES[2], "solid"), (6, "#475569", "dash")):
        reviews.add_series({
            "name": ["Trend", 3, col],
            "categories": ["Trend", first_row, 0, last_row, 0],
            "values": ["Trend", first_row, col, last_row, col],
            "line": {"color": colour, "width": 2.25, "dash_type": dash},
            "marker": {"type": "circle", "size": 5, "fill": {"color": "white"},
                       "border": {"color": colour}},
            "smooth": False,
        })
    columns.combine(reviews)
    columns.set_title({"name": "Meetings and reviews by month"})
    columns.set_y_axis({"name": "Count", "min": 0})
    columns.set_x_axis({"name": "Month"})
    columns.set_legend({"position": "bottom"})
    columns.set_style(11)
    columns.set_size({"width": 680, "height": 340})
    ws.insert_chart(f"E{last_row + 3}", columns)


def _stage_cell(row, stage):
    """The stage's completion date, falling back to Done/Pending for older payloads."""
    return row.get(f"{stage}_on") or ("Done" if row.get(f"{stage}_done") else "Pending")


def _attended_cell(row, flag, done_key):
    if not row.get(done_key):
        return "—"
    return "Yes" if row.get(flag) else "No"


def _build_governance_sheet(wb, fmt, governance, include_restricted=True):
    """Four banded, filterable tables. An empty table keeps a "None open" row."""
    ws = wb.add_worksheet("Governance")
    ws.hide_gridlines(2)
    _print_setup(ws)
    ws.set_column("A:A", 24)
    ws.set_column("B:B", 16)
    ws.set_column("C:D", 18)
    ws.set_column("E:G", 20)
    ws.set_column("H:H", 36)
    ws.set_column("I:I", 48)
    ws.merge_range("A1:I1", "Governance records", fmt.title)
    ws.set_row(0, 30)

    sections = [
        ("Open PIPs", "OpenPIPs",
         ["Employee", "Status", "Start date", "HR approved", "Shared notes"], governance["open_pips"],
         [lambda r: r["employee"], lambda r: r["status"], lambda r: r["start_date"],
          lambda r: "Yes" if r["approved"] else "No", lambda r: r["shared_notes"] or "—"]),
        ("Open absences", "OpenAbsences",
         ["Employee", "Absence date", "Reason"], governance["open_absences"],
         [lambda r: r["employee"], lambda r: r["absence_date"], lambda r: r["reason"] or "—"]),
        ("Pending promotion nominations", "PendingPromotions",
         ["Employee", "Nominated on"], governance["pending_promotions"],
         [lambda r: r["employee"], lambda r: r["nominated_on"]]),
        ("EPR cycles", "EPRCycles",
         ["Employee", "Year", "Goal setting", "Mid-year", "HBPR at mid-year", "Final review",
          "HBPR at final review", "Goals", "Goal titles"], governance["epr_cycles"],
         [
             lambda r: r["employee"],
             lambda r: r.get("year", ""),
             lambda r: _stage_cell(r, "goal_setting"),
             lambda r: _stage_cell(r, "mid_year"),
             lambda r: _attended_cell(r, "hbpr_mid_year", "mid_year_done"),
             lambda r: _stage_cell(r, "final_review"),
             lambda r: _attended_cell(r, "hbpr_final_review", "final_review_done"),
             lambda r: r["goal_count"],
             lambda r: "; ".join(r.get("goal_titles", [])) or "—",
         ]),
        ("EPR stage evidence", "EPRStageEvidence",
         ["Employee", "Stage", "Completed on", "Recorded by", "HBPR present", "Shared with employee",
          "Reference", "Summary"], governance.get("epr_stage_evidence", []),
         [
             lambda r: r["employee"],
             lambda r: r["stage"],
             lambda r: r["completed_on"] or "—",
             lambda r: r["recorded_by"] or "—",
             lambda r: "Yes" if r["hbpr_present"] else "No",
             lambda r: "Yes" if r["shared_with_employee"] else "No",
             lambda r: r["reference_url"] or ("Recorded (hidden)" if r["has_reference"] else "—"),
             lambda r: r["summary"] or "—",
         ]),
    ]
    if include_restricted:
        sections.append((
            "Onboarding", "Onboarding",
            ["Employee", "Onboarding date", "With"], governance.get("onboarding", []),
            [
                lambda r: r.get("name") or r.get("employee", ""),
                lambda r: r["met_on"].isoformat() if hasattr(r.get("met_on"), "isoformat") else (r.get("met_on") or "—"),
                lambda r: r.get("organizer_name") or "—",
            ],
        ))

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
    """HBPR ↔ Line Manager governance evidence.

    Cadence meetings and the mid-year / year-end EPR participation records the
    Line Manager authored for the HBPR relationship. Employee one-on-one meetings are
    never part of this data set.
    """
    ws = wb.add_worksheet("HBPR partnership log")
    ws.hide_gridlines(2)
    _print_setup(ws, (1, 1))
    ws.set_column("A:A", 22)
    ws.set_column("B:B", 14)
    ws.set_column("C:C", 10)
    ws.set_column("D:D", 12)
    ws.set_column("E:F", 26)
    ws.set_column("G:H", 40)
    ws.set_column("I:I", 26)

    headers = [
        "Kind", "Occurred on", "Year", "Status", "Cancel reason", "Recorded by",
        "Shared summary", "Action items", "Reference",
    ]
    ws.freeze_panes(4, 0)
    ws.merge_range(0, 0, 0, len(headers) - 1, "HBPR ↔ Line Manager partnership log", fmt.title)
    ws.set_row(0, 30)
    ws.merge_range(
        1, 0, 1, len(headers) - 1,
        f"Entries: {len(evidence)} · Generated on {business_today().strftime('%d %b %Y')}",
        fmt.subtitle,
    )
    ws.set_row(1, 20)
    for col, label in enumerate(headers):
        ws.write(3, col, label, fmt.header)

    row = 4
    if not evidence:
        ws.write(row, 0, "No entries logged yet", fmt.empty)
        return
    for item in evidence:
        ws.write(row, 0, item["kind_display"], fmt.cell_center)
        ws.write(row, 1, item["occurred_on"], fmt.cell_center)
        ws.write(row, 2, item["reporting_year"] or "—", fmt.cell_center)
        ws.write(row, 3, "Cancelled" if item.get("status") == "cancelled" else "Held", fmt.cell_center)
        ws.write(row, 4, xlsx_safe(item.get("cancel_reason", "")) or "—", fmt.cell)
        ws.write(row, 5, xlsx_safe(item.get("recorded_by", "")) or "—", fmt.cell)
        ws.write(row, 6, xlsx_safe(item["shared_summary"]) or "—", fmt.cell)
        ws.write(row, 7, xlsx_safe(item["action_items"]) or "—", fmt.cell)
        ws.write(row, 8, xlsx_safe(item["reference_url"]) or "—", fmt.cell)
        row += 1


def build_workbook_bytes(scorecard, governance, period_label, hbpr_evidence=None, trend=None,
                         include_restricted=True, epr=None):
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
    _build_summary_sheet(wb, fmt, scorecard, period_label, include_restricted, epr=epr)
    if trend:
        _build_trend_sheet(wb, fmt, trend, include_restricted=include_restricted)
    _build_governance_sheet(wb, fmt, governance, include_restricted=include_restricted)
    _build_hbpr_evidence_sheet(wb, fmt, hbpr_evidence or [])
    wb.close()
    return buffer.getvalue()
