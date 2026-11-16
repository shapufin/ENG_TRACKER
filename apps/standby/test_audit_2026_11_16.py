"""Standby audit 2026-11-16: F6 (times travel together on create) and F7 (model errors are ValidationErrors)."""
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.standby.models import StandbyLog
from core.utils.timezone_local import business_today


class StandbyCreateTimesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='f6_emp', password='x')
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def _post(self, **body):
        payload = {'date': business_today().isoformat(), 'hours': 4}
        payload.update(body)
        return self.api.post('/api/standby/logs/', payload, format='json')

    def test_start_time_alone_is_a_400(self):
        response = self._post(start_time='18:00:00')
        self.assertEqual(response.status_code, 400, response.content)

    def test_end_time_alone_is_a_400(self):
        response = self._post(end_time='09:00:00')
        self.assertEqual(response.status_code, 400, response.content)

    def test_both_times_still_create(self):
        response = self._post(start_time='09:00:00', end_time='13:00:00', hours=None)
        self.assertEqual(response.status_code, 201, response.content)

    def test_no_times_still_create(self):
        self.assertEqual(self._post().status_code, 201)


class StandbyModelSaveErrorTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='f7_emp', password='x')

    def test_zero_hours_raises_validation_error(self):
        with self.assertRaises(ValidationError):
            StandbyLog(user=self.user, date=date(2026, 3, 3), hours=0).save()

    def test_over_24_hours_raises_validation_error(self):
        with self.assertRaises(ValidationError):
            StandbyLog(user=self.user, date=date(2026, 3, 3), hours=25).save()


class WeeklyGeneratorRowsTests(TestCase):
    """The rows the weekly generator sends after the midnight split (item 63) all save."""

    def setUp(self):
        self.user = User.objects.create_user(username='f1_emp', password='x')
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        # Next Monday, so the whole week is in the future and in open periods.
        today = business_today()
        self.monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)

    def _row(self, offset, start, end):
        return {
            'date': (self.monday + timedelta(days=offset)).isoformat(),
            'start_time': start,
            'end_time': end,
            'hours': 1,
        }

    def _post(self, row):
        return self.api.post('/api/standby/logs/', row, format='json')

    def _week(self):
        rows = [self._row(0, '18:00', '00:00')]
        for day in range(1, 5):
            rows += [self._row(day, '00:00', '09:00'), self._row(day, '18:00', '00:00')]
        rows += [self._row(5, '00:00', '00:00'), self._row(6, '00:00', '00:00'), self._row(7, '00:00', '09:00')]
        return rows

    def test_the_whole_week_saves_and_adds_up_to_123_hours(self):
        rows = self._week()
        self.assertEqual(len(rows), 12)
        for row in rows:
            with self.subTest(row=row):
                self.assertEqual(self._post(row).status_code, 201)
        total = sum(StandbyLog.objects.filter(user=self.user).values_list('hours', flat=True))
        self.assertEqual(total, 123)

    def test_the_old_overnight_row_still_collides_with_a_24h_saturday(self):
        # The overlap rule is never loosened for the generator.
        self.assertEqual(self._post(self._row(4, '18:00', '09:00')).status_code, 201)
        response = self._post(self._row(5, '00:00', '00:00'))
        self.assertEqual(response.status_code, 400, response.content)


class UntimedDayCapTests(TestCase):
    """F5: untimed entries bypass the overlap rule, so their hours per user and day are capped at 24."""

    def setUp(self):
        self.user = User.objects.create_user(username='f5_emp', password='x')
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.day = business_today().isoformat()

    def _post(self, hours):
        return self.api.post('/api/standby/logs/', {'date': self.day, 'hours': hours}, format='json')

    def test_second_24h_untimed_entry_is_refused(self):
        self.assertEqual(self._post(24).status_code, 201)
        self.assertEqual(self._post(24).status_code, 400)

    def test_untimed_entries_up_to_24h_in_total_are_accepted(self):
        self.assertEqual(self._post(10).status_code, 201)
        self.assertEqual(self._post(14).status_code, 201)
        self.assertEqual(self._post(1).status_code, 400)

    def test_a_rejected_entry_does_not_count(self):
        self._post(24)
        StandbyLog.objects.filter(user=self.user).update(status='rejected')
        self.assertEqual(self._post(24).status_code, 201)

    def test_update_cannot_push_the_day_past_24h(self):
        self._post(10)
        self._post(10)
        second = StandbyLog.objects.filter(user=self.user).latest('id')
        response = self.api.patch(f'/api/standby/logs/{second.id}/', {'hours': 15}, format='json')
        self.assertEqual(response.status_code, 400, response.content)
        ok = self.api.patch(f'/api/standby/logs/{second.id}/', {'hours': 14}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)

    def test_other_users_and_days_are_independent(self):
        self._post(24)
        other = User.objects.create_user(username='f5_other', password='x')
        api = APIClient()
        api.force_authenticate(other)
        self.assertEqual(api.post('/api/standby/logs/', {'date': self.day, 'hours': 24}, format='json').status_code, 201)
