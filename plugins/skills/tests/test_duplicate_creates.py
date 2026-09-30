"""A create that loses a concurrent race must be a 400, not a 500.

The serializers uppercase ``name`` into ``code`` at save time, so two simultaneous requests can
both pass validation and then collide on the database unique constraint.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.skills.models import SkillCategory
from plugins.skills.viewsets import SkillCategoryViewSet, SkillViewSet

User = get_user_model()


class DuplicateCreateTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("skills_admin", "sa@example.com", "pw")
        self.factory = APIRequestFactory()

    def _post(self, viewset, path, data):
        request = self.factory.post(path, data, format="json")
        force_authenticate(request, user=self.admin)
        response = viewset.as_view({"post": "create"})(request)
        response.render()
        return response

    def test_category_create_race_returns_400(self):
        with patch(
            "plugins.skills.serializers.SkillCategorySerializer.create",
            side_effect=IntegrityError("UNIQUE constraint failed: skills_skillcategory.code"),
        ):
            response = self._post(
                SkillCategoryViewSet, "/api/plugins/skills/categories/", {"name": "Racers", "is_active": True}
            )
        self.assertEqual(response.status_code, 400, getattr(response, "data", None))
        self.assertIn("already exists", str(response.data).lower())

    def test_skill_create_race_returns_400(self):
        category = SkillCategory.objects.create(name="RACERS", code="RACERS")
        with patch(
            "plugins.skills.serializers.SkillSerializer.create",
            side_effect=IntegrityError("UNIQUE constraint failed: skills_skill.category_id, skills_skill.name"),
        ):
            response = self._post(
                SkillViewSet,
                "/api/plugins/skills/skills/",
                {"name": "Racing", "category": category.id, "description": "", "is_active": True},
            )
        self.assertEqual(response.status_code, 400, getattr(response, "data", None))
        self.assertIn("already exists", str(response.data).lower())
