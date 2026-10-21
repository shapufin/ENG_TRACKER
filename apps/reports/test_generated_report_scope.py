"""M-3: a team leader listing generated reports got a 500 (the TL filter looked up a
``user`` column that GeneratedReport does not have). Reports are personal."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.reports.models import GeneratedReport
from core.utils.timezone_local import business_today


class GeneratedReportListScopeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tl = User.objects.create_user('gr_tl', password='x')
        cls.tl.profile.is_italian_tl_role = True
        cls.tl.profile.save()
        cls.member = User.objects.create_user('gr_member', password='x')
        cls.member.profile.italian_tl = cls.tl
        cls.member.profile.save()
        today = business_today()
        for owner in (cls.tl, cls.member):
            GeneratedReport.objects.create(
                generated_by=owner, name=f'report of {owner.username}',
                date_range_start=today, date_range_end=today)

    def _names(self, user):
        self.client.force_authenticate(user)
        response = self.client.get('/api/reports/generated/')
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['name'] for row in rows}

    def test_team_leader_lists_only_their_own_reports(self):
        self.assertEqual(self._names(self.tl), {'report of gr_tl'})

    def test_member_lists_only_their_own_reports(self):
        self.assertEqual(self._names(self.member), {'report of gr_member'})
