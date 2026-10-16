"""
File-content helpers for the data import endpoints: coercing cells into typed
values, building mapped rows, and rendering the downloadable template.

HTTP concerns (requests, permissions, transactions) stay in ``viewsets.py``.
"""

import io
from typing import Any, Dict, List

import pandas as pd
from django.http import HttpResponse

from core.utils.csv_safe import xlsx_safe
from core.utils.tabular_file import resolve_mapping

CSV_CONTENT_TYPE = 'text/csv'
XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def _detected_values(df: pd.DataFrame, max_unique: int = 50) -> Dict[str, List[Any]]:
    """Return up to max_unique unique non-null values per column for transform UIs."""
    values: Dict[str, List[Any]] = {}
    for col in df.columns:
        unique_vals = df[col].dropna().astype(str).unique().tolist()[:max_unique]
        values[col] = [v for v in unique_vals if v]
    return values


def _parse_value(value: Any, field_type: str) -> Any:
    """Convert a pandas/cell value into a Python value appropriate for the field type."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None

    if field_type == 'bool':
        if isinstance(value, bool):
            return value
        lowered = str(value).lower().strip()
        if lowered in ('true', '1', 'yes', 'y'):
            return True
        if lowered in ('false', '0', 'no', 'n', ''):
            return False
        return None

    if field_type == 'integer':
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None

    if field_type == 'decimal':
        from decimal import Decimal, InvalidOperation
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None

    if field_type == 'date':
        from datetime import date, datetime
        from dateutil import parser as date_parser
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()
        try:
            parsed = date_parser.parse(str(value))
            return parsed.date()
        except (ValueError, TypeError, OverflowError):
            return None

    if field_type == 'choice':
        return str(value).strip() if pd.notna(value) else None

    # string / email / password
    if pd.isna(value):
        return None
    return str(value).strip() if value is not None else None


def _cell_present(value: Any) -> bool:
    """True when a raw cell holds a value, as opposed to blank/NaN/whitespace."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return not bool(pd.isna(value))


def _build_mapped_rows(
    df: pd.DataFrame,
    field_mapping: Dict[str, str],
    default_values: Dict[str, Any],
    importer,
    value_transforms: Dict[str, Dict[str, str]] | None = None,
) -> List[Dict[str, Any]]:
    """Build a list of mapped row dicts from a DataFrame and a field mapping.

    A cell whose content exists but cannot be parsed for the field type is
    recorded under ``__parse_errors`` instead of being silently flattened to
    ``None``, which importers that treat ``None`` as "leave the existing value
    alone" would otherwise report as a successful no-op update.
    """
    df_columns = list(df.columns)
    resolved_mapping = resolve_mapping(field_mapping, df_columns)
    fields_by_key = {f.key: f for f in importer.get_fields()}
    transforms = value_transforms or {}

    rows = []
    for idx, row in df.iterrows():
        mapped_row: Dict[str, Any] = {'__row_index': int(idx) + 1}
        parse_errors: List[str] = []

        for our_field, their_column in resolved_mapping.items():
            field = fields_by_key.get(our_field)
            if field is None:
                continue
            val = row.get(their_column)
            parsed = _parse_value(val, field.field_type)
            field_transforms = transforms.get(our_field)
            # Transforms are not limited to choice fields: reference fields
            # like client_code use them to remap unknown raw codes to
            # existing ones.
            if field_transforms is not None and parsed is not None:
                parsed = field_transforms.get(str(parsed).strip(), str(parsed).strip())
            mapped_row[our_field] = parsed
            if parsed is None and _cell_present(val):
                parse_errors.append(our_field)

        # Apply default values for any field not present in the mapping
        for our_field, default_value in default_values.items():
            if our_field not in mapped_row:
                field = fields_by_key.get(our_field)
                parsed = _parse_value(default_value, field.field_type if field else 'string')
                field_transforms = transforms.get(our_field)
                if field_transforms is not None and field and parsed is not None:
                    parsed = field_transforms.get(str(parsed).strip(), str(parsed).strip())
                mapped_row[our_field] = parsed
                if parsed is None and _cell_present(default_value):
                    parse_errors.append(our_field)

        if parse_errors:
            mapped_row['__parse_errors'] = parse_errors

        rows.append(mapped_row)

    return rows


def _template_frame(importer) -> pd.DataFrame:
    """Build the template DataFrame: field labels as headers, sample rows as data.

    A required field's header carries a trailing " *" so the downloaded file
    itself shows which columns are mandatory, not just the in-app mapping UI.
    ``normalize_columns`` strips that suffix again on re-upload so auto-detect
    still matches the plain alias list.
    """
    fields = importer.get_fields()
    header = {f.key: f"{f.label} *" if f.required else f.label for f in fields}
    columns = [header[f.key] for f in fields]
    rows = [
        {header[f.key]: row.get(f.key, "") for f in fields}
        for row in importer.get_sample_rows()
    ]
    return pd.DataFrame(rows, columns=columns).map(xlsx_safe)


def _template_response(importer, file_format: str) -> HttpResponse:
    """Render a target's template as a downloadable CSV or XLSX file."""
    frame = _template_frame(importer)
    filename = f"{importer.target_key}_import_template.{file_format}"

    if file_format == 'csv':
        buffer = io.StringIO()
        frame.to_csv(buffer, index=False)
        # utf-8-sig so Excel opens accented characters correctly.
        response = HttpResponse(
            buffer.getvalue().encode('utf-8-sig'), content_type=CSV_CONTENT_TYPE
        )
    else:
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            frame.to_excel(writer, index=False, sheet_name=importer.display_name[:31])
        response = HttpResponse(buffer.getvalue(), content_type=XLSX_CONTENT_TYPE)

    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
