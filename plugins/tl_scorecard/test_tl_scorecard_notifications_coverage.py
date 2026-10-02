"""HBPR governance notification triggers beyond first-time evidence: assignment
lifecycle, meaningful edits, resolved flags, EPR stages and non-one-on-one
meeting changes. Employee one-on-ones never notify anyone."""
from datetime import date

from django.contrib.auth.models import User
from django.db import transaction
from django.test import TestCase
from django.utils import timezone

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models.core import UserProfile
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from plugins.notifications.models import Notification

from . import signals
from .models import Absence, EPRCycle, HbprGovernanceEvidence, IdleFlag, Meeting


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class HbprGovernanceCoverageNotificationTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        signals.connect()

    def setUp(self):
        for code in ('hbpr', 'albanian_tl', 'italian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.hbpr = _make_user('hbpr_cov')
        assign_role(self.hbpr, 'hbpr')
        self.other_hbpr = _make_user('other_hbpr_cov')
        assign_role(self.other_hbpr, 'hbpr')
        self.tl = _make_user('tl_cov')
        assign_role(self.tl, 'albanian_tl')
        self.emp = _make_user('emp_cov')
        self.emp.profile.albanian_tl = self.tl
        self.emp.profile.save()
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )

    def _fire(self, fn):
        with self.captureOnCommitCallbacks(execute=True):
            return fn()

    def _titles(self, user):
        return list(Notification.objects.filter(user=user).values_list('title', flat=True))

    # --- assignment lifecycle -------------------------------------------
    def test_new_assignment_notifies_the_new_hbpr_only(self):
        tl2 = _make_user('tl2_cov')
        assign_role(tl2, 'albanian_tl')
        self._fire(lambda: HbprAlbanianTlAssignment.objects.create(
            hbpr=self.other_hbpr, albanian_tl=tl2,
            cadence='monthly', effective_from=date(2020, 1, 1),
        ))
        self.assertEqual(self._titles(self.other_hbpr), ['A team leader was assigned to you'])
        self.assertEqual(self._titles(self.hbpr), [])

    def test_ending_an_assignment_notifies_the_hbpr_once(self):
        def end():
            self.assignment.effective_to = date(2026, 1, 1)
            self.assignment.save()

        self._fire(end)
        self.assertEqual(self._titles(self.hbpr), ['A team leader assignment ended'])
        self._fire(self.assignment.save)  # unrelated re-save
        self.assertEqual(len(self._titles(self.hbpr)), 1)

    # --- evidence edits ---------------------------------------------------
    def _evidence(self):
        return HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=date.today(), recorded_by=self.tl, shared_summary='v1',
        )

    def test_meaningful_evidence_edit_notifies_again(self):
        row = self._fire(self._evidence)
        Notification.objects.all().delete()

        def edit():
            row.shared_summary = 'v2'
            row.updated_by = self.tl
            row.save()

        self._fire(edit)
        self.assertEqual(self._titles(self.hbpr), ['A partnership meeting was updated'])

    def test_non_meaningful_evidence_save_does_not_renotify(self):
        row = self._fire(self._evidence)
        Notification.objects.all().delete()

        def touch():
            row.updated_by = self.tl
            row.save()

        self._fire(touch)
        self.assertEqual(self._titles(self.hbpr), [])

    def test_epr_evidence_edit_notifies_under_the_epr_group(self):
        row = self._fire(lambda: HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='epr_mid_year', reporting_year=2026,
            occurred_on=date.today(), recorded_by=self.tl,
        ))
        Notification.objects.all().delete()

        def edit():
            row.action_items = 'Follow up'
            row.save()

        self._fire(edit)
        self.assertEqual(self._titles(self.hbpr), ['Your EPR participation was updated'])

    # --- resolved flags ---------------------------------------------------
    def test_resolving_an_idle_flag_notifies_hbpr_never_the_employee(self):
        flag = self._fire(lambda: IdleFlag.objects.create(
            employee=self.emp, flagged_by=self.tl, flagged_on=date.today()))
        Notification.objects.all().delete()

        def resolve():
            flag.status = 'resolved'
            flag.resolved_on = date.today()
            flag.save()

        self._fire(resolve)
        self.assertEqual(self._titles(self.hbpr), ['A flag was resolved'])
        self.assertEqual(self._titles(self.emp), [])

    def test_addressing_an_absence_notifies_hbpr_once(self):
        absence = self._fire(lambda: Absence.objects.create(
            employee=self.emp, flagged_by=self.tl, absence_date=date.today()))
        Notification.objects.all().delete()

        def address():
            absence.addressed_on = date.today()
            absence.save()

        self._fire(address)
        self.assertEqual(self._titles(self.hbpr), ['A flag was resolved'])
        self._fire(absence.save)
        self.assertEqual(len(self._titles(self.hbpr)), 1)

    # --- employee EPR stage ----------------------------------------------
    def test_epr_stage_completion_notifies_hbpr(self):
        cycle = self._fire(lambda: EPRCycle.objects.create(user=self.emp, year=2026))
        self.assertEqual(self._titles(self.hbpr), [])

        def complete():
            cycle.mid_year_completed_at = timezone.now()
            cycle.save()

        self._fire(complete)
        self.assertEqual(self._titles(self.hbpr), ['An EPR stage was completed'])
        self._fire(cycle.save)
        self.assertEqual(len(self._titles(self.hbpr)), 1)

    # --- meetings ---------------------------------------------------------
    def test_team_meeting_create_and_edit_notify_hbpr(self):
        meeting = self._fire(lambda: Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.tl, occurred_on=date.today()))
        self.assertEqual(self._titles(self.hbpr), ['A governance meeting was updated'])

        def reschedule():
            meeting.occurred_on = date(2026, 1, 2)
            meeting.save()

        self._fire(reschedule)
        self.assertEqual(len(self._titles(self.hbpr)), 2)
        self._fire(meeting.save)
        self.assertEqual(len(self._titles(self.hbpr)), 2)

    def test_one_on_one_never_notifies_hbpr(self):
        meeting = self._fire(lambda: Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.emp,
            occurred_on=date.today()))

        def reschedule():
            meeting.occurred_on = date(2026, 1, 2)
            meeting.shared_summary = 'x'
            meeting.shared_at = timezone.now()
            meeting.save()

        self._fire(reschedule)
        self.assertEqual(self._titles(self.hbpr), [])
        self.assertEqual(self._titles(self.other_hbpr), [])

    def test_unassigned_tl_meeting_notifies_nobody(self):
        stray = _make_user('stray_cov')
        assign_role(stray, 'albanian_tl')
        self._fire(lambda: Meeting.objects.create(
            meeting_type='team_meeting', organizer=stray, occurred_on=date.today()))
        self.assertEqual(self._titles(self.hbpr), [])
        self.assertEqual(self._titles(self.other_hbpr), [])

    def test_rollback_notifies_nobody(self):
        class Boom(Exception):
            pass

        try:
            with self.captureOnCommitCallbacks(execute=True):
                with transaction.atomic():
                    Meeting.objects.create(
                        meeting_type='team_meeting', organizer=self.tl,
                        occurred_on=date.today())
                    raise Boom
        except Boom:
            pass
        self.assertEqual(self._titles(self.hbpr), [])
