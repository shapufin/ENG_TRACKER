"""Adversarial simulation: finalized payroll and the monthly lock.

Each test states what a hostile or careless owner, staff member or superuser
must NOT be able to do once payroll is final or a month has passed.
"""
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.overtime.models import Client, OvertimeLog
from core.utils.timezone_local import business_today

OT = '/api/overtime/logs/'


def _weekday(d):
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


class FinalizedPayrollAbuseTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command
        from plugins.payroll.models import PayrollConfiguration, WageAssignment

        PayrollConfiguration.objects.update_or_create(
            pk=1, defaults={'require_tl_closed_before_finalize': False})
        call_command('seed_payroll_rules', verbosity=0)
        cls.admin = User.objects.create_superuser(username='sim_root', password='x')
        cls.staff = User.objects.create_user(username='sim_st', password='x', is_staff=True)
        cls.emp = User.objects.create_user(username='sim_pe', password='x')
        cls.client_obj = Client.objects.create(name='SimPC', code='SIMPC')
        WageAssignment.objects.create(
            user=cls.emp, gross_monthly_wage=Decimal('100000'),
            effective_from=date(2020, 1, 1), is_active=True)

    def setUp(self):
        from plugins.payroll.models import PayrollRun, PayrollRuleSet
        from plugins.payroll.services.payroll_service import generate_draft_run
        self.today = _weekday(business_today())
        self.period = self.today.replace(day=1)
        self.rules = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        self.e1 = OvertimeLog.objects.create(
            user=self.emp, client=self.client_obj, date=self.today, hours=1,
            start_time=time(18, 0), end_time=time(19, 0), status='approved',
            requested_processing_period=self.period)
        self.run = PayrollRun.objects.create(
            year=self.today.year, month=self.today.month, status='draft',
            rule_set=self.rules, created_by=self.admin)
        generate_draft_run(self.run, [self.emp])

    def _finalize(self):
        from plugins.payroll.services.payroll_service import finalize_run
        return finalize_run(self.run, self.admin)

    def _frozen(self):
        self.e1.refresh_from_db()
        return (self.e1.status, self.e1.hours, self.e1.start_time, self.e1.end_time, self.e1.date)

    def test_nobody_can_change_or_remove_a_finalized_entry(self):
        self._finalize()
        before = self._frozen()
        for who in (self.emp, self.staff, self.admin):
            self.client.force_authenticate(who)
            calls = (
                lambda: self.client.patch(f'{OT}{self.e1.pk}/', {'hours': 9, 'description': 'z'}, format='json'),
                lambda: self.client.patch(f'{OT}{self.e1.pk}/', {'start_time': '10:00', 'end_time': '14:00'}, format='json'),
                lambda: self.client.delete(f'{OT}{self.e1.pk}/'),
                lambda: self.client.post(f'{OT}bulk_delete/', {'ids': [self.e1.pk]}, format='json'),
                lambda: self.client.post(f'{OT}{self.e1.pk}/reject/', {'rejection_reason': 'x'}, format='json'),
            )
            for call in calls:
                r = call()
                self.assertNotEqual(r.status_code, 500, (who.username, r.data))
                self.assertNotIn(r.status_code, (200, 201, 204), (who.username, r.status_code))
                self.assertEqual(self._frozen(), before, who.username)

    def test_new_entry_in_the_same_paid_hour_never_changes_a_finalized_entry(self):
        self._finalize()
        before = self._frozen()
        self.client.force_authenticate(self.emp)
        self.client.post(OT, {'client': self.client_obj.pk, 'date': self.today.isoformat(),
                              'start_time': '18:10', 'end_time': '18:50', 'description': 'x'}, format='json')
        self.assertEqual(self._frozen(), before)

    def test_deleting_a_sibling_never_changes_a_finalized_entry(self):
        sib = OvertimeLog.objects.create(
            user=self.emp, client=self.client_obj, date=self.today, hours=1,
            start_time=time(18, 20), end_time=time(18, 50), status='pending')
        self._finalize()
        before = self._frozen()
        self.client.force_authenticate(self.emp)
        self.client.delete(f'{OT}{sib.pk}/')
        self.assertEqual(self._frozen(), before)

    def test_editing_a_drafted_entry_blocks_finalizing(self):
        self.client.force_authenticate(self.emp)
        r = self.client.patch(f'{OT}{self.e1.pk}/', {'description': 'tweak'}, format='json')
        self.e1.refresh_from_db()
        if r.status_code == 200:
            self.assertEqual(self.e1.status, 'pending')
            with self.assertRaises(ValidationError):
                self._finalize()

    def test_hours_tampered_after_drafting_blocks_finalizing(self):
        OvertimeLog.objects.filter(pk=self.e1.pk).update(hours=5)
        with self.assertRaises(ValidationError):
            self._finalize()

    def test_double_finalize_cancel_and_regenerate_after_finalize_are_refused(self):
        from plugins.payroll.services.payroll_service import cancel_run, generate_draft_run
        self._finalize()
        with self.assertRaises(ValidationError):
            self._finalize()
        with self.assertRaises(ValidationError):
            cancel_run(self.run, self.admin)
        try:
            generate_draft_run(self.run, [self.emp])
        except ValidationError:
            pass
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, 'finalized')
        self.assertEqual(self._frozen()[0], 'approved')

    def test_a_second_run_for_the_same_month_cannot_exist(self):
        from django.db import IntegrityError, transaction
        from plugins.payroll.models import PayrollRun
        self._finalize()
        with self.assertRaises(IntegrityError), transaction.atomic():
            PayrollRun.objects.create(
                year=self.today.year, month=self.today.month, status='draft',
                rule_set=self.rules, created_by=self.admin)

    def test_a_pending_entry_is_not_included_in_a_default_draft(self):
        from plugins.payroll.models import PayrollRunEntry
        from plugins.payroll.services.payroll_service import generate_draft_run
        pend = OvertimeLog.objects.create(
            user=self.emp, client=self.client_obj, date=self.today, hours=1,
            start_time=time(21, 0), end_time=time(22, 0), status='pending',
            requested_processing_period=self.period)
        generate_draft_run(self.run, [self.emp])
        self.assertFalse(
            PayrollRunEntry.objects.filter(source_id=pend.pk, source_kind='overtime').exists())


class MonthLockAbuseTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.root = User.objects.create_superuser(username='sim_ml_root', password='x')
        cls.staff = User.objects.create_user(username='sim_ml_st', password='x', is_staff=True)
        cls.emp = User.objects.create_user(username='sim_ml_e', password='x')
        cls.client_obj = Client.objects.create(name='SimML', code='SIMML')

    def setUp(self):
        self.past = _weekday(business_today().replace(day=1) - timedelta(days=5))

    def _past(self, status):
        return OvertimeLog.objects.create(
            user=self.emp, client=self.client_obj, date=self.past, hours=1,
            start_time=time(18, 0), end_time=time(19, 0), status=status)

    def test_owner_cannot_edit_or_delete_an_approved_past_month_entry(self):
        e = self._past('approved')
        self.client.force_authenticate(self.emp)
        self.assertEqual(
            self.client.patch(f'{OT}{e.pk}/?ignore_date_filter=true', {'description': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{OT}{e.pk}/?ignore_date_filter=true').status_code, 403)
        self.client.post(f'{OT}bulk_delete/', {'ids': [e.pk]}, format='json')
        self.assertTrue(OvertimeLog.objects.filter(pk=e.pk).exists())

    def test_plain_staff_cannot_delete_an_approved_past_month_entry(self):
        e = self._past('approved')
        self.client.force_authenticate(self.staff)
        # Personal endpoint is scoped to the owner, so 404; the admin_logs action is the staff door.
        self.assertIn(self.client.delete(f'{OT}{e.pk}/?ignore_date_filter=true').status_code, (403, 404))
        self.assertTrue(OvertimeLog.objects.filter(pk=e.pk).exists())

    def test_owner_may_delete_a_pending_past_month_entry(self):
        e = self._past('pending')
        self.client.force_authenticate(self.emp)
        self.assertEqual(self.client.delete(f'{OT}{e.pk}/?ignore_date_filter=true').status_code, 204)

    def test_back_dating_into_a_past_month_cannot_land_approved(self):
        self.client.force_authenticate(self.emp)
        r = self.client.post(OT, {'client': self.client_obj.pk, 'date': self.past.isoformat(),
                                  'start_time': '18:00', 'end_time': '19:00', 'description': 'x'},
                             format='json')
        self.assertNotEqual(r.status_code, 500, r.data)
        if r.status_code == 201:
            e = OvertimeLog.objects.get(pk=r.data['id'])
            self.assertEqual(e.status, 'pending')
            self.assertIsNone(e.approved_by_id)


class OtherModulesMassAssignmentTests(APITestCase):
    """Standby and leave must not let the requester pick their own status either."""

    @classmethod
    def setUpTestData(cls):
        cls.emp = User.objects.create_user(username='sim_ma_e', password='x')

    def setUp(self):
        self.today = _weekday(business_today())
        self.client.force_authenticate(self.emp)

    def test_standby_create_and_patch_cannot_set_status(self):
        from apps.standby.models import StandbyLog
        r = self.client.post('/api/standby/logs/', {
            'date': self.today.isoformat(), 'hours': 4, 'description': 'x',
            'status': 'approved'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        log = StandbyLog.objects.get(user=self.emp)
        self.assertEqual(log.status, 'pending')
        self.client.patch(f'/api/standby/logs/{log.pk}/', {'status': 'approved'}, format='json')
        log.refresh_from_db()
        self.assertEqual(log.status, 'pending')

    def test_leave_create_and_patch_cannot_set_status(self):
        from apps.leave_management.models import LeaveRequest
        day = self.today
        r = self.client.post('/api/leave-management/requests/', {
            'request_type': 'sick', 'start_date': day.isoformat(), 'end_date': day.isoformat(),
            'reason': 'x', 'status': 'approved'}, format='json')
        if r.status_code == 201:
            obj = LeaveRequest.objects.get(pk=r.data['id'])
            self.assertEqual(obj.status, 'pending')
            self.client.patch(f'/api/leave-management/requests/{obj.pk}/', {'status': 'approved'}, format='json')
            obj.refresh_from_db()
            self.assertEqual(obj.status, 'pending')

    def test_leave_owner_cannot_hand_a_request_to_another_user(self):
        from apps.leave_management.models import LeaveRequest
        victim = User.objects.create_user(username='sim_ma_v', password='x')
        r = self.client.post('/api/leave-management/requests/', {
            'request_type': 'sick', 'start_date': self.today.isoformat(),
            'end_date': self.today.isoformat(), 'reason': 'x'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        obj = LeaveRequest.objects.get(user=self.emp)
        self.client.patch(f'/api/leave-management/requests/{obj.pk}/', {'user': victim.pk}, format='json')
        obj.refresh_from_db()
        self.assertEqual(obj.user_id, self.emp.pk)
