"""HR (and admin) can narrow the team matrix by TL and Tech; a TL cannot widen scope."""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.users.models.core import Tech, UserTech
from plugins.skills import signals  # noqa: F401
from plugins.skills.viewsets import SkillMatrixViewSet


class MatrixHrFilterTests(TestCase):
    def setUp(self):
        self.hr = User.objects.create_user(username='mhf_hr', password='x')
        self.hr.profile.is_hr_user = True
        self.hr.profile.save()
        self.it_tl = User.objects.create_user(username='mhf_it', password='x')
        self.al_tl = User.objects.create_user(username='mhf_al', password='x')
        self.a = User.objects.create_user(username='mhf_a', password='x')
        self.b = User.objects.create_user(username='mhf_b', password='x')
        self.a.profile.italian_tl = self.it_tl
        self.a.profile.save()
        self.b.profile.albanian_tl = self.al_tl
        self.b.profile.save()
        self.tech = Tech.objects.create(name='Net', code='net')
        UserTech.objects.create(user_profile=self.b.profile, tech=self.tech)

    def _names(self, user, **params):
        request = APIRequestFactory().get('/x/', params)
        force_authenticate(request, user=user)
        response = SkillMatrixViewSet.as_view({'get': 'matrix'})(request)
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {r['username'] for r in rows}

    def test_italian_tl_filter(self):
        self.assertEqual(self._names(self.hr, italian_tl=self.it_tl.id), {'mhf_a'})

    def test_albanian_tl_filter(self):
        self.assertEqual(self._names(self.hr, albanian_tl=self.al_tl.id), {'mhf_b'})

    def test_tech_filter(self):
        self.assertEqual(self._names(self.hr, tech=self.tech.id), {'mhf_b'})

    def test_tl_filters_cannot_widen_a_tl_scope(self):
        self.it_tl.profile.is_italian_tl_role = True
        self.it_tl.profile.save()
        # al_tl's member is outside it_tl's team, so it never appears.
        self.assertEqual(self._names(self.it_tl, albanian_tl=self.al_tl.id), set())
