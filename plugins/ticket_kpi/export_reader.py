"""Read a team's ticket export: find the real data sheet and header row, keep only the chosen columns.

Some systems wrap the data: a "Filters" sheet in front, a title row above the header,
90 columns when 13 matter, a header that repeats. A profile that lists its
``keep_columns`` gets exactly those columns back, whatever sheet or row they sit on,
in whatever order, however the header is cased or spaced. A missing column is refused
by name, never guessed. Profiles without ``keep_columns`` keep the old reader.
"""
import csv
import io
from typing import Any, List, Optional, Sequence, Tuple

import pandas as pd

from .upload_validation import UploadValidationError

HEADER_SCAN_ROWS = 30


class ExportFormatError(UploadValidationError):
    """The file is not in the expected format. The message is safe to show the user.

    An UploadValidationError, so every upload endpoint already answers it with a
    400 that carries the message.
    """

    def __init__(self, detail: str):
        super().__init__(detail, code='export_format')


def _norm(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ''
    return ' '.join(str(value).split()).lower()


def _blank(value: Any) -> bool:
    return value is None or (isinstance(value, float) and pd.isna(value)) or (
        isinstance(value, str) and not value.strip()
    )


def _grids(file_bytes: bytes, filename: str) -> List[List[List[Any]]]:
    """Every sheet (or the one CSV) as a list of rows, with no header assumption."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext == 'csv':
        for encoding in ('utf-8-sig', 'latin-1'):
            try:
                text = file_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        return [[row for row in csv.reader(io.StringIO(text))]]
    sheets = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None, header=None, dtype=object)
    return [frame.astype(object).where(frame.notna(), None).values.tolist() for frame in sheets.values()]


def _best_header(
    grids: Sequence[List[List[Any]]], expected: Sequence[str]
) -> Optional[Tuple[int, int, int]]:
    """(grid, row, matched columns) of the row that holds most expected headers.

    Ties go to the sheet with more data under the header, so a filter or summary
    sheet that repeats the header names cannot win over the real one.
    """
    wanted = {_norm(c) for c in expected}
    best = None
    best_key = (0, 0)
    for gi, grid in enumerate(grids):
        for ri, row in enumerate(grid[:HEADER_SCAN_ROWS]):
            matched = len(wanted & {_norm(c) for c in row})
            if not matched:
                continue
            below = sum(1 for r in grid[ri + 1:] if any(not _blank(c) for c in r))
            if (matched, below) > best_key:
                best_key = (matched, below)
                best = (gi, ri, matched)
    return best


def read_export(file_bytes: bytes, filename: str, expected: Sequence[str]) -> pd.DataFrame:
    """The chosen columns of the export's data sheet, named as listed in ``expected``."""
    try:
        grids = _grids(file_bytes, filename)
    except Exception as exc:  # noqa: BLE001 - any parser error becomes one safe message
        raise ExportFormatError('Could not read this file. Check that it is a valid Excel or CSV export.') from exc

    found = _best_header(grids, expected)
    if found is None:
        raise ExportFormatError(
            'This file does not look like the expected export: no header row with the '
            f'expected columns was found in the first {HEADER_SCAN_ROWS} rows of any sheet.'
        )
    gi, ri, _ = found
    header = grids[gi][ri]
    position = {}
    for index, cell in enumerate(header):
        position.setdefault(_norm(cell), index)  # a repeated header: the first one counts

    missing = [c for c in expected if _norm(c) not in position]
    if missing:
        raise ExportFormatError('The export is missing these columns: ' + ', '.join(missing) + '.')

    indexes = [position[_norm(c)] for c in expected]
    rows = []
    for raw in grids[gi][ri + 1:]:
        values = [raw[i] if i < len(raw) else None for i in indexes]
        values = [None if _blank(v) else (v.strip() if isinstance(v, str) else v) for v in values]
        if any(v is not None for v in values):
            rows.append(values)
    return pd.DataFrame(rows, columns=list(expected), dtype=object)
