"""SEC-16 (engagement): the workbook holds only system labels and numbers.

No user-controlled string reaches a cell (names are not exported), so no
neutraliser is wired in. This pins that: if a user-supplied string is ever
added, a formula-typed cell here fails and the writer must go through
``core.utils.csv_safe.xlsx_safe``.
"""
import io

from django.test import SimpleTestCase
from openpyxl import load_workbook

from plugins.engagement.excel_export import build_workbook_bytes


class EngagementWorkbookFormulaSafetyTests(SimpleTestCase):
    def test_no_cell_is_a_formula_or_starts_with_a_trigger(self):
        content = build_workbook_bytes([], [], "month", "January 2026")
        wb = load_workbook(io.BytesIO(content))
        cells = [c for ws in wb.worksheets for row in ws.iter_rows() for c in row if c.value is not None]
        self.assertTrue(cells)
        for cell in cells:
            self.assertNotEqual(cell.data_type, "f", cell.coordinate)
            if isinstance(cell.value, str):
                self.assertFalse(cell.value.startswith(("=", "+", "-", "@")), cell.value)
