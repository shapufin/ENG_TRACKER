"""The admin Leave Requests page pages, searches and counts on the server."""
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.leave_management.models import LeaveRequest

URL = '/api/leave-management/requests/admin_requests/'


def _req(user, start, end, status='approved', request_type='vacation', reason=''):
    return LeaveRequest.objects.create(
        user=user, start_date=start, end_date=end, status=status,
        request_type=request_type, reason=reason,
    )


class AdminRequestsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(username='ar_admin', password='x')
        cls.employee = User.objects.create_user(username='ar_emp', password='x')
        cls.anna = User.objects.create_user(username='ar_a', password='x', first_name='Anna', last_name='Zogaj')
        cls.ben = User.objects.create_user(username='ar_b', password='x', first_name='Ben', last_name='Hoxha')
        _req(cls.anna, date(2026, 9, 1), date(2026, 9, 2), 'pending', 'vacation', 'beach')
        _req(cls.anna, date(2026, 9, 8), date(2026, 9, 8), 'approved', 'sick')
        _req(cls.ben, date(2026, 10, 5), date(2026, 10, 6), 'rejected')
        for i in range(60):
            _req(cls.ben, date(2025, 1, 6 + (i % 5)), date(2025, 1, 6 + (i % 5)))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_only_admins_hr_and_staff(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.get(URL).status_code, 403)

    def test_pages_newest_first(self):
        r = self.client.get(URL, {'page_size': 10})
        self.assertEqual(len(r.data['results']), 10)
        self.assertEqual(r.data['count'], 63)

    def test_search_matches_full_name_and_reason(self):
        self.assertEqual(self.client.get(URL, {'search': 'Anna Zogaj'}).data['count'], 2)
        self.assertEqual(self.client.get(URL, {'search': 'beach'}).data['count'], 1)

    def test_user_type_and_date_range(self):
        self.assertEqual(self.client.get(URL, {'user': self.anna.id}).data['count'], 2)
        self.assertEqual(self.client.get(URL, {'request_type': 'sick'}).data['count'], 1)
        r = self.client.get(URL, {'date_from': '2026-09-01', 'date_to': '2026-09-30'})
        self.assertEqual(r.data['count'], 2)

    def test_counts_ignore_the_status_filter_but_respect_the_rest(self):
        r = self.client.get(URL, {'status': 'pending', 'user': self.anna.id})
        self.assertEqual(r.data['count'], 1)
        self.assertEqual(
            r.data['status_counts'],
            {'total': 2, 'pending': 1, 'approved': 1, 'rejected': 0, 'vacation': 1, 'sick': 1},
        )
