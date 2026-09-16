"""Export service for the Payroll plugin.

Generates Excel run summaries and individual payslip PDFs from
finalized (or draft) payroll data.
"""
from __future__ import annotations

import io
import logging
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)

# Must match the fixed dropdown labels in
# frontend/src/plugins/payroll/components/PayrollRuleSetEditorDialog.tsx:41-45
# so the same category reads the same way in Settings, the PDF, and Excel.
OVERTIME_CATEGORY_LABELS = {
    'weekday_day': 'Weekday — Daytime',
    'weekday_night': 'Weekday — Night',
    'weekend_day': 'Weekend — Daytime',
    'weekend_night': 'Weekend — Night',
    'holiday': 'Public Holiday',
}


def _excel_text(value: str) -> str:
    return f"'{value}" if value.lstrip().startswith(('=', '+', '-', '@')) else value


def _dec(value, default: str = '0') -> Decimal:
    """Parse a possibly-string-or-missing JSON value into a Decimal."""
    if value is None or value == '':
        value = default
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return Decimal(default)


def _pct(part: Decimal, whole: Decimal) -> Decimal:
    """Percentage of ``part`` over ``whole``; 0 when ``whole`` is 0."""
    if not whole:
        return Decimal('0')
    return (part / whole) * Decimal('100')


def _overtime_rows(line) -> list[dict]:
    """Per-category overtime rows for display, derived from
    ``line.overtime_breakdown['categories']`` (list of
    ``{'code', 'hours', 'multiplier', 'amount'}`` with string-decimal values).
    """
    categories = (line.overtime_breakdown or {}).get('categories', [])
    total_gross = line.total_gross
    rows = []
    for cat in categories:
        code = cat.get('code', '')
        amount = _dec(cat.get('amount'))
        rows.append({
            'code': code,
            'label': OVERTIME_CATEGORY_LABELS.get(code, code),
            'hours': _dec(cat.get('hours')),
            'multiplier_pct': _dec(cat.get('multiplier')) * Decimal('100'),
            'amount': amount,
            'pct_of_gross': _pct(amount, total_gross),
        })
    return rows


def _standby_rows(line) -> list[dict]:
    """Weekday/weekend standby rows, derived from
    ``line.calculation_trace['standby']``. Zero-hour buckets are omitted.
    """
    standby = (line.calculation_trace or {}).get('standby') or {}
    total_gross = line.total_gross
    rows = []
    for label, hours_key, rate_key in (
        ('Weekday Standby', 'weekday_hours', 'weekday_rate'),
        ('Weekend Standby', 'weekend_hours', 'weekend_rate'),
    ):
        hours = _dec(standby.get(hours_key))
        if not hours:
            continue
        rate = _dec(standby.get(rate_key))
        amount = hours * rate
        rows.append({
            'label': label, 'hours': hours, 'rate': rate, 'amount': amount,
            'pct_of_gross': _pct(amount, total_gross),
        })
    return rows


def _trace_amount_rate_base(trace: dict, key: str) -> tuple[Decimal, Decimal, Decimal]:
    """Read a ``{'base','rate','amount'}`` trace entry as Decimals."""
    entry = (trace or {}).get(key) or {}
    return _dec(entry.get('base')), _dec(entry.get('rate')), _dec(entry.get('amount'))


def _run_summary_metrics(run, lines: list) -> list[tuple[str, Decimal, str]]:
    """Run-level totals plus derived percentages, shared by the Excel Summary
    sheet and the consolidated PDF cover page. Each tuple is
    ``(label, value, kind)`` where ``kind`` is ``'amount'``, ``'count'``, or
    ``'pct'`` (value already scaled to a percentage number, e.g. ``9.5``).
    """
    totals = run.totals or {}
    total_gross = _dec(totals.get('total_gross'))
    total_employer_cost = _dec(totals.get('total_employer_cost'))
    total_overtime = _dec(totals.get('total_overtime'))
    avg_effective_tax = (
        sum((_pct(line.income_tax, line.total_gross) for line in lines), Decimal('0')) / len(lines)
        if lines else Decimal('0')
    )
    return [
        ('Total Gross', total_gross, 'amount'),
        ('Total Employee Deductions', _dec(totals.get('total_deductions')), 'amount'),
        ('Total Net Pay', _dec(totals.get('total_net')), 'amount'),
        ('Total Employer Cost', total_employer_cost, 'amount'),
        ('Total Overtime', total_overtime, 'amount'),
        ('Total Standby', _dec(totals.get('total_standby')), 'amount'),
        ('Employee Count', Decimal(int(totals.get('line_count', len(lines)) or 0)), 'count'),
        ('Overtime % of Total Gross', _pct(total_overtime, total_gross), 'pct'),
        ('Average Effective Tax Rate', avg_effective_tax, 'pct'),
        ('Employer Overhead %', _pct(total_employer_cost - total_gross, total_gross), 'pct'),
    ]


def _format_bracket(bracket: dict) -> str:
    """Render one ``calculation_trace['income_tax']['brackets']`` entry,
    e.g. ``'30,000–200,000 @ 13%'`` or ``'200,000+ @ 23%'``."""
    lower = _dec(bracket.get('lower'))
    upper_raw = bracket.get('upper')
    rate = _dec(bracket.get('rate')) * Decimal('100')
    if upper_raw in (None, 'inf'):
        range_text = f'{lower:,.0f}+'
    else:
        range_text = f'{lower:,.0f}–{_dec(upper_raw):,.0f}'
    return f'{range_text} @ {rate:.0f}%'


# ---------------------------------------------------------------------------
# Excel export
# ---------------------------------------------------------------------------

_HEADER_FILL_COLOR = 'FF1E3A8A'  # indigo-900
_HEADER_FONT_COLOR = 'FFFFFFFF'
_THIN_BORDER_COLOR = 'FFB0B0B0'


def _style_header_row(ws, ncols: int, row: int = 1) -> None:
    from openpyxl.styles import Font, PatternFill, Alignment

    fill = PatternFill(start_color=_HEADER_FILL_COLOR, end_color=_HEADER_FILL_COLOR, fill_type='solid')
    font = Font(bold=True, color=_HEADER_FONT_COLOR)
    for col in range(1, ncols + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = fill
        cell.font = font
        cell.alignment = Alignment(horizontal='center')


def _apply_borders(ws, min_row: int, max_row: int, ncols: int) -> None:
    from openpyxl.styles import Border, Side

    border = Border(*(Side(style='thin', color=_THIN_BORDER_COLOR) for _ in range(4)))
    for row in ws.iter_rows(min_row=min_row, max_row=max_row, min_col=1, max_col=ncols):
        for cell in row:
            cell.border = border


def generate_payroll_excel(run) -> io.BytesIO:
    """Generate a multi-sheet Excel file for a payroll run.

    Returns a ``BytesIO`` stream positioned at 0, suitable for
    ``FileResponse`` streaming.

    Sheets:
    1. Summary — run-level totals plus derived percentage metrics.
    2. Employee Breakdown — one row per employee with all line items.
    3. Overtime Detail — per-category overtime hours/amounts, human labels.
    4. Tax & Contributions Detail — per-employee contribution/tax breakdown
       against the run's actual rule-set schedule.
    5. Carryover Detail — carried-over overtime/standby from prior periods.
    """
    import openpyxl
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter
    from django.utils import timezone

    from ..models import PayrollConfiguration

    wb = openpyxl.Workbook()
    config = PayrollConfiguration.get_singleton()
    org = config.organization_name or ''
    lines = list(run.lines.all().select_related('user').order_by('user__username'))

    def full_name(user) -> str:
        return f'{user.first_name} {user.last_name}'.strip() or user.username

    # --- Sheet 1: Summary ---
    ws_summary = wb.active
    ws_summary.title = 'Summary'
    r = 1
    if org:
        ws_summary.cell(row=r, column=1, value=org).font = Font(bold=True, size=14)
        r += 1
    ws_summary.cell(row=r, column=1, value=f'Payroll Run {run.year}-{run.month:02d}').font = Font(bold=True, size=13)
    r += 1
    ws_summary.cell(row=r, column=1, value=f'Status: {run.status}')
    r += 1
    ws_summary.cell(row=r, column=1, value=f'Rule Set: {run.rule_set.name} v{run.rule_set.version} ({run.rule_set.validation_status})')
    r += 1
    ws_summary.cell(row=r, column=1, value=f'Created: {run.created_at.strftime("%Y-%m-%d %H:%M")}')
    r += 1
    ws_summary.cell(row=r, column=1, value=f'Generated: {timezone.now().strftime("%Y-%m-%d %H:%M")}')
    r += 2

    _METRIC_FORMATS = {'amount': '#,##0', 'count': '0', 'pct': '0.00"%"'}
    header_row = r
    ws_summary.cell(row=r, column=1, value='Metric').font = Font(bold=True)
    ws_summary.cell(row=r, column=2, value='Value').font = Font(bold=True)
    r += 1
    for label, value, kind in _run_summary_metrics(run, lines):
        ws_summary.cell(row=r, column=1, value=label)
        cell = ws_summary.cell(row=r, column=2, value=float(value))
        cell.number_format = _METRIC_FORMATS[kind]
        r += 1
    _style_header_row(ws_summary, 2, row=header_row)
    _apply_borders(ws_summary, header_row, r - 1, 2)
    ws_summary.column_dimensions['A'].width = 32
    ws_summary.column_dimensions['B'].width = 18

    # --- Sheet 2: Employee Breakdown ---
    ws_emp = wb.create_sheet('Employee Breakdown')
    headers = [
        'User', 'Gross Wage', 'Overtime Hours', 'Overtime Amount',
        'Standby Hours', 'Standby Amount', 'Carryover Amount', 'Total Gross',
        'Employee Social', 'Employee Health', 'Income Tax',
        'Total Deductions', 'Net Pay', 'Employer Social',
        'Employer Health', 'Employer Cost',
        'Overtime % Gross', 'Effective Tax Rate %', 'Total Deduction % Gross',
    ]
    for col, header in enumerate(headers, 1):
        ws_emp.cell(row=1, column=col, value=header)

    row = 2
    for line in lines:
        carryover_amount = sum(
            (_dec(item.get('overtime_amount')) + _dec(item.get('standby_amount'))
             for item in (line.carryover_breakdown or {}).get('carried_over', [])),
            Decimal('0'),
        )
        values = [
            _excel_text(full_name(line.user)),
            float(line.gross_monthly_wage),
            float(line.overtime_hours),
            float(line.overtime_amount),
            float(line.standby_hours),
            float(line.standby_amount),
            float(carryover_amount),
            float(line.total_gross),
            float(line.employee_social),
            float(line.employee_health),
            float(line.income_tax),
            float(line.total_employee_deductions),
            float(line.net_pay),
            float(line.employer_social),
            float(line.employer_health),
            float(line.total_employer_cost),
            float(_pct(line.overtime_amount, line.total_gross)),
            float(_pct(line.income_tax, line.total_gross)),
            float(_pct(line.total_employee_deductions, line.total_gross)),
        ]
        for col, val in enumerate(values, 1):
            cell = ws_emp.cell(row=row, column=col, value=val)
            if col in (3, 5):
                cell.number_format = '#,##0.00'
            elif col in (17, 18, 19):
                cell.number_format = '0.00"%"'
            elif col >= 2:
                cell.number_format = '#,##0'
        row += 1

    _style_header_row(ws_emp, len(headers))
    _apply_borders(ws_emp, 1, row - 1, len(headers))
    ws_emp.freeze_panes = 'A2'
    ws_emp.auto_filter.ref = f'A1:{get_column_letter(len(headers))}{row - 1}'
    for col in range(1, len(headers) + 1):
        ws_emp.column_dimensions[get_column_letter(col)].width = 20

    # --- Sheet 3: Overtime Detail ---
    ws_ot = wb.create_sheet('Overtime Detail')
    ot_headers = ['User', 'Category', 'Hours', 'Multiplier', 'Amount', '% of Employee Gross']
    for col, header in enumerate(ot_headers, 1):
        ws_ot.cell(row=1, column=col, value=header)

    row = 2
    for line in lines:
        rows = _overtime_rows(line)
        if not rows:
            ws_ot.cell(row=row, column=1, value=_excel_text(full_name(line.user)))
            ws_ot.cell(row=row, column=2, value='(none)')
            row += 1
            continue
        for entry in rows:
            ws_ot.cell(row=row, column=1, value=_excel_text(full_name(line.user)))
            ws_ot.cell(row=row, column=2, value=entry['label'])
            ws_ot.cell(row=row, column=3, value=float(entry['hours'])).number_format = '#,##0.00'
            mult_cell = ws_ot.cell(row=row, column=4, value=float(entry['multiplier_pct']) / 100)
            mult_cell.number_format = '0%'
            ws_ot.cell(row=row, column=5, value=float(entry['amount'])).number_format = '#,##0'
            ws_ot.cell(row=row, column=6, value=float(entry['pct_of_gross'])).number_format = '0.00"%"'
            row += 1

    _style_header_row(ws_ot, len(ot_headers))
    _apply_borders(ws_ot, 1, row - 1, len(ot_headers))
    for col in range(1, len(ot_headers) + 1):
        ws_ot.column_dimensions[get_column_letter(col)].width = 20

    # --- Sheet 4: Tax & Contributions Detail ---
    ws_tax = wb.create_sheet('Tax & Contributions Detail')
    brackets = list(run.rule_set.tax_brackets.order_by('order', 'lower_bound'))
    bracket_summary = '; '.join(
        f'{b.lower_bound:,.0f}'
        f'{"+" if b.upper_bound is None else f"–{b.upper_bound:,.0f}"} @ {b.rate * 100:.1f}%'
        for b in brackets
    )
    ws_tax.cell(row=1, column=1, value=f'Tax brackets ({run.rule_set.name} v{run.rule_set.version}): {bracket_summary}').font = Font(bold=True)
    ws_tax.merge_cells('A1:N1')

    tax_headers = [
        'User', 'Contribution Base (Social)', 'Employee Social Rate %', 'Employee Social Amount',
        'Contribution Base (Health)', 'Employee Health Rate %', 'Employee Health Amount',
        'Tax Base', 'Income Tax Amount', 'Effective Tax Rate %',
        'Employer Social Rate %', 'Employer Social Amount',
        'Employer Health Rate %', 'Employer Health Amount',
    ]
    header_row = 3
    for col, header in enumerate(tax_headers, 1):
        ws_tax.cell(row=header_row, column=col, value=header)

    row = header_row + 1
    for line in lines:
        trace = line.calculation_trace or {}
        emp_soc_base, emp_soc_rate, emp_soc_amt = _trace_amount_rate_base(trace, 'employee_social')
        emp_health_base, emp_health_rate, emp_health_amt = _trace_amount_rate_base(trace, 'employee_health')
        er_soc_base, er_soc_rate, er_soc_amt = _trace_amount_rate_base(trace, 'employer_social')
        er_health_base, er_health_rate, er_health_amt = _trace_amount_rate_base(trace, 'employer_health')
        tax_info = trace.get('income_tax') or {}
        tax_base = _dec(tax_info.get('tax_base'))
        values = [
            _excel_text(full_name(line.user)),
            float(emp_soc_base), float(emp_soc_rate * 100), float(emp_soc_amt),
            float(emp_health_base), float(emp_health_rate * 100), float(emp_health_amt),
            float(tax_base), float(line.income_tax), float(_pct(line.income_tax, line.total_gross)),
            float(er_soc_rate * 100), float(er_soc_amt),
            float(er_health_rate * 100), float(er_health_amt),
        ]
        for col, val in enumerate(values, 1):
            cell = ws_tax.cell(row=row, column=col, value=val)
            if col in (3, 6, 10, 11, 13):
                cell.number_format = '0.00"%"'
            elif col >= 2:
                cell.number_format = '#,##0'
        row += 1

    _style_header_row(ws_tax, len(tax_headers), row=header_row)
    _apply_borders(ws_tax, header_row, row - 1, len(tax_headers))
    ws_tax.freeze_panes = f'A{header_row + 1}'
    for col in range(1, len(tax_headers) + 1):
        ws_tax.column_dimensions[get_column_letter(col)].width = 22

    # --- Sheet 5: Carryover Detail ---
    ws_carry = wb.create_sheet('Carryover Detail')
    carry_headers = [
        'User', 'From Period', 'Requested Period', 'Resolved Period',
        'Resolution Reason', 'Work Dates', 'Overtime Hours',
        'Overtime Amount', 'Standby Hours', 'Standby Amount',
    ]
    for col, header in enumerate(carry_headers, 1):
        ws_carry.cell(row=1, column=col, value=header)
    row = 2
    for line in lines:
        for item in (line.carryover_breakdown or {}).get('carried_over', []):
            values = [
                _excel_text(full_name(line.user)), item.get('from_period', ''),
                item.get('requested_period', ''), item.get('resolved_period', ''),
                item.get('resolution_reason', ''), ', '.join(item.get('work_dates', [])),
                float(item.get('overtime_hours', 0)), float(item.get('overtime_amount', 0)),
                float(item.get('standby_hours', 0)), float(item.get('standby_amount', 0)),
            ]
            for col, value in enumerate(values, 1):
                ws_carry.cell(row=row, column=col, value=value)
            row += 1
    _style_header_row(ws_carry, len(carry_headers))
    if row > 2:
        _apply_borders(ws_carry, 1, row - 1, len(carry_headers))
    ws_carry.freeze_panes = 'A2'
    ws_carry.auto_filter.ref = f'A1:{get_column_letter(len(carry_headers))}{max(row - 1, 1)}'
    for col in range(1, len(carry_headers) + 1):
        ws_carry.column_dimensions[get_column_letter(col)].width = 20

    # Save to BytesIO stream for FileResponse streaming
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


# ---------------------------------------------------------------------------
# Payslip / consolidated payroll PDF
# ---------------------------------------------------------------------------

_PDF_PRIMARY = '#1e3a8a'
_PDF_WARN = '#f59e0b'
_PDF_WARN_BG = '#fef3c7'
_PDF_DANGER = '#ef4444'
_PDF_DANGER_BG = '#fee2e2'
_PDF_SUCCESS = '#22c55e'
_PDF_TOTAL_BG = '#e0e7ff'
_PDF_INFO_BG = '#f1f5f9'
_PDF_MARGIN_MM = 18
_PDF_TOP_BOTTOM_MM = 13


def _money(value) -> str:
    return f'{Decimal(value):,.0f}'


def _check_reportlab_available() -> None:
    try:
        import reportlab  # noqa: F401
    except ImportError:
        logger.error('ReportLab is not installed. PDF generation requires: pip install reportlab')
        raise ImportError(
            'PDF generation requires the reportlab library. '
            'Install it with: pip install reportlab'
        )


def _payslip_styles() -> dict:
    """Paragraph styles shared by the single payslip and the consolidated
    run PDF, so both look identical wherever they overlap."""
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    base = getSampleStyleSheet()
    return {
        'title': ParagraphStyle('PayslipTitle', parent=base['Title'], fontSize=18, spaceAfter=2, textColor=colors.HexColor(_PDF_PRIMARY)),
        'cover_title': ParagraphStyle('CoverTitle', parent=base['Title'], fontSize=20, spaceAfter=4, textColor=colors.HexColor(_PDF_PRIMARY)),
        'org': ParagraphStyle('Org', parent=base['Normal'], fontSize=12, fontName='Helvetica-Bold'),
        'label': ParagraphStyle('Label', parent=base['Normal'], fontSize=8, textColor=colors.grey),
        'normal': base['Normal'],
        'section_title': ParagraphStyle('SectionTitle', parent=base['Normal'], fontSize=10, fontName='Helvetica-Bold', spaceBefore=6, spaceAfter=3),
        'warn': ParagraphStyle('Warn', parent=base['Normal'], fontSize=8.5, textColor=colors.HexColor('#92400e')),
    }


def _base_table_style(header_color: str, total_bg: str | None = None):
    from reportlab.platypus import TableStyle
    from reportlab.lib import colors

    style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(header_color)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]
    if total_bg:
        style += [
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor(total_bg)),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]
    return TableStyle(style)


def _validation_warning_flowable(rule_set, styles):
    """Amber banner for a non-'official' rule set; ``None`` when official."""
    if rule_set.validation_status == 'official':
        return None
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib import colors

    warn_table = Table(
        [[Paragraph(
            f"⚠ Calculated using a '{rule_set.validation_status}' rule set "
            f"({rule_set.name} v{rule_set.version}) — verify against official "
            f"figures before relying on this document.",
            styles['warn'],
        )]],
        colWidths=[170 * mm],
    )
    warn_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(_PDF_WARN_BG)),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor(_PDF_WARN)),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return warn_table


def _draw_page_number(canvas, doc_) -> None:
    from reportlab.lib.units import mm
    from reportlab.lib import colors

    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.grey)
    canvas.drawRightString(
        doc_.pagesize[0] - _PDF_MARGIN_MM * mm, 10 * mm, f'Page {doc_.page}',
    )
    canvas.restoreState()


def _new_payslip_doc(output: io.BytesIO):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate

    return SimpleDocTemplate(
        output, pagesize=A4,
        leftMargin=_PDF_MARGIN_MM * mm, rightMargin=_PDF_MARGIN_MM * mm,
        topMargin=_PDF_TOP_BOTTOM_MM * mm, bottomMargin=_PDF_TOP_BOTTOM_MM * mm,
    )


def _build_payslip_flowables(line, styles: dict) -> list:
    """One employee's full payslip content (letterhead through rule-set
    footer). Used both for the single-payslip PDF and, once per employee,
    inside the consolidated run PDF.
    """
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors

    from django.utils import timezone
    from ..models import PayrollConfiguration

    run = line.run
    rule_set = run.rule_set
    user = line.user
    full_name = f'{user.first_name} {user.last_name}'.strip() or user.username
    config = PayrollConfiguration.get_singleton()
    org = config.organization_name or ''
    total_gross = line.total_gross
    trace = line.calculation_trace or {}

    story: list = []

    # --- Letterhead ---
    if org:
        story.append(Paragraph(org, styles['org']))
    story.append(Paragraph('PAYSLIP', styles['title']))
    story.append(Paragraph(
        f'Period: {run.year}-{run.month:02d}  •  Generated: {timezone.now().strftime("%Y-%m-%d %H:%M")}',
        styles['label'],
    ))
    story.append(Spacer(1, 3 * mm))

    warn_flowable = _validation_warning_flowable(rule_set, styles)
    if warn_flowable:
        story.append(warn_flowable)
        story.append(Spacer(1, 3 * mm))

    # --- Employee info ---
    info_table = Table(
        [
            ['Employee', f'{full_name} ({user.username})'],
            ['Rule Set', f'{rule_set.name} v{rule_set.version}'],
        ],
        colWidths=[35 * mm, 95 * mm],
    )
    info_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(_PDF_INFO_BG)),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 4 * mm))

    # --- Earnings ---
    story.append(Paragraph('Earnings', styles['section_title']))
    earnings_data = [['Item', 'Hours', 'Rate', 'Amount (Lek)', '% of Gross']]
    earnings_data.append([
        'Base Monthly Wage', '—', '—', _money(line.gross_monthly_wage),
        f'{_pct(line.gross_monthly_wage, total_gross):.1f}%',
    ])
    for ot in _overtime_rows(line):
        earnings_data.append([
            f"Overtime — {ot['label']}", f"{ot['hours']:.2f} h", f"{ot['multiplier_pct']:.0f}%",
            _money(ot['amount']), f"{ot['pct_of_gross']:.1f}%",
        ])
    if line.overtime_amount:
        earnings_data.append([
            'Total Overtime', f'{line.overtime_hours:,.2f} h', '—',
            _money(line.overtime_amount), f'{_pct(line.overtime_amount, total_gross):.1f}%',
        ])
    for sb in _standby_rows(line):
        earnings_data.append([
            sb['label'], f"{sb['hours']:.2f} h", _money(sb['rate']),
            _money(sb['amount']), f"{sb['pct_of_gross']:.1f}%",
        ])
    earnings_data.append(['Total Gross', '—', '—', _money(total_gross), '100.0%'])
    earnings_table = Table(earnings_data, colWidths=[55 * mm, 25 * mm, 20 * mm, 35 * mm, 25 * mm])
    earnings_table.setStyle(_base_table_style(_PDF_PRIMARY, total_bg=_PDF_TOTAL_BG))
    story.append(earnings_table)
    story.append(Spacer(1, 4 * mm))

    # --- Carryover ---
    carryover_items = (line.carryover_breakdown or {}).get('carried_over', [])
    if carryover_items:
        story.append(Paragraph('Carried Over From Prior Periods', styles['section_title']))
        carryover_data = [['Period', 'OT Hours', 'OT Amount', 'SB Hours', 'SB Amount']]
        for item in carryover_items:
            from_label = item.get('from_period', '')
            resolved_label = item.get('resolved_period', '')
            reason = item.get('resolution_reason', 'normal')
            suffix = f' ({reason})' if reason != 'normal' else ''
            carryover_data.append([
                f'{from_label} → {resolved_label}{suffix}',
                f"{item.get('overtime_hours', '0')}", _money(item.get('overtime_amount', 0)),
                f"{item.get('standby_hours', '0')}", _money(item.get('standby_amount', 0)),
            ])
        carryover_table = Table(carryover_data, colWidths=[55 * mm, 25 * mm, 25 * mm, 25 * mm, 25 * mm])
        carryover_table.setStyle(_base_table_style(_PDF_WARN))
        story.append(carryover_table)
        story.append(Spacer(1, 4 * mm))

    # --- Employee deductions ---
    story.append(Paragraph('Employee Deductions', styles['section_title']))
    emp_soc_base, emp_soc_rate, emp_soc_amt = _trace_amount_rate_base(trace, 'employee_social')
    emp_health_base, emp_health_rate, emp_health_amt = _trace_amount_rate_base(trace, 'employee_health')
    deductions_data = [
        ['Item', 'Base', 'Rate', 'Amount (Lek)'],
        ['Social Security (Sig. Shoq.)', _money(emp_soc_base), f'{emp_soc_rate * 100:.1f}%', _money(emp_soc_amt)],
        ['Health Insurance (Sig. Shend.)', _money(emp_health_base), f'{emp_health_rate * 100:.1f}%', _money(emp_health_amt)],
    ]
    tax_info = trace.get('income_tax') or {}
    tax_base = _dec(tax_info.get('tax_base'))
    deductions_data.append([
        'Income Tax (Tatimi)', _money(tax_base),
        f'{_pct(line.income_tax, tax_base) if tax_base else 0:.1f}% eff.', _money(line.income_tax),
    ])
    deductions_data.append([
        'Total Employee Deductions', '—', f'{_pct(line.total_employee_deductions, total_gross):.1f}% of gross',
        _money(line.total_employee_deductions),
    ])
    deductions_table = Table(deductions_data, colWidths=[60 * mm, 35 * mm, 35 * mm, 30 * mm])
    deductions_table.setStyle(_base_table_style(_PDF_DANGER, total_bg=_PDF_DANGER_BG))
    story.append(deductions_table)

    brackets = tax_info.get('brackets') or []
    if brackets:
        story.append(Spacer(1, 2 * mm))
        bracket_text = '; '.join(_format_bracket(b) for b in brackets)
        story.append(Paragraph(f'Tax brackets applied: {bracket_text}', styles['label']))
    story.append(Spacer(1, 4 * mm))

    # --- Employer contributions (informational) ---
    story.append(Paragraph('Employer Contributions (informational — not deducted from your pay)', styles['section_title']))
    er_soc_base, er_soc_rate, er_soc_amt = _trace_amount_rate_base(trace, 'employer_social')
    er_health_base, er_health_rate, er_health_amt = _trace_amount_rate_base(trace, 'employer_health')
    employer_data = [
        ['Item', 'Base', 'Rate', 'Amount (Lek)'],
        ['Employer Social Security', _money(er_soc_base), f'{er_soc_rate * 100:.1f}%', _money(er_soc_amt)],
        ['Employer Health Insurance', _money(er_health_base), f'{er_health_rate * 100:.1f}%', _money(er_health_amt)],
        ['Total Employer Cost', '—', f'{_pct(line.total_employer_cost - total_gross, total_gross):.1f}% overhead', _money(line.total_employer_cost)],
    ]
    employer_table = Table(employer_data, colWidths=[60 * mm, 35 * mm, 35 * mm, 30 * mm])
    employer_table.setStyle(_base_table_style('#64748b', total_bg='#e2e8f0'))
    story.append(employer_table)
    story.append(Spacer(1, 4 * mm))

    # --- Net pay ---
    net_data = [
        ['Net Pay', f'{_money(line.net_pay)} Lek', f'{_pct(line.net_pay, total_gross):.1f}% of gross'],
    ]
    net_table = Table(net_data, colWidths=[50 * mm, 60 * mm, 50 * mm])
    net_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(_PDF_SUCCESS)),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(net_table)

    # Footer
    if config.payslip_footer:
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph(config.payslip_footer, styles['label']))

    # Warnings
    if line.warnings:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph('<b>Warnings:</b>', styles['normal']))
        for w in line.warnings:
            story.append(Paragraph(f'• {w}', styles['label']))

    # Rule set info
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        f'Rule Set: {rule_set.name} v{rule_set.version} ({rule_set.validation_status})',
        styles['label'],
    ))

    return story


def _build_cover_flowables(run, lines: list, styles: dict) -> list:
    """Run-level summary page for the consolidated PDF: totals, derived
    percentages (mirrors the Excel Summary sheet via ``_run_summary_metrics``),
    and an employee roster."""
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table

    from django.utils import timezone
    from ..models import PayrollConfiguration

    config = PayrollConfiguration.get_singleton()
    org = config.organization_name or ''
    rule_set = run.rule_set

    story: list = []
    if org:
        story.append(Paragraph(org, styles['org']))
    story.append(Paragraph('PAYROLL RUN SUMMARY', styles['cover_title']))
    story.append(Paragraph(
        f'Period: {run.year}-{run.month:02d}  •  Status: {run.status}  •  '
        f'Generated: {timezone.now().strftime("%Y-%m-%d %H:%M")}',
        styles['label'],
    ))
    story.append(Spacer(1, 3 * mm))

    warn_flowable = _validation_warning_flowable(rule_set, styles)
    if warn_flowable:
        story.append(warn_flowable)
        story.append(Spacer(1, 3 * mm))

    story.append(Paragraph(
        f'Rule Set: {rule_set.name} v{rule_set.version} ({rule_set.validation_status})  •  '
        f'Employees included: {len(lines)}',
        styles['normal'],
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph('Run Totals', styles['section_title']))
    metric_formatters = {
        'amount': lambda v: f'{v:,.0f} Lek',
        'count': lambda v: f'{int(v)}',
        'pct': lambda v: f'{v:.2f}%',
    }
    metrics_data = [['Metric', 'Value']]
    for label, value, kind in _run_summary_metrics(run, lines):
        metrics_data.append([label, metric_formatters[kind](value)])
    metrics_table = Table(metrics_data, colWidths=[100 * mm, 60 * mm])
    metrics_table.setStyle(_base_table_style(_PDF_PRIMARY))
    story.append(metrics_table)
    story.append(Spacer(1, 4 * mm))

    story.append(Paragraph('Employees in This Run', styles['section_title']))
    roster_data = [['Employee', 'Net Pay (Lek)']]
    for line in lines:
        full_name = f'{line.user.first_name} {line.user.last_name}'.strip() or line.user.username
        roster_data.append([full_name, f'{line.net_pay:,.0f}'])
    roster_table = Table(roster_data, colWidths=[100 * mm, 60 * mm])
    roster_table.setStyle(_base_table_style('#64748b'))
    story.append(roster_table)

    return story


def generate_payslip_pdf(line) -> io.BytesIO:
    """Generate a single-employee payslip PDF.

    Returns a ``BytesIO`` stream positioned at 0, suitable for
    ``FileResponse`` streaming.

    Sections: letterhead (with a validation-status warning banner when the
    rule set isn't yet marked "official"), employee info, earnings (base wage
    + per-category overtime + standby, each broken out with hours/rate/%),
    employee deductions (social/health/tax with rates, bases, and the
    applicable tax bracket schedule), employer contributions (informational —
    not deducted from pay), net pay, carryover detail, warnings, and a
    rule-set/footer block with page numbers.
    """
    _check_reportlab_available()
    styles = _payslip_styles()
    output = io.BytesIO()
    doc = _new_payslip_doc(output)
    story = _build_payslip_flowables(line, styles)
    doc.build(story, onFirstPage=_draw_page_number, onLaterPages=_draw_page_number)
    output.seek(0)
    return output


def generate_payroll_pdf(run) -> io.BytesIO:
    """Generate a single consolidated PDF for an entire payroll run.

    Page 1 is a run-level summary — the same totals and derived percentages
    as the Excel Summary sheet, plus an employee roster. Every employee then
    gets their own full payslip (identical layout to ``generate_payslip_pdf``),
    each starting on a new page. Returns a ``BytesIO`` stream positioned at 0,
    suitable for ``FileResponse`` streaming.
    """
    _check_reportlab_available()
    from reportlab.platypus import PageBreak

    lines = list(
        run.lines.all().select_related('user', 'run', 'run__rule_set').order_by('user__username')
    )
    styles = _payslip_styles()
    output = io.BytesIO()
    doc = _new_payslip_doc(output)

    story: list = _build_cover_flowables(run, lines, styles)
    for line in lines:
        story.append(PageBreak())
        story.extend(_build_payslip_flowables(line, styles))

    doc.build(story, onFirstPage=_draw_page_number, onLaterPages=_draw_page_number)
    output.seek(0)
    return output
