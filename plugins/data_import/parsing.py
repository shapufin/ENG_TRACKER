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
    if hasattr(importer, "get_dynamic_sample_rows"):
        sample_rows = importer.get_dynamic_sample_rows()
    elif hasattr(importer, "get_sample_rows"):
        sample_rows = importer.get_sample_rows()
    else:
        sample_rows = []
    rows = [
        {header[f.key]: row.get(f.key, "") for f in fields}
        for row in sample_rows
    ]
    return pd.DataFrame(rows, columns=columns).map(xlsx_safe)


def _build_excel_workbook_bytes(importer) -> bytes:
    """Build a multi-sheet, validated Excel template using openpyxl.

    Sheet 1 holds the data import template with in-cell dropdown data validations.
    Sheet 2 holds a Reference Data directory of existing valid database entities.
    """
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    frame = _template_frame(importer)
    buffer = io.BytesIO()

    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        sheet_title = (importer.display_name or importer.target_key)[:31]
        frame.to_excel(writer, index=False, sheet_name=sheet_title)

        wb = writer.book
        ws = writer.sheets[sheet_title]

        # Formatting Sheet 1: Template
        ws.freeze_panes = "A2"
        header_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="0F172A")
        thin_border = Border(
            bottom=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
        )

        for col_idx in range(1, ws.max_column + 1):
            col_letter = get_column_letter(col_idx)
            header_cell = ws.cell(row=1, column=col_idx)
            header_cell.fill = header_fill
            header_cell.font = header_font
            header_cell.alignment = Alignment(vertical="center", horizontal="left")
            header_cell.border = thin_border

            # Auto-fit column width
            max_len = max(len(str(header_cell.value or "")), 12)
            for row_idx in range(2, min(ws.max_row + 1, 10)):
                cell_val = ws.cell(row=row_idx, column=col_idx).value
                if cell_val is not None:
                    max_len = max(max_len, min(len(str(cell_val)), 40))
            ws.column_dimensions[col_letter].width = max_len + 4

        # Add DataValidation dropdowns on Sheet 1
        fields = importer.get_fields()
        dropdowns = (
            importer.get_field_dropdowns()
            if hasattr(importer, "get_field_dropdowns")
            else {}
        )
        lists_ws = None
        list_idx = 0
        for col_idx, f in enumerate(fields, 1):
            choices = dropdowns.get(f.key)
            if not choices:
                continue
            safe_choices = [
                str(c).replace('"', '').replace(',', ' ').strip()
                for c in choices
                if str(c).strip()
            ]
            if not safe_choices:
                continue
            inline = f'"{",".join(safe_choices)}"'
            if len(inline) <= 255:
                formula_str = inline
            else:
                # Excel caps an inline list at 255 characters, so long lists
                # live in a hidden sheet and the validation points at the range.
                if lists_ws is None:
                    lists_ws = wb.create_sheet(title="Lists")
                    lists_ws.sheet_state = "hidden"
                list_idx += 1
                list_col = get_column_letter(list_idx)
                for row_idx, choice in enumerate(safe_choices, 1):
                    lists_ws.cell(row=row_idx, column=list_idx, value=xlsx_safe(choice))
                formula_str = f"Lists!${list_col}$1:${list_col}${len(safe_choices)}"
            col_letter = get_column_letter(col_idx)
            dv = DataValidation(type="list", formula1=formula_str, allow_blank=True)
            ws.add_data_validation(dv)
            dv.add(f"{col_letter}2:{col_letter}1000")

        # Sheet 2: Reference Data
        ref_data = (
            importer.get_reference_data()
            if hasattr(importer, "get_reference_data")
            else {}
        )
        if ref_data:
            ref_ws = wb.create_sheet(title="Reference Data")
            ref_header_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
            ref_header_font = Font(name="Calibri", size=11, bold=True, color="1E293B")
            section_font = Font(name="Calibri", size=12, bold=True, color="0F172A")

            current_row = 1
            for section_title, records in ref_data.items():
                if not records:
                    continue
                title_cell = ref_ws.cell(row=current_row, column=1, value=section_title)
                title_cell.font = section_font
                current_row += 1

                headers = list(records[0].keys())
                for col_idx, h in enumerate(headers, 1):
                    h_cell = ref_ws.cell(row=current_row, column=col_idx, value=h)
                    h_cell.fill = ref_header_fill
                    h_cell.font = ref_header_font
                    h_cell.border = thin_border
                current_row += 1

                for item in records:
                    for col_idx, h in enumerate(headers, 1):
                        val_cell = ref_ws.cell(
                            row=current_row,
                            column=col_idx,
                            value=xlsx_safe(item.get(h, "")),
                        )
                        val_cell.border = thin_border
                    current_row += 1
                current_row += 1

            for col_idx in range(1, ref_ws.max_column + 1):
                col_letter = get_column_letter(col_idx)
                ref_ws.column_dimensions[col_letter].width = 24

    return buffer.getvalue()


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
        content = _build_excel_workbook_bytes(importer)
        response = HttpResponse(content, content_type=XLSX_CONTENT_TYPE)

    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
