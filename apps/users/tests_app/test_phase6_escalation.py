"""Phase 6 (permissions/users audit): staff must not escalate or touch privileged accounts."""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role

User = get_user_model()


class StaffEscalationTests(APITestCase):
    def setUp(self):
        for code in ('hr', 'italian_tl', 'albanian_tl', 'employee', 'admin'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.staff = User.objects.create_user(username='p6_staff', password='x', is_staff=True)
        self.other_staff = User.objects.create_user(username='p6_staff2', password='x', is_staff=True)
        self.su = User.objects.create_user(
            username='p6_su', password='Orig-Pass-7391x', is_staff=True, is_superuser=True)
        self.plain = User.objects.create_user(username='p6_plain', password='Orig-Pass-7391x')
        self.api = APIClient()

    # N1
    def test_staff_cannot_set_own_is_superuser(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.patch(
            f'/api/users/users/{self.staff.id}/', {'is_superuser': True}, format='json')
        self.assertEqual(resp.status_code, 403, resp.data)
        self.staff.refresh_from_db()
        self.assertFalse(self.staff.is_superuser)

    def test_staff_cannot_promote_another_user_to_staff(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.patch(
            f'/api/users/users/{self.plain.id}/', {'is_staff': True}, format='json')
        self.assertEqual(resp.status_code, 403, resp.data)
        self.plain.refresh_from_db()
        self.assertFalse(self.plain.is_staff)

    def test_staff_cannot_create_superuser(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.post('/api/users/users/', {
            'username': 'p6_new_su', 'email': 'n@x.test', 'is_superuser': True, 'is_staff': True,
        }, format='json')
        self.assertEqual(resp.status_code, 403, resp.data)
        self.assertFalse(User.objects.filter(username='p6_new_su', is_superuser=True).exists())

    def test_superuser_can_still_set_flags(self):
        self.api.force_authenticate(self.su)
        resp = self.api.patch(
            f'/api/users/users/{self.plain.id}/', {'is_staff': True}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.plain.refresh_from_db()
        self.assertTrue(self.plain.is_staff)

    def test_staff_can_still_edit_names(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.patch(
            f'/api/users/users/{self.plain.id}/', {'first_name': 'Zed'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)

    # N3
    def test_staff_cannot_reset_superuser_password(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.post(
            f'/api/users/users/{self.su.id}/reset_password/',
            {'new_password': 'Brand-New-Pass-4417'}, format='json')
        self.assertEqual(resp.status_code, 403, resp.data)
        self.su.refresh_from_db()
        self.assertTrue(self.su.check_password('Orig-Pass-7391x'))

    def test_staff_cannot_reset_other_staff_password(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.post(
            f'/api/users/users/{self.other_staff.id}/reset_password/',
            {'new_password': 'Brand-New-Pass-4417'}, format='json')
        self.assertEqual(resp.status_code, 403, resp.data)
        self.other_staff.refresh_from_db()
        self.assertTrue(self.other_staff.check_password('x'))

    def test_staff_can_reset_plain_user_password(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.post(
            f'/api/users/users/{self.plain.id}/reset_password/',
            {'new_password': 'Brand-New-Pass-4417'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_superuser_can_reset_staff_password(self):
        self.api.force_authenticate(self.su)
        resp = self.api.post(
            f'/api/users/users/{self.staff.id}/reset_password/',
            {'new_password': 'Brand-New-Pass-4417'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)


class TeamLeaderValidationTests(APITestCase):
    def setUp(self):
        for code in ('hr', 'italian_tl', 'albanian_tl', 'employee'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.staff = User.objects.create_user(username='p6n6_staff', password='x', is_staff=True)
        self.target = User.objects.create_user(username='p6n6_target', password='x')
        self.not_tl = User.objects.create_user(username='p6n6_nottl', password='x')
        self.tl = User.objects.create_user(username='p6n6_tl', password='x')
        assign_role(self.tl, 'italian_tl')
        self.api = APIClient()
        self.api.force_authenticate(self.staff)

    def test_update_user_rejects_non_tl_italian_tl(self):
        resp = self.api.patch(
            f'/api/users/users/{self.target.id}/update_user/',
            {'italian_tl': self.not_tl.id}, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.target.profile.refresh_from_db()
        self.assertIsNone(self.target.profile.italian_tl_id)

    def test_update_user_accepts_real_tl(self):
        resp = self.api.patch(
            f'/api/users/users/{self.target.id}/update_user/',
            {'italian_tl': self.tl.id}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.target.profile.refresh_from_db()
        self.assertEqual(self.target.profile.italian_tl_id, self.tl.id)

    def test_bulk_update_rejects_non_tl_albanian_tl(self):
        resp = self.api.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.target.id], 'albanian_tl': self.not_tl.id}, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.target.profile.refresh_from_db()
        self.assertIsNone(self.target.profile.albanian_tl_id)

    def test_update_user_failed_role_sync_leaves_no_partial_write(self):
        Role.objects.filter(code='hbpr').delete()
        resp = self.api.patch(
            f'/api/users/users/{self.target.id}/update_user/',
            {'first_name': 'Partial', 'roles': ['hbpr']}, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.target.refresh_from_db()
        self.assertNotEqual(self.target.first_name, 'Partial')


class TeamListRedactionTests(APITestCase):
    def test_employee_team_list_does_not_leak_leader_pii(self):
        from apps.users.models import Team
        leader = User.objects.create_user(
            username='p6n7_leader', password='x', email='leader-secret@x.test', is_staff=True)
        Team.objects.create(name='P6 Team', code='P6T', team_leader=leader)
        emp = User.objects.create_user(username='p6n7_emp', password='x')
        api = APIClient()
        api.force_authenticate(emp)
        resp = api.get('/api/users/teams/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn('leader-secret@x.test', resp.content.decode())
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertTrue(rows)
        for row in rows:
            tl = row.get('team_leader')
            if tl:
                for key in ('is_staff', 'is_superuser', 'email'):
                    self.assertNotIn(key, tl)
