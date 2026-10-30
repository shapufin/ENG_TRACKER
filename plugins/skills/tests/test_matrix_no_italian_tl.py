"""Italian TLs never appear on the team skill matrix pages."""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.skills import signals  # noqa: F401
from plugins.skills.models import Skill, SkillCategory, UserSkill
from plugins.skills.viewsets import SkillExportViewSet, SkillMatrixViewSet


class MatrixWithoutItalianTlTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('nit_admin', password='x', is_staff=True)
        self.flagged_tl = User.objects.create_user('nit_flag', password='x')
        self.flagged_tl.profile.is_italian_tl_role = True
        self.flagged_tl.profile.save()
        self.linked_tl = User.objects.create_user('nit_linked', password='x')
        self.member = User.objects.create_user('nit_member', password='x')
        self.member.profile.italian_tl = self.linked_tl
        self.member.profile.save()
        category = SkillCategory.objects.create(name='Cat', code='cat')
        skill = Skill.objects.create(name='S', category=category)
        for user in (self.flagged_tl, self.linked_tl, self.member):
            UserSkill.objects.create(user=user, skill=skill, level=3)

    def _rows(self, view, action, user=None):
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=user or self.admin)
        response = view.as_view({'get': action})(request)
        self.assertEqual(response.status_code, 200)
        return response

    def test_matrix_omits_italian_tls_flagged_or_linked(self):
        response = self._rows(SkillMatrixViewSet, 'matrix')
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        names = {r['username'] for r in rows}
        self.assertIn('nit_member', names)
        self.assertNotIn('nit_flag', names)
        self.assertNotIn('nit_linked', names)

    def test_coverage_counts_exclude_italian_tls(self):
        response = self._rows(SkillMatrixViewSet, 'coverage')
        self.assertEqual(response.data[0]['team_count'], 1)

    def test_csv_export_omits_italian_tls(self):
        response = self._rows(SkillExportViewSet, 'export')
        body = b''.join(response.streaming_content).decode()
        self.assertIn('nit_member', body)
        self.assertNotIn('nit_flag', body)
