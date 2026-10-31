"""The same holiday cannot be added twice in the same scope."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

URL = '/api/dashboard/holidays/'


class PublicHolidayDuplicateTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user('hol_staff', password='x', is_staff=True)
        self.client.force_authenticate(self.staff)
        self.payload = {'name': 'Independence Day', 'date': '2026-11-28', 'is_global': True}

    def test_a_second_identical_holiday_is_a_400(self):
        first = self.client.post(URL, self.payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post(URL, self.payload, format='json')
        self.assertEqual(second.status_code, 400, second.data)

    def test_a_different_date_is_allowed(self):
        self.client.post(URL, self.payload, format='json')
        other = dict(self.payload, date='2026-11-29')
        self.assertEqual(self.client.post(URL, other, format='json').status_code, 201)

    def test_editing_a_holiday_does_not_collide_with_itself(self):
        created = self.client.post(URL, self.payload, format='json').data
        res = self.client.patch(f"{URL}{created['id']}/", {'name': 'Renamed'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['name'], 'Renamed')
