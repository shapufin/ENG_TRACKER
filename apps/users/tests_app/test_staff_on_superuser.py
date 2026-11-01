"""A staff account may not edit or remove a superuser account (credential resets are already refused)."""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase


class StaffOnSuperuserTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='sos_staff', password='x', is_staff=True)
        cls.superuser = User.objects.create_superuser(username='sos_super', password='x', email='s@example.com')
        cls.other_super = User.objects.create_superuser(username='sos_super2', password='x', email='s2@example.com')
        cls.employee = User.objects.create_user(username='sos_emp', password='x')

    def _update(self, actor, target, **data):
        self.client.force_authenticate(user=actor)
        return self.client.patch(f'/api/users/users/{target.pk}/update_user/', data, format='json')

    def test_staff_cannot_edit_a_superuser(self):
        response = self._update(self.staff, self.superuser, first_name='Hacked', email='evil@example.com')
        self.assertEqual(response.status_code, 403)
        self.superuser.refresh_from_db()
        self.assertEqual(self.superuser.email, 's@example.com')
        self.assertNotEqual(self.superuser.first_name, 'Hacked')

    def test_staff_cannot_delete_a_superuser(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.delete(f'/api/users/users/{self.superuser.pk}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.superuser.pk).exists())

    def test_staff_cannot_bulk_update_a_superuser(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.superuser.pk], 'is_hr': True}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.superuser.profile.__class__.objects.get(pk=self.superuser.profile.pk).is_hr_user)

    def test_staff_still_edits_an_ordinary_user_and_themselves(self):
        self.assertEqual(self._update(self.staff, self.employee, first_name='Ok').status_code, 200)
        self.assertEqual(self._update(self.staff, self.staff, first_name='Me').status_code, 200)

    def test_staff_cannot_put_or_patch_a_superuser_on_the_rest_route(self):
        self.client.force_authenticate(user=self.staff)
        url = f'/api/users/users/{self.superuser.pk}/'
        self.assertEqual(self.client.patch(url, {'first_name': 'Hacked'}, format='json').status_code, 403)
        self.assertEqual(
            self.client.put(url, {'username': 'sos_super', 'first_name': 'Hacked'}, format='json').status_code, 403)
        self.superuser.refresh_from_db()
        self.assertNotEqual(self.superuser.first_name, 'Hacked')

    def test_staff_cannot_edit_or_delete_a_superuser_profile(self):
        self.client.force_authenticate(user=self.staff)
        url = f'/api/users/profiles/{self.superuser.profile.pk}/'
        self.assertEqual(self.client.patch(url, {'code': 'HACK1'}, format='json').status_code, 403)
        self.assertEqual(self.client.put(url, {'code': 'HACK2'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)
        self.superuser.profile.refresh_from_db()
        self.assertNotIn(self.superuser.profile.code, ('HACK1', 'HACK2'))

    def test_staff_cannot_assign_clients_to_a_superuser(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.post(
            f'/api/users/users/{self.superuser.pk}/assign_member_clients/', {'client_ids': []}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_staff_still_edits_their_own_and_ordinary_profiles(self):
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(
            self.client.patch(f'/api/users/users/{self.staff.pk}/', {'first_name': 'Me'}, format='json').status_code,
            200)
        self.assertEqual(
            self.client.patch(
                f'/api/users/profiles/{self.employee.profile.pk}/', {'code': 'EMP1'}, format='json').status_code,
            200)

    def test_a_superuser_may_edit_another_superuser_on_the_rest_routes(self):
        self.client.force_authenticate(user=self.superuser)
        self.assertEqual(
            self.client.patch(
                f'/api/users/users/{self.other_super.pk}/', {'first_name': 'Peer'}, format='json').status_code,
            200)
        self.assertEqual(
            self.client.patch(
                f'/api/users/profiles/{self.other_super.profile.pk}/', {'code': 'SU2'}, format='json').status_code,
            200)

    def test_a_superuser_may_edit_and_delete_another_superuser(self):
        self.assertEqual(self._update(self.superuser, self.other_super, first_name='Peer').status_code, 200)
        self.client.force_authenticate(user=self.superuser)
        self.assertEqual(self.client.delete(f'/api/users/users/{self.other_super.pk}/').status_code, 204)
