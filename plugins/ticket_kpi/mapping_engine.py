"""
Ticket KPI Mapping Engine — Dynamic Schema Edition.

Transforms user-uploaded CSV/Excel files into ticket records.
No mandatory field mappings: every column is stored as-is in raw_data.
Standard fields (ticket_id, status, created_at, etc.) are auto-detected
and extracted for fast filtering when possible, but nothing is required.

Handles:
- Column name auto-detection (case-insensitive, fuzzy)
- Data type coercion for known date columns
- Value normalization when a profile is provided
- Resolution time computation when dates are detectable
- SLA breach detection
- Graceful handling of any schema (no required fields)
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from django.utils import timezone
from dateutil import parser as date_parser
from core.utils.tabular_file import (
    read_tabular_file,
    suggest_mapping,
    resolve_mapping,
    get_value as _shared_get_value,
)


class ColumnMapper:
    """
    Maps user-uploaded columns to normalized ticket schema.
    All columns are preserved in raw_data; standard fields are
    extracted when auto-detection succeeds.
    """

    # Heuristic aliases for auto-detection
    KNOWN_ALIASES = {
        'ticket_id': [
            'number', 'ticket', 'id', 'ticket_id', 'issue key', 'case id',
            'ticket number', 'ticket_id', 'incident number', 'request number',
            'task number', 'work item id', 'sys_id', 'ticket #', '#',
            'ticket id', 'incident id', 'case number', 'sr number',
        ],
        'title': [
            'short description', 'summary', 'subject', 'title', 'description',
            'ticket title', 'issue summary', 'problem statement', 'heading',
            'short_description', 'short desc', 'detailed description',
            'issue description', 'request description', 'task title',
        ],
        'status': [
            'state', 'status', 'stage', 'ticket state', 'incident state',
            'ticket status', 'current state', 'work status', 'condition',
            'resolution state', 'task status', 'case status',
        ],
        'created_at': [
            'opened', 'created', 'submitted', 'date opened', 'created at',
            'date created', 'opened at', 'ticket created', 'start date',
            'date submitted', 'open date', 'submission date',
            'created date', 'opened date', 'reported date', 'opened on',
        ],
        'resolved_at': [
            'resolved', 'closed', 'date resolved', 'closed at', 'resolved at',
            'date closed', 'resolution date', 'end date', 'completion date',
            'resolved date', 'closed date', 'finish date', 'resolved on',
            'date resolved', 'solved date', 'solved at',
        ],
        'assignee': [
            'assigned to', 'assignee', 'owner', 'technician', 'engineer',
            'assigned', 'handler', 'resolver', 'support engineer',
            'assigned_to', 'assigned user', 'it owner', 'support owner',
        ],
        'requester': [
            'caller', 'requester', 'reporter', 'customer', 'submitter',
            'requestor', 'end user', 'affected user', 'contact',
            'caller_id', 'requester_id', 'opened by', 'reported by',
            'created by', 'customer name', 'user name',
        ],
        'priority': [
            'priority', 'urgency', 'impact', 'severity', 'ticket priority',
            'priority level', 'urgency level', 'business priority',
            'ticket urgency', 'impact level',
        ],
        'category': [
            'category', 'type', 'issue type', 'service', 'topic',
            'ticket category', 'classification', 'service category',
            'request type', 'incident category', 'area', 'subcategory',
            'service type', 'product', 'module', 'component',
        ],
    }

    # Default status transforms covering common ticketing systems
    # (ServiceNow, Jira, Zendesk, Freshdesk, etc.). Profiles can override
    # these via value_transforms.
    DEFAULT_STATUS_TRANSFORMS = {
        'new': 'open',
        'in progress': 'open',
        'on hold': 'open',
        'awaiting info': 'open',
        'awaiting user': 'open',
        'awaiting vendor': 'open',
        'resolved': 'closed',
        'closed': 'closed',
        'closed complete': 'closed',
        'closed incomplete': 'closed',
        'cancelled': 'cancelled',
        'canceled': 'cancelled',
        'reopened': 'open',
        'pending': 'open',
        'work in progress': 'open',
        'awaiting assignment': 'open',
    }

    # Default priority transforms
    DEFAULT_PRIORITY_TRANSFORMS = {
        'p1 - critical': 'critical',
        'p1': 'critical',
        'critical': 'critical',
        'p2 - high': 'high',
        'p2': 'high',
        'high': 'high',
        'p3 - moderate': 'medium',
        'p3': 'medium',
        'moderate': 'medium',
        'medium': 'medium',
        'p4 - low': 'low',
        'p4': 'low',
        'low': 'low',
        'p5 - planning': 'low',
        'p5': 'low',
        'planning': 'low',
    }

    def __init__(self, profile: Optional[Any] = None):
        self.profile = profile

    def auto_detect_columns(self, df_columns: List[str]) -> Dict[str, str]:
        """
        Auto-detect mapping from detected columns to our normalized fields.
        Returns: {our_field: their_column}
        """
        return suggest_mapping(df_columns, self.KNOWN_ALIASES)

    def read_file(self, file_bytes: bytes, filename: str = '') -> pd.DataFrame:
        """
        Read CSV or Excel file into a DataFrame.
        """
        return read_tabular_file(file_bytes, filename=filename)

    def process_file(
        self,
        df: pd.DataFrame,
        field_mapping: Optional[Dict[str, str]] = None,
        value_transforms: Optional[Dict[str, Dict[str, str]]] = None,
        compute_resolution: bool = True,
        compute_sla: bool = False
    ) -> Tuple[List[Dict[str, Any]], List[str], Dict[str, str]]:
        """
        Dynamic schema processing.

        Stores every column in raw_data and auto-detects standard fields.
        No required fields — any schema is accepted.

        Returns:
            (records, errors, detected_mapping)
        """
        records = []
        errors = []
        df_columns = list(df.columns)

        # Auto-detect if no mapping provided
        detected = field_mapping or self.auto_detect_columns(df_columns)

        # Resolve case-insensitive mapping
        resolved_mapping = self._resolve_mapping(detected, df_columns)

        # Build value transform lookup (profile-specific + defaults)
        transforms = value_transforms or {}

        for idx, row in df.iterrows():
            try:
                record = self._process_row_dynamic(
                    row, df_columns, resolved_mapping, transforms,
                    compute_resolution=compute_resolution,
                    compute_sla=compute_sla
                )
                records.append(record)
            except Exception as e:
                errors.append(f"Row {idx + 1}: {str(e)}")

        return records, errors, resolved_mapping

    def apply_mapping(
        self,
        df: pd.DataFrame,
        field_mapping: Dict[str, str],
        value_transforms: Optional[Dict[str, Dict[str, str]]] = None,
        compute_resolution: bool = True,
        compute_sla: bool = False
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Legacy method for profile-driven mapping.
        Delegates to process_file for consistency.
        """
        records, errors, _ = self.process_file(
            df, field_mapping, value_transforms,
            compute_resolution, compute_sla
        )
        return records, errors

    def _resolve_mapping(
        self,
        mapping: Dict[str, str],
        df_columns: List[str]
    ) -> Dict[str, str]:
        """Resolve mapping with case-insensitive column matching."""
        return resolve_mapping(mapping, df_columns)

    def _process_row_dynamic(
        self,
        row: pd.Series,
        df_columns: List[str],
        mapping: Dict[str, str],
        transforms: Dict[str, Dict[str, str]],
        compute_resolution: bool,
        compute_sla: bool
    ) -> Dict[str, Any]:
        """
        Process a single DataFrame row into a dynamic ticket dict.
        ALL columns are stored in raw_data. Standard fields are extracted
        when detectable for fast filtering.
        """
        record = {}

        # --- Store EVERY column in raw_data (primary source of truth) ---
        raw_data = {}
        for col in df_columns:
            val = row.get(col)
            if pd.notna(val):
                # Convert datetime objects to ISO strings for JSON serialization
                if isinstance(val, datetime):
                    raw_data[str(col)] = val.isoformat()
                else:
                    raw_data[str(col)] = str(val)
        record['raw_data'] = raw_data

        # --- Extract standard fields when auto-detected ---
        # ticket_id
        ticket_id_val = self._get_value(row, mapping.get('ticket_id'))
        if pd.notna(ticket_id_val) and str(ticket_id_val).strip():
            record['ticket_id'] = str(ticket_id_val).strip()
        else:
            # Use row index as fallback ticket ID for traceability
            record['ticket_id'] = ''

        # title
        title_val = self._get_value(row, mapping.get('title'), '')
        record['title'] = str(title_val).strip()

        # status — try mapping first, then keyword fallback in raw columns
        status_col = mapping.get('status')
        if not status_col:
            status_col = self._find_column_by_keyword(df_columns, ['status', 'state'])
        status_val = self._get_value(row, status_col, '')
        record['status'] = self._transform_value('status', status_val, transforms)

        # created_at
        created_val = self._get_value(row, mapping.get('created_at'))
        if pd.notna(created_val):
            record['created_at'] = self._parse_datetime(created_val)

        # resolved_at
        if 'resolved_at' in mapping:
            val = self._get_value(row, mapping['resolved_at'])
            if pd.notna(val):
                record['resolved_at'] = self._parse_datetime(val)

        # assignee
        if 'assignee' in mapping:
            val = self._get_value(row, mapping['assignee'], '')
            record['assignee'] = str(val).strip()

        # requester
        if 'requester' in mapping:
            val = self._get_value(row, mapping['requester'], '')
            record['requester'] = str(val).strip()

        # priority
        if 'priority' in mapping:
            val = self._get_value(row, mapping['priority'], '')
            record['priority'] = self._transform_value('priority', val, transforms)

        # category
        if 'category' in mapping:
            val = self._get_value(row, mapping['category'], '')
            record['category'] = str(val).strip()

        # --- Computed fields ---
        if compute_resolution and record.get('resolved_at') and record.get('created_at'):
            delta = record['resolved_at'] - record['created_at']
            if delta.total_seconds() >= 0:
                record['time_to_resolution_hours'] = round(delta.total_seconds() / 3600, 2)

        if compute_sla:
            sla_val = self._find_sla_value(row, mapping)
            if sla_val is not None:
                record['sla_breached'] = sla_val
            elif record.get('time_to_resolution_hours') is not None:
                # Fallback: breach if resolution > 24 hours
                record['sla_breached'] = record['time_to_resolution_hours'] > 24

        return record

    def _find_column_by_keyword(
        self,
        df_columns: List[str],
        keywords: List[str]
    ) -> Optional[str]:
        """Find a column name matching any keyword (case-insensitive)."""
        columns_lower = {c.lower().strip(): c for c in df_columns}
        for kw in keywords:
            if kw in columns_lower:
                return columns_lower[kw]
            for col_lower, col in columns_lower.items():
                if kw in col_lower:
                    return col
        return None

    def _get_value(self, row: pd.Series, column: Optional[str], default='') -> Any:
        """Safely get a value from a DataFrame row."""
        return _shared_get_value(row, column, default=default)

    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        """Parse various datetime formats into a timezone-aware datetime."""
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None

        if isinstance(value, datetime):
            if timezone.is_naive(value):
                return timezone.make_aware(value)
            return value

        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None

        try:
            dt = date_parser.parse(str(value))
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            return dt
        except Exception:
            return None

    def _transform_value(
        self,
        field: str,
        value: Any,
        transforms: Dict[str, Dict[str, str]]
    ) -> str:
        """Apply value transforms for a field."""
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return ''

        str_value = str(value).strip().lower()

        # Profile-specific transforms
        if field in transforms and str_value in transforms[field]:
            return transforms[field][str_value]

        # Default transforms
        if field == 'status' and str_value in self.DEFAULT_STATUS_TRANSFORMS:
            return self.DEFAULT_STATUS_TRANSFORMS[str_value]

        if field == 'priority' and str_value in self.DEFAULT_PRIORITY_TRANSFORMS:
            return self.DEFAULT_PRIORITY_TRANSFORMS[str_value]

        return str(value).strip()

    def _find_sla_value(self, row: pd.Series, mapping: Dict[str, str]) -> Optional[bool]:
        """
        Try to find SLA breach info from columns not in the main mapping.

        Handles both negative indicators (e.g. 'SLA Breached') and positive
        indicators (e.g. 'Made SLA', 'SLA Met'). For positive indicators,
        True/Yes means the SLA was met (not breached), so the result is inverted.
        """
        sla_match_keywords = ['sla']
        positive_indicators = ['made', 'met', 'achieved', 'passed', 'within', 'not breached', 'ok', 'success']
        negative_indicators = ['breached', 'overdue', 'violated', 'failed', 'missed', 'not met']
        true_values = ('breached', 'overdue', 'violated', 'yes', 'true', '1')
        false_values = ('met', 'not breached', 'within sla', 'no', 'false', '0')

        for col in row.index:
            col_lower = str(col).lower().strip()
            if any(kw in col_lower for kw in sla_match_keywords):
                raw_val = row[col]
                if pd.isna(raw_val):
                    continue
                val = str(raw_val).lower().strip()

                # Determine whether the column is a positive or negative SLA indicator
                is_positive = any(ind in col_lower for ind in positive_indicators)
                is_negative = any(ind in col_lower for ind in negative_indicators)

                if val in true_values:
                    return False if is_positive else True
                elif val in false_values:
                    return True if is_positive else False
                # Default for ambiguous columns: treat True/Yes as breached unless column looks positive
                if not is_positive and not is_negative:
                    return True
                return False if is_positive else True

        return None

    def validate_preview(self, records: List[Dict], max_rows: int = 5) -> Dict[str, Any]:
        """
        Generate a preview summary from parsed records.
        Works with any available fields dynamically.
        """
        total = len(records)
        preview_rows = records[:max_rows]

        # Gather all field names present in raw_data across records
        all_fields = set()
        for r in records:
            all_fields.update(r.get('raw_data', {}).keys())

        # Issues: count missing standard fields
        issues = {}
        for field in ['ticket_id', 'title', 'status', 'created_at', 'resolved_at', 'assignee', 'priority', 'category']:
            missing = sum(1 for r in records if not r.get(field))
            if missing > 0:
                issues[f'missing_{field}'] = missing

        # Build breakdowns for every field that has categorical data
        field_breakdowns = {}
        for field in ['status', 'priority', 'category']:
            counts = {}
            for r in records:
                val = r.get(field, '')
                if val:
                    counts[val] = counts.get(val, 0) + 1
            if counts:
                field_breakdowns[field] = counts

        # Also breakdowns from raw_data for fields not in standard set
        standard_fields = {'ticket_id', 'title', 'status', 'created_at', 'resolved_at',
                           'assignee', 'requester', 'priority', 'category',
                           'time_to_resolution_hours', 'sla_breached', 'raw_data'}
        for field_name in all_fields:
            if field_name.lower() in {s.lower() for s in standard_fields}:
                continue
            counts = {}
            for r in records:
                val = r.get('raw_data', {}).get(field_name, '')
                if val:
                    counts[val] = counts.get(val, 0) + 1
            if counts and len(counts) <= 50:  # Only include if not too many unique values
                field_breakdowns[field_name] = counts

        return {
            'total_records': total,
            'preview_rows': preview_rows,
            'issues': issues,
            'field_breakdowns': field_breakdowns,
            'status_breakdown': field_breakdowns.get('status', {}),
            'priority_breakdown': field_breakdowns.get('priority', {}),
            'category_breakdown': field_breakdowns.get('category', {}),
        }
