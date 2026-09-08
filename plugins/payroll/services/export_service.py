"""Export service for the Payroll plugin.

Generates Excel run summaries and individual payslip PDFs from
finalized (or draft) payroll data.
"""
from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)


def _excel_text(value: str) -> str:
    return f"'{value}" if value.lstrip().startswith(('=', '+', '-', '@')) else value


# ---------------------------------------------------------------------------
# Excel export
# ---------------------------------------------------------------------------

def generate_payroll_excel(run) -> io.BytesIO:
    """Generate a multi-sheet Excel file for a payroll run.

    Returns a ``BytesIO`` stream positioned at 0, suitable for
    ``FileResponse`` streaming.

    Sheets:
    1. Summary — run-level totals.
    2. Employee Breakdown — one row per employee with all line items.
    3. Overtime Detail — per-category overtime hours and amounts.
    """
    import openpyxl
    from openpyxl.styles import Font, Alignment

    wb = openpyxl.Workbook()

    # --- Sheet 1: Summary ---
    ws_summary = wb.active
    ws_summary.title = 'Summary'
    ws_summary['A1'] = f'Payroll Run {run.year}-{run.month:02d}'
    ws_summary['A1'].font = Font(bold=True, size=14)
    ws_summary['A2'] = f'Status: {run.status}'
    ws_summary['A3'] = f'Rule Set: {run.rule_set.name} v{run.rule_set.version}'
    ws_summary['A4'] = f'Created: {run.created_at.strftime("%Y-%m-%d %H:%M")}'

    totals = run.totals or {}
    row = 6
    ws_summary.cell(row=row, column=1, value='Metric').font = Font(bold=True)
    ws_summary.cell(row=row, column=2, value='Amount (Lek)').font = Font(bold=True)
    row += 1
    for key, label in [
        ('total_gross', 'Total Gross'),
        ('total_deductions', 'Total Employee Deductions'),
        ('total_net', 'Total Net Pay'),
        ('total_employer_cost', 'Total Employer Cost'),
        ('total_overtime', 'Total Overtime'),
        ('total_standby', 'Total Standby'),
        ('line_count', 'Employee Count'),
    ]:
        ws_summary.cell(row=row, column=1, value=label)
        val = totals.get(key, '0')
        if key != 'line_count':
            ws_summary.cell(row=row, column=2, value=float(val)).number_format = '#,##0'
        else:
            ws_summary.cell(row=row, column=2, value=int(val))
        row += 1

    # --- Sheet 2: Employee Breakdown ---
    ws_emp = wb.create_sheet('Employee Breakdown')
    headers = [
        'User', 'Gross Wage', 'Overtime Hours', 'Overtime Amount',
        'Standby Hours', 'Standby Amount', 'Carryover', 'Total Gross',
        'Employee Social', 'Employee Health', 'Income Tax',
        'Total Deductions', 'Net Pay', 'Employer Social',
        'Employer Health', 'Employer Cost',
    ]
    for col, header in enumerate(headers, 1):
        cell = ws_emp.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal='center')

    row = 2
    for line in run.lines.all().select_related('user').order_by('user__username'):
        full_name = f'{line.user.first_name} {line.user.last_name}'.strip() or line.user.username
        values = [
            _excel_text(full_name),
            float(line.gross_monthly_wage),
            float(line.overtime_hours),
            float(line.overtime_amount),
            float(line.standby_hours),
            'Yes' if (line.carryover_breakdown or {}).get('carried_over') else 'No',
            float(line.total_gross),
            float(line.employee_social),
            float(line.employee_health),
            float(line.income_tax),
            float(line.total_employee_deductions),
            float(line.net_pay),
            float(line.employer_social),
            float(line.employer_health),
            float(line.total_employer_cost),
        ]
        for col, val in enumerate(values, 1):
            cell = ws_emp.cell(row=row, column=col, value=val)
            if col >= 2 and col != 3 and col != 5:
                cell.number_format = '#,##0'
            elif col in (3, 5):
                cell.number_format = '#,##0.00'
        row += 1

    # Auto-width
    for col in range(1, len(headers) + 1):
        ws_emp.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 18

    # --- Sheet 3: Overtime Detail ---
    ws_ot = wb.create_sheet('Overtime Detail')
    ot_headers = ['User', 'Category', 'Hours', 'Multiplier', 'Amount']
    for col, header in enumerate(ot_headers, 1):
        cell = ws_ot.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)

    row = 2
    for line in run.lines.all().select_related('user').order_by('user__username'):
        full_name = f'{line.user.first_name} {line.user.last_name}'.strip() or line.user.username
        breakdown = line.overtime_breakdown or {}
        categories = breakdown.get('categories', [])
        if not categories:
            ws_ot.cell(row=row, column=1, value=_excel_text(full_name))
            ws_ot.cell(row=row, column=2, value='(none)')
            row += 1
            continue
        for cat in categories:
            ws_ot.cell(row=row, column=1, value=_excel_text(full_name))
            ws_ot.cell(row=row, column=2, value=cat.get('code', ''))
            ws_ot.cell(row=row, column=3, value=float(cat.get('hours', 0))).number_format = '#,##0.00'
            ws_ot.cell(row=row, column=4, value=float(cat.get('multiplier', 0))).number_format = '0.00'
            ws_ot.cell(row=row, column=5, value=float(cat.get('amount', 0))).number_format = '#,##0'
            row += 1

    for col in range(1, len(ot_headers) + 1):
        ws_ot.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 18

    # --- Sheet 4: Carryover Detail ---
    ws_carry = wb.create_sheet('Carryover Detail')
    carry_headers = [
        'User', 'From Period', 'Requested Period', 'Resolved Period',
        'Resolution Reason', 'Work Dates', 'Overtime Hours',
        'Overtime Amount', 'Standby Hours', 'Standby Amount',
    ]
    for col, header in enumerate(carry_headers, 1):
        cell = ws_carry.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
    row = 2
    for line in run.lines.all().select_related('user').order_by('user__username'):
        full_name = f'{line.user.first_name} {line.user.last_name}'.strip() or line.user.username
        for item in (line.carryover_breakdown or {}).get('carried_over', []):
            values = [
                _excel_text(full_name), item.get('from_period', ''),
                item.get('requested_period', ''), item.get('resolved_period', ''),
                item.get('resolution_reason', ''), ', '.join(item.get('work_dates', [])),
                float(item.get('overtime_hours', 0)), float(item.get('overtime_amount', 0)),
                float(item.get('standby_hours', 0)), float(item.get('standby_amount', 0)),
            ]
            for col, value in enumerate(values, 1):
                ws_carry.cell(row=row, column=col, value=value)
            row += 1
    for col in range(1, len(carry_headers) + 1):
        ws_carry.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 20

    # Save to BytesIO stream for FileResponse streaming
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


# ---------------------------------------------------------------------------
# Payslip PDF
# ---------------------------------------------------------------------------

def generate_payslip_pdf(line) -> io.BytesIO:
    """Generate a single-employee payslip PDF.

    Returns a ``BytesIO`` stream positioned at 0, suitable for
    ``FileResponse`` streaming.

    Uses ReportLab if available; otherwise returns a simple text-based
    PDF placeholder. The layout includes employee info, earnings,
    deductions, and net pay.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        )
        from reportlab.lib import colors
    except ImportError:
        logger.error('ReportLab is not installed. Payslip PDF generation requires: pip install reportlab')
        raise ImportError(
            'Payslip PDF generation requires the reportlab library. '
            'Install it with: pip install reportlab'
        )

    run = line.run
    user = line.user
    full_name = f'{user.first_name} {user.last_name}'.strip() or user.username

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=16, spaceAfter=10)
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=9, textColor=colors.grey)
    normal_style = styles['Normal']

    story: list = []

    # Header
    story.append(Paragraph('Payslip', title_style))
    story.append(Spacer(1, 5 * mm))

    # Employee info
    from ..models import PayrollConfiguration
    config = PayrollConfiguration.get_singleton()
    org = config.organization_name or ''
    if org:
        story.append(Paragraph(f'<b>{org}</b>', normal_style))
    story.append(Paragraph(f'Period: {run.year}-{run.month:02d}', normal_style))
    story.append(Paragraph(f'Employee: {full_name} ({user.username})', normal_style))
    story.append(Spacer(1, 8 * mm))

    # Earnings table
    earnings_data = [
        ['Earnings', 'Amount (Lek)'],
        ['Gross Monthly Wage', f'{line.gross_monthly_wage:,.0f}'],
        ['Overtime Hours', f'{line.overtime_hours:,.2f} h'],
        ['Overtime Amount', f'{line.overtime_amount:,.0f}'],
        ['Standby Hours', f'{line.standby_hours:,.2f} h'],
        ['Standby Amount', f'{line.standby_amount:,.0f}'],
        ['Total Gross', f'{line.total_gross:,.0f}'],
    ]
    earnings_table = Table(earnings_data, colWidths=[80 * mm, 50 * mm])
    earnings_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e0e7ff')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    story.append(earnings_table)
    carryover_items = (line.carryover_breakdown or {}).get('carried_over', [])
    if carryover_items:
        story.append(Spacer(1, 5 * mm))
        carryover_data = [['Carryover detail', 'Hours', 'Amount (Lek)']]
        for item in carryover_items:
            from_label = item.get('from_period', '')
            resolved_label = item.get('resolved_period', '')
            reason = item.get('resolution_reason', 'normal')
            suffix = f' ({reason})' if reason != 'normal' else ''
            carryover_data.append([
                f'From {from_label} to {resolved_label}{suffix}',
                f"OT {item.get('overtime_hours', '0')} / SB {item.get('standby_hours', '0')}",
                f"OT {item.get('overtime_amount', '0')} / SB {item.get('standby_amount', '0')}",
            ])
        carryover_table = Table(carryover_data, colWidths=[65 * mm, 35 * mm, 30 * mm])
        carryover_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f59e0b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(carryover_table)
    story.append(Spacer(1, 5 * mm))

    # Deductions table
    deductions_data = [
        ['Deductions', 'Amount (Lek)'],
        ['Employee Social Security', f'{line.employee_social:,.0f}'],
        ['Employee Health Insurance', f'{line.employee_health:,.0f}'],
        ['Income Tax', f'{line.income_tax:,.0f}'],
        ['Total Deductions', f'{line.total_employee_deductions:,.0f}'],
    ]
    deductions_table = Table(deductions_data, colWidths=[80 * mm, 50 * mm])
    deductions_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ef4444')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#fee2e2')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    story.append(deductions_table)
    story.append(Spacer(1, 5 * mm))

    # Net pay
    net_data = [
        ['Net Pay', f'{line.net_pay:,.0f} Lek'],
        ['Total Employer Cost', f'{line.total_employer_cost:,.0f} Lek'],
    ]
    net_table = Table(net_data, colWidths=[80 * mm, 50 * mm])
    net_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#22c55e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ]))
    story.append(net_table)

    # Footer
    if config.payslip_footer:
        story.append(Spacer(1, 10 * mm))
        story.append(Paragraph(config.payslip_footer, label_style))

    # Warnings
    if line.warnings:
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph('<b>Warnings:</b>', normal_style))
        for w in line.warnings:
            story.append(Paragraph(f'• {w}', label_style))

    # Rule set info
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        f'Rule Set: {run.rule_set.name} v{run.rule_set.version} '
        f'({run.rule_set.validation_status})',
        label_style,
    ))

    doc.build(story)
    output.seek(0)
    return output
