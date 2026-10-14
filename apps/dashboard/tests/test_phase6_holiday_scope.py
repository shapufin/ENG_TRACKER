"""Phase 6 confirmation tests for holiday scoping (D-F1, D-F2)."""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday
from apps.users.models import Team

URL = '/api/dashboard/holidays/'


def _names(response):
    rows = response.data['results'] if isinstance(response.data, dict) else response.data
    return {row['name'] for row in rows}


class HolidayReadScopeTests(TestCase):
    """D-F1: holiday reads follow CalendarWorkspace.get_accessible_for_user."""

    def setUp(self):
        cache.clear()
        team = Team.objects.create(name='Hidden Team', code='HID')
        self.private_ws = CalendarWorkspace.objects.create(
            name='Hidden WS', code='hidden-ws', team=team, is_public=False,
        )
        self.public_ws = CalendarWorkspace.objects.create(
            name='Open WS', code='open-ws', is_public=True,
        )
        self.hidden = PublicHoliday.objects.create(
            name='Hidden Holiday', date='2026-03-01', calendar=self.private_ws,
        )
        self.open = PublicHoliday.objects.create(
            name='Open Holiday', date='2026-03-02', calendar=self.public_ws,
        )
        self.global_h = PublicHoliday.objects.create(
            name='Global Holiday', date='2026-03-03', is_global=True,
        )
        self.outsider = User.objects.create_user(username='d1-out', password='x')
        self.insider = User.objects.create_user(username='d1-in', password='x')
        self.private_ws.allowed_users.add(self.insider)
        self.admin = User.objects.create_user(username='d1-admin', password='x', is_staff=True)

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_list_hides_inaccessible_private_calendar(self):
        names = _names(self._client(self.outsider).get(URL))
        self.assertNotIn('Hidden Holiday', names)
        self.assertIn('Open Holiday', names)
        self.assertIn('Global Holiday', names)

    def test_retrieve_inaccessible_private_calendar_is_404(self):
        r = self._client(self.outsider).get(f'{URL}{self.hidden.id}/')
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_filter_by_inaccessible_calendar_returns_nothing(self):
        r = self._client(self.outsider).get(URL, {'calendar': self.private_ws.id})
        self.assertNotIn('Hidden Holiday', _names(r))

    def test_cache_does_not_leak_between_users(self):
        # Privileged user populates the cache first.
        self.assertIn('Hidden Holiday', _names(self._client(self.insider).get(URL)))
        self.assertNotIn('Hidden Holiday', _names(self._client(self.outsider).get(URL)))

    def test_staff_sees_everything(self):
        self.assertIn('Hidden Holiday', _names(self._client(self.admin).get(URL)))


class HolidayDetachScopeTests(TestCase):
    """D-F2: HR cannot detach a holiday from a workspace they cannot access."""

    def setUp(self):
        cache.clear()
        team = Team.objects.create(name='Priv Team', code='PRV')
        self.private_ws = CalendarWorkspace.objects.create(
            name='Priv WS', code='priv-ws', team=team, is_public=False,
        )
        self.holiday = PublicHoliday.objects.create(
            name='Priv Holiday', date='2026-04-01', calendar=self.private_ws,
        )
        self.hr = User.objects.create_user(username='d2-hr', password='x')
        self.hr.profile.is_hr_user = True
        self.hr.profile.save()
        self.client = APIClient()
        self.client.force_authenticate(self.hr)

    def test_hr_cannot_null_out_calendar_of_inaccessible_holiday(self):
        r = self.client.patch(f'{URL}{self.holiday.id}/', {'calendar': None}, format='json')
        self.assertIn(r.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.holiday.refresh_from_db()
        self.assertEqual(self.holiday.calendar_id, self.private_ws.id)
