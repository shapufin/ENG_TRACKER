"""Scorecard notifications: who is told, what the copy discloses, and that the
employee is never a recipient of an oversight event."""
from datetime import date

from django.test import TestCase
from django.utils import timezone

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from plugins.notifications.models import Notification, NotificationPreference

from . import signals
from .testing import make_user as _make_user
from .models import (
    Absence,
    HbprGovernanceEvidence,
    IdleFlag,
    Meeting,
    PIPRecord,
    PromotionFlag,
)


class ScorecardNotificationTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        signals.connect()  # idempotent (dispatch_uid); the plugin does this in ready()

    def setUp(self):
        for code in ('hbpr', 'italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.hbpr = _make_user('hbpr_n')
        assign_role(self.hbpr, 'hbpr')
        # The assigned Albanian TL (owns the records) + their report.
        self.tl = _make_user('tl_n')
        assign_role(self.tl, 'albanian_tl')
        self.emp = _make_user('emp_n', first_name='Giulia', last_name='Rossi')
        self.emp.profile.albanian_tl = self.tl
        self.emp.profile.save()
        HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )
        # An UNASSIGNED Albanian TL + their report: must never notify the HBPR.
        self.al_tl = _make_user('al_tl_n')
        assign_role(self.al_tl, 'albanian_tl')
        self.al_emp = _make_user('al_emp_n')
        self.al_emp.profile.albanian_tl = self.al_tl
        self.al_emp.profile.save()

    def _fire(self, fn):
        with self.captureOnCommitCallbacks(execute=True):
            return fn()

    def _titles(self, user):
        return list(Notification.objects.filter(user=user).values_list('title', flat=True))

    def _pip(self, employee=None, tl=None):
        return PIPRecord.objects.create(
            employee=employee or self.emp, tl=tl or self.tl, start_date=date.today())

    def test_new_pip_notifies_covering_hbpr_only(self):
        self._fire(self._pip)
        self.assertEqual(self._titles(self.hbpr), ['Improvement plan awaiting approval'])
        self.assertEqual(self._titles(self.tl), [])
        self.assertEqual(self._titles(self.emp), [])

    def test_out_of_scope_pip_notifies_no_hbpr(self):
        self._fire(lambda: self._pip(self.al_emp, self.al_tl))
        self.assertEqual(self._titles(self.hbpr), [])

    def test_copy_never_names_the_employee(self):
        self._fire(self._pip)
        note = Notification.objects.get(user=self.hbpr)
        self.assertNotIn('Giulia', note.title + note.message)
        self.assertNotIn('Rossi', note.title + note.message)

    def test_rolled_back_write_notifies_nobody(self):
        with self.captureOnCommitCallbacks(execute=False):
            self._pip()
        self.assertEqual(Notification.objects.count(), 0)

    def test_approval_tells_the_owning_tl(self):
        pip = self._fire(self._pip)
        pip.status = 'active'
        self._fire(pip.save)
        self.assertEqual(self._titles(self.tl), ['Improvement plan approved'])

    def test_return_tells_the_owning_tl(self):
        pip = self._fire(self._pip)
        pip.status = 'cancelled'
        self._fire(pip.save)
        self.assertEqual(self._titles(self.tl), ['Improvement plan returned'])

    def test_closing_an_active_pip_tells_the_hbpr(self):
        pip = self._fire(self._pip)
        pip.status = 'active'
        self._fire(pip.save)
        Notification.objects.all().delete()
        pip.status = 'completed'
        self._fire(pip.save)
        self.assertEqual(self._titles(self.hbpr), ['Improvement plan closed'])

    def test_unrelated_edit_does_not_renotify(self):
        pip = self._fire(self._pip)
        Notification.objects.all().delete()
        pip.notes = 'updated'
        self._fire(pip.save)
        self.assertEqual(Notification.objects.count(), 0)

    def test_flags_reach_hbpr_never_the_employee(self):
        self._fire(lambda: IdleFlag.objects.create(
            employee=self.emp, flagged_by=self.tl, flagged_on=date.today()))
        self._fire(lambda: Absence.objects.create(
            employee=self.emp, flagged_by=self.tl, absence_date=date.today()))
        self.assertEqual(len(self._titles(self.hbpr)), 2)
        self.assertEqual(self._titles(self.emp), [])
        links = set(Notification.objects.filter(user=self.hbpr).values_list('link', flat=True))
        self.assertEqual(links, {'/hbpr?view=records&kind=idle',
                                 '/hbpr?view=records&kind=absences'})

    def test_promotion_nomination_and_decision(self):
        promo = self._fire(lambda: PromotionFlag.objects.create(
            employee=self.emp, nominated_by=self.tl, nominated_on=date.today()))
        self.assertEqual(self._titles(self.hbpr), ['Promotion nomination to review'])
        self.assertEqual(self._titles(self.emp), [])
        promo.status = 'promoted'
        self._fire(promo.save)
        self.assertEqual(self._titles(self.tl), ['Promotion nomination decided'])
        self.assertEqual(self._titles(self.emp), [])

    def test_inactive_hbpr_is_not_notified(self):
        self.hbpr.is_active = False
        self.hbpr.save()
        self._fire(self._pip)
        self.assertEqual(Notification.objects.count(), 0)

    def test_push_is_off_by_default_but_in_app_is_on(self):
        from plugins.notifications.signals import _preference_enabled
        self.assertFalse(_preference_enabled(self.hbpr, 'scorecard_pip_pending', 'push'))
        self.assertTrue(_preference_enabled(self.hbpr, 'scorecard_pip_pending', 'in_app'))
        self.assertTrue(_preference_enabled(self.hbpr, 'own_leave_submitted', 'push'))

    def test_skip_flag_suppresses(self):
        pip = PIPRecord(employee=self.emp, tl=self.tl, start_date=date.today())
        pip._skip_notifications = True
        self._fire(pip.save)
        self.assertEqual(Notification.objects.count(), 0)

    def test_sharing_a_summary_tells_the_employee_only(self):
        meeting = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.emp,
            occurred_on=date.today(), notes='PRIVATE')
        self.assertEqual(Notification.objects.count(), 0)  # logging alone tells no one
        meeting.shared_summary = 'Agreed next steps'
        meeting.shared_at = timezone.now()
        self._fire(meeting.save)
        self.assertEqual(self._titles(self.emp), ['New item in your records'])
        note = Notification.objects.get(user=self.emp)
        self.assertEqual(note.link, '/my-records')
        self.assertNotIn('Agreed', note.message)
        self.assertEqual(self._titles(self.tl), [])
        self.assertEqual(self._titles(self.hbpr), [])

    def test_re_saving_a_shared_meeting_does_not_renotify(self):
        meeting = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.emp,
            occurred_on=date.today(), shared_summary='x', shared_at=timezone.now())
        self._fire(meeting.save)
        meeting.notes = 'edited'
        self._fire(meeting.save)
        self.assertEqual(Notification.objects.count(), 0)

    def test_team_meeting_share_has_no_one_to_tell(self):
        meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.tl, occurred_on=date.today())
        meeting.shared_at = timezone.now()
        self._fire(meeting.save)
        self.assertEqual(Notification.objects.count(), 0)

    def test_approving_a_pip_also_tells_the_employee(self):
        pip = self._fire(self._pip)
        pip.status = 'active'
        self._fire(pip.save)
        self.assertEqual(self._titles(self.emp), ['New item in your records'])

    def test_returned_draft_never_reaches_the_employee(self):
        pip = self._fire(self._pip)
        pip.status = 'cancelled'
        self._fire(pip.save)
        self.assertEqual(self._titles(self.emp), [])


class ScorecardPreferenceVisibilityTests(ScorecardNotificationTests):
    def _prefs(self, user):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from plugins.notifications.viewsets import NotificationViewSet
        request = APIRequestFactory().get('/x/')
        force_authenticate(request, user=user)
        data = NotificationViewSet.as_view({'get': 'preferences'})(request).data
        return {row['event_type']: row for row in data}

    def test_hbpr_sees_oversight_types_with_push_off(self):
        prefs = self._prefs(self.hbpr)
        # HBPR oversight events are grouped into user-facing preference keys.
        self.assertIn('hbpr_pip_promotion', prefs)
        self.assertFalse(prefs['hbpr_pip_promotion']['push_enabled'])
        self.assertNotIn('scorecard_pip_decided', prefs)  # TL-facing

    def test_tl_sees_decision_types_not_oversight(self):
        prefs = self._prefs(self.tl)
        self.assertIn('scorecard_pip_decided', prefs)
        self.assertNotIn('scorecard_pip_pending', prefs)

    def test_employee_sees_only_the_records_types(self):
        prefs = self._prefs(self.emp)
        self.assertEqual(
            {k for k in prefs if k.startswith('scorecard_')},
            {'scorecard_record_shared', 'scorecard_pip_started'},
        )


class OutOfScopeOwnerTests(ScorecardNotificationTests):
    def test_albanian_tl_flagging_an_italian_person_does_not_notify_hbpr(self):
        self._fire(lambda: IdleFlag.objects.create(
            employee=self.emp, flagged_by=self.al_tl, flagged_on=date.today()))
        self.assertEqual(self._titles(self.hbpr), [])

    def test_malformed_preference_event_type_is_a_400_not_a_500(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from plugins.notifications.viewsets import NotificationViewSet
        request = APIRequestFactory().patch('/x/', {'event_type': ['a']}, format='json')
        force_authenticate(request, user=self.hbpr)
        self.assertEqual(NotificationViewSet.as_view({'patch': 'preferences'})(request).status_code, 400)


class HbprGovernanceNotificationTests(TestCase):
    """The five grouped HBPR governance notifications."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        signals.connect()

    def setUp(self):
        for code in ('hbpr', 'albanian_tl', 'italian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.hbpr = _make_user('hbpr_gov')
        assign_role(self.hbpr, 'hbpr')
        self.tl = _make_user('tl_gov')
        assign_role(self.tl, 'albanian_tl')
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )
        self.other_hbpr = _make_user('other_hbpr_gov')
        assign_role(self.other_hbpr, 'hbpr')

    def _fire(self, fn):
        with self.captureOnCommitCallbacks(execute=True):
            return fn()

    def _titles(self, user):
        return list(Notification.objects.filter(user=user).values_list('title', flat=True))

    def _cadence(self, **overrides):
        data = {
            'assignment': self.assignment, 'kind': 'cadence_meeting',
            'occurred_on': date.today(), 'recorded_by': self.tl,
        }
        data.update(overrides)
        return self._fire(lambda: HbprGovernanceEvidence.objects.create(**data))

    def test_cadence_evidence_notifies_the_assigned_hbpr(self):
        self._cadence()
        self.assertEqual(self._titles(self.hbpr), ['A partnership meeting was recorded'])
        self.assertEqual(self._titles(self.other_hbpr), [])

    def test_epr_evidence_notifies_the_assigned_hbpr(self):
        self._cadence(kind='epr_mid_year', reporting_year=date.today().year)
        self.assertEqual(self._titles(self.hbpr), ['Your EPR participation was recorded'])

    def test_review_delivery_notifies_the_assigned_hbpr(self):
        from .models import ReviewDelivery

        self._fire(lambda: ReviewDelivery.objects.create(
            leader=self.tl, period='2026-01', recipient='Ops',
            delivered_on=date.today(),
        ))
        self.assertEqual(self._titles(self.hbpr), ['A review was delivered'])

    def test_disabling_the_group_suppresses_the_notification(self):
        NotificationPreference.objects.create(
            user=self.hbpr, event_type='hbpr_meetings', in_app_enabled=False,
        )
        self._cadence()
        self.assertEqual(self._titles(self.hbpr), [])

    def test_group_toggle_covers_every_member_event(self):
        # `hbpr_pip_promotion` covers both PIP and promotion events.
        NotificationPreference.objects.create(
            user=self.hbpr, event_type='hbpr_pip_promotion', in_app_enabled=False,
        )
        self._fire(lambda: PromotionFlag.objects.create(
            employee=self._make_member(), nominated_by=self.tl,
            nominated_on=date.today(),
        ))
        self.assertEqual(self._titles(self.hbpr), [])

    def _make_member(self):
        member = _make_user('gov_member')
        member.profile.albanian_tl = self.tl
        member.profile.save()
        return member

    def test_available_groups_for_hbpr_only(self):
        from plugins.notifications.viewsets import NotificationViewSet

        available = NotificationViewSet()._available_event_types(self.hbpr)
        for group in (
            'hbpr_meetings', 'hbpr_epr', 'hbpr_pip_promotion',
            'hbpr_team_risks', 'hbpr_record_updates',
        ):
            self.assertIn(group, available)
        # An HBPR-only user gets no employee own/team categories.
        self.assertNotIn('own_leave_submitted', available)
        self.assertNotIn('team_action_required', available)

    def test_employee_keeps_own_categories_and_no_hbpr_groups(self):
        from plugins.notifications.viewsets import NotificationViewSet

        employee = _make_user('plain_gov')
        available = NotificationViewSet()._available_event_types(employee)
        self.assertIn('own_leave_submitted', available)
        self.assertNotIn('hbpr_meetings', available)
