"""Wage assignments are written only by HR or staff (2026-10-11 decision).

The payroll ``manage`` grant lets a user act on payroll *runs*, but it does not
make them unrestricted: only staff, superusers and HR get an unrestricted
scope (``_allowed_payroll_user_ids`` returns None). Before this guard a team
leader granted ``manage`` could create, change or delete any employee's wage.
Team leaders may read the wage of their own scoreable team (TL scorecard);
they may never write one. The wage importer applies the same rule.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from plugins.payroll.models import WageAssignment
from plugins.payroll.viewsets import WageAssignmentViewSet

User = get_user_model()


class WageWritePermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import assign_role
        from apps.plugins.models import PluginPermission

        tl_role, _ = Role.objects.get_or_create(code='team_leader', defaults={'name': 'Team Leader'})
        hr_role, _ = Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        for action in ('view', 'manage'):
            perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action=action)
            perm.allowed_roles.add(tl_role)
            perm.allowed_roles.add(hr_role)
        # A payroll manager who is not a team leader and not HR: holds the manage grant only.
        manager_role, _ = Role.objects.get_or_create(code='payroll_manager', defaults={'name': 'Payroll manager'})
        manage_perm, _ = PluginPermission.objects.get_or_create(plugin_name='payroll', action='manage')
        manage_perm.allowed_roles.add(manager_role)
        cls.payroll_manager = User.objects.create_user(username='wage_payroll_manager', password='pass')
        assign_role(cls.payroll_manager, 'payroll_manager')

        # A team leader granted the payroll manage grant: the case the guard closes.
        cls.tl_manager = User.objects.create_user(username='wage_tl_manager', password='pass')
        assign_role(cls.tl_manager, 'team_leader')

        cls.hr_user = User.objects.create_user(username='wage_hr', password='pass')
        assign_role(cls.hr_user, 'hr')

        cls.employee = User.objects.create_user(username='wage_employee', password='pass')
        cls.other = User.objects.create_user(username='wage_other', password='pass')

    def setUp(self):
        self.factory = APIRequestFactory()
        self.wage = WageAssignment.objects.create(
            user=self.employee,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
            is_active=True,
        )

    def _create_body(self):
        return {
            'user': self.other.id,
            'gross_monthly_wage': '90000',
            'effective_from': '2026-02-01',
            'is_active': True,
        }

    def _post_create(self, user):
        request = self.factory.post('/api/plugins/payroll/wages/', self._create_body(), format='json')
        force_authenticate(request, user=user)
        return WageAssignmentViewSet.as_view({'post': 'create'})(request)

    def test_tl_with_manage_grant_cannot_create_wage(self):
        response = self._post_create(self.tl_manager)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(WageAssignment.objects.filter(user=self.other).exists())

    def test_tl_with_manage_grant_cannot_update_wage(self):
        request = self.factory.patch(
            f'/api/plugins/payroll/wages/{self.wage.id}/', {'gross_monthly_wage': '1'}, format='json',
        )
        force_authenticate(request, user=self.tl_manager)
        response = WageAssignmentViewSet.as_view({'patch': 'partial_update'})(request, pk=self.wage.id)
        self.assertEqual(response.status_code, 403)
        self.wage.refresh_from_db()
        self.assertEqual(self.wage.gross_monthly_wage, Decimal('100000'))

    def test_tl_with_manage_grant_cannot_delete_wage(self):
        request = self.factory.delete(f'/api/plugins/payroll/wages/{self.wage.id}/')
        force_authenticate(request, user=self.tl_manager)
        response = WageAssignmentViewSet.as_view({'delete': 'destroy'})(request, pk=self.wage.id)
        self.assertEqual(response.status_code, 403)
        self.assertTrue(WageAssignment.objects.filter(pk=self.wage.pk).exists())

    def test_tl_with_manage_grant_cannot_bulk_create_wages(self):
        body = {'assignments': [{'user': self.other.id, 'gross_monthly_wage': '90000',
                                 'effective_from': '2026-02-01'}]}
        request = self.factory.post('/api/plugins/payroll/wages/bulk_create/', body, format='json')
        force_authenticate(request, user=self.tl_manager)
        response = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(WageAssignment.objects.filter(user=self.other).exists())

    def test_manage_grant_holders_are_refused_every_wage_write(self):
        """A team leader and a plain payroll manager, both holding only the
        manage grant, may not create, change, delete or bulk-create a wage."""
        for user in (self.tl_manager, self.payroll_manager):
            with self.subTest(user=user.username):
                response = self._post_create(user)
                self.assertEqual(response.status_code, 403, 'create')

                request = self.factory.patch(
                    f'/api/plugins/payroll/wages/{self.wage.id}/', {'note': 'x'}, format='json',
                )
                force_authenticate(request, user=user)
                response = WageAssignmentViewSet.as_view({'patch': 'partial_update'})(
                    request, pk=self.wage.id)
                self.assertEqual(response.status_code, 403, 'partial_update')

                request = self.factory.delete(f'/api/plugins/payroll/wages/{self.wage.id}/')
                force_authenticate(request, user=user)
                response = WageAssignmentViewSet.as_view({'delete': 'destroy'})(request, pk=self.wage.id)
                self.assertEqual(response.status_code, 403, 'destroy')

                body = {'assignments': [{'user': self.other.id, 'gross_monthly_wage': '90000',
                                         'effective_from': '2026-02-01'}]}
                request = self.factory.post('/api/plugins/payroll/wages/bulk_create/', body, format='json')
                force_authenticate(request, user=user)
                response = WageAssignmentViewSet.as_view({'post': 'bulk_create'})(request)
                self.assertEqual(response.status_code, 403, 'bulk_create')

        self.wage.refresh_from_db()
        self.assertEqual(self.wage.gross_monthly_wage, Decimal('100000'))
        self.assertFalse(WageAssignment.objects.filter(user=self.other).exists())

    def test_tl_with_manage_grant_can_still_read_wages(self):
        request = self.factory.get('/api/plugins/payroll/wages/')
        force_authenticate(request, user=self.tl_manager)
        response = WageAssignmentViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200)

    def test_hr_can_create_wage(self):
        response = self._post_create(self.hr_user)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(WageAssignment.objects.filter(user=self.other).exists())

    def test_wage_importer_refuses_tl_with_payroll_manage_grant(self):
        from plugins.data_import.importers.authority import PayrollAuthority

        class _Importer(PayrollAuthority):
            display_name = 'Payroll wages'

        self.assertIsNotNone(_Importer().check_authority(self.tl_manager))
        self.assertIsNone(_Importer().check_authority(self.hr_user))

    def test_eligible_users_excludes_superusers_for_hr(self):
        User.objects.create_superuser(username='wage_su', email='su@test.com', password='pass')
        request = self.factory.get('/api/plugins/payroll/wages/eligible_users/')
        force_authenticate(request, user=self.hr_user)
        response = WageAssignmentViewSet.as_view({'get': 'eligible_users'})(request)
        self.assertEqual(response.status_code, 200)
        usernames = [u['username'] for u in response.data]
        self.assertNotIn('wage_su', usernames)
        self.assertIn(self.employee.username, usernames)

    def test_wage_create_rejects_superuser(self):
        superuser = User.objects.create_superuser(username='wage_su2', email='su2@test.com', password='pass')
        body = {
            'user': superuser.id,
            'gross_monthly_wage': '100000',
            'effective_from': '2026-01-01',
            'is_active': True,
        }
        request = self.factory.post('/api/plugins/payroll/wages/', body, format='json')
        force_authenticate(request, user=self.hr_user)
        response = WageAssignmentViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Superuser accounts are not payroll subjects.', str(response.data))

    def test_wage_list_excludes_superusers_for_hr(self):
        superuser = User.objects.create_superuser(username='wage_su3', email='su3@test.com', password='pass')
        WageAssignment.objects.create(
            user=superuser,
            gross_monthly_wage=Decimal('100000'),
            effective_from=date(2026, 1, 1),
            is_active=True,
        )
        request = self.factory.get('/api/plugins/payroll/wages/')
        force_authenticate(request, user=self.hr_user)
        response = WageAssignmentViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        returned_users = [row['user'] for row in results]
        self.assertNotIn(superuser.id, returned_users)
