"""Tests for Skills Matrix ViewSets — permissions, scoping, actions.

Uses APIRequestFactory + force_authenticate + direct view dispatch (matches
the ticket_kpi test pattern) to avoid depending on plugin URL mounting.
"""
from types import SimpleNamespace
from unittest.mock import Mock

from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.services.role_service import assign_role
from apps.users.models.core import UserProfile
from apps.plugins.models import PluginPermission
from plugins.skills.models import SkillCategory, Skill, UserSkill
from plugins.skills.serializers import SkillCategorySerializer
from plugins.skills.viewsets import (
    SkillCategoryViewSet,
    SkillViewSet,
    UserSkillViewSet,
    SkillMatrixViewSet,
    SkillGapReportViewSet,
    SkillExportViewSet,
    SkillRatingHistoryViewSet,
)

# Import signals module to ensure audit signal handlers are connected.
# In production, this is done by plugin.py ready() on activation. In tests,
# the plugin may not be activated, so we import explicitly.
from plugins.skills import signals  # noqa: F401, E402


class ViewSetTestCase:
    """Shared setUp for viewset tests."""
    factory = APIRequestFactory()

    def setUp(self):
        self.cat = SkillCategory.objects.create(name="Backend", code="backend")
        self.skill1 = Skill.objects.create(
            category=self.cat, name="Python", code="python"
        )
        self.skill2 = Skill.objects.create(
            category=self.cat, name="Django", code="django"
        )

        # Employee
        self.employee = User.objects.create_user(username="alice", password="x")
        # TL
        self.tl = User.objects.create_user(username="tl_bob", password="x")
        tl_profile = UserProfile.objects.get(user=self.tl)
        tl_profile.is_italian_tl_role = True
        tl_profile.save()
        # Assign alice to tl_bob
        alice_profile = UserProfile.objects.get(user=self.employee)
        alice_profile.italian_tl = self.tl
        alice_profile.save()

        # HR
        self.hr = User.objects.create_user(username="hr_sue", password="x")
        hr_profile = UserProfile.objects.get(user=self.hr)
        hr_profile.is_hr_user = True
        hr_profile.save()
        assign_role(self.hr, 'hr')

        # Admin
        self.admin = User.objects.create_user(
            username="admin", password="x", is_staff=True
        )

        # Another employee not in tl_bob's team
        self.other_emp = User.objects.create_user(username="charlie", password="x")
        # Wire the 'hr' role to the 'manage' and 'configure' plugin permissions
        # so HR users can perform catalog CRUD (matches the plugin manifest).
        from apps.permissions.models import Role
        hr_role = Role.objects.get(code='hr')
        for action in ('manage', 'configure'):
            perm = PluginPermission.objects.get(plugin_name='skills', action=action)
            perm.allowed_roles.add(hr_role)

    def _list(self, viewset_cls, user, action='list', params=None):
        url = '/api/plugins/skills/'
        if params:
            from urllib.parse import urlencode
            url += '?' + urlencode(params)
        request = self.factory.get(url)
        force_authenticate(request, user)
        view = viewset_cls.as_view({'get': action})
        return view(request)

    def _create(self, viewset_cls, user, data, action='create'):
        request = self.factory.post('/api/plugins/skills/', data, format='json')
        force_authenticate(request, user)
        view = viewset_cls.as_view({'post': action})
        return view(request)

    def _update(self, viewset_cls, user, pk, data, action='partial_update'):
        request = self.factory.patch(f'/api/plugins/skills/{pk}/', data, format='json')
        force_authenticate(request, user)
        view = viewset_cls.as_view({request.method.lower(): action})
        return view(request, pk=pk)

    def _delete(self, viewset_cls, user, pk, action='destroy'):
        request = self.factory.delete(f'/api/plugins/skills/{pk}/')
        force_authenticate(request, user)
        view = viewset_cls.as_view({'delete': action})
        return view(request, pk=pk)

    def _action(self, viewset_cls, user, pk, method, action_name, data=None):
        if method == 'POST':
            request = self.factory.post(
                f'/api/plugins/skills/{pk}/{action_name}/', data, format='json'
            )
        elif method == 'GET':
            request = self.factory.get(f'/api/plugins/skills/{pk}/{action_name}/')
        else:
            request = self.factory.generic(
                method, f'/api/plugins/skills/{pk}/{action_name}/', data=data, format='json'
            )
        force_authenticate(request, user)
        view = viewset_cls.as_view({method.lower(): action_name})
        return view(request, pk=pk)

    def _action_list(self, viewset_cls, user, action_name, params=None):
        url = f'/api/plugins/skills/{action_name}/'
        if params:
            from urllib.parse import urlencode
            url += '?' + urlencode(params)
        request = self.factory.get(url)
        force_authenticate(request, user)
        view = viewset_cls.as_view({'get': action_name})
        return view(request)


from django.test import TestCase  # noqa: E402


class UserSkillViewSetTest(ViewSetTestCase, TestCase):
    def test_employee_can_list_own_skills_only(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        UserSkill.objects.create(
            user=self.other_emp, skill=self.skill1, level=4,
            last_updated_by=self.other_emp,
        )
        resp = self._list(UserSkillViewSet, self.employee)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['user'], self.employee.id)

    def test_employee_can_create_own_skill(self):
        resp = self._create(UserSkillViewSet, self.employee, {
            'user': self.employee.id,
            'skill': self.skill1.id,
            'level': 3,
        })
        self.assertEqual(resp.status_code, 201)

    def test_duplicate_user_skill_returns_400_not_500(self):
        """S2: a duplicate (user, skill) POST must return 400, not 500."""
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._create(UserSkillViewSet, self.employee, {
            'user': self.employee.id,
            'skill': self.skill1.id,
            'level': 4,
        })
        self.assertEqual(resp.status_code, 400)

    def test_user_skill_list_includes_last_updated_by_name(self):
        """PERF-001: last_updated_by_name must not trigger N+1 queries.

        The query count for 1 row must equal the count for 5 rows — if
        select_related covers last_updated_by, no per-row queries are added.
        """
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        # 1 row
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        with CaptureQueriesContext(connection) as ctx1:
            resp = self._list(UserSkillViewSet, self.employee)
            self.assertEqual(resp.status_code, 200)
            results = resp.data.get('results', resp.data)
            self.assertEqual(results[0]['last_updated_by_name'], 'alice')
        count_1 = len(ctx1.captured_queries)

        # 5 rows (add 4 more skills + ratings)
        for i in range(4):
            sk = Skill.objects.create(
                category=self.cat, name=f"Skill{i}", code=f"sk{i}"
            )
            UserSkill.objects.create(
                user=self.employee, skill=sk, level=2,
                last_updated_by=self.employee,
            )
        with CaptureQueriesContext(connection) as ctx5:
            resp = self._list(UserSkillViewSet, self.employee)
            self.assertEqual(resp.status_code, 200)
        count_5 = len(ctx5.captured_queries)

        # No N+1: query count must not scale with row count.
        self.assertEqual(
            count_1, count_5,
            f"N+1 detected: 1 row={count_1} queries, 5 rows={count_5} queries"
        )

    def test_employee_create_ignores_supplied_user_field(self):
        """F1 Option A: `user` is read-only; the server always sets it to
        request.user. A POST with `user: <other_user_id>` creates for the
        requester, not the supplied id — no cross-user leak.
        """
        resp = self._create(UserSkillViewSet, self.employee, {
            'user': self.other_emp.id,
            'skill': self.skill1.id,
            'level': 3,
        })
        self.assertEqual(resp.status_code, 201)
        # The created UserSkill belongs to the employee, not other_emp.
        us = UserSkill.objects.get(user=self.employee, skill=self.skill1)
        self.assertEqual(us.level, 3)
        self.assertFalse(
            UserSkill.objects.filter(user=self.other_emp, skill=self.skill1).exists()
        )

    def test_create_without_user_returns_201_not_500(self):
        """F1: a POST with no `user` field must not 500. Under Option A,
        `user` is read-only and auto-set from request.user, so the create
        succeeds for the requester.
        """
        resp = self._create(UserSkillViewSet, self.employee, {
            'skill': self.skill1.id,
            'level': 3,
        })
        self.assertEqual(resp.status_code, 201)
        us = UserSkill.objects.get(user=self.employee, skill=self.skill1)
        self.assertEqual(us.level, 3)

    def test_admin_create_is_self_only(self):
        """F1 Option A: cross-user admin creation is not supported via this
        endpoint. An admin POST creates for the admin themselves.
        """
        resp = self._create(UserSkillViewSet, self.admin, {
            'user': self.employee.id,  # ignored — read-only
            'skill': self.skill1.id,
            'level': 4,
        })
        self.assertEqual(resp.status_code, 201)
        us = UserSkill.objects.get(skill=self.skill1)
        self.assertEqual(us.user_id, self.admin.id)

    def test_employee_can_update_own_level(self):
        us = UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._update(UserSkillViewSet, self.employee, us.id, {'level': 4})
        self.assertEqual(resp.status_code, 200)
        us.refresh_from_db()
        self.assertEqual(us.level, 4)

    def test_tl_cannot_update_via_patch(self):
        """TLs must use the `rate` action, not PATCH, to edit team skills."""
        us = UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._update(UserSkillViewSet, self.tl, us.id, {'level': 5})
        self.assertEqual(resp.status_code, 403)
        us.refresh_from_db()
        self.assertEqual(us.level, 3)  # unchanged

    def test_employee_can_delete_own_skill(self):
        us = UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._delete(UserSkillViewSet, self.employee, us.id)
        self.assertEqual(resp.status_code, 204)

    def test_tl_can_rate_team_member(self):
        us = UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._action(UserSkillViewSet, self.tl, us.id, 'POST', 'rate', {'level': 5})
        self.assertEqual(resp.status_code, 200)
        us.refresh_from_db()
        self.assertEqual(us.level, 5)
        self.assertEqual(us.last_updated_by, self.tl)

    def test_tl_cannot_rate_non_team_member(self):
        us = UserSkill.objects.create(
            user=self.other_emp, skill=self.skill1, level=3,
            last_updated_by=self.other_emp,
        )
        resp = self._action(UserSkillViewSet, self.tl, us.id, 'POST', 'rate', {'level': 5})
        # 404 because the TL's queryset doesn't include non-team members,
        # so get_object() raises NotFound (doesn't leak existence).
        self.assertEqual(resp.status_code, 404)

    def test_tl_cannot_delete_team_member_skill(self):
        us = UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._delete(UserSkillViewSet, self.tl, us.id)
        self.assertEqual(resp.status_code, 403)

    def test_tl_can_list_team_skills(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        UserSkill.objects.create(
            user=self.other_emp, skill=self.skill1, level=4,
            last_updated_by=self.other_emp,
        )
        resp = self._list(UserSkillViewSet, self.tl)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        user_ids = {r['user'] for r in results}
        self.assertIn(self.employee.id, user_ids)
        self.assertNotIn(self.other_emp.id, user_ids)

    def test_hr_can_list_all_skills(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        UserSkill.objects.create(
            user=self.other_emp, skill=self.skill1, level=4,
            last_updated_by=self.other_emp,
        )
        resp = self._list(UserSkillViewSet, self.hr)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        user_ids = {r['user'] for r in results}
        self.assertIn(self.employee.id, user_ids)
        self.assertIn(self.other_emp.id, user_ids)

    def test_invalid_level_rejected(self):
        resp = self._create(UserSkillViewSet, self.employee, {
            'user': self.employee.id,
            'skill': self.skill1.id,
            'level': 6,
        })
        self.assertEqual(resp.status_code, 400)


class SkillViewSetTest(ViewSetTestCase, TestCase):
    def test_employee_can_list_skills(self):
        resp = self._list(SkillViewSet, self.employee)
        self.assertEqual(resp.status_code, 200)

    def test_employee_cannot_create_skill(self):
        resp = self._create(SkillViewSet, self.employee, {
            'category': self.cat.id,
            'name': 'NewSkill',
            'code': 'newskill',
        })
        # manage permission required → 403 for non-HR/non-staff
        self.assertEqual(resp.status_code, 403)

    def test_hr_can_create_skill(self):
        resp = self._create(SkillViewSet, self.hr, {
            'category': self.cat.id,
            'name': 'NewSkill',
            'code': 'newskill',
        })
        self.assertEqual(resp.status_code, 201)

    def test_admin_can_create_skill(self):
        resp = self._create(SkillViewSet, self.admin, {
            'category': self.cat.id,
            'name': 'AdminSkill',
            'code': 'adminskill',
        })
        self.assertEqual(resp.status_code, 201)

    def test_delete_skill_with_ratings_returns_400(self):
        """F2-v4: deleting a Skill that has active UserSkill ratings must
        return 400, not cascade-delete all ratings. Admins should deactivate
        the skill instead.
        """
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._delete(SkillViewSet, self.admin, self.skill1.id)
        self.assertEqual(resp.status_code, 400)
        # Skill and rating still exist
        self.assertTrue(Skill.objects.filter(id=self.skill1.id).exists())
        self.assertTrue(
            UserSkill.objects.filter(skill=self.skill1.id).exists()
        )

    def test_delete_skill_without_ratings_succeeds(self):
        """F2-v4: a Skill with no ratings can be deleted normally."""
        empty_skill = Skill.objects.create(
            category=self.cat, name="Unused", code="unused"
        )
        resp = self._delete(SkillViewSet, self.admin, empty_skill.id)
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Skill.objects.filter(id=empty_skill.id).exists())


class SkillCategoryViewSetTest(ViewSetTestCase, TestCase):
    def test_employee_can_list_categories(self):
        resp = self._list(SkillCategoryViewSet, self.employee)
        self.assertEqual(resp.status_code, 200)

    def test_employee_cannot_create_category(self):
        resp = self._create(SkillCategoryViewSet, self.employee, {
            'name': 'Frontend',
            'code': 'frontend',
        })
        self.assertEqual(resp.status_code, 403)

    def test_zero_annotated_skill_count_does_not_query_related_manager(self):
        related_manager = Mock()
        category = SimpleNamespace(_skill_count=0, skills=related_manager)

        self.assertEqual(SkillCategorySerializer().get_skill_count(category), 0)
        related_manager.count.assert_not_called()

    def test_hr_can_create_category(self):
        resp = self._create(SkillCategoryViewSet, self.hr, {
            'name': 'Frontend',
            'code': 'frontend',
        })
        self.assertEqual(resp.status_code, 201)

    def test_hr_can_update_category(self):
        resp = self._update(SkillCategoryViewSet, self.hr, self.cat.id, {
            'description': 'Backend skills updated',
        })
        self.assertEqual(resp.status_code, 200)
        self.cat.refresh_from_db()
        self.assertEqual(self.cat.description, 'Backend skills updated')

    def test_hr_cannot_delete_category_with_skills(self):
        # self.skill1 is in self.cat, so deletion should be blocked by PROTECT
        resp = self._delete(SkillCategoryViewSet, self.hr, self.cat.id)
        self.assertEqual(resp.status_code, 400)

    def test_admin_can_delete_empty_category(self):
        empty_cat = SkillCategory.objects.create(name="Empty", code="empty")
        resp = self._delete(SkillCategoryViewSet, self.admin, empty_cat.id)
        self.assertEqual(resp.status_code, 204)


class MatrixViewSetTest(ViewSetTestCase, TestCase):
    def test_tl_can_get_matrix(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._action_list(SkillMatrixViewSet, self.tl, 'matrix')
        self.assertEqual(resp.status_code, 200)

    def test_employee_matrix_is_self_only(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        UserSkill.objects.create(
            user=self.other_emp, skill=self.skill1, level=4,
            last_updated_by=self.other_emp,
        )
        resp = self._action_list(SkillMatrixViewSet, self.employee, 'matrix')
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        user_ids = {r['user_id'] for r in results}
        self.assertEqual(user_ids, {self.employee.id})

    def test_skill_search_matches_code(self):
        response = self._list(
            SkillViewSet, self.admin, params={"search": "py"}
        )
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual([skill["id"] for skill in results], [self.skill1.id])

    def test_skill_list_can_filter_inactive_only(self):
        self.skill1.is_active = False
        self.skill1.save(update_fields=["is_active"])
        response = self._list(
            SkillViewSet, self.admin, params={"active": "false"}
        )
        self.assertEqual(response.status_code, 200)
        results = response.data.get("results", response.data)
        self.assertEqual([skill["id"] for skill in results], [self.skill1.id])

    def test_matrix_search_matches_member_name_and_skill_name(self):
        self.employee.first_name = "Alice"
        self.employee.last_name = "Smith"
        self.employee.save(update_fields=["first_name", "last_name"])
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        by_first_name = self._action_list(
            SkillMatrixViewSet, self.admin, "matrix", {"search": "alice"}
        )
        by_last_name = self._action_list(
            SkillMatrixViewSet, self.admin, "matrix", {"search": "smith"}
        )
        by_skill = self._action_list(
            SkillMatrixViewSet, self.admin, "matrix", {"search": "python"}
        )

        for label, response in (
            ("first name", by_first_name),
            ("last name", by_last_name),
            ("skill", by_skill),
        ):
            with self.subTest(label=label):
                self.assertEqual(response.status_code, 200)
                results = response.data.get("results", response.data)
                self.assertEqual([row["user_id"] for row in results], [self.employee.id])

    def test_coverage_stats(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._action_list(SkillMatrixViewSet, self.tl, 'coverage')
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertTrue(len(data) > 0)
        self.assertIn('skill_name', data[0])
        self.assertIn('avg_level', data[0])

    def test_coverage_top_n_limits_payload(self):
        """S3: ?top_n= truncates the coverage payload."""
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        full = self._action_list(SkillMatrixViewSet, self.tl, 'coverage')
        limited = self._action_list(
            SkillMatrixViewSet, self.tl, 'coverage', {'top_n': '1'}
        )
        self.assertEqual(limited.status_code, 200)
        self.assertEqual(len(limited.data), 1)
        self.assertEqual(limited.data, full.data[:1])

    def test_coverage_top_n_invalid_returns_400(self):
        """Non-integer top_n returns 400, not 500."""
        resp = self._action_list(
            SkillMatrixViewSet, self.tl, 'coverage', {'top_n': 'abc'}
        )
        self.assertEqual(resp.status_code, 400)


class GapReportTest(ViewSetTestCase, TestCase):
    def test_gap_report_returns_low_avg_with_threshold(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=1,
            last_updated_by=self.employee,
        )
        resp = self._action_list(
            SkillGapReportViewSet, self.tl, 'gaps', {'threshold': '3'}
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        skill_ids = {g['skill_id'] for g in data}
        self.assertIn(self.skill1.id, skill_ids)

    def test_gap_report_no_threshold_returns_empty(self):
        """Without a threshold, no gaps are reported (no target_level)."""
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._action_list(SkillGapReportViewSet, self.tl, 'gaps')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])

    def test_invalid_threshold_returns_400_not_500(self):
        """VULN-001: invalid threshold must return 400, not 500."""
        resp = self._action_list(
            SkillGapReportViewSet, self.tl, 'gaps', {'threshold': 'abc'}
        )
        self.assertEqual(resp.status_code, 400)

    def test_valid_threshold_returns_200(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._action_list(
            SkillGapReportViewSet, self.tl, 'gaps', {'threshold': '4'}
        )
        self.assertEqual(resp.status_code, 200)

    def test_gaps_top_n_returns_worst_n(self):
        """S3: ?top_n= returns the N worst gaps (lowest avg_level first)."""
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=1,
            last_updated_by=self.employee,
        )
        skill2 = Skill.objects.create(
            category=self.cat, name="Git", code="git"
        )
        UserSkill.objects.create(
            user=self.employee, skill=skill2, level=2,
            last_updated_by=self.employee,
        )
        full = self._action_list(
            SkillGapReportViewSet, self.tl, 'gaps', {'threshold': '5'}
        )
        self.assertGreaterEqual(len(full.data), 2)
        limited = self._action_list(
            SkillGapReportViewSet, self.tl, 'gaps', {'threshold': '5', 'top_n': '1'}
        )
        self.assertEqual(limited.status_code, 200)
        self.assertEqual(len(limited.data), 1)
        self.assertEqual(limited.data, full.data[:1])

    def test_gaps_top_n_invalid_returns_400(self):
        resp = self._action_list(
            SkillGapReportViewSet, self.tl, 'gaps', {'top_n': 'xyz'}
        )
        self.assertEqual(resp.status_code, 400)


class ExportTest(ViewSetTestCase, TestCase):
    def test_csv_export(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._action_list(SkillExportViewSet, self.tl, 'export')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'text/csv')
        content = b''.join(resp.streaming_content).decode()
        self.assertIn('alice', content)
        self.assertIn('Python', content)


class HistoryTest(ViewSetTestCase, TestCase):
    def test_employee_can_see_own_history(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        resp = self._list(SkillRatingHistoryViewSet, self.employee)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        self.assertTrue(len(results) > 0)
        self.assertEqual(results[0]['user'], self.employee.id)

    def test_tl_can_see_team_history(self):
        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        UserSkill.objects.create(
            user=self.other_emp, skill=self.skill1, level=4,
            last_updated_by=self.other_emp,
        )
        resp = self._list(SkillRatingHistoryViewSet, self.tl)
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        user_ids = {r['user'] for r in results}
        self.assertIn(self.employee.id, user_ids)
        self.assertNotIn(self.other_emp.id, user_ids)

    def test_date_from_filters_history(self):
        """Entries before date_from are excluded."""
        from datetime import date, timedelta
        from django.utils import timezone
        from plugins.skills.models import SkillRatingHistory

        UserSkill.objects.create(
            user=self.employee, skill=self.skill1, level=3,
            last_updated_by=self.employee,
        )
        old_entry = SkillRatingHistory.objects.create(
            user=self.employee, skill=self.skill1,
            old_level=None, new_level=3,
            changed_by=self.employee, source='self',
        )
        # Backdate to 30 days ago
        SkillRatingHistory.objects.filter(pk=old_entry.pk).update(
            changed_at=timezone.now() - timedelta(days=30)
        )
        recent_entry = SkillRatingHistory.objects.create(
            user=self.employee, skill=self.skill1,
            old_level=3, new_level=4,
            changed_by=self.employee, source='self',
        )

        today = date.today().isoformat()
        resp = self._list(SkillRatingHistoryViewSet, self.employee, params={'date_from': today})
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        ids = [r['id'] for r in results]
        self.assertIn(recent_entry.id, ids)
        self.assertNotIn(old_entry.id, ids)

    def test_date_to_filters_history(self):
        """Entries after date_to are excluded."""
        from datetime import date, timedelta
        from plugins.skills.models import SkillRatingHistory

        SkillRatingHistory.objects.create(
            user=self.employee, skill=self.skill1,
            old_level=None, new_level=3,
            changed_by=self.employee, source='self',
        )
        # date_to = yesterday → today's entry excluded
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        resp = self._list(SkillRatingHistoryViewSet, self.employee, params={'date_to': yesterday})
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get('results', resp.data)
        self.assertEqual(len(results), 0)

    def test_invalid_date_from_is_silently_ignored(self):
        """A malformed date_from must not 500 — it is silently skipped."""
        from plugins.skills.models import SkillRatingHistory

        SkillRatingHistory.objects.create(
            user=self.employee, skill=self.skill1,
            old_level=None, new_level=3,
            changed_by=self.employee, source='self',
        )
        resp = self._list(SkillRatingHistoryViewSet, self.employee, params={'date_from': 'not-a-date'})
        self.assertEqual(resp.status_code, 200)
