"""One owner per overtime/standby row, and history stays with the leader who decided it.

Owner ruling (Option A, 2026-11-13): a decided row belongs to its approver while the
approver is a leader; every other row belongs to the employee's current leader.
"""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from apps.users.services.leader_ownership import leader_user_ids, owned_by_leader_q


def _leader(username, *, line=True):
    user = User.objects.create_user(username=username, password='x')
    flag = 'is_albanian_tl_role' if line else 'is_italian_tl_role'
    setattr(user.profile, flag, True)
    user.profile.save()
    return user


class LeaderOwnershipTests(TestCase):
    def setUp(self):
        self.old_lm = _leader('own_old_lm')
        self.new_lm = _leader('own_new_lm')
        self.manager = _leader('own_manager', line=False)
        self.staff = User.objects.create_user(username='own_staff', password='x', is_staff=True)
        self.emp = User.objects.create_user(username='own_emp', password='x')
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.save()
        self.day = date(2026, 3, 10)
        self.client_row = Client.objects.create(name='Own', code='OWN')

    def _log(self, **kwargs):
        defaults = {'user': self.emp, 'client': self.client_row, 'date': self.day, 'hours': 2, 'status': 'pending'}
        defaults.update(kwargs)
        return OvertimeLog.objects.create(**defaults)

    def _owners(self, row):
        leaders = leader_user_ids()
        owners = []
        for leader in (self.old_lm, self.new_lm, self.manager):
            if OvertimeLog.objects.filter(pk=row.pk).filter(owned_by_leader_q(leader.id, leaders)).exists():
                owners.append(leader.username)
        return owners

    def _move_to_new_lm(self):
        self.emp.profile.albanian_tl = self.new_lm
        self.emp.profile.save()

    def test_decided_row_stays_with_its_approver_after_a_move(self):
        row = self._log(status='approved', approved_by=self.old_lm)
        self._move_to_new_lm()
        self.assertEqual(self._owners(row), ['own_old_lm'])

    def test_pending_row_follows_the_current_leader_after_a_move(self):
        row = self._log(status='pending')
        self._move_to_new_lm()
        self.assertEqual(self._owners(row), ['own_new_lm'])

    def test_row_decided_by_staff_follows_the_current_leader(self):
        row = self._log(status='approved', approved_by=self.staff)
        self.assertEqual(self._owners(row), ['own_old_lm'])
        self._move_to_new_lm()
        self.assertEqual(self._owners(row), ['own_new_lm'])

    def test_employee_with_line_manager_and_manager_is_owned_once(self):
        self.emp.profile.italian_tl = self.manager
        self.emp.profile.save()
        row = self._log(status='pending')
        self.assertEqual(self._owners(row), ['own_old_lm'])

    def test_manager_decision_on_a_line_managers_employee_stays_with_the_manager(self):
        self.emp.profile.italian_tl = self.manager
        self.emp.profile.save()
        row = self._log(status='rejected', approved_by=self.manager, rejection_reason='no')
        self.assertEqual(self._owners(row), ['own_manager'])

    def test_employee_without_a_leader_has_no_leader_owner(self):
        self.emp.profile.albanian_tl = None
        self.emp.profile.save()
        row = self._log(status='pending')
        self.assertEqual(self._owners(row), [])

    def test_every_row_has_at_most_one_owner_across_a_move(self):
        rows = [
            self._log(status='pending'),
            self._log(date=date(2026, 3, 11), status='approved', approved_by=self.old_lm),
            self._log(date=date(2026, 3, 12), status='rejected', approved_by=self.old_lm, rejection_reason='x'),
        ]
        self._move_to_new_lm()
        for row in rows:
            self.assertLessEqual(len(self._owners(row)), 1, row.pk)

    def test_standby_rows_use_the_same_rule(self):
        row = StandbyLog.objects.create(
            user=self.emp, date=self.day, hours=8, status='approved', approved_by=self.old_lm,
        )
        self._move_to_new_lm()
        leaders = leader_user_ids()
        self.assertTrue(StandbyLog.objects.filter(pk=row.pk).filter(owned_by_leader_q(self.old_lm.id, leaders)).exists())
        self.assertFalse(StandbyLog.objects.filter(pk=row.pk).filter(owned_by_leader_q(self.new_lm.id, leaders)).exists())

    def test_python_owner_matches_the_queryset_owner(self):
        from apps.users.services.leader_ownership import owner_leader_id

        self._move_to_new_lm()
        self.emp.profile.italian_tl = self.manager
        self.emp.profile.save()
        rows = [
            self._log(status='pending'),
            self._log(date=date(2026, 3, 11), status='approved', approved_by=self.old_lm),
            self._log(date=date(2026, 3, 12), status='rejected', approved_by=self.manager, rejection_reason='x'),
            self._log(date=date(2026, 3, 13), status='approved', approved_by=self.staff),
        ]
        leaders = leader_user_ids()
        for row in rows:
            row = OvertimeLog.objects.select_related('user__profile').get(pk=row.pk)
            profile = row.user.profile
            python_owner = owner_leader_id(
                row.status, row.approved_by_id, profile.albanian_tl_id, profile.italian_tl_id, leaders,
            )
            db_owners = [
                leader.id for leader in (self.old_lm, self.new_lm, self.manager)
                if OvertimeLog.objects.filter(pk=row.pk).filter(owned_by_leader_q(leader.id, leaders)).exists()
            ]
            self.assertEqual(db_owners, [python_owner] if python_owner is not None else [], row.pk)
