"""The hourly job tells a Line Manager which 1-on-1s are due or overdue (never the HBPR)."""
from datetime import date

from django.test import TestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from plugins.notifications.models import Notification

from . import signals
from .models import OneOnOnePlan
from .one_on_one import process_one_on_one_reminders
from .testing import make_user


class OneOnOneReminderTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        signals.connect()

    def setUp(self):
        for code in ('albanian_tl', 'hbpr'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.lm = make_user('oo_rem_lm')
        assign_role(self.lm, 'albanian_tl')
        self.emp = make_user('oo_rem_emp')
        self.emp.profile.albanian_tl = self.lm
        self.emp.profile.save()
        self.hbpr = make_user('oo_rem_hbpr')
        assign_role(self.hbpr, 'hbpr')
        # Monday 2026-11-16; first Wednesday slot is the 18th.
        OneOnOnePlan.objects.create(
            leader=self.lm, employee=self.emp, cadence='weekly',
            cadence_day_of_week=2, effective_from=date(2026, 11, 16),
        )

    def _run(self, today):
        with self.captureOnCommitCallbacks(execute=True):
            return process_one_on_one_reminders(today=today)

    def test_nothing_before_the_slot(self):
        self.assertEqual(self._run(date(2026, 11, 17)), 0)
        self.assertEqual(Notification.objects.count(), 0)

    def test_the_leader_is_told_once_per_week_not_every_hour(self):
        self.assertEqual(self._run(date(2026, 11, 18)), 1)
        self._run(date(2026, 11, 18))
        self._run(date(2026, 11, 19))  # overdue, same ISO week
        self.assertEqual(Notification.objects.filter(user=self.lm).count(), 1)

    def test_the_hbpr_never_hears_about_a_one_on_one(self):
        self._run(date(2026, 11, 20))
        self.assertEqual(Notification.objects.filter(user=self.hbpr).count(), 0)

    def test_the_message_carries_a_count_not_names_or_reasons(self):
        self._run(date(2026, 11, 18))
        note = Notification.objects.get(user=self.lm)
        self.assertNotIn('oo_rem_emp', note.message)

    def test_a_plan_for_someone_who_left_the_team_never_nags_the_old_leader(self):
        self.emp.profile.albanian_tl = None
        self.emp.profile.save()
        self.assertEqual(self._run(date(2026, 11, 20)), 0)
        self.assertEqual(Notification.objects.filter(user=self.lm).count(), 0)
