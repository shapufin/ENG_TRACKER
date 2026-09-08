"""Tests for the CSV export service."""
import csv
import io

from django.contrib.auth.models import User
from django.test import TestCase

from plugins.skills.models import SkillCategory, Skill, UserSkill
from plugins.skills.services.export import export_matrix_csv


class ExportMatrixCsvTest(TestCase):
    def setUp(self):
        self.cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.skill1 = Skill.objects.create(
            category=self.cat, name="Python", code="python"
        )
        self.skill2 = Skill.objects.create(
            category=self.cat, name="Django", code="django"
        )
        self.user1 = User.objects.create_user(username="alice", password="x")
        self.user2 = User.objects.create_user(username="bob", password="x")

    def _parse_csv(self, response):
        """Collect all streamed chunks and parse as CSV."""
        chunks = list(response.streaming_content)
        raw = b"".join(
            c.encode('utf-8') if isinstance(c, str) else c for c in chunks
        ).decode('utf-8')
        reader = csv.reader(io.StringIO(raw))
        return list(reader)

    def test_response_headers(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        resp = export_matrix_csv({self.user1.id})
        self.assertEqual(resp['Content-Type'], 'text/csv')
        self.assertIn('attachment', resp['Content-Disposition'])
        self.assertIn('skills_matrix.csv', resp['Content-Disposition'])

    def test_header_row(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        resp = export_matrix_csv({self.user1.id})
        rows = self._parse_csv(resp)
        self.assertEqual(
            rows[0],
            ['Username', 'Skill', 'Category', 'Level', 'Notes'],
        )

    def test_one_row_per_user_skill(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user1, skill=self.skill2, level=2,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill1, level=5,
            last_updated_by=self.user2,
        )
        resp = export_matrix_csv({self.user1.id, self.user2.id})
        rows = self._parse_csv(resp)
        # 1 header + 3 data rows
        self.assertEqual(len(rows), 4)

    def test_row_content(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1, notes="learning",
        )
        resp = export_matrix_csv({self.user1.id})
        rows = self._parse_csv(resp)
        data = rows[1]
        self.assertEqual(data[0], 'alice')
        self.assertEqual(data[1], 'Python')
        self.assertEqual(data[2], 'Backend')
        self.assertEqual(data[3], '3')
        self.assertEqual(data[4], 'learning')

    def test_empty_team_returns_header_only(self):
        resp = export_matrix_csv(set())
        rows = self._parse_csv(resp)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], 'Username')

    def test_category_filter(self):
        other_cat = SkillCategory.objects.create(name="Frontend", code="frontend")
        other_skill = Skill.objects.create(
            category=other_cat, name="React", code="react"
        )
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user1, skill=other_skill, level=3,
            last_updated_by=self.user1,
        )
        resp = export_matrix_csv({self.user1.id}, category_code='backend')
        rows = self._parse_csv(resp)
        # header + 1 row (Python only; React filtered out)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][1], 'Python')

    def test_inactive_skills_excluded(self):
        inactive = Skill.objects.create(
            category=self.cat, name="Legacy", code="legacy", is_active=False
        )
        UserSkill.objects.create(
            user=self.user1, skill=inactive, level=3,
            last_updated_by=self.user1,
        )
        resp = export_matrix_csv({self.user1.id})
        rows = self._parse_csv(resp)
        # header only — inactive skill excluded
        self.assertEqual(len(rows), 1)

    def test_search_filters_by_username(self):
        """Export with search= only includes matching users."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill1, level=4,
            last_updated_by=self.user2,
        )
        resp = export_matrix_csv({self.user1.id, self.user2.id}, search='alice')
        rows = self._parse_csv(resp)
        usernames = [r[0] for r in rows[1:]]  # skip header
        self.assertIn('alice', usernames)
        self.assertNotIn('bob', usernames)

    def test_search_filters_by_skill_name(self):
        """Export with search= includes users who have the matching skill."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,  # Python
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill2, level=4,  # Django
            last_updated_by=self.user2,
        )
        resp = export_matrix_csv({self.user1.id, self.user2.id}, search='python')
        rows = self._parse_csv(resp)
        usernames = [r[0] for r in rows[1:]]
        self.assertIn('alice', usernames)
        self.assertNotIn('bob', usernames)

    def test_no_search_returns_all_users(self):
        """Export without search includes all visible users."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill1, level=4,
            last_updated_by=self.user2,
        )
        resp = export_matrix_csv({self.user1.id, self.user2.id})
        rows = self._parse_csv(resp)
        usernames = [r[0] for r in rows[1:]]
        self.assertIn('alice', usernames)
        self.assertIn('bob', usernames)
