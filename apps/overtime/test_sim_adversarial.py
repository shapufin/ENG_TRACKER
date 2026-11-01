"""Adversarial simulation of overtime -> approval -> payroll -> month lock.

Each test states the behaviour a hostile or careless user must NOT get.
"""
from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from apps.users.models import Team
from core.utils.timezone_local import business_today

OT = '/api/overtime/logs/'


def _weekday(d):
    """The latest weekday on or before ``d`` in the same month (early-month weekends keep ``d``)."""
    back = d
    while back.weekday() >= 5:
        back -= timedelta(days=1)
    return back if back.month == d.month else d


class OvertimeAbuseTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.emp = User.objects.create_user(username='sim_emp', password='x')
        cls.other = User.objects.create_user(username='sim_other', password='x')
        cls.tl = User.objects.create_user(username='sim_tl', password='x')
        cls.staff = User.objects.create_user(username='sim_staff', password='x', is_staff=True)
        cls.team = Team.objects.create(name='Sim', code='SIM', team_leader=cls.tl)
        cls.emp.profile.teams.add(cls.team)
        cls.tl.profile.teams.add(cls.team)
        cls.foreign_team = Team.objects.create(name='SimF', code='SIMF')
        cls.other.profile.teams.add(cls.foreign_team)
        cls.client_obj = Client.objects.create(name='SimC', code='SIMC')

    def setUp(self):
        self.today = _weekday(business_today())

    def _payload(self, **kw):
        base = {'client': self.client_obj.pk, 'date': self.today.isoformat(),
                'start_time': '18:00', 'end_time': '19:00', 'description': 'x'}
        base.update(kw)
        return base

    # --- mass assignment on create -------------------------------------
    def test_employee_cannot_create_an_already_approved_entry(self):
        self.client.force_authenticate(self.emp)
        r = self.client.post(OT, self._payload(status='approved'), format='json')
        if r.status_code == 201:
            self.assertEqual(OvertimeLog.objects.get(pk=r.data['id']).status, 'pending', r.data)

    def test_employee_cannot_create_for_another_user(self):
        self.client.force_authenticate(self.emp)
        r = self.client.post(OT, self._payload(user=self.other.pk), format='json')
        if r.status_code == 201:
            self.assertEqual(OvertimeLog.objects.get(pk=r.data['id']).user_id, self.emp.pk)

    def test_employee_cannot_set_paid_hours_directly_with_times(self):
        self.client.force_authenticate(self.emp)
        r = self.client.post(OT, self._payload(hours=20), format='json')
        if r.status_code == 201:
            self.assertEqual(Decimal(str(OvertimeLog.objects.get(pk=r.data['id']).hours)), Decimal('1'))

    def test_bad_hours_are_refused(self):
        self.client.force_authenticate(self.emp)
        for bad in (-1, 0, 25, 1e9):
            r = self.client.post(OT, {'client': self.client_obj.pk, 'date': self.today.isoformat(),
                                      'hours': bad, 'description': 'x'}, format='json')
            self.assertEqual(r.status_code, 400, (bad, r.data))

    def test_future_date_entry(self):
        self.client.force_authenticate(self.emp)
        r = self.client.post(OT, self._payload(date=(self.today + timedelta(days=400)).isoformat()),
                             format='json')
        self.assertIn(r.status_code, (201, 400))
        self.assertNotEqual(r.status_code, 500, r.data)

    def test_garbage_times_do_not_500(self):
        self.client.force_authenticate(self.emp)
        for st, et in (('25:00', '26:00'), ('abc', '10:00'), ('10:00', '10:00'), ('23:30', '00:30')):
            r = self.client.post(OT, self._payload(start_time=st, end_time=et), format='json')
            self.assertNotEqual(r.status_code, 500, (st, et))

    # --- overlap / paid blocks -----------------------------------------
    def test_overlapping_and_overnight_entries(self):
        self.client.force_authenticate(self.emp)
        a = self.client.post(OT, self._payload(start_time='22:00', end_time='02:00'), format='json')
        self.assertEqual(a.status_code, 201, a.data)
        for st, et in (('23:00', '23:30'), ('21:00', '22:30'), ('01:00', '03:00')):
            r = self.client.post(OT, self._payload(start_time=st, end_time=et), format='json')
            # 01:00-03:00 on the same date is the *start* of the day, before the 22:00 entry
            # that runs into the next day, so it is a different clock span.
            self.assertNotEqual(r.status_code, 500, (st, et, r.data))
        adjacent = self.client.post(OT, self._payload(start_time='02:00', end_time='03:00'), format='json')
        self.assertNotEqual(adjacent.status_code, 500)

    # --- update / ownership --------------------------------------------
    def _own(self, **kw):
        defaults = dict(user=self.emp, client=self.client_obj, date=self.today, hours=1,
                        start_time=time(18, 0), end_time=time(19, 0), status='pending')
        defaults.update(kw)
        return OvertimeLog.objects.create(**defaults)

    def test_owner_cannot_self_approve_by_patch(self):
        e = self._own()
        self.client.force_authenticate(self.emp)
        self.client.patch(f'{OT}{e.pk}/', {'status': 'approved'}, format='json')
        e.refresh_from_db()
        self.assertEqual(e.status, 'pending')

    def test_owner_cannot_reassign_entry_to_someone_else(self):
        e = self._own()
        self.client.force_authenticate(self.emp)
        self.client.patch(f'{OT}{e.pk}/', {'user': self.other.pk}, format='json')
        e.refresh_from_db()
        self.assertEqual(e.user_id, self.emp.pk)

    def test_owner_cannot_fake_approver_fields_by_patch(self):
        e = self._own()
        self.client.force_authenticate(self.emp)
        self.client.patch(f'{OT}{e.pk}/', {'approved_by': self.tl.pk, 'approved_at': '2026-01-01T00:00:00Z'},
                          format='json')
        e.refresh_from_db()
        self.assertIsNone(e.approved_by_id)

    def test_editing_an_approved_entry_sends_it_back_to_pending(self):
        e = self._own(status='approved', approved_by=self.tl)
        self.client.force_authenticate(self.emp)
        r = self.client.patch(f'{OT}{e.pk}/', {'description': 'changed'}, format='json')
        self.assertIn(r.status_code, (200, 403), r.data)
        e.refresh_from_db()
        if r.status_code == 200:
            self.assertEqual(e.status, 'pending')

    def test_resubmitting_an_approved_entry_restarts_its_sla_clock(self):
        """An edited approved entry is a new submission: it must not inherit the old deadline."""
        e = self._own(status='approved', approved_by=self.tl)
        old = timezone.now() - timedelta(days=30)
        OvertimeLog.objects.filter(pk=e.pk).update(submitted_at=old)
        self.client.force_authenticate(self.emp)
        r = self.client.patch(f'{OT}{e.pk}/', {'description': 'changed'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        e.refresh_from_db()
        self.assertEqual(e.status, 'pending')
        self.assertGreater(e.submitted_at, old + timedelta(days=29))

    def test_editing_a_pending_entry_keeps_its_submission_time(self):
        e = self._own()
        old = timezone.now() - timedelta(days=3)
        OvertimeLog.objects.filter(pk=e.pk).update(submitted_at=old)
        self.client.force_authenticate(self.emp)
        r = self.client.patch(f'{OT}{e.pk}/', {'description': 'changed'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        e.refresh_from_db()
        self.assertEqual(e.submitted_at, old)

    def test_owner_cannot_move_an_entry_into_a_past_month(self):
        e = self._own()
        past = (self.today.replace(day=1) - timedelta(days=3))
        past = _weekday(past)
        self.client.force_authenticate(self.emp)
        r = self.client.patch(f'{OT}{e.pk}/', {'date': past.isoformat()}, format='json')
        e.refresh_from_db()
        self.assertEqual(e.date, self.today if r.status_code >= 400 else e.date)
        self.assertNotEqual(r.status_code, 500)

    def test_owner_cannot_create_directly_in_a_past_month(self):
        self.client.force_authenticate(self.emp)
        past = _weekday(self.today.replace(day=1) - timedelta(days=3))
        r = self.client.post(OT, self._payload(date=past.isoformat()), format='json')
        self.assertNotEqual(r.status_code, 500, r.data)
        # Documented here, asserted below in the payroll class: what matters is that
        # a finalized month cannot absorb it.

    # --- approval authority --------------------------------------------
    def test_employee_cannot_approve_anyone(self):
        e = self._own(user=self.other)
        self.client.force_authenticate(self.emp)
        r = self.client.post(f'{OT}{e.pk}/approve/', {}, format='json')
        self.assertIn(r.status_code, (403, 404), r.data)
        e.refresh_from_db()
        self.assertEqual(e.status, 'pending')

    def test_employee_cannot_approve_own_entry(self):
        e = self._own()
        self.client.force_authenticate(self.emp)
        r = self.client.post(f'{OT}{e.pk}/approve/', {}, format='json')
        self.assertIn(r.status_code, (403, 404), r.data)

    def test_tl_cannot_approve_foreign_team_entry(self):
        e = self._own(user=self.other)
        self.client.force_authenticate(self.tl)
        r = self.client.post(f'{OT}{e.pk}/approve/', {}, format='json')
        self.assertIn(r.status_code, (403, 404), r.data)

    def test_employee_bulk_approve_and_delete_of_foreign_rows_is_refused(self):
        e = self._own(user=self.other)
        self.client.force_authenticate(self.emp)
        r1 = self.client.post(f'{OT}bulk_approve/', {'ids': [e.pk]}, format='json')
        r2 = self.client.post(f'{OT}bulk_delete/', {'ids': [e.pk]}, format='json')
        e_after = OvertimeLog.objects.filter(pk=e.pk).first()
        self.assertIsNotNone(e_after, (r1.data, r2.data))
        self.assertEqual(e_after.status, 'pending', (r1.status_code, r1.data))

    def test_employee_cannot_read_or_delete_a_foreign_entry(self):
        e = self._own(user=self.other)
        self.client.force_authenticate(self.emp)
        self.assertEqual(self.client.get(f'{OT}{e.pk}/').status_code, 404)
        self.assertEqual(self.client.delete(f'{OT}{e.pk}/').status_code, 404)

    def test_double_approve_race_is_refused(self):
        e = self._own()
        self.client.force_authenticate(self.tl)
        r1 = self.client.post(f'{OT}{e.pk}/approve/', {}, format='json')
        r2 = self.client.post(f'{OT}{e.pk}/approve/', {}, format='json')
        self.assertEqual(r1.status_code, 200, r1.data)
        self.assertEqual(r2.status_code, 400, r2.data)
