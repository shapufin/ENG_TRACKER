"""HR TL-assignment tiles count the whole assignable population, not one page."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.users.models import UserProfile

URL = '/api/users/profiles/assignment_counts/?role=assignable_employee'


def make_user(name, **kwargs):
    user = User.objects.create_user(name, password='x', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class AssignmentCountsTests(APITestCase):
    def setUp(self):
        self.staff = make_user('counts_staff', is_staff=True)
        self.client.force_authenticate(self.staff)

    def counts(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200, res.data)
        return res.data

    def test_a_new_employee_joins_the_totals(self):
        before = self.counts()
        make_user('counts_emp')
        after = self.counts()
        self.assertEqual(after['total'], before['total'] + 1)
        self.assertEqual(after['without_any'], before['without_any'] + 1)

    def test_the_tiles_are_subsets_of_the_total(self):
        data = self.counts()
        self.assertLessEqual(data['italian'], data['total'])
        self.assertLessEqual(data['albanian'], data['total'])
        self.assertLessEqual(data['without_any'], data['total'])
