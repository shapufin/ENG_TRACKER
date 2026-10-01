"""Scorecard notifications: who is told, what the copy discloses, and that the
employee is never a recipient of an oversight event."""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models.core import UserProfile
from plugins.notifications.models import Notification

from . import signals
from .models import Absence, IdleFlag, Meeting, PIPRecord, PromotionFlag


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


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
        self.tl = _make_user('tl_n')
        assign_role(self.tl, 'italian_tl')
        self.emp = _make_user('emp_n', first_name='Giulia', last_name='Rossi')
        self.emp.profile.italian_tl = self.tl
        self.emp.profile.save()
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
        self.assertEqual(links, {'/tl-scorecard?tab=records&kind=idle',
                                 '/tl-scorecard?tab=records&kind=absences'})

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
        self.assertIn('scorecard_pip_pending', prefs)
        self.assertFalse(prefs['scorecard_pip_pending']['push_enabled'])
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
