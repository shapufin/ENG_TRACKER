"""
Shared tabular file utilities.

Used by both the ticket_kpi plugin (ColumnMapper) and the data_import plugin.
Only generic, side-effect-free file reading and column mapping lives here;
ticket-specific logic (status transforms, resolution computation, etc.) stays in
plugins/ticket_kpi/mapping_engine.py.
"""

import io
from typing import Any, Dict, List, Optional

import pandas as pd


def read_tabular_file(file_bytes: bytes, filename: str = '') -> pd.DataFrame:
    """Read a CSV or Excel file into a pandas DataFrame.

    Args:
        file_bytes: Raw file content.
        filename: Original filename, used to infer the format from the extension.

    Returns:
        A pandas DataFrame containing the parsed file contents.

    Raises:
        ValueError: If the file cannot be parsed as either CSV or Excel.
    """
    ext = filename.split('.')[-1].lower() if '.' in filename else ''

    if ext == 'csv':
        return pd.read_csv(io.BytesIO(file_bytes))

    if ext in ('xlsx', 'xls'):
        return pd.read_excel(io.BytesIO(file_bytes))

    # Try both when the extension is unknown or missing.
    try:
        return pd.read_csv(io.BytesIO(file_bytes))
    except Exception as csv_error:  # noqa: BLE001
        try:
            return pd.read_excel(io.BytesIO(file_bytes))
        except Exception as excel_error:  # noqa: BLE001
            raise ValueError(
                f"Could not parse file as CSV or Excel. CSV error: {csv_error}; "
                f"Excel error: {excel_error}"
            ) from csv_error


def normalize_columns(df_columns: List[str]) -> Dict[str, str]:
    """Return a lowercase/stripped lookup map from original column names."""
    return {c.lower().strip(): c for c in df_columns}


def suggest_mapping(
    df_columns: List[str],
    alias_map: Dict[str, List[str]],
) -> Dict[str, str]:
    """Suggest a mapping from normalized field names to actual column names.

    Args:
        df_columns: Column names present in the uploaded file.
        alias_map: A dictionary mapping each normalized field to a list of
            candidate column names (lowercase). The first match wins.

    Returns:
        A dictionary of {our_field: their_original_column_name} for all matches.
    """
    detected: Dict[str, str] = {}
    columns_lower = normalize_columns(df_columns)

    for our_field, aliases in alias_map.items():
        for alias in aliases:
            if alias in columns_lower:
                detected[our_field] = columns_lower[alias]
                break

    return detected


def resolve_mapping(
    mapping: Dict[str, str],
    df_columns: List[str],
) -> Dict[str, str]:
    """Resolve a mapping with case-insensitive/whitespace-tolerant matching.

    Args:
        mapping: A dictionary of {our_field: their_column_name} as provided by
            the user/admin (may differ in case or whitespace from df_columns).
        df_columns: Column names actually present in the uploaded file.

    Returns:
        A dictionary of {our_field: their_exact_column_name} where each value
        is guaranteed to be in df_columns. Unmatched entries are dropped.
    """
    columns_lower = normalize_columns(df_columns)
    resolved: Dict[str, str] = {}
    for our_field, their_field in mapping.items():
        if their_field in df_columns:
            resolved[our_field] = their_field
        else:
            normalized = their_field.lower().strip()
            if normalized in columns_lower:
                resolved[our_field] = columns_lower[normalized]
    return resolved


def get_value(row: pd.Series, column: Optional[str], default: Any = '') -> Any:
    """Safely get a value from a DataFrame row, treating NaN/None as default."""
    if column is None:
        return default
    val = row.get(column, default)
    if pd.isna(val):
        return default
    return val
