"""Attack simulation: what a low-privilege or stolen-session attacker can reach.

Each test plays one attack and asserts the safe outcome, so a regression in any
guard fails loudly. Covers self-escalation by mass assignment, acting on other
accounts, role self-grants, forged/abused tokens and login enumeration.
"""
import base64
import json

from django.contrib.auth.models import User
from django.forms.models import model_to_dict
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

PW = 'Sturdy-Pass-7391'
ESCALATION = {
    'is_staff': True, 'is_superuser': True, 'is_active': True, 'is_hr': True,
    'is_hr_user': True, 'is_team_leader': True, 'is_italian_tl': True, 'is_albanian_tl': True,
    'is_italian_tl_role': True, 'is_albanian_tl_role': True, 'is_hbpr': True, 'is_cr_admin': True,
    'mfa_required': False, 'roles': [1], 'groups': [1], 'user_permissions': [1],
}


def snapshot(user):
    user.refresh_from_db()
    data = {k: v for k, v in model_to_dict(user).items() if k not in ('groups', 'user_permissions')}
    profile = getattr(user, 'profile', None)
    if profile is not None:
        profile.refresh_from_db()
        data['profile'] = {k: v for k, v in model_to_dict(profile).items()
                           if not isinstance(v, (list, tuple)) and k != 'user'}
    return data


class AttackSimulationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.emp = User.objects.create_user('atk_emp', 'a@x.com', PW)
        cls.victim = User.objects.create_user('atk_victim', 'v@x.com', PW)
        cls.admin = User.objects.create_user('atk_admin', 'ad@x.com', PW, is_staff=True)

    def as_user(self, user=None):
        c = APIClient(raise_request_exception=False)
        if user:
            c.force_authenticate(user)
        return c

    # --- privilege self-escalation (mass assignment) ---------------------------------
    def test_employee_cannot_escalate_through_any_user_or_profile_write(self):
        before = snapshot(self.emp)
        c = self.as_user(self.emp)
        profile_id = self.emp.profile.id
        for method, url in (
            ('patch', f'/api/users/users/{self.emp.id}/'),
            ('put', f'/api/users/users/{self.emp.id}/'),
            ('patch', '/api/users/users/me/'),
            ('post', f'/api/users/users/{self.emp.id}/update_user/'),
            ('patch', f'/api/users/profiles/{profile_id}/'),
            ('put', f'/api/users/profiles/{profile_id}/'),
        ):
            resp = getattr(c, method)(url, ESCALATION, format='json')
            self.assertLess(resp.status_code, 500, f'{method} {url} crashed')
        self.assertEqual(snapshot(self.emp), before)

    def test_employee_cannot_grant_roles_groups_or_permissions_to_self(self):
        c = self.as_user(self.emp)
        for url, body in (
            ('/api/permissions/user-roles/', {'user': self.emp.id, 'role': 1}),
            ('/api/permissions/user-groups/', {'user': self.emp.id, 'group': 1}),
            ('/api/permissions/role-permissions/', {'role': 1, 'permission': 1}),
            ('/api/permissions/roles/', {'name': 'god'}),
            ('/api/permissions/groups/', {'name': 'god'}),
        ):
            resp = c.post(url, body, format='json')
            self.assertIn(resp.status_code, (401, 403), f'POST {url} -> {resp.status_code}')

    # --- acting on someone else's account ---------------------------------------------
    def test_employee_cannot_touch_another_account(self):
        c = self.as_user(self.emp)
        before = snapshot(self.victim)
        vid = self.victim.id
        for method, url, body in (
            ('post', f'/api/users/users/{vid}/reset_password/', {'new_password': 'Hacked-Pass-9911'}),
            ('post', f'/api/users/users/{vid}/reset_mfa/', {}),
            ('get', f'/api/users/users/{vid}/mfa_status/', None),
            ('patch', f'/api/users/users/{vid}/', {'first_name': 'pwned', **ESCALATION}),
            ('delete', f'/api/users/users/{vid}/', None),
            ('post', '/api/users/users/bulk_delete/', {'user_ids': [vid]}),
            ('post', '/api/users/users/bulk_update/', {'user_ids': [vid], 'is_hr': True}),
            ('post', '/api/users/users/create_user/', {'username': 'x', 'email': 'x@x.com', 'password': PW}),
        ):
            resp = (getattr(c, method)(url, body, format='json') if body is not None
                    else getattr(c, method)(url))
            self.assertIn(resp.status_code, (401, 403, 404), f'{method} {url} -> {resp.status_code}')
        self.assertEqual(snapshot(self.victim), before)
        self.assertTrue(User.objects.get(pk=vid).check_password(PW))
        self.assertFalse(User.objects.filter(username='x').exists())

    def test_plain_staff_cannot_reset_a_superuser(self):
        boss = User.objects.create_user('atk_boss', 'b@x.com', PW, is_staff=True, is_superuser=True)
        resp = self.as_user(self.admin).post(
            f'/api/users/users/{boss.id}/reset_password/', {'new_password': 'Hacked-Pass-9911'}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(User.objects.get(pk=boss.pk).check_password(PW))

    # --- token abuse ---------------------------------------------------------------------
    def _status(self, token):
        c = APIClient(raise_request_exception=False)
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return c.get('/api/auth/mfa/status/').status_code

    def test_refresh_token_is_not_accepted_as_an_access_token(self):
        self.assertEqual(self._status(str(RefreshToken.for_user(self.emp))), 401)

    def test_access_token_is_not_accepted_for_refresh(self):
        resp = APIClient().post('/api/auth/token/refresh/',
                                {'refresh': str(AccessToken.for_user(self.emp))}, format='json')
        self.assertEqual(resp.status_code, 401)

    def test_forged_tokens_are_rejected(self):
        good = str(AccessToken.for_user(self.admin))
        head, body, _sig = good.split('.')
        none_head = base64.urlsafe_b64encode(json.dumps({'alg': 'none', 'typ': 'JWT'}).encode()).rstrip(b'=').decode()
        self.assertEqual(self._status(f'{none_head}.{body}.'), 401)           # alg=none
        self.assertEqual(self._status(f'{head}.{body}.AAAA'), 401)            # bad signature
        # Re-targeted payload (user id swapped to the admin) with the employee's signature.
        emp_head, _emp_body, emp_sig = str(AccessToken.for_user(self.emp)).split('.')
        swapped = json.loads(base64.urlsafe_b64decode(body + '=='))
        swapped['user_id'] = str(self.admin.id)
        forged = base64.urlsafe_b64encode(json.dumps(swapped).encode()).rstrip(b'=').decode()
        self.assertEqual(self._status(f'{emp_head}.{forged}.{emp_sig}'), 401)

    def test_deactivated_user_token_stops_working_immediately(self):
        token = str(AccessToken.for_user(self.emp))
        self.assertEqual(self._status(token), 200)
        User.objects.filter(pk=self.emp.pk).update(is_active=False)
        self.assertEqual(self._status(token), 401)

    def test_admin_password_reset_kills_the_victims_live_access_token(self):
        token = str(AccessToken.for_user(self.victim))
        self.assertEqual(self._status(token), 200)
        self.as_user(self.admin).post(
            f'/api/users/users/{self.victim.id}/reset_password/', {'new_password': 'Fresh-Pass-4417x'}, format='json')
        self.assertEqual(self._status(token), 401)

    # --- login hygiene ---------------------------------------------------------------------
    def test_login_does_not_reveal_which_usernames_exist(self):
        c = APIClient()
        unknown = c.post('/api/auth/token/', {'username': 'nobody_here', 'password': 'x'}, format='json')
        wrong = c.post('/api/auth/token/', {'username': 'atk_emp', 'password': 'x'}, format='json')
        self.assertEqual(unknown.status_code, wrong.status_code)
        self.assertEqual(unknown.json(), wrong.json())

    def test_credential_endpoints_are_throttled_by_scope(self):
        from apps.users.views.auth import CustomTokenObtainPairView, MFASetupView, PasswordChangeView
        self.assertEqual(PasswordChangeView.throttle_scope, 'mfa')
        self.assertEqual(MFASetupView.throttle_scope, 'mfa')
        self.assertEqual(CustomTokenObtainPairView.throttle_scope, 'auth')

    def test_inactive_user_cannot_log_in(self):
        User.objects.filter(pk=self.emp.pk).update(is_active=False)
        resp = APIClient().post('/api/auth/token/', {'username': 'atk_emp', 'password': PW}, format='json')
        self.assertEqual(resp.status_code, 401)
