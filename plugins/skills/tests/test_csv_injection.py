"""SEC-16: skills matrix exports must neutralise spreadsheet formulas."""
from django.contrib.auth.models import User
from django.test import TestCase

from core.utils.csv_injection_assert import (
    PAYLOAD,
    assert_csv_neutralised,
    assert_xlsx_neutralised,
)
from plugins.skills.models import Skill, SkillCategory, UserSkill
from plugins.skills.services.export import export_matrix_csv, export_matrix_xlsx


class SkillsExportFormulaInjectionTests(TestCase):
    def setUp(self):
        cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.skill = Skill.objects.create(category=cat, name=PAYLOAD, code="inj")
        self.user = User.objects.create_user(
            username="alice", password="x", first_name=PAYLOAD, last_name="L",
        )
        UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3,
            last_updated_by=self.user, notes=PAYLOAD,
        )

    def test_csv_notes_and_skill_name(self):
        resp = export_matrix_csv({self.user.id})
        raw = b"".join(
            c.encode("utf-8") if isinstance(c, str) else c for c in resp.streaming_content
        )
        assert_csv_neutralised(self, raw)

    def test_xlsx_names(self):
        resp = export_matrix_xlsx({self.user.id})
        assert_xlsx_neutralised(self, resp.content)
