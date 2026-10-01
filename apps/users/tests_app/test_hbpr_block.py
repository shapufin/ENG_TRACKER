from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from core.mixins.permissions import is_hbpr_only

User = get_user_model()

# Surfaces an HBPR-only user must never reach, even by direct API call.
BLOCKED_GET_PATHS = [
    '/api/overtime/logs/',
    '/api/overtime/logs/team_logs/',
    '/api/standby/logs/',
    '/api/standby/logs/team_logs/',
    '/api/reports/summary/',
    '/api/reports/detailed/',
    '/api/reports/audit-logs/',
]


def _user(name, roles=(), **kwargs):
    user = User.objects.create_user(username=name, password='testpass', **kwargs)
    for code in roles:
        assign_role(user, code)
    user.profile.refresh_from_db()
    return user


class HbprOnlyBlockTests(APITestCase):
    def setUp(self):
        for code in ('hbpr', 'italian_tl', 'albanian_tl', 'hr', 'employee'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.hbpr = _user('hbpr', ['hbpr'])
        self.client = APIClient()

    def test_is_hbpr_only_true_for_plain_hbpr(self):
        self.assertTrue(is_hbpr_only(self.hbpr))

    def test_is_hbpr_only_true_even_with_employee_role(self):
        user = _user('hbpr-emp', ['hbpr', 'employee'])
        self.assertTrue(is_hbpr_only(user))

    def test_is_hbpr_only_false_when_also_tl_hr_or_staff(self):
        self.assertFalse(is_hbpr_only(_user('b-tl', ['hbpr', 'italian_tl'])))
        self.assertFalse(is_hbpr_only(_user('b-al', ['hbpr', 'albanian_tl'])))
        self.assertFalse(is_hbpr_only(_user('b-hr', ['hbpr', 'hr'])))
        self.assertFalse(is_hbpr_only(_user('b-staff', ['hbpr'], is_staff=True)))
        self.assertFalse(is_hbpr_only(_user('b-su', ['hbpr'], is_superuser=True)))

    def test_hbpr_stays_blocked_when_set_as_someones_tl_fk_or_leading_a_team(self):
        # TL-by-FK / led-team are derived facts, not roles: they must not lift the block.
        from apps.users.models import Team

        hbpr = _user('hbpr-fk', ['hbpr'])
        report = _user('fk-report', ['employee'])
        report.profile.italian_tl = hbpr
        report.profile.save()
        Team.objects.create(name='Led', code='LED', team_leader=hbpr)
        hbpr.profile.refresh_from_db()
        self.assertTrue(hbpr.profile.is_team_leader)
        self.assertTrue(is_hbpr_only(hbpr))
        self.client.force_authenticate(hbpr)
        self.assertEqual(self.client.get('/api/overtime/logs/').status_code, 403)

    def test_is_hbpr_only_false_without_the_role(self):
        self.assertFalse(is_hbpr_only(_user('plain', ['employee'])))

    def test_blocked_get_endpoints_return_403(self):
        self.client.force_authenticate(self.hbpr)
        for path in BLOCKED_GET_PATHS:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 403, path)

    def test_hbpr_cannot_create_overtime_or_standby(self):
        self.client.force_authenticate(self.hbpr)
        for path in ('/api/overtime/logs/', '/api/standby/logs/'):
            with self.subTest(path=path):
                response = self.client.post(path, {}, format='json')
                self.assertEqual(response.status_code, 403, path)

    def test_multi_role_tl_keeps_access(self):
        tl = _user('tl-hbpr', ['hbpr', 'italian_tl'])
        self.client.force_authenticate(tl)
        response = self.client.get('/api/overtime/logs/')
        self.assertEqual(response.status_code, 200)

    def test_plain_employee_unaffected(self):
        employee = _user('emp', ['employee'])
        self.client.force_authenticate(employee)
        response = self.client.get('/api/overtime/logs/')
        self.assertEqual(response.status_code, 200)

    def test_hbpr_keeps_own_leave_access(self):
        # Leave and Calendar stay available to HBPR for their own use.
        self.client.force_authenticate(self.hbpr)
        response = self.client.get('/api/leave-management/requests/')
        self.assertEqual(response.status_code, 200)
