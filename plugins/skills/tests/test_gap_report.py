"""Tests for the skill gap report service."""
from django.contrib.auth.models import User
from django.test import TestCase

from plugins.skills.models import SkillCategory, Skill, UserSkill
from plugins.skills.services.gap_report import build_gap_report


class GapReportTest(TestCase):
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
        self.user3 = User.objects.create_user(username="carol", password="x")

    def test_threshold_flags_low_avg_skills(self):
        """Threshold-based gap: avg_level < threshold."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=1,
            last_updated_by=self.user1,
        )
        gaps = build_gap_report({self.user1.id}, threshold=3)
        self.assertIn(self.skill1.id, [g['skill_id'] for g in gaps])

    def test_no_threshold_returns_empty(self):
        """Without a threshold, no gaps are reported."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=1,
            last_updated_by=self.user1,
        )
        gaps = build_gap_report({self.user1.id})
        self.assertEqual(gaps, [])

    def test_threshold_excludes_high_avg_skills(self):
        """Skills with avg_level >= threshold are not gaps."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=5,
            last_updated_by=self.user1,
        )
        gaps = build_gap_report({self.user1.id}, threshold=3)
        self.assertNotIn(self.skill1.id, [g['skill_id'] for g in gaps])

    def test_gaps_sorted_worst_first(self):
        """Gaps sorted by avg_level ascending (worst gaps first)."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=1,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user1, skill=self.skill2, level=3,
            last_updated_by=self.user1,
        )
        gaps = build_gap_report({self.user1.id}, threshold=5)
        self.assertGreaterEqual(len(gaps), 2)
        avg_levels = [g['avg_level'] for g in gaps]
        self.assertEqual(avg_levels, sorted(avg_levels))

    def test_category_filter(self):
        other_cat = SkillCategory.objects.create(name="Frontend", code="frontend")
        other_skill = Skill.objects.create(
            category=other_cat, name="React", code="react"
        )
        UserSkill.objects.create(
            user=self.user1, skill=other_skill, level=1,
            last_updated_by=self.user1,
        )
        gaps = build_gap_report({self.user1.id}, category_code='backend', threshold=5)
        self.assertNotIn(other_skill.id, [g['skill_id'] for g in gaps])

    def test_empty_team_no_gaps(self):
        gaps = build_gap_report(set(), threshold=5)
        self.assertEqual(gaps, [])

    def test_gap_report_top_n_returns_worst_n(self):
        """top_n returns the N worst gaps (lowest avg_level first)."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=1,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user1, skill=self.skill2, level=2,
            last_updated_by=self.user1,
        )
        skill3 = Skill.objects.create(
            category=self.cat, name="Git", code="git"
        )
        UserSkill.objects.create(
            user=self.user1, skill=skill3, level=3,
            last_updated_by=self.user1,
        )
        all_gaps = build_gap_report({self.user1.id}, threshold=5)
        self.assertGreaterEqual(len(all_gaps), 3)
        limited = build_gap_report({self.user1.id}, threshold=5, top_n=2)
        self.assertEqual(len(limited), 2)
        # Worst-first order preserved: limited is a prefix of all_gaps.
        self.assertEqual(limited, all_gaps[:2])

    def test_gap_report_top_n_zero_no_limit(self):
        """Non-positive top_n is treated as 'no limit' (lenient)."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=1,
            last_updated_by=self.user1,
        )
        full = build_gap_report({self.user1.id}, threshold=5)
        self.assertEqual(
            len(build_gap_report({self.user1.id}, threshold=5, top_n=0)),
            len(full),
        )
