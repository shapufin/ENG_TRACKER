"""Tests for Skills Matrix plugin models."""
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase

from plugins.skills.models import (
    SkillCategory,
    Skill,
    UserSkill,
    SkillRatingHistory,
)

# Import signals module to ensure audit signal handlers are connected.
from plugins.skills import signals  # noqa: F401


class SkillCategoryTestCase(TestCase):
    def test_create_category(self):
        cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.assertEqual(str(cat), "Backend")
        self.assertTrue(cat.is_active)

    def test_unique_name(self):
        SkillCategory.objects.create(name="Backend", code="backend")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SkillCategory.objects.create(name="Backend", code="backend2")

    def test_unique_code(self):
        SkillCategory.objects.create(name="Backend", code="backend")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SkillCategory.objects.create(name="Frontend", code="backend")


class SkillTestCase(TestCase):
    def setUp(self):
        self.cat = SkillCategory.objects.create(name="Backend", code="backend")

    def test_create_skill(self):
        skill = Skill.objects.create(
            category=self.cat, name="Python", code="python"
        )
        self.assertEqual(str(skill), "Python")
        self.assertTrue(skill.is_active)

    def test_unique_category_name(self):
        Skill.objects.create(category=self.cat, name="Python", code="python")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Skill.objects.create(category=self.cat, name="Python", code="python2")

    def test_unique_code(self):
        Skill.objects.create(category=self.cat, name="Python", code="python")
        cat2 = SkillCategory.objects.create(name="Frontend", code="frontend")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Skill.objects.create(category=cat2, name="JS", code="python")

    def test_protect_category_deletion(self):
        Skill.objects.create(category=self.cat, name="Python", code="python")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.cat.delete()


class UserSkillTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="x")
        self.cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.skill = Skill.objects.create(
            category=self.cat, name="Python", code="python"
        )

    def test_create_user_skill(self):
        us = UserSkill.objects.create(user=self.user, skill=self.skill, level=3)
        self.assertEqual(us.level, 3)
        self.assertEqual(str(us), "alice – Python (L3)")

    def test_unique_user_skill(self):
        UserSkill.objects.create(user=self.user, skill=self.skill, level=3)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                UserSkill.objects.create(user=self.user, skill=self.skill, level=4)

    def test_level_bounds(self):
        from django.core.exceptions import ValidationError
        us = UserSkill(user=self.user, skill=self.skill, level=0)
        with self.assertRaises(ValidationError):
            us.full_clean()
        us2 = UserSkill(user=self.user, skill=self.skill, level=6)
        with self.assertRaises(ValidationError):
            us2.full_clean()
        for lvl in range(1, 6):
            UserSkill.objects.create(
                user=self.user,
                skill=Skill.objects.create(
                    category=self.cat, name=f"S{lvl}", code=f"s{lvl}"
                ),
                level=lvl,
            )

    def test_cascade_skill_deletion(self):
        UserSkill.objects.create(user=self.user, skill=self.skill, level=3)
        self.skill.delete()
        self.assertEqual(UserSkill.objects.filter(user=self.user).count(), 0)


class SkillRatingHistoryTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="x")
        self.cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.skill = Skill.objects.create(
            category=self.cat, name="Python", code="python"
        )

    def test_history_fields(self):
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=self.user
        )
        hist = SkillRatingHistory.objects.filter(user_skill=us).first()
        self.assertIsNotNone(hist)
        self.assertEqual(hist.old_level, None)
        self.assertEqual(hist.new_level, 3)
        self.assertEqual(hist.source, 'self')
