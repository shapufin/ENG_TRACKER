"""Team Overview export (``?team_only=true``) must match the team tables, even for a leader who also holds HR."""
import io
from datetime import date

import openpyxl
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.reports.filters import UnifiedReportFilter
from apps.standby.models import StandbyLog
from apps.users.models import UserProfile

User = get_user_model()
EVERYONE = {'Mate T', 'Outsider T', 'Purehr T', 'Leaderhr T'}
WINDOW = {'start_date': '2026-07-01', 'end_date': '2026-07-31'}


class TeamOnlyExportScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        def user(name):
            u = User.objects.create_user(username=f'to_{name}', password='x', first_name=name.title(), last_name='T')
            UserProfile.objects.get_or_create(user=u)
            return u

        def grant(u, code):
            Role.objects.get_or_create(code=code, defaults={'name': code})
            assign_role(u, code)

        cls.leader_hr = user('leaderhr')
        cls.pure_hr = user('purehr')
        cls.mate = user('mate')
        cls.outsider = user('outsider')
        cls.staff = User.objects.create_user(username='to_staff', password='x', is_staff=True)
        profile = UserProfile.objects.get(user=cls.mate)
        profile.albanian_tl = cls.leader_hr
        profile.save()
        grant(cls.leader_hr, 'albanian_tl')
        grant(cls.leader_hr, 'hr')
        grant(cls.pure_hr, 'hr')

        client = Client.objects.create(name='Team Client', code='TCL')
        for index, u in enumerate((cls.mate, cls.outsider, cls.pure_hr, cls.leader_hr)):
            day = date(2026, 7, 6 + index)
            OvertimeLog.objects.create(user=u, client=client, date=day, hours=2, status='approved')
            StandbyLog.objects.create(user=u, date=day, hours=8, status='approved')
            LeaveRequest.objects.create(
                user=u, request_type='vacation', start_date=day, end_date=day, status='approved', reason='x',
            )

    def _names(self, user, endpoint, **params):
        api = APIClient()
        api.force_authenticate(user=User.objects.get(pk=user.pk))
        response = api.get(f'/api/reports/{endpoint}/', {**WINDOW, **params})
        self.assertEqual(response.status_code, 200, response.content[:300])
        wb = openpyxl.load_workbook(io.BytesIO(response.content))
        return {
            row[0] for ws in wb.worksheets for row in ws.iter_rows(min_row=2, values_only=True)
            if row[0] in EVERYONE
        }

    def test_leader_with_hr_team_export_is_team_only(self):
        for endpoint in ('export-ot-standby', 'export-leave'):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self._names(self.leader_hr, endpoint, team_only='true'), {'Mate T', 'Leaderhr T'})

    def test_hr_export_without_flag_stays_company_wide(self):
        for endpoint in ('export-ot-standby', 'export-leave'):
            with self.subTest(endpoint=endpoint):
                for user in (self.leader_hr, self.pure_hr):
                    self.assertEqual(self._names(user, endpoint), EVERYONE)

    def test_flag_only_narrows_hr_not_staff(self):
        for endpoint in ('export-ot-standby', 'export-leave'):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self._names(self.pure_hr, endpoint, team_only='true'), {'Purehr T'})
                self.assertEqual(
                    self._names(self.staff, endpoint, team_only='true'), EVERYONE,
                )

    def test_line_manager_filter_includes_their_own_records(self):
        for endpoint in ('export-ot-standby', 'export-leave'):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(
                    self._names(self.pure_hr, endpoint, albanian_tl_ids=str(self.leader_hr.pk)),
                    {'Mate T', 'Leaderhr T'},
                )
        filtered = UnifiedReportFilter(
            {**WINDOW, 'albanian_tl_id': str(self.leader_hr.pk)}, user=User.objects.get(pk=self.pure_hr.pk),
        ).get_filtered_querysets()
        for kind, queryset in filtered.items():
            with self.subTest(screen=kind):
                self.assertEqual(set(queryset.values_list('user_id', flat=True)), {self.mate.pk, self.leader_hr.pk})
