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
- SLA breach from evidence in the file only (never guessed)
- Graceful handling of any schema (no required fields)
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from django.utils import timezone
from dateutil import parser as date_parser
from .status_groups import status_group
from .export_reader import read_export
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
        'open': 'open',
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

    def suggest_month(self, df: pd.DataFrame, created_at_column: Optional[str]) -> Optional[str]:
        """Guess the upload's target month from its own dates.

        The upload form otherwise requires the user to type the month before
        they can even see what is in the file — a manual step that is both
        unnecessary (the file already says) and a source of "picked the wrong
        month" mistakes. Returns the most common ``YYYY-MM-01`` across every
        parseable ``created_at`` value, or ``None`` if no such column was
        detected or nothing in it parses as a date.
        """
        if not created_at_column or created_at_column not in df.columns:
            return None
        months: Dict[str, int] = {}
        for raw in df[created_at_column]:
            if pd.isna(raw):
                continue
            try:
                parsed = self._parse_datetime(raw)
            except ValueError:
                continue
            if parsed is None:
                continue
            key = parsed.strftime('%Y-%m-01')
            months[key] = months.get(key, 0) + 1
        if not months:
            return None
        return max(months.items(), key=lambda item: item[1])[0]

    def read_file(self, file_bytes: bytes, filename: str = '') -> pd.DataFrame:
        """
        Read CSV or Excel file into a DataFrame.

        A profile that lists ``keep_columns`` gets exactly those columns from the
        real data sheet and header row (``export_reader``); otherwise the plain
        reader keeps every column.
        """
        keep = getattr(self.profile, 'keep_columns', None)
        if keep:
            return read_export(file_bytes, filename, keep)
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
            record['created_at'] = self._parse_datetime(created_val, strict=True)

        # resolved_at
        if 'resolved_at' in mapping:
            val = self._get_value(row, mapping['resolved_at'])
            if pd.notna(val):
                record['resolved_at'] = self._parse_datetime(val, strict=True)

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

        # An SLA verdict needs evidence in the file. No column, or a value we cannot
        # read, leaves it None (shown as N/A): a guess here corrupts the KPI.
        if compute_sla:
            sla_val = self._find_sla_value(row, mapping, transforms.get('sla_breached') or {})
            if sla_val is not None:
                record['sla_breached'] = sla_val

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

    def _parse_datetime(self, value: Any, strict: bool = False) -> Optional[datetime]:
        """Parse various datetime formats into a timezone-aware datetime.

        A profile with a ``date_format`` reads text dates with exactly that format
        (day-first exports: the auto parser would read 05/10 as 10 May). With
        ``strict`` a text that does not fit raises ValueError, so the row is
        reported instead of silently losing its date.
        """
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

        fmt = getattr(self.profile, 'date_format', '')
        if fmt and isinstance(value, str):
            try:
                dt = datetime.strptime(value, fmt)
            except ValueError:
                if strict:
                    raise ValueError(f"Unreadable date '{value}' (expected {fmt})") from None
                return None
            return timezone.make_aware(dt) if timezone.is_naive(dt) else dt

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

    # Headers that unmistakably carry a breach verdict; read without a mapping.
    SLA_IMPLICIT_HEADERS = frozenset({'sla breached', 'sla breach', 'made sla', 'sla met'})
    # Values that mean the same whatever the column is called.
    SLA_WORD_VALUES = {
        'breached': True, 'overdue': True, 'violated': True, 'missed': True,
        'not met': True, 'not made': True,
        'met': False, 'made': False, 'achieved': False, 'within sla': False,
        'within target': False, 'not breached': False,
    }
    SLA_YES = ('yes', 'y', 'true', '1')
    SLA_NO = ('no', 'n', 'false', '0')

    @staticmethod
    def _sla_header_polarity(header: str) -> Optional[bool]:
        """What a bare Yes means in this column: True = breached, False = met, None = unclear.

        Whole words only ("Token" is not "ok", "Metric" is not "met").
        """
        text = ' '.join(re.findall(r'[a-z]+', str(header).lower()))
        padded = f' {text} '
        if any(f' {p} ' in padded for p in ('not breached', 'not overdue')):
            return False
        if any(f' {p} ' in padded for p in ('not met', 'not made', 'not within', 'not achieved', 'missed')):
            return True
        words = set(text.split())
        if words & {'breached', 'breach', 'overdue', 'violated', 'violation', 'failed'}:
            return True
        if words & {'made', 'met', 'achieved', 'within', 'compliant', 'passed'}:
            return False
        return None

    def _read_sla_cell(self, raw: Any, header: str, transform: Dict[str, str]) -> Optional[bool]:
        """True = breached, False = met, None = not a recognisable verdict."""
        if pd.isna(raw):
            return None
        val = str(raw).strip().lower()
        if not val:
            return None
        custom = {str(k).strip().lower(): v for k, v in transform.items()}.get(val)
        if custom in ('breached', 'met'):
            return custom == 'breached'
        if val in self.SLA_WORD_VALUES:
            return self.SLA_WORD_VALUES[val]
        if val in self.SLA_YES or val in self.SLA_NO:
            polarity = self._sla_header_polarity(header)
            if polarity is None:
                return None
            return polarity if val in self.SLA_YES else not polarity
        return None

    def _find_sla_value(
        self, row: pd.Series, mapping: Dict[str, str], transform: Optional[Dict[str, str]] = None
    ) -> Optional[bool]:
        """The SLA verdict for this row, from evidence only.

        The column the profile maps to ``sla_breached`` is authoritative. Without a
        mapping only a header that says so outright ("SLA Breached", "Made SLA") is
        read; "SLA Tier", "SLA Priority" and the like never are. A value that is
        not a recognisable verdict is None, never breached.
        """
        transform = transform or {}
        mapped = mapping.get('sla_breached')
        if mapped and mapped in row.index:
            return self._read_sla_cell(row[mapped], mapped, transform)
        for col in row.index:
            if ' '.join(re.findall(r'[a-z]+', str(col).lower())) in self.SLA_IMPLICIT_HEADERS:
                verdict = self._read_sla_cell(row[col], str(col), transform)
                if verdict is not None:
                    return verdict
        return None

    def validate_preview(
        self,
        records: List[Dict],
        max_rows: int = 5,
        mapped_fields: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Generate a preview summary from parsed records.
        Works with any available fields dynamically.

        ``mapped_fields`` limits the missing-field warnings to the fields a team
        format actually maps (a format with no priority column must not warn
        about priority). None checks every standard field.
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
            if mapped_fields is not None and field not in mapped_fields:
                continue
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

        # Statuses no group recognises are counted as "other" (D9). List them
        # so the uploader can map them before importing; never block the import.
        unmapped = {}
        for r in records:
            value = r.get('status')
            if value and status_group(value) == 'other':
                unmapped[value] = unmapped.get(value, 0) + 1
        unmapped_statuses = [
            {'value': v, 'count': c}
            for v, c in sorted(unmapped.items(), key=lambda kv: (-kv[1], kv[0]))[:20]
        ]

        return {
            'total_records': total,
            'preview_rows': preview_rows,
            'unmapped_statuses': unmapped_statuses,
            'issues': issues,
            'field_breakdowns': field_breakdowns,
            'status_breakdown': field_breakdowns.get('status', {}),
            'priority_breakdown': field_breakdowns.get('priority', {}),
            'category_breakdown': field_breakdowns.get('category', {}),
        }
