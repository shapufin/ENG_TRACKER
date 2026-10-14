"""Shared assertions for the SEC-16 export tests (not a test module itself)."""
import csv
import io

import openpyxl

PAYLOAD = '=HYPERLINK("http://evil.example/x","click")'


def _cells_xlsx(content):
    wb = openpyxl.load_workbook(io.BytesIO(content))
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is not None:
                    yield cell.value, cell.data_type


def assert_csv_neutralised(testcase, text, payload=PAYLOAD):
    """The payload appears in the CSV only with a leading apostrophe."""
    if isinstance(text, bytes):
        text = text.decode("utf-8-sig")
    cells = [c for row in csv.reader(io.StringIO(text.lstrip("﻿"))) for c in row]
    testcase.assertIn(f"'{payload}", cells, "neutralised payload missing from CSV")
    testcase.assertNotIn(payload, cells, "raw formula payload written to CSV")


def assert_xlsx_neutralised(testcase, content, payload=PAYLOAD):
    """The payload is stored as a literal ``'``-prefixed string, never a formula."""
    cells = list(_cells_xlsx(content))
    values = [v for v, _ in cells]
    testcase.assertIn(f"'{payload}", values, "neutralised payload missing from XLSX")
    testcase.assertNotIn(payload, values, "raw formula payload written to XLSX")
    testcase.assertFalse(
        [v for v, t in cells if t == "f" and "HYPERLINK" in str(v)],
        "payload stored as a formula cell",
    )
