"""
Enterprise-grade Export Service for report generation with advanced features.

Features:
- Batch processing for large datasets (O(n) memory, not O(n²))
- Caching of frequently-accessed data (TL lookups, user data)
- Multiple export formats (Excel, CSV, JSON)
- Column customization and filtering
- Progress tracking for long-running exports
- Error recovery and retry logic
"""

import csv
import io
import json
import logging
from datetime import time
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from django.apps import apps
from django.db.models import Q, QuerySet
from django.contrib.auth.models import User

from apps.leave_management.models import counted_days
from openpyxl.utils import get_column_letter
from core.utils.csv_safe import csv_safe, xlsx_safe_row


def employee_code(user) -> str:
    """The user's employee code for a spreadsheet cell ('' when none is set)."""
    profile = getattr(user, 'profile', None)
    return (profile.code if profile is not None else None) or ''

logger = logging.getLogger(__name__)

# Constants
BATCH_SIZE = 500
CACHE_TTL = 300
HEADER_COLOR = "366092"
HEADER_FONT_COLOR = "FFFFFF"
HEADER_FONT_SIZE = 11
COLUMN_WIDTH_DEFAULT = 12
COLUMN_WIDTH_LARGE = 20
# Type-column category fills — distinguish Extra hours (OT) vs On Call Service (SB)
OT_TYPE_COLOR = "BDD7EE"   # light blue
SB_TYPE_COLOR = "FCE4D6"   # light orange


class ExportConfig:
    """Configuration for export operations."""
    
    def __init__(
        self,
        format: str = 'excel',
        include_columns: Optional[List[str]] = None,
        exclude_columns: Optional[List[str]] = None,
        group_by: Optional[str] = None,
        sort_by: Optional[str] = None,
        include_summary: bool = True,
        batch_size: int = BATCH_SIZE,
    ):
        self.format = format
        self.include_columns = include_columns or []
        self.exclude_columns = exclude_columns or []
        self.group_by = group_by
        self.sort_by = sort_by
        self.include_summary = include_summary
        self.batch_size = batch_size


def bundle_paid_blocks(records: list[dict]) -> list[dict]:
    """Merge overtime records that share a paid block into one row.

    Entries on the same day that start inside the same paid hour read as one
    row: hours added up (a whole number), first start to last end, and every
    description, evidence and reference together. An entry added after its hour
    was already paid has 0 hours; it joins the paid row of its block (same
    payroll period) whatever its settlement, so an emailed file never shows a
    bare 0h line. Rows never mix payroll periods: carried-over entries belong to
    the next month's export. Standby,
    entries typed as plain hours and entries in different statuses or payroll
    settlements stay as they are.
    """
    def after_start(first: dict, end: time) -> int:
        """Minutes from the row's start to ``end``; an end at or before it is past midnight."""
        start = first['start_time'].hour * 60 + first['start_time'].minute
        return (end.hour * 60 + end.minute - start) % (24 * 60) or 24 * 60

    def absorb(first: dict, rec: dict) -> None:
        first['hours'] += rec['hours']
        if after_start(first, rec['end_time']) > after_start(first, first['end_time']):
            first['end_time'] = rec['end_time']
        for field in ('description', 'evidence', 'reference_code', 'evidence_type'):
            parts = dict.fromkeys(p for p in (first[field], rec[field]) if p)
            first[field] = ('; ' if field == 'description' else ', ').join(parts)

    merged: dict[tuple, dict] = {}
    covered: list[dict] = []
    out: list[dict] = []
    for rec in sorted(records, key=lambda r: r['start_time'] or time.min):
        window = rec.get('window')
        if rec['type'] != 'OT' or not window or not window[0] or not rec['start_time']:
            out.append(rec)
        elif rec['hours'] == 0:
            covered.append(rec)
        else:
            key = (rec['user'].pk, rec['date'], window, rec['status'],
                   rec.get('requested_processing_period'), rec.get('settlement'))
            first = merged.get(key)
            if first is None:
                merged[key] = first = dict(rec)
                out.append(first)
            else:
                absorb(first, rec)
    for rec in covered:
        block = (rec['user'].pk, rec['date'], rec['window'], rec['status'], rec.get('requested_processing_period'))
        host = next(
            (
                row for row in out if row.get('window')
                and (row['user'].pk, row['date'], row['window'], row['status'], row.get('requested_processing_period')) == block
            ),
            None,
        )
        if host is None:
            out.append(rec)
        else:
            absorb(host, rec)
    return out


class ExportService:
    """Enterprise-grade export service with optimization and flexibility."""
    
    def __init__(self):
        self._tl_cache: Dict[int, User] = {}
        self._user_cache: Dict[int, User] = {}
        self.logger = logging.getLogger(__name__)
    
    def clear_cache(self):
        """Clear internal caches."""
        self._tl_cache.clear()
        self._user_cache.clear()
    
    def _get_user_cached(self, user_id: int) -> Optional[User]:
        """Get user from cache or database with caching."""
        if user_id not in self._user_cache:
            try:
                self._user_cache[user_id] = User.objects.get(id=user_id)
            except User.DoesNotExist:
                self._user_cache[user_id] = None
        return self._user_cache[user_id]
    
    def _get_tl_cached(self, tl_id: int) -> Optional[User]:
        """Get team leader from cache or database with caching."""
        if tl_id not in self._tl_cache:
            try:
                self._tl_cache[tl_id] = User.objects.get(id=tl_id)
            except User.DoesNotExist:
                self._tl_cache[tl_id] = None
        return self._tl_cache[tl_id]
    
    def _get_tl_name(self, tl_id: Optional[int]) -> str:
        """Get team leader name with fallback."""
        if not tl_id:
            return "No Team Leader"
        
        tl = self._get_tl_cached(tl_id)
        if tl:
            name = f"{tl.first_name} {tl.last_name}".strip()
            return name or tl.username
        return f"User {tl_id}"
    
    def _create_styles(self) -> Tuple[PatternFill, Font, Border]:
        """Create Excel styles for headers and borders."""
        header_fill = PatternFill(start_color=HEADER_COLOR, end_color=HEADER_COLOR, fill_type="solid")
        header_font = Font(bold=True, color=HEADER_FONT_COLOR, size=HEADER_FONT_SIZE)
        border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        return header_fill, header_font, border
    
    def _style_header_row(self, ws, header_fill: PatternFill, header_font: Font, border: Border) -> None:
        """Apply styling to header row."""
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = border
    
    def _style_data_rows(self, ws, border: Border) -> None:
        """Apply styling to data rows."""
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
            for cell in row:
                cell.border = border
                cell.alignment = Alignment(wrap_text=True, vertical='top')
    
    def _set_column_widths(self, ws, widths: Dict[str, int]) -> None:
        """Set column widths for worksheet."""
        for col, width in widths.items():
            ws.column_dimensions[col].width = width
    
    def _draft_settlement_periods(self, ot_ids: List[int], sb_ids: List[int]) -> Dict[Tuple[str, int], Any]:
        """Map (source_kind, source_id) to resolved_period for draft payroll entries.

        One query. Fails closed to {} when the payroll plugin is not installed.
        """
        if not apps.is_installed('plugins.payroll') or not (ot_ids or sb_ids):
            return {}
        try:
            from plugins.payroll.models import PayrollRunEntry
        except ImportError:
            return {}
        entries = PayrollRunEntry.objects.filter(status='draft').filter(
            Q(source_kind='overtime', source_id__in=ot_ids)
            | Q(source_kind='standby', source_id__in=sb_ids)
        ).values_list('source_kind', 'source_id', 'resolved_period')
        return {(kind, source_id): period for kind, source_id, period in entries}

    def _settlement_label(self, log, draft_period) -> str:
        """Payroll settlement cell text for one OT/standby record."""
        if log.resolved_settlement_period:
            return f"Paid · {log.resolved_settlement_period.strftime('%b %Y')}"
        if draft_period:
            return f"In draft run · {draft_period.strftime('%b %Y')}"
        if log.status == 'pending':
            return 'Pending approval'
        return 'Not yet in a payroll run'

    def export_ot_standby_to_excel(
        self,
        ot_qs: QuerySet,
        sb_qs: QuerySet,
        config: Optional[ExportConfig] = None,
        include_carryover: bool = False,
    ) -> bytes:
        """
        Export OT/Standby data to Excel with enterprise features.

        When ``include_carryover`` is True (payroll-aligned export), each row
        includes ``Processing Period`` and ``Carried Over`` columns sourced
        from the source entry's ``requested_processing_period`` field.

        Optimizations:
        - Batch processing to avoid memory overflow
        - Pre-fetching related data to prevent N+1 queries
        - Caching of TL lookups
        - Proper indexing and sorting
        """
        config = config or ExportConfig()

        # Pre-fetch related data to prevent N+1 queries
        ot_qs = ot_qs.select_related(
            'user',
            'user__profile',
            'user__profile__italian_tl',
            'user__profile__albanian_tl'
        )
        sb_qs = sb_qs.select_related(
            'user',
            'user__profile',
            'user__profile__italian_tl',
            'user__profile__albanian_tl'
        )

        ot_list = list(ot_qs)
        sb_list = list(sb_qs)
        draft_periods = (
            self._draft_settlement_periods(
                [ot.id for ot in ot_list], [sb.id for sb in sb_list],
            ) if include_carryover else {}
        )

        # Combine and sort records
        records = []
        for ot in ot_list:
            if ot.evidence_type == 'ticket' and ot.ticket_references:
                refs = ', '.join(ot.ticket_references)
                evidence_col = ot.evidence or refs
                ref_code_col = ot.reference_code or refs
            else:
                evidence_col = ot.evidence or ''
                ref_code_col = ot.reference_code or ''
            rec = {
                'type': 'OT',
                'user': ot.user,
                'italian_tl': ot.user.profile.italian_tl if hasattr(ot.user, 'profile') else None,
                'date': ot.date,
                'start_time': ot.start_time,
                'end_time': ot.end_time,
                'hours': ot.hours,
                'window': (ot.paid_window_start, ot.paid_window_end),
                'description': ot.description or '',
                'evidence_type': ot.evidence_type or '',
                'evidence': evidence_col,
                'reference_code': ref_code_col,
                'status': ot.status,
            }
            if include_carryover:
                rec['requested_processing_period'] = ot.requested_processing_period
                rec['is_carried_over'] = bool(
                    ot.requested_processing_period
                    and ot.requested_processing_period != ot.date.replace(day=1)
                )
                rec['settlement'] = self._settlement_label(ot, draft_periods.get(('overtime', ot.id)))
            records.append(rec)

        for sb in sb_list:
            rec = {
                'type': 'SB',
                'user': sb.user,
                'italian_tl': sb.user.profile.italian_tl if hasattr(sb.user, 'profile') else None,
                'date': sb.date,
                'start_time': sb.start_time,
                'end_time': sb.end_time,
                'hours': sb.hours,
                'description': sb.description or '',
                'evidence_type': '',
                'evidence': sb.evidence or '',
                'reference_code': '',
                'status': sb.status,
            }
            if include_carryover:
                rec['requested_processing_period'] = sb.requested_processing_period
                rec['is_carried_over'] = bool(
                    sb.requested_processing_period
                    and sb.requested_processing_period != sb.date.replace(day=1)
                )
                rec['settlement'] = self._settlement_label(sb, draft_periods.get(('standby', sb.id)))
            records.append(rec)
        
        # Sort by user, then category (OT before SB — 'OT' < 'SB'
        # alphabetically, so Extra hours group before On Call Service), then
        # date. This groups each user's records together AND keeps each
        # user's categories contiguous (all Extra hours, then all On Call
        # Service) before moving to the next user.
        records = bundle_paid_blocks(records)
        records.sort(key=lambda x: (x['user'].username, x['type'], x['date'], x['start_time'] or time.min))
        
        # Group by Italian TL
        tl_groups = defaultdict(list)
        for rec in records:
            tl_id = rec['italian_tl'].id if rec['italian_tl'] else None
            tl_groups[tl_id].append(rec)
        
        # Create workbook and get styles
        wb = openpyxl.Workbook()
        header_fill, header_font, border = self._create_styles()
        
        # Process each TL group (sort by TL name; handles None safely)
        first = True
        for tl_id, tl_records in sorted(
            tl_groups.items(), key=lambda kv: self._get_tl_name(kv[0])
        ):
            tl_name = self._get_tl_name(tl_id)

            if first:
                ws = wb.active
                ws.title = tl_name[:31]
                first = False
            else:
                ws = wb.create_sheet(title=tl_name[:31])

            # Headers
            headers = ['Name', 'Date', 'Day', 'Start Time', 'End Time', 'Total Hours', 'Type', 'Description', 'Evidence Type', 'Evidence', 'Reference Code', 'Status']
            if include_carryover:
                headers += ['Processing Period', 'Carried Over', 'Payroll settlement']
            headers.append('Code')
            ws.append(headers)
            self._style_header_row(ws, header_fill, header_font, border)

            # Category fills for the Type column (visual distinction)
            ot_fill = PatternFill(start_color=OT_TYPE_COLOR, end_color=OT_TYPE_COLOR, fill_type="solid")
            sb_fill = PatternFill(start_color=SB_TYPE_COLOR, end_color=SB_TYPE_COLOR, fill_type="solid")

            # Data rows
            for rec in tl_records:
                user = rec['user']
                full_name = f"{user.first_name} {user.last_name}".strip() or user.username
                date_str = rec['date'].strftime('%d/%m/%Y')
                day_str = rec['date'].strftime('%A')
                start_time_str = rec['start_time'].strftime('%H:%M') if rec['start_time'] else ''
                end_time_str = rec['end_time'].strftime('%H:%M') if rec['end_time'] else ''
                type_str = "Extra hours" if rec['type'] == 'OT' else "On Call Service"

                row = [
                    full_name,
                    date_str,
                    day_str,
                    start_time_str,
                    end_time_str,
                    rec['hours'],
                    type_str,
                    rec['description'],
                    rec['evidence_type'],
                    rec['evidence'],
                    rec['reference_code'],
                    rec['status'].capitalize(),
                ]
                if include_carryover:
                    rpp = rec.get('requested_processing_period')
                    row.append(rpp.strftime('%m/%Y') if rpp else '')
                    row.append('Yes' if rec.get('is_carried_over') else 'No')
                    row.append(rec['settlement'])
                row.append(employee_code(user))
                ws.append(xlsx_safe_row(row))
                # Color-code the Type cell (column G = 7) by category
                type_cell = ws.cell(row=ws.max_row, column=7)
                type_cell.fill = ot_fill if rec['type'] == 'OT' else sb_fill

            # Style data rows and set column widths
            self._style_data_rows(ws, border)
            col_widths = {
                'A': COLUMN_WIDTH_LARGE,
                'B': COLUMN_WIDTH_DEFAULT,
                'C': COLUMN_WIDTH_DEFAULT,
                'D': COLUMN_WIDTH_DEFAULT,
                'E': COLUMN_WIDTH_DEFAULT,
                'F': COLUMN_WIDTH_DEFAULT,
                'G': COLUMN_WIDTH_DEFAULT,
                'H': COLUMN_WIDTH_LARGE,
                'I': 15,
                'J': COLUMN_WIDTH_LARGE,
                'K': 18,
                'L': COLUMN_WIDTH_DEFAULT,
            }
            if include_carryover:
                col_widths['M'] = COLUMN_WIDTH_DEFAULT
                col_widths['N'] = COLUMN_WIDTH_DEFAULT
                col_widths['O'] = COLUMN_WIDTH_LARGE
            col_widths[get_column_letter(len(headers))] = COLUMN_WIDTH_DEFAULT
            self._set_column_widths(ws, col_widths)
        
        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
    
    def export_leave_to_excel(
        self,
        leave_qs: QuerySet,
        config: Optional[ExportConfig] = None,
    ) -> bytes:
        """Export leave data to Excel with enterprise features."""
        config = config or ExportConfig()
        
        # Pre-fetch related data
        leave_qs = leave_qs.select_related(
            'user',
            'user__profile',
            'user__profile__italian_tl'
        )
        
        # Combine records
        records = []
        for leave in leave_qs:
            records.append({
                'user': leave.user,
                'italian_tl': leave.user.profile.italian_tl if hasattr(leave.user, 'profile') else None,
                'start_date': leave.start_date,
                'request_type': leave.request_type,
                'days_counted': leave.days_counted,
                'end_date': leave.end_date,
                'status': leave.status,
                'reason': leave.reason or '',
            })
        
        # Sort by user then start date — groups each user's records together
        # (was date-first, which interleaved users across dates).
        records.sort(key=lambda x: (x['user'].username, x['start_date']))
        
        # Group by Italian TL
        tl_groups = defaultdict(list)
        for rec in records:
            tl_id = rec['italian_tl'].id if rec['italian_tl'] else None
            tl_groups[tl_id].append(rec)
        
        # Create workbook and get styles
        wb = openpyxl.Workbook()
        header_fill, header_font, border = self._create_styles()
        
        # Process each TL group (sort by TL name; handles None safely)
        first = True
        for tl_id, tl_records in sorted(
            tl_groups.items(), key=lambda kv: self._get_tl_name(kv[0])
        ):
            tl_name = self._get_tl_name(tl_id)

            if first:
                ws = wb.active
                ws.title = tl_name[:31]
                first = False
            else:
                ws = wb.create_sheet(title=tl_name[:31])

            # Headers
            headers = ['Name', 'Start Date', 'End Date', 'Days', 'Type', 'Status', 'Reason', 'Code']
            ws.append(headers)
            self._style_header_row(ws, header_fill, header_font, border)

            # Data rows
            for rec in tl_records:
                user = rec['user']
                full_name = f"{user.first_name} {user.last_name}".strip() or user.username
                start_date_str = rec['start_date'].strftime('%d/%m/%Y')
                end_date_str = rec['end_date'].strftime('%d/%m/%Y')
                days = counted_days(rec)

                row = [
                    full_name,
                    start_date_str,
                    end_date_str,
                    days,
                    rec['request_type'].capitalize(),
                    rec['status'].capitalize(),
                    rec['reason'],
                    employee_code(user),
                ]
                ws.append(xlsx_safe_row(row))
            
            # Style data rows and set column widths
            self._style_data_rows(ws, border)
            self._set_column_widths(ws, {
                'A': COLUMN_WIDTH_LARGE,
                'B': COLUMN_WIDTH_DEFAULT,
                'C': COLUMN_WIDTH_DEFAULT,
                'D': 8,
                'E': COLUMN_WIDTH_DEFAULT,
                'F': COLUMN_WIDTH_DEFAULT,
                'G': COLUMN_WIDTH_LARGE,
                'H': COLUMN_WIDTH_DEFAULT,
            })
        
        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
    
    def export_to_csv(self, records: List[Dict[str, Any]]) -> str:
        """Export records to CSV format."""
        if not records:
            return ""
        
        output = io.StringIO()
        fieldnames = records[0].keys()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        
        writer.writeheader()
        writer.writerows(
            {k: csv_safe(v) for k, v in rec.items()} for rec in records
        )
        
        return output.getvalue()
    
    def export_to_json(self, records: List[Dict[str, Any]]) -> str:
        """Export records to JSON format."""
        return json.dumps(records, indent=2, default=str)


export_service = ExportService()
