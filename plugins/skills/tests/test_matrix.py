"""Tests for the matrix builder service and matrix ViewSet.

Covers B1 regression: matrix rows MUST include ``user_skill_id`` (the
UserSkill PK) so the frontend ``rate`` action can target the correct row.
Also covers filtering, pagination, and coverage stats math.
"""
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate
from django.test import TestCase

from apps.permissions.services.role_service import assign_role
from apps.users.models.core import UserProfile
from apps.plugins.models import PluginPermission
from plugins.skills.models import SkillCategory, Skill, UserSkill
from plugins.skills.services.matrix import (
    build_matrix_queryset,
    build_matrix_rows,
    build_coverage_stats,
    MatrixPagination,
)
from plugins.skills.viewsets import SkillMatrixViewSet

# Import signals so audit handlers are connected in tests.
from plugins.skills import signals  # noqa: F401


class MatrixServiceTest(TestCase):
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

    def test_matrix_row_includes_user_skill_id(self):
        """B1 regression: each skill dict must carry the UserSkill PK."""
        us = UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        rows = build_matrix_rows([self.user1])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['user_id'], self.user1.id)
        self.assertEqual(len(rows[0]['skills']), 1)
        skill_dict = rows[0]['skills'][0]
        self.assertEqual(skill_dict['skill_id'], self.skill1.id)
        # The fix: user_skill_id must be present and equal the UserSkill PK.
        self.assertIn('user_skill_id', skill_dict)
        self.assertEqual(skill_dict['user_skill_id'], us.id)

    def test_matrix_row_includes_full_name_with_username_fallback(self):
        """Rows carry full_name for the member profile column; falls back to
        username when the user has no first/last name set."""
        self.user1.first_name = "Alice"
        self.user1.last_name = "Aardvark"
        self.user1.save()
        rows = build_matrix_rows([self.user1, self.user2])
        by_user = {r['user_id']: r for r in rows}
        self.assertEqual(by_user[self.user1.id]['full_name'], "Alice Aardvark")
        # user2 has no first/last name — falls back to username.
        self.assertEqual(by_user[self.user2.id]['full_name'], "bob")

    def test_matrix_row_user_skill_id_distinguishes_same_skill_different_user(self):
        """Two users rating the same skill must get distinct user_skill_ids."""
        us1 = UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        us2 = UserSkill.objects.create(
            user=self.user2, skill=self.skill1, level=4,
            last_updated_by=self.user2,
        )
        rows = build_matrix_rows([self.user1, self.user2])
        by_user = {r['user_id']: r for r in rows}
        self.assertEqual(by_user[self.user1.id]['skills'][0]['user_skill_id'], us1.id)
        self.assertEqual(by_user[self.user2.id]['skills'][0]['user_skill_id'], us2.id)
        self.assertNotEqual(us1.id, us2.id)

    def test_build_matrix_queryset_filters_by_skill(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill2, level=3,
            last_updated_by=self.user2,
        )
        # Filter for skill1 only -> only user1 appears.
        qs = build_matrix_queryset(
            {self.user1.id, self.user2.id},
            {'skill_id': [str(self.skill1.id)]},
        )
        self.assertEqual(set(qs.values_list('id', flat=True)), {self.user1.id})

    def test_build_matrix_queryset_filters_by_category(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        other_cat = SkillCategory.objects.create(name="Frontend", code="frontend")
        other_skill = Skill.objects.create(
            category=other_cat, name="React", code="react"
        )
        UserSkill.objects.create(
            user=self.user2, skill=other_skill, level=3,
            last_updated_by=self.user2,
        )
        qs = build_matrix_queryset(
            {self.user1.id, self.user2.id},
            {'category': 'backend'},
        )
        self.assertEqual(set(qs.values_list('id', flat=True)), {self.user1.id})

    def test_build_matrix_queryset_search_by_username(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill1, level=3,
            last_updated_by=self.user2,
        )
        qs = build_matrix_queryset(
            {self.user1.id, self.user2.id},
            {'search': 'alice'},
        )
        self.assertEqual(set(qs.values_list('id', flat=True)), {self.user1.id})

    def test_build_matrix_queryset_search_matches_first_and_last_name(self):
        self.user1.first_name = "Alice"
        self.user1.last_name = "Smith"
        self.user1.save(update_fields=["first_name", "last_name"])

        first_name_qs = build_matrix_queryset(
            {self.user1.id, self.user2.id},
            {"search": "alice"},
        )
        last_name_qs = build_matrix_queryset(
            {self.user1.id, self.user2.id},
            {"search": "smith"},
        )

        self.assertEqual(set(first_name_qs.values_list("id", flat=True)), {self.user1.id})
        self.assertEqual(set(last_name_qs.values_list("id", flat=True)), {self.user1.id})

    def test_build_matrix_queryset_search_matches_skill_name_without_duplicates(self):
        skill3 = Skill.objects.create(
            category=self.cat, name="Python Automation", code="python-automation"
        )
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user1, skill=skill3, level=4,
            last_updated_by=self.user1,
        )

        qs = build_matrix_queryset(
            {self.user1.id, self.user2.id},
            {"search": "python"},
        )

        self.assertEqual(list(qs.values_list("id", flat=True)), [self.user1.id])

    def test_build_matrix_queryset_skill_search_preserves_visible_scope(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill2, level=3,
            last_updated_by=self.user2,
        )

        qs = build_matrix_queryset(
            {self.user1.id},
            {"search": "django"},
        )

        self.assertEqual(list(qs.values_list("id", flat=True)), [])

    def test_build_matrix_queryset_no_filters_returns_all_visible(self):
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        # No filters -> all visible users are returned (those without skills
        # get an empty skills list in build_matrix_rows).
        qs = build_matrix_queryset({self.user1.id, self.user2.id})
        self.assertEqual(set(qs.values_list('id', flat=True)), {self.user1.id, self.user2.id})

    def test_build_coverage_stats_basic(self):
        """team_count and avg_level are computed correctly."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=5,
            last_updated_by=self.user1,
        )
        UserSkill.objects.create(
            user=self.user2, skill=self.skill1, level=2,
            last_updated_by=self.user2,
        )
        stats = build_coverage_stats({self.user1.id, self.user2.id})
        py = [s for s in stats if s['skill_id'] == self.skill1.id][0]
        self.assertEqual(py['team_count'], 2)
        self.assertEqual(py['avg_level'], 3.5)

    def test_build_coverage_stats_empty_team(self):
        stats = build_coverage_stats(set())
        for s in stats:
            self.assertEqual(s['team_count'], 0)

    def test_build_coverage_stats_category_filter(self):
        other_cat = SkillCategory.objects.create(name="Frontend", code="frontend")
        other_skill = Skill.objects.create(
            category=other_cat, name="React", code="react"
        )
        UserSkill.objects.create(
            user=self.user1, skill=other_skill, level=3,
            last_updated_by=self.user1,
        )
        stats = build_coverage_stats({self.user1.id}, category_code='backend')
        skill_ids = {s['skill_id'] for s in stats}
        self.assertIn(self.skill1.id, skill_ids)
        self.assertNotIn(other_skill.id, skill_ids)

    def test_build_coverage_stats_top_n_limits_results(self):
        """top_n truncates the result list (S3 payload limit)."""
        # setUp creates skill1 (Python) + skill2 (Django); add a third.
        skill3 = Skill.objects.create(
            category=self.cat, name="Git", code="git"
        )
        UserSkill.objects.create(
            user=self.user1, skill=skill3, level=3,
            last_updated_by=self.user1,
        )
        all_stats = build_coverage_stats({self.user1.id})
        self.assertEqual(len(all_stats), 3)
        limited = build_coverage_stats({self.user1.id}, top_n=2)
        self.assertEqual(len(limited), 2)
        # Truncation preserves the A-Z name sort.
        self.assertEqual(limited, all_stats[:2])

    def test_build_coverage_stats_top_n_zero_or_negative_no_limit(self):
        """Non-positive top_n is treated as 'no limit' (lenient)."""
        UserSkill.objects.create(
            user=self.user1, skill=self.skill1, level=3,
            last_updated_by=self.user1,
        )
        self.assertEqual(
            len(build_coverage_stats({self.user1.id}, top_n=0)),
            len(build_coverage_stats({self.user1.id})),
        )
        self.assertEqual(
            len(build_coverage_stats({self.user1.id}, top_n=-1)),
            len(build_coverage_stats({self.user1.id})),
        )


class MatrixPaginationTest(TestCase):
    def test_default_page_size_is_25(self):
        self.assertEqual(MatrixPagination.page_size, 25)

    def test_max_page_size_is_100(self):
        self.assertEqual(MatrixPagination.max_page_size, 100)


class MatrixViewSetB1RegressionTest(TestCase):
    """B1 end-to-end: the matrix endpoint payload includes user_skill_id."""

    factory = APIRequestFactory()

    def setUp(self):
        self.cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.skill1 = Skill.objects.create(
            category=self.cat, name="Python", code="python"
        )
        self.tl = User.objects.create_user(username="tl_bob", password="x")
        tl_profile = UserProfile.objects.get(user=self.tl)
        tl_profile.is_italian_tl_role = True
        tl_profile.save()
        self.employee = User.objects.create_user(username="alice", password="x")
        emp_profile = UserProfile.objects.get(user=self.employee)
        emp_profile.italian_tl = self.tl
        emp_profile.save()
        # Wire HR role to manage/configure so the manifest is consistent.
        self.hr = User.objects.create_user(username="hr_sue", password="x")
        hr_profile = UserProfile.objects.get(user=self.hr)
        hr_profile.is_hr_user = True
        hr_profile.save()
        assign_role(self.hr, 'hr')
        from apps.permissions.models import Role
        hr_role = Role.objects.get(code='hr')
        for action in ('manage', 'configure'):
            perm = PluginPermission.objects.get(plugin_name='skills', action=action)
            perm.allowed_roles.add(hr_role)

    def test_matrix_endpoint_returns_user_skill_id(self):
        us = UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        request = self.factory.get('/api/plugins/skills/matrix/matrix/')
        force_authenticate(request, user=self.tl)
        view = SkillMatrixViewSet.as_view({'get': 'matrix'})
        resp = view(request)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        self.assertTrue(any(
            sk.get('user_skill_id') == us.id
            for row in results
            for sk in row['skills']
        ), "matrix rows must include user_skill_id matching the UserSkill PK")

    def test_matrix_filter_multiple_skills_comma_joined(self):
        """S1: comma-joined skill_id param must filter on all listed skills.

        The frontend joins an array as ``skill_id=1,2,3`` (one query param).
        The viewset must split on comma; ``getlist`` alone returns
        ``["1,2,3"]`` which matches nothing.
        """
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        # skill2 in the same category; employee has no rating for it.
        from plugins.skills.models import Skill
        skill2 = Skill.objects.create(
            category=self.cat, name="Django", code="django"
        )
        # A second team member rated skill2.
        other = User.objects.create_user(username="other", password="x")
        other_profile = UserProfile.objects.get(user=other)
        other_profile.italian_tl = self.tl
        other_profile.save()
        UserSkill.objects.create(
            user=other, skill=skill2, level=4,
            last_updated_by=other,
        )
        # Filter for both skills via comma-joined param.
        request = self.factory.get(
            '/api/plugins/skills/matrix/matrix/',
            {'skill_id': f'{self.skill1.id},{skill2.id}'},
        )
        force_authenticate(request, user=self.tl)
        view = SkillMatrixViewSet.as_view({'get': 'matrix'})
        resp = view(request)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        user_ids = {row['user_id'] for row in results}
        # Both employees should appear (each rated one of the two skills).
        self.assertIn(self.employee.id, user_ids)
        self.assertIn(other.id, user_ids)
