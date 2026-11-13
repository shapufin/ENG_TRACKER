"""Team views and exports follow the owner rule after an employee changes Line Manager.

Option A (2026-11-13): a decided row stays with the leader who decided it; a pending row
goes to the current leader. No row appears in two leaders' views.
"""
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog


def _line_manager(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_albanian_tl_role = True
    user.profile.save()
    return user


class LmReassignmentScopeTests(APITestCase):
    def setUp(self):
        self.old_lm = _line_manager('rs_old_lm')
        self.new_lm = _line_manager('rs_new_lm')
        self.emp = User.objects.create_user(username='rs_emp', password='x')
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.save()
        self.client_row = Client.objects.create(name='RS', code='RS')
        self.approved_by_old = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=date(2026, 3, 2), hours=2,
            status='approved', approved_by=self.old_lm,
        )
        self.pending = OvertimeLog.objects.create(
            user=self.emp, client=self.client_row, date=date(2026, 3, 3), hours=3, status='pending',
        )
        self.standby_approved_by_old = StandbyLog.objects.create(
            user=self.emp, date=date(2026, 3, 4), hours=8, status='approved', approved_by=self.old_lm,
        )
        self.emp.profile.albanian_tl = self.new_lm
        self.emp.profile.save()

    def _ids(self, path, leader):
        self.client.force_authenticate(user=leader)
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return [row['id'] for row in rows]

    def test_decided_overtime_stays_in_the_approvers_team_log(self):
        self.assertIn(self.approved_by_old.id, self._ids('/api/overtime/logs/team_logs/', self.old_lm))
        self.assertNotIn(self.approved_by_old.id, self._ids('/api/overtime/logs/team_logs/', self.new_lm))

    def test_pending_overtime_follows_the_current_leader(self):
        self.assertIn(self.pending.id, self._ids('/api/overtime/logs/team_pending/', self.new_lm))
        self.assertNotIn(self.pending.id, self._ids('/api/overtime/logs/team_pending/', self.old_lm))

    def test_team_logs_of_the_two_leaders_never_overlap(self):
        old_ids = set(self._ids('/api/overtime/logs/team_logs/', self.old_lm))
        new_ids = set(self._ids('/api/overtime/logs/team_logs/', self.new_lm))
        self.assertFalse(old_ids & new_ids)
        self.assertEqual(old_ids | new_ids, {self.approved_by_old.id, self.pending.id})

    def test_standby_decided_rows_stay_with_the_approver(self):
        self.assertIn(self.standby_approved_by_old.id, self._ids('/api/standby/logs/team_logs/', self.old_lm))
        self.assertNotIn(self.standby_approved_by_old.id, self._ids('/api/standby/logs/team_logs/', self.new_lm))
