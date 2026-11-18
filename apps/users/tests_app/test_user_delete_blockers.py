"""A user with business records is deactivated, never deleted (audit 2026-11-14, C1).

Deleting a ``User`` cascades over every CASCADE relation: the person's own requests and
records a leader wrote about other people. Both delete paths refuse while any such row exists.
"""
from datetime import date

from django.contrib.auth.models import User
from django.db import models
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.users.services.user_deletion import HOUSEKEEPING_MODELS, user_delete_blockers

BULK_URL = '/api/users/users/bulk_delete/'


def _cascade_labels():
    return {
        rel.related_model._meta.label
        for rel in User._meta.related_objects
        if getattr(rel, 'on_delete', None) is models.CASCADE
    }


class UserDeleteBlockerTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='udb-admin', password='x', is_staff=True)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.employee = User.objects.create_user(username='udb-employee', password='x')
        client = Client.objects.create(name='UDB Client', code='UDB')
        self.log = OvertimeLog.objects.create(
            user=self.employee, client=client, date=date(2026, 11, 2), hours=2, description='kept',
        )

    def test_helper_counts_business_rows_and_ignores_housekeeping(self):
        self.assertEqual(user_delete_blockers(self.employee), {'overtime.OvertimeLog': 1})
        blank = User.objects.create_user(username='udb-blank', password='x')
        self.assertEqual(user_delete_blockers(blank), {})

    def test_passkeys_are_housekeeping_and_never_block_a_delete(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.users.models import WebAuthnChallenge, WebAuthnCredential

        blank = User.objects.create_user(username='udb-passkey', password='x')
        WebAuthnCredential.objects.create(
            user=blank, credential_id=b'udb-1', public_key=b'pk', sign_count=0, name='Phone',
        )
        WebAuthnChallenge.objects.create(
            user=blank, purpose='login', challenge=b'c', expires_at=timezone.now() + timedelta(seconds=60),
        )
        self.assertEqual(user_delete_blockers(blank), {})

    def test_single_delete_is_refused_and_keeps_the_rows(self):
        resp = self.api.delete(f'/api/users/users/{self.employee.id}/')
        self.assertEqual(resp.status_code, 409, getattr(resp, 'data', None))
        self.assertEqual(resp.data['blockers'], {'overtime.OvertimeLog': 1})
        self.assertIn('Deactivate the user instead', resp.data['detail'])
        self.assertTrue(User.objects.filter(pk=self.employee.id).exists())
        self.assertTrue(OvertimeLog.objects.filter(pk=self.log.pk).exists())

    def test_bulk_delete_is_refused_and_keeps_leader_references(self):
        member = User.objects.create_user(username='udb-member', password='x')
        member.profile.italian_tl = self.employee
        member.profile.save()

        resp = self.api.post(BULK_URL, {'ids': [self.employee.id]}, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['deleted_count'], 0)
        failed = resp.data['failed_users'][0]
        self.assertEqual(failed['blockers'], {'overtime.OvertimeLog': 1})
        self.assertIn('Deactivate the user instead', failed['reason'])
        member.profile.refresh_from_db()
        self.assertEqual(member.profile.italian_tl_id, self.employee.id)
        self.assertTrue(OvertimeLog.objects.filter(pk=self.log.pk).exists())

    def test_a_user_with_no_business_rows_is_still_deleted(self):
        blank = User.objects.create_user(username='udb-mistake', password='x')
        self.assertEqual(self.api.delete(f'/api/users/users/{blank.id}/').status_code, 204)
        other = User.objects.create_user(username='udb-mistake-2', password='x')
        resp = self.api.post(BULK_URL, {'ids': [other.id]}, format='json')
        self.assertEqual(resp.data['deleted_count'], 1)


class HousekeepingAllowListTests(TestCase):
    """The allow-list is closed by default: a new CASCADE relation to User blocks a delete
    until someone decides its rows are safe to lose."""

    def test_allow_list_names_only_real_cascade_relations(self):
        self.assertEqual(HOUSEKEEPING_MODELS - _cascade_labels(), set())

    def test_history_and_leader_authored_records_are_never_housekeeping(self):
        kept = {
            'overtime.OvertimeLog', 'standby.StandbyLog', 'leave_management.LeaveRequest',
            'payroll.WageAssignment', 'engagement.TLApprovalMetric',
            'tl_scorecard.PIPRecord', 'tl_scorecard.Meeting', 'tl_scorecard.Absence',
            'tl_scorecard.IdleFlag', 'tl_scorecard.PromotionFlag', 'tl_scorecard.ReviewDelivery',
            'tl_scorecard.ScorecardMonthSnapshot', 'tl_scorecard.EPRCycle',
            'users.ApprovalPeriodCloseMember', 'ticket_kpi.MonthlyKPI', 'ticket_kpi.KPIEvidence',
        }
        self.assertEqual(kept & HOUSEKEEPING_MODELS, set())
        self.assertEqual(kept - _cascade_labels(), set(), 'a listed model no longer cascades from User')
