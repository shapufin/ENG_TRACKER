"""
Excel workbook builder for TL Scorecard evidence exports.

Same intent and library choice as `plugins/engagement/excel_export.py`
(xlsxwriter, not openpyxl, for native styling) — this is evidence a TL
hands to a reviewer, not a raw data dump. Self-contained within this
plugin: only xlsxwriter + this plugin's own `services` output (already-
computed `dict`s passed in) are used — no cross-plugin imports, see the
"Plugin removal safety" invariant.

Sheets: Summary (scorecard metrics),
Governance (open PIPs/absences/pending promotions/EPR cycle progress),
HBPR evidence (cadence meetings + EPR participation).
"""
import io

import xlsxwriter

PRIMARY = "#1D4ED8"
INK = "#0F172A"
MUTED = "#475569"


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


def _build_hbpr_evidence_sheet(wb, fmt, evidence):
    """HBPR ↔ Albanian TL governance evidence.

    Cadence meetings and the mid-year / year-end EPR participation records the
    AL TL authored for the HBPR relationship. Employee one-on-one meetings are
    never part of this data set.
    """
    ws = wb.add_worksheet("HBPR partnership log")
    ws.hide_gridlines(2)
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
        ws.write(row, 3, item["shared_summary"] or "—", fmt.cell)
        ws.write(row, 4, item["action_items"] or "—", fmt.cell)
        ws.write(row, 5, item["reference_url"] or "—", fmt.cell)
        row += 1


def build_workbook_bytes(scorecard, governance, period_label, hbpr_evidence=None):
    """Build the tl_scorecard evidence workbook and return raw .xlsx bytes."""
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
    _build_summary_sheet(wb, fmt, scorecard, period_label)
    _build_governance_sheet(wb, fmt, governance)
    _build_hbpr_evidence_sheet(wb, fmt, hbpr_evidence or [])
    wb.close()
    return buffer.getvalue()
