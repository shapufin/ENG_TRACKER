"""A standby pattern belongs to one user: nobody else reads, edits, deletes or links it."""
from datetime import date, time

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import StandbyLog, StandbyPattern


class StandbyPatternScopeTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='sp_owner', password='x')
        self.other = User.objects.create_user(username='sp_other', password='x')
        self.staff = User.objects.create_user(username='sp_staff', password='x', is_staff=True)
        self.pattern = StandbyPattern.objects.create(
            name='Owner on-call', user=self.owner, recurrence_type='weekly',
            start_time=time(20, 0), end_time=time(23, 0), valid_from=date.today(),
        )
        self.url = f'/api/standby/patterns/{self.pattern.id}/'

    def _as(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_another_employee_cannot_read_the_pattern(self):
        client = self._as(self.other)
        self.assertEqual(client.get(self.url).status_code, status.HTTP_404_NOT_FOUND)
        listed = client.get('/api/standby/patterns/').data
        self.assertEqual(listed['count'], 0)

    def test_another_employee_cannot_edit_or_delete_the_pattern(self):
        client = self._as(self.other)
        self.assertEqual(client.patch(self.url, {'name': 'HIJACKED'}).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(client.delete(self.url).status_code, status.HTTP_404_NOT_FOUND)
        self.pattern.refresh_from_db()
        self.assertEqual(self.pattern.name, 'Owner on-call')
        self.assertFalse(self.pattern.is_deleted)

    def test_the_owner_reads_and_edits_their_pattern(self):
        client = self._as(self.owner)
        self.assertEqual(client.get(self.url).status_code, status.HTTP_200_OK)
        self.assertEqual(client.patch(self.url, {'name': 'Renamed'}).status_code, status.HTTP_200_OK)

    def test_staff_still_sees_every_pattern(self):
        client = self._as(self.staff)
        self.assertEqual(client.get(self.url).status_code, status.HTTP_200_OK)
        self.assertEqual(client.get('/api/standby/patterns/').data['count'], 1)

    def test_an_employee_cannot_log_standby_against_someone_elses_pattern(self):
        response = self._as(self.other).post('/api/standby/logs/', {
            'date': date.today().isoformat(), 'start_time': '10:00', 'end_time': '11:00',
            'description': 'borrowed', 'pattern': self.pattern.id,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(StandbyLog.objects.filter(user=self.other).exists())

    def test_the_owner_can_log_against_their_own_pattern(self):
        response = self._as(self.owner).post('/api/standby/logs/', {
            'date': date.today().isoformat(), 'start_time': '10:00', 'end_time': '11:00',
            'description': 'mine', 'pattern': self.pattern.id,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
