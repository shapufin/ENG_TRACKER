"""Superuser override: erase a user who has business records (audit 2026-11-14, item 83).

Preview first, then a typed confirmation with a reason. Payroll and evidence rows
(PROTECT) and closed years are never erased; every erase is audited and announced.
"""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.reports.models import AuditLog
from apps.users.models import ClosedYear
from apps.users.services.approval_periods import clear_closed_year_cache
from apps.users.services.user_deletion import user_erased


def _url(user):
    return f'/api/users/users/{user.id}/erase/'


class UserEraseTests(TestCase):
    def setUp(self):
        self.root = User.objects.create_user(
            username='ue-root', password='x', is_staff=True, is_superuser=True)
        self.api = APIClient()
        self.api.force_authenticate(self.root)
        self.target = User.objects.create_user(username='ue-target', password='x', is_active=False)
        self.client_row = Client.objects.create(name='UE Client', code='UEC')
        self.log = OvertimeLog.objects.create(
            user=self.target, client=self.client_row, date=date(2026, 11, 3), hours=1, description='x',
        )
        self.body = {'confirm': 'ERASE ue-target', 'reason': 'Duplicate account created by mistake'}

    def test_staff_who_is_not_superuser_is_refused(self):
        staff = User.objects.create_user(username='ue-staff', password='x', is_staff=True)
        api = APIClient()
        api.force_authenticate(staff)
        self.assertEqual(api.get(_url(self.target)).status_code, 403)
        self.assertEqual(api.post(_url(self.target), self.body, format='json').status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.target.pk).exists())

    def test_preview_lists_what_would_be_destroyed_and_changes_nothing(self):
        resp = self.api.get(_url(self.target))
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['can_erase'])
        self.assertEqual(resp.data['will_delete']['overtime.OvertimeLog'], 1)
        self.assertEqual(resp.data['confirm_phrase'], 'ERASE ue-target')
        self.assertTrue(OvertimeLog.objects.filter(pk=self.log.pk).exists())

    def test_erase_needs_the_typed_phrase_and_a_reason(self):
        for body in (
            {'confirm': 'ERASE someone-else', 'reason': self.body['reason']},
            {'confirm': self.body['confirm'], 'reason': 'short'},
            {},
        ):
            resp = self.api.post(_url(self.target), body, format='json')
            self.assertEqual(resp.status_code, 400, body)
        self.assertTrue(User.objects.filter(pk=self.target.pk).exists())

    def test_erase_deletes_audits_and_announces(self):
        member = User.objects.create_user(username='ue-member', password='x')
        member.profile.italian_tl = self.target
        member.profile.save()
        heard = []
        receiver = lambda sender, **kw: heard.append(kw)  # noqa: E731
        user_erased.connect(receiver)
        self.addCleanup(user_erased.disconnect, receiver)

        with self.captureOnCommitCallbacks(execute=True):
            resp = self.api.post(_url(self.target), self.body, format='json')

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(User.objects.filter(pk=self.target.pk).exists())
        self.assertFalse(OvertimeLog.objects.filter(pk=self.log.pk).exists())
        member.profile.refresh_from_db()
        self.assertIsNone(member.profile.italian_tl_id)
        row = AuditLog.objects.get(extra_data__operation='user_erased')
        self.assertEqual(row.user_id, self.root.id)
        self.assertEqual(row.extra_data['reason'], self.body['reason'])
        self.assertEqual(row.extra_data['will_delete']['overtime.OvertimeLog'], 1)
        self.assertEqual(len(heard), 1)
        self.assertEqual(heard[0]['username'], 'ue-target')
        self.assertEqual(heard[0]['actor_id'], self.root.id)

    def test_an_active_user_must_be_deactivated_first(self):
        User.objects.filter(pk=self.target.pk).update(is_active=True)
        self.assertFalse(self.api.get(_url(self.target)).data['can_erase'])
        resp = self.api.post(_url(self.target), self.body, format='json')
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertTrue(User.objects.filter(pk=self.target.pk).exists())

    def test_nobody_erases_themselves(self):
        resp = self.api.post(
            _url(self.root), {'confirm': 'ERASE ue-root', 'reason': self.body['reason']}, format='json')
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertTrue(User.objects.filter(pk=self.root.pk).exists())

    def test_a_closed_year_is_never_erased(self):
        ClosedYear.objects.create(year=2026, closed_at=timezone.now())
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        preview = self.api.get(_url(self.target)).data
        self.assertFalse(preview['can_erase'])
        self.assertEqual(preview['closed_years'], [2026])
        resp = self.api.post(_url(self.target), self.body, format='json')
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertTrue(OvertimeLog.objects.filter(pk=self.log.pk).exists())

    def test_payroll_rows_are_never_erased(self):
        from plugins.payroll.models import PayrollLine, PayrollRuleSet, PayrollRun

        rule_set = PayrollRuleSet.objects.create(
            name='UE', country='AL', tax_profile='standard',
            effective_from=date(2020, 1, 1), is_active=True)
        run = PayrollRun.objects.create(year=2026, month=1, status='draft', rule_set=rule_set)
        PayrollLine.objects.create(user=self.target, run=run)
        preview = self.api.get(_url(self.target)).data
        self.assertFalse(preview['can_erase'])
        self.assertEqual(preview['protected'], {'payroll.PayrollLine': 1})
        resp = self.api.post(_url(self.target), self.body, format='json')
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertTrue(User.objects.filter(pk=self.target.pk).exists())

    def test_records_about_other_people_need_their_own_acknowledgement(self):
        from plugins.tl_scorecard.models import Absence

        other = User.objects.create_user(username='ue-other', password='x')
        Absence.objects.create(
            employee=other, flagged_by=self.target, absence_date=date(2026, 11, 3), reason='x')

        preview = self.api.get(_url(self.target)).data
        self.assertEqual(preview['about_other_people'], {'tl_scorecard.Absence': 1})
        resp = self.api.post(_url(self.target), self.body, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertTrue(Absence.objects.exists())

        resp = self.api.post(
            _url(self.target), {**self.body, 'acknowledge_other_people_records': True}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(User.objects.filter(pk=self.target.pk).exists())
