"""Tests for downloadable templates, dynamic real-data samples, and multi-sheet Excel generation."""

import io
import openpyxl
from django.contrib.auth.models import User
from django.test import TestCase

from core.utils.tabular_file import normalize_columns, read_tabular_file, suggest_mapping
from apps.users.models import Team, Tech, TechLevel
from apps.overtime.models import Client
from plugins.data_import.importers.registry import get_importer, list_importers
from plugins.data_import.parsing import _build_excel_workbook_bytes, _template_frame, _template_response


class TemplateRoundTripTests(TestCase):
    def test_every_template_column_auto_maps(self):
        for importer in list_importers():
            with self.subTest(target=importer.target_key):
                columns = list(_template_frame(importer).columns)
                mapped = suggest_mapping(columns, importer.get_mapping_aliases())
                missing = [f.key for f in importer.get_fields() if f.key not in mapped]
                self.assertEqual(missing, [])

    def test_normalize_columns_strips_parenthetical_hints(self):
        cols = [
            "Username *",
            "Team Code (e.g. ENG, HR) *",
            "Line Manager Username [optional]",
            "Active (TRUE/FALSE)",
        ]
        norm = normalize_columns(cols)
        self.assertIn("username", norm)
        self.assertIn("team code", norm)
        self.assertIn("line manager username", norm)
        self.assertIn("active", norm)

    def test_dynamic_sample_rows_uses_real_database_entities(self):
        # Create real test entities
        Team.objects.create(code="ALPHA", name="Alpha Team")
        mgr = User.objects.create(username="it_manager", first_name="Mario", last_name="Rossi")
        mgr.profile.is_italian_tl_role = True
        mgr.profile.save()

        line_mgr = User.objects.create(username="al_leader", first_name="Arben", last_name="Hoxha")
        line_mgr.profile.is_albanian_tl_role = True
        line_mgr.profile.save()

        Client.objects.create(code="TESTCLIENT", name="Test Client Corp")
        tech = Tech.objects.create(code="PYTHON", name="Python Dev")
        TechLevel.objects.create(tech=tech, code="SENIOR", rank=1)

        # 1. User importer
        user_importer = get_importer("users")
        dynamic_rows = user_importer.get_dynamic_sample_rows()
        self.assertGreater(len(dynamic_rows), 0)
        self.assertEqual(dynamic_rows[0]["team_code"], "ALPHA")
        self.assertEqual(dynamic_rows[0]["italian_tl_username"], "it_manager")
        self.assertEqual(dynamic_rows[0]["albanian_tl_username"], "al_leader")

        # 2. Overtime importer
        ot_importer = get_importer("overtime_logs")
        ot_rows = ot_importer.get_dynamic_sample_rows()
        self.assertGreater(len(ot_rows), 0)
        self.assertEqual(ot_rows[0]["client_code"], "TESTCLIENT")

        # 3. Reference data
        user_ref = user_importer.get_reference_data()
        self.assertIn("Active Teams", user_ref)
        self.assertIn("Managers", user_ref)
        self.assertIn("Line Managers", user_ref)

    def test_excel_multi_sheet_and_data_validation(self):
        Team.objects.create(code="DEV", name="Development")
        importer = get_importer("users")
        xlsx_bytes = _build_excel_workbook_bytes(importer)

        # Check with openpyxl that both Sheet 1 and Sheet 2 exist
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
        self.assertIn(importer.display_name[:31], wb.sheetnames)
        self.assertIn("Reference Data", wb.sheetnames)

        # Ensure Sheet 1 has in-cell data validations
        ws = wb[importer.display_name[:31]]
        self.assertGreater(len(ws.data_validations.dataValidation), 0)

        # Ensure read_tabular_file reads Sheet 1 without issue
        df = read_tabular_file(xlsx_bytes, filename="users_template.xlsx")
        self.assertIn("Username *", df.columns)
        self.assertIn("Team Code", df.columns)
        self.assertEqual(len(df), len(importer.get_dynamic_sample_rows()))

    def test_long_dropdown_list_uses_hidden_sheet_range(self):
        for i in range(40):
            Team.objects.create(code=f"TEAMCODE{i:03d}", name=f"Team {i}")
        importer = get_importer("users")
        wb = openpyxl.load_workbook(io.BytesIO(_build_excel_workbook_bytes(importer)))
        ws = wb[importer.display_name[:31]]
        formulas = [dv.formula1 for dv in ws.data_validations.dataValidation]
        self.assertTrue(all(len(f) <= 255 for f in formulas))
        range_formulas = [f for f in formulas if f.startswith("Lists!")]
        self.assertTrue(range_formulas)
        self.assertEqual(wb["Lists"].sheet_state, "hidden")
        listed = {c.value for row in wb["Lists"].iter_rows() for c in row if c.value}
        self.assertGreaterEqual(len([v for v in listed if str(v).startswith("TEAMCODE")]), 40)

    def test_template_response_csv_and_xlsx(self):
        importer = get_importer("users")
        resp_csv = _template_response(importer, "csv")
        self.assertEqual(resp_csv.status_code, 200)
        self.assertTrue(resp_csv["Content-Type"].startswith("text/csv"))
        self.assertIn("attachment; filename=", resp_csv["Content-Disposition"])

        resp_xlsx = _template_response(importer, "xlsx")
        self.assertEqual(resp_xlsx.status_code, 200)
        self.assertEqual(
            resp_xlsx["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

