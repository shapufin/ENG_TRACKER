"""The employee's read-only view of records about them: PIP, EPR, 1-on-1s only,
whitelisted fields, never another person's data, never TL-private text."""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.users.models.core import UserProfile

from .models import Absence, EPRCycle, EPRGoal, IdleFlag, Meeting, PIPRecord, PromotionFlag
from .viewsets_my_records import MyRecordsViewSet


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class MyRecordsTests(TestCase):
    def setUp(self):
        self.tl = _make_user('tl_mr', first_name='Tina', last_name='Lead')
        self.emp = _make_user('emp_mr')
        self.other = _make_user('other_mr')
        today = date.today()

        self.shared = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.emp, occurred_on=today,
            notes='PRIVATE tl notes', shared_summary='Agreed to pair on reviews', shared_at=timezone.now())
        self.unshared = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.emp, occurred_on=today,
            notes='PRIVATE other notes')
        Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.other, occurred_on=today,
            notes='someone else', shared_summary='not mine', shared_at=timezone.now())
        Meeting.objects.create(
            meeting_type='tl_sync', organizer=self.tl, counterparty=self.emp, occurred_on=today)

        self.draft_pip = PIPRecord.objects.create(
            employee=self.emp, tl=self.tl, start_date=today, notes='PRIVATE pip evidence')
        self.active_pip = PIPRecord.objects.create(
            employee=self.emp, tl=self.tl, start_date=today, status='active',
            approved_at=timezone.now(), notes='PRIVATE evidence 2', shared_notes='Focus on code review')
        PIPRecord.objects.create(employee=self.other, tl=self.tl, start_date=today, status='active',
                                 approved_at=timezone.now())

        cycle = EPRCycle.objects.create(user=self.emp, year=today.year)
        EPRGoal.objects.create(cycle=cycle, description='Ship the importer')
        EPRCycle.objects.create(user=self.other, year=today.year)

        PromotionFlag.objects.create(employee=self.emp, nominated_by=self.tl, nominated_on=today,
                                     notes='PRIVATE promo')
        IdleFlag.objects.create(employee=self.emp, flagged_by=self.tl, flagged_on=today)
        Absence.objects.create(employee=self.emp, flagged_by=self.tl, absence_date=today)

    def _get(self, user):
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=user)
        return MyRecordsViewSet.as_view({'get': 'list'})(request)

    def test_requires_login(self):
        request = APIRequestFactory().get('/x/')
        self.assertIn(MyRecordsViewSet.as_view({'get': 'list'})(request).status_code, (401, 403))

    def test_hbpr_only_user_is_denied(self):
        """My Records is denied for HBPR-only identities (approved decision 13).

        It is a self-service surface with no plugin grant, so the denial comes
        from `HbprBlockedMixin`, not from a permission manifest.
        """
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role

        Role.objects.get_or_create(code='hbpr', defaults={'name': 'hbpr'})
        hbpr = _make_user('hbpr_mr')
        assign_role(hbpr, 'hbpr')
        self.assertEqual(self._get(hbpr).status_code, 403)

    def test_multi_role_user_keeps_my_records(self):
        # HBPR+HR keeps the non-HBPR role's access; the block is HBPR-only.
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role

        Role.objects.get_or_create(code='hr', defaults={'name': 'hr'})
        multi = _make_user('hbpr_hr_mr')
        assign_role(multi, 'hbpr')
        assign_role(multi, 'hr')
        self.assertEqual(self._get(multi).status_code, 200)

    def test_shows_only_shared_one_on_ones_about_me(self):
        data = self._get(self.emp).data
        self.assertEqual(len(data['one_on_ones']), 1)
        row = data['one_on_ones'][0]
        self.assertEqual(row['summary'], 'Agreed to pair on reviews')
        self.assertEqual(set(row), {'id', 'occurred_on', 'with_name', 'summary'})
        self.assertEqual(row['with_name'], 'Tina Lead')

    def test_unshared_and_other_peoples_meetings_never_appear(self):
        text = str(self._get(self.emp).data)
        for leaked in ('PRIVATE', 'not mine', 'someone else'):
            self.assertNotIn(leaked, text)

    def test_pip_visible_only_after_approval_with_shared_notes_only(self):
        pips = self._get(self.emp).data['pips']
        self.assertEqual(len(pips), 1)
        self.assertEqual(set(pips[0]), {'id', 'status', 'start_date', 'closed_on', 'shared_notes'})
        self.assertEqual(pips[0]['status'], 'active')
        self.assertEqual(pips[0]['shared_notes'], 'Focus on code review')

    def test_returned_draft_is_never_shown(self):
        PIPRecord.objects.filter(pk=self.draft_pip.pk).update(status='cancelled')
        self.assertEqual(len(self._get(self.emp).data['pips']), 1)

    def test_epr_is_mine_with_goals(self):
        cycles = self._get(self.emp).data['epr_cycles']
        self.assertEqual(len(cycles), 1)
        self.assertEqual([g['description'] for g in cycles[0]['goals']], ['Ship the importer'])
        self.assertEqual(
            set(cycles[0]),
            {'id', 'year', 'goal_setting_completed_at', 'mid_year_completed_at',
             'final_review_completed_at', 'goals'},
        )

    def test_nothing_else_is_ever_exposed(self):
        self.assertEqual(set(self._get(self.emp).data), {'one_on_ones', 'pips', 'epr_cycles'})

    def test_a_user_with_no_records_gets_empty_lists(self):
        stranger = _make_user('stranger_mr')
        self.assertEqual(
            self._get(stranger).data, {'one_on_ones': [], 'pips': [], 'epr_cycles': []})
