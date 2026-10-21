from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.models import Team, TeamMembership


class ApproveInClosedPeriodTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.tl = User.objects.create_user(username='ap-tl', password='pass')
        self.tl.profile.is_albanian_tl_role = True
        self.tl.profile.save(update_fields=['is_albanian_tl_role', 'updated_at'])
        self.emp = User.objects.create_user(username='ap-emp', password='pass')
        team = Team.objects.create(name='AP', code='AP', team_leader=self.tl)
        TeamMembership.objects.create(user_profile=self.emp.profile, team=team, is_primary_team=True)
        self.cl = Client.objects.create(name='C', code='C')
        self.api.force_authenticate(user=self.tl)
        r = self.api.post('/api/users/approval-periods/finalize/',
                          {'period': '2026-10-01'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def test_tl_can_approve_standby_added_after_finalize(self):
        sb = StandbyLog.objects.create(user=self.emp, date=date(2026, 10, 10), hours=8)
        r = self.api.post(f'/api/standby/logs/{sb.id}/approve/', format='json')
        self.assertEqual(r.status_code, 200, r.data)

    def test_tl_can_approve_overtime_added_after_finalize(self):
        ot = OvertimeLog.objects.create(user=self.emp, client=self.cl, date=date(2026, 10, 10), hours=2)
        r = self.api.post(f'/api/overtime/logs/{ot.id}/approve/', format='json')
        self.assertEqual(r.status_code, 200, r.data)

    def test_employee_api_create_then_tl_single_and_bulk_approve(self):
        emp_api = APIClient()
        emp_api.force_authenticate(user=self.emp)
        r = emp_api.post('/api/standby/logs/', {
            'date': '2026-10-10', 'start_time': '18:00', 'end_time': '23:00',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        sid = StandbyLog.objects.get(user=self.emp).id
        r = self.api.post('/api/standby/logs/bulk_approve/', {'ids': [sid]}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['approved_count'], 1, r.data)
        r = self.api.get('/api/standby/logs/team_pending/', format='json')
        self.assertEqual(r.status_code, 200, r.data)
