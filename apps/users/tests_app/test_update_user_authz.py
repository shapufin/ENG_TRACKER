"""`update_user` / `create_user` write roles and TL links: staff only.

Regression for a privilege-escalation path: the viewset's get_permissions()
returned IsAuthenticated for any action not listed, so the action-level
`permission_classes=[IsAdminUser()]` was never applied.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role

User = get_user_model()


class UserWriteAuthorizationTests(APITestCase):
    def setUp(self):
        for code in ('hr', 'italian_tl', 'hbpr', 'employee'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.employee = User.objects.create_user(username='plain', password='x')
        self.victim = User.objects.create_user(username='victim', password='x')
        self.tl = User.objects.create_user(username='tl_authz', password='x')
        assign_role(self.tl, 'italian_tl')
        self.victim.profile.italian_tl = self.tl
        self.victim.profile.save()
        self.hbpr = User.objects.create_user(username='hbpr_authz', password='x')
        assign_role(self.hbpr, 'hbpr')
        self.hr = User.objects.create_user(username='hr_authz', password='x')
        assign_role(self.hr, 'hr')
        self.staff = User.objects.create_user(username='staff_authz', password='x', is_staff=True)
        self.api = APIClient()

    def _update(self, actor, target, payload):
        self.api.force_authenticate(actor)
        return self.api.patch(
            f'/api/users/users/{target.id}/update_user/', payload, format='json')

    def test_employee_cannot_grant_themselves_a_role(self):
        resp = self._update(self.employee, self.employee, {'roles': ['hr']})
        self.assertEqual(resp.status_code, 403)
        self.employee.profile.refresh_from_db()
        self.assertNotIn('hr', self.employee.profile.role_codes)

    def test_hbpr_cannot_change_roles_or_email_of_an_in_scope_user(self):
        resp = self._update(self.hbpr, self.victim, {'roles': ['hr'], 'email': 'x@evil.test'})
        self.assertEqual(resp.status_code, 403)
        self.victim.refresh_from_db()
        self.assertNotEqual(self.victim.email, 'x@evil.test')

    def test_hr_and_tl_cannot_use_update_user(self):
        for actor in (self.hr, self.tl):
            resp = self._update(actor, self.victim, {'roles': ['hr']})
            self.assertEqual(resp.status_code, 403, actor.username)

    def test_create_user_is_staff_only(self):
        self.api.force_authenticate(self.hbpr)
        resp = self.api.post('/api/users/users/create_user/', {
            'username': 'new', 'email': 'n@x.test', 'password': 'Passw0rd!x', 'roles': ['hr'],
        }, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(User.objects.filter(username='new').exists())

    def test_reset_password_is_staff_only(self):
        # HR and HBPR can see other users, so this was an account-takeover path.
        for actor in (self.employee, self.hbpr, self.hr, self.tl):
            self.api.force_authenticate(actor)
            resp = self.api.post(
                f'/api/users/users/{self.victim.id}/reset_password/',
                {'new_password': 'hijacked-123'}, format='json')
            self.assertEqual(resp.status_code, 403, actor.username)
        self.victim.refresh_from_db()
        self.assertFalse(self.victim.check_password('hijacked-123'))

    def test_staff_can_still_reset_a_password(self):
        self.api.force_authenticate(self.staff)
        resp = self.api.post(
            f'/api/users/users/{self.victim.id}/reset_password/',
            {'new_password': 'legit-pass-1'}, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_staff_can_grant_hbpr(self):
        resp = self._update(self.staff, self.victim, {'roles': ['employee', 'hbpr']})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.victim.profile.refresh_from_db()
        self.assertIn('hbpr', self.victim.profile.role_codes)


class HbprRevocationGuardTests(APITestCase):
    """Revoking hbpr/albanian_tl while an open HBPR↔AL-TL assignment exists
    must return a structured 400 — never a 500 with partially-applied writes."""

    def setUp(self):
        from apps.users.models.hbpr import HbprAlbanianTlAssignment
        from datetime import date

        for code in ('hr', 'italian_tl', 'albanian_tl', 'hbpr', 'employee'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.assigned_hbpr = User.objects.create_user(username='hbpr_guarded', password='x')
        assign_role(self.assigned_hbpr, 'hbpr')
        self.assigned_tl = User.objects.create_user(username='tl_guarded', password='x')
        assign_role(self.assigned_tl, 'albanian_tl')
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.assigned_hbpr, albanian_tl=self.assigned_tl,
            cadence='weekly', effective_from=date(2026, 10, 1),
        )
        self.staff = User.objects.create_user(username='staff_guard', password='x', is_staff=True)
        self.api = APIClient()

    def _update(self, target, payload):
        self.api.force_authenticate(self.staff)
        return self.api.patch(
            f'/api/users/users/{target.id}/update_user/', payload, format='json')

    def test_revoking_hbpr_returns_400_not_500(self):
        resp = self._update(self.assigned_hbpr, {'roles': ['employee']})
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('blocked_hbpr_revocations', resp.data)

    def test_revoking_albanian_tl_returns_400_not_500(self):
        resp = self._update(self.assigned_tl, {'roles': ['employee']})
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('blocked_hbpr_revocations', resp.data)

    def test_profile_untouched_after_blocked_revoke(self):
        resp = self._update(self.assigned_hbpr, {'roles': ['employee'], 'email': 'new@x.test'})
        self.assertEqual(resp.status_code, 400)
        self.assigned_hbpr.refresh_from_db()
        self.assertIn('hbpr', self.assigned_hbpr.profile.role_codes)

    def test_revocation_allowed_after_assignment_ended(self):
        from apps.users.services.hbpr_assignments import end_assignment
        from datetime import date

        end_assignment(assignment=self.assignment, effective_to=date(2026, 10, 15))
        resp = self._update(self.assigned_hbpr, {'roles': ['employee']})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assigned_hbpr.profile.refresh_from_db()
        self.assertNotIn('hbpr', self.assigned_hbpr.profile.role_codes)

    def test_editing_other_roles_unaffected_by_hbpr_guard(self):
        # Removing only 'hr' (not held) must not trip the HBPR guard.
        resp = self._update(self.assigned_hbpr, {'roles': ['hbpr']})
        self.assertEqual(resp.status_code, 200, resp.data)
