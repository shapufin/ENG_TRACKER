"""Tests for Skills Matrix audit signals."""
from django.contrib.auth.models import User
from django.test import TestCase

from plugins.skills.models import (
    SkillCategory,
    Skill,
    UserSkill,
    SkillRatingHistory,
)

# Import signals module to ensure audit signal handlers are connected.
from plugins.skills import signals  # noqa: F401


class SignalTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="x")
        self.cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.skill = Skill.objects.create(
            category=self.cat, name="Python", code="python"
        )

    def test_create_logs_history(self):
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=self.user
        )
        hist = SkillRatingHistory.objects.filter(user_skill=us).first()
        self.assertIsNotNone(hist)
        self.assertIsNone(hist.old_level)
        self.assertEqual(hist.new_level, 3)
        self.assertEqual(hist.source, 'self')

    def test_update_level_logs_history(self):
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=self.user
        )
        us.level = 4
        us.last_updated_by = self.user
        us.save()
        history = list(SkillRatingHistory.objects.filter(user_skill=us).order_by('changed_at'))
        self.assertEqual(len(history), 2)
        # First: create (null → 3)
        self.assertIsNone(history[0].old_level)
        self.assertEqual(history[0].new_level, 3)
        # Second: update (3 → 4)
        self.assertEqual(history[1].old_level, 3)
        self.assertEqual(history[1].new_level, 4)

    def test_update_non_level_field_no_history(self):
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=self.user
        )
        initial_count = SkillRatingHistory.objects.filter(user_skill=us).count()
        us.notes = "Updated notes only"
        us.save()
        final_count = SkillRatingHistory.objects.filter(user_skill=us).count()
        self.assertEqual(initial_count, final_count)

    def test_delete_logs_history(self):
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=self.user
        )
        create_count = SkillRatingHistory.objects.filter(user_skill=us).count()
        self.assertEqual(create_count, 1)
        us.delete()
        # F1-v4: prior history rows survive with user_skill=None (SET_NULL),
        # NOT cascade-deleted. The delete history row also has user_skill=None.
        delete_hist = SkillRatingHistory.objects.filter(
            user=self.user, new_level=None
        ).first()
        self.assertIsNotNone(delete_hist)
        self.assertEqual(delete_hist.old_level, 3)
        self.assertIsNone(delete_hist.new_level)

    def test_delete_preserves_prior_history(self):
        """F1-v4: create + update history rows must survive UserSkill deletion.

        With `user_skill` FK on_delete=SET_NULL, deleting a UserSkill sets
        `user_skill=None` on prior history rows instead of cascade-deleting
        them. The full audit trail (create → update → delete) remains
        queryable via the denormalized `user`/`skill` fields.
        """
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=self.user
        )
        us.level = 4
        us.last_updated_by = self.user
        us.save()
        # 2 history rows so far: create (null→3) + update (3→4)
        self.assertEqual(
            SkillRatingHistory.objects.filter(user=self.user).count(), 2
        )
        us.delete()
        # All 3 rows survive (create + update + delete), each with
        # user_skill=None after the UserSkill is gone.
        history = list(
            SkillRatingHistory.objects.filter(user=self.user).order_by('changed_at')
        )
        self.assertEqual(len(history), 3)
        # create: null → 3
        self.assertIsNone(history[0].old_level)
        self.assertEqual(history[0].new_level, 3)
        self.assertIsNone(history[0].user_skill_id)
        # update: 3 → 4
        self.assertEqual(history[1].old_level, 3)
        self.assertEqual(history[1].new_level, 4)
        self.assertIsNone(history[1].user_skill_id)
        # delete: 4 → null
        self.assertEqual(history[2].old_level, 4)
        self.assertIsNone(history[2].new_level)
        self.assertIsNone(history[2].user_skill_id)

    def test_source_classification_tl(self):
        tl = User.objects.create_user(username="tl_bob", password="x")
        from apps.users.models.core import UserProfile
        profile = UserProfile.objects.get(user=tl)
        profile.is_italian_tl_role = True
        profile.save()
        # Assign alice to tl_bob
        alice_profile = UserProfile.objects.get(user=self.user)
        alice_profile.italian_tl = tl
        alice_profile.save()

        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=tl
        )
        hist = SkillRatingHistory.objects.get(user_skill=us)
        self.assertEqual(hist.source, 'tl')

    def test_source_classification_admin(self):
        admin = User.objects.create_user(
            username="admin_sue", password="x", is_staff=True
        )
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=admin
        )
        hist = SkillRatingHistory.objects.get(user_skill=us)
        self.assertEqual(hist.source, 'admin')

    def test_source_classification_system(self):
        us = UserSkill.objects.create(
            user=self.user, skill=self.skill, level=3, last_updated_by=None
        )
        hist = SkillRatingHistory.objects.get(user_skill=us)
        self.assertEqual(hist.source, 'system')
