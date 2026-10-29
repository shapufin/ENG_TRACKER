"""HR narrows the admin leave list by the employee's assigned TL."""
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.leave_management.models import LeaveRequest

URL = '/api/leave-management/requests/admin_requests/'


class AdminRequestsTlFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hr = User.objects.create_user(username='tlf_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save()
        cls.it_tl = User.objects.create_user(username='tlf_it', password='x')
        cls.al_tl = User.objects.create_user(username='tlf_al', password='x')
        cls.a = User.objects.create_user(username='tlf_a', password='x')
        cls.b = User.objects.create_user(username='tlf_b', password='x')
        cls.c = User.objects.create_user(username='tlf_c', password='x')
        cls.a.profile.italian_tl = cls.it_tl
        cls.a.profile.save()
        cls.b.profile.albanian_tl = cls.al_tl
        cls.b.profile.save()
        for u in (cls.a, cls.b, cls.c):
            LeaveRequest.objects.create(
                user=u, start_date=date(2026, 9, 1), end_date=date(2026, 9, 1),
                status='pending', request_type='vacation',
            )

    def setUp(self):
        self.client.force_authenticate(self.hr)

    def test_filters_by_italian_tl(self):
        r = self.client.get(URL, {'italian_tl': self.it_tl.id})
        self.assertEqual([x['user'] for x in r.data['results']], [self.a.id])

    def test_filters_by_albanian_tl(self):
        r = self.client.get(URL, {'albanian_tl': self.al_tl.id})
        self.assertEqual([x['user'] for x in r.data['results']], [self.b.id])

    def test_status_counts_follow_the_tl_filter(self):
        r = self.client.get(URL, {'italian_tl': self.it_tl.id})
        self.assertEqual(r.data['status_counts']['total'], 1)
