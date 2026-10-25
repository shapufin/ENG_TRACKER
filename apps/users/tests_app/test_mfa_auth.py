"""HTTP-level tests for the second-factor login handshake and management API."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.leave_management.models import GlobalSettings
from apps.users.models import UserMFA
from apps.users.services import mfa

User = get_user_model()
PASSWORD = 'pw-Strong-123'


def login(client, username='ann', password=PASSWORD):
    return client.post('/api/auth/token/', {'username': username, 'password': password})


def next_code(secret):
    """A code for a step after the one consumed at activation."""
    return mfa.code_at(secret, mfa.current_step() + 1)


class MFATestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('ann', 'ann@example.com', PASSWORD)

    def enrol(self, user=None):
        user = user or self.user
        setup = mfa.begin_setup(user)
        codes = mfa.activate(user, mfa.code_at(setup['secret'], mfa.current_step()))
        return setup['secret'], codes

    def bearer(self, access):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')


class LoginHandshakeTests(MFATestBase):
    def test_unenrolled_user_logs_in_exactly_as_before(self):
        response = login(self.client)
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertIn('user', response.data)
        self.assertIn('refresh_token', response.cookies)
        self.assertNotIn('mfa_required', response.data)

    def test_enrolled_user_gets_challenge_and_no_tokens(self):
        self.enrol()
        response = login(self.client)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['mfa_required'])
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh_token', response.cookies)
        self.assertEqual(OutstandingToken.objects.filter(user=self.user).count(), 0)

    def test_challenge_is_not_usable_as_a_bearer_token(self):
        self.enrol()
        token = login(self.client).data['mfa_token']
        self.bearer(token)
        self.assertEqual(self.client.get('/api/auth/mfa/status/').status_code, 401)

    def test_verify_with_totp_signs_in_with_full_payload(self):
        secret, _ = self.enrol()
        token = login(self.client).data['mfa_token']
        response = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': next_code(secret)})
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertEqual(response.data['user']['username'], 'ann')
        self.assertIn('refresh_token', response.cookies)
        self.assertNotIn('refresh', response.data)

    def test_verify_with_backup_code_then_code_is_spent(self):
        _, codes = self.enrol()
        for expected in (200, 400):
            token = login(self.client).data['mfa_token']
            response = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': codes[0]})
            self.assertEqual(response.status_code, expected)

    def test_replayed_totp_code_is_rejected(self):
        secret, _ = self.enrol()
        code = next_code(secret)
        token = login(self.client).data['mfa_token']
        self.assertEqual(self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': code}).status_code, 200)
        token = login(self.client).data['mfa_token']
        self.assertEqual(self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': code}).status_code, 400)

    def test_wrong_codes_lock_the_account_even_with_fresh_challenges(self):
        secret, _ = self.enrol()
        for _ in range(mfa.MAX_FAILURES):
            token = login(self.client).data['mfa_token']
            response = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': 'wrong'})
        self.assertEqual(response.status_code, 429)
        token = login(self.client).data['mfa_token']
        response = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': next_code(secret)})
        self.assertEqual(response.status_code, 429)

    def test_garbage_challenge_is_401(self):
        response = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': 'x', 'code': '123456'})
        self.assertEqual(response.status_code, 401)

    def test_setup_challenge_cannot_be_used_to_verify(self):
        secret, _ = self.enrol()
        wrong_purpose = mfa.make_challenge(self.user, mfa.PURPOSE_SETUP)
        response = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': wrong_purpose, 'code': next_code(secret)})
        self.assertEqual(response.status_code, 401)

    def test_unavailable_seed_fails_closed_with_503(self):
        from cryptography.fernet import Fernet
        from django.test import override_settings
        secret, _ = self.enrol()
        token = login(self.client).data['mfa_token']
        with override_settings(MFA_ENCRYPTION_KEYS=[Fernet.generate_key().decode()]):
            response = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': next_code(secret)})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('access', response.data)

    def test_refresh_after_mfa_login_still_works(self):
        secret, _ = self.enrol()
        token = login(self.client).data['mfa_token']
        self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': next_code(secret)})
        self.assertEqual(self.client.post('/api/auth/token/refresh/').status_code, 200)


class RequiredEnrolmentAtLoginTests(MFATestBase):
    def _require(self):
        self.user.profile.mfa_required = True
        self.user.profile.save()

    def test_required_but_unenrolled_user_gets_setup_challenge_not_tokens(self):
        self._require()
        response = login(self.client)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['mfa_setup_required'])
        self.assertNotIn('access', response.data)
        self.assertNotIn('refresh_token', response.cookies)

    def test_global_switch_applies_to_everyone(self):
        GlobalSettings.objects.update_or_create(pk=1, defaults={'mfa_required': True})
        self.assertTrue(login(self.client).data['mfa_setup_required'])

    def test_enrol_at_login_then_signed_in_with_backup_codes(self):
        self._require()
        token = login(self.client).data['mfa_token']
        setup = self.client.post('/api/auth/mfa/login/setup/', {'mfa_token': token}).data
        self.assertIn('qr_svg', setup)
        response = self.client.post(
            '/api/auth/mfa/login/activate/',
            {'mfa_token': token, 'code': mfa.code_at(setup['secret'], mfa.current_step())},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
        self.assertEqual(len(response.data['backup_codes']), mfa.BACKUP_CODE_COUNT)
        self.assertIn('refresh_token', response.cookies)
        # Next login now asks for the code.
        self.assertTrue(login(self.client).data['mfa_required'])

    def test_wrong_activation_code_gives_no_tokens(self):
        self._require()
        token = login(self.client).data['mfa_token']
        self.client.post('/api/auth/mfa/login/setup/', {'mfa_token': token})
        response = self.client.post('/api/auth/mfa/login/activate/', {'mfa_token': token, 'code': '000000'})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('access', response.data)

    def test_verify_challenge_cannot_start_login_setup(self):
        self.enrol()
        token = login(self.client).data['mfa_token']  # purpose verify
        response = self.client.post('/api/auth/mfa/login/setup/', {'mfa_token': token})
        self.assertEqual(response.status_code, 401)

    def test_required_cannot_be_turned_off(self):
        secret, _ = self.enrol()
        self._require()
        token = login(self.client).data['mfa_token']
        access = self.client.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': next_code(secret)}).data['access']
        self.bearer(access)
        response = self.client.post('/api/auth/mfa/disable/', {'password': PASSWORD, 'code': mfa.code_at(secret, mfa.current_step() + 1)})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'required')


class SelfServiceTests(MFATestBase):
    def setUp(self):
        super().setUp()
        self.bearer(login(self.client).data['access'])

    def test_status_reflects_state(self):
        self.assertEqual(self.client.get('/api/auth/mfa/status/').data['enabled'], False)

    def test_setup_needs_password(self):
        self.assertEqual(self.client.post('/api/auth/mfa/setup/', {'password': 'bad'}).status_code, 400)
        self.assertEqual(self.client.post('/api/auth/mfa/setup/', {'password': PASSWORD}).status_code, 200)

    def test_full_enrol_then_disable_with_step_up(self):
        setup = self.client.post('/api/auth/mfa/setup/', {'password': PASSWORD}).data
        activated = self.client.post('/api/auth/mfa/activate/', {'code': mfa.code_at(setup['secret'], mfa.current_step())})
        self.assertEqual(activated.status_code, 200)
        self.assertEqual(len(activated.data['backup_codes']), mfa.BACKUP_CODE_COUNT)
        status = self.client.get('/api/auth/mfa/status/').data
        self.assertTrue(status['enabled'])
        self.assertEqual(status['backup_codes_remaining'], mfa.BACKUP_CODE_COUNT)
        # Password alone is not enough to turn it off.
        self.assertEqual(self.client.post('/api/auth/mfa/disable/', {'password': PASSWORD}).status_code, 400)
        self.assertTrue(UserMFA.objects.filter(user=self.user, is_enabled=True).exists())
        ok = self.client.post('/api/auth/mfa/disable/', {'password': PASSWORD, 'code': activated.data['backup_codes'][0]})
        self.assertEqual(ok.status_code, 204)
        self.assertFalse(UserMFA.objects.filter(user=self.user).exists())

    def test_regenerate_backup_codes_needs_password_and_code(self):
        secret, codes = self.enrol()
        self.assertEqual(self.client.post('/api/auth/mfa/backup-codes/', {'password': PASSWORD}).status_code, 400)
        response = self.client.post('/api/auth/mfa/backup-codes/', {'password': PASSWORD, 'code': next_code(secret)})
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(set(response.data['backup_codes']), set(codes))
        # Old codes no longer work.
        anon = self.client_class()
        token = login(anon).data['mfa_token']
        bad = anon.post('/api/auth/token/mfa-verify/', {'mfa_token': token, 'code': codes[0]})
        self.assertEqual(bad.status_code, 400)

    def test_setup_refused_when_already_enabled(self):
        self.enrol()
        self.assertEqual(self.client.post('/api/auth/mfa/setup/', {'password': PASSWORD}).status_code, 400)

    def test_management_endpoints_need_authentication(self):
        self.client.credentials()
        for path in ('status', 'setup', 'activate', 'disable', 'backup-codes'):
            method = self.client.get if path == 'status' else self.client.post
            self.assertEqual(method(f'/api/auth/mfa/{path}/').status_code, 401, path)


class AdminControlTests(MFATestBase):
    def setUp(self):
        super().setUp()
        self.staff = User.objects.create_user('staff', 's@example.com', PASSWORD, is_staff=True)
        self.root = User.objects.create_superuser('root', 'r@example.com', PASSWORD)
        self.other = User.objects.create_user('other', 'o@example.com', PASSWORD)

    def as_user(self, user):
        self.client.force_authenticate(user)

    def test_reset_mfa_removes_factor_and_ends_sessions(self):
        self.enrol()
        from rest_framework_simplejwt.tokens import RefreshToken
        RefreshToken.for_user(self.user)  # a live session that the reset must end
        self.as_user(self.staff)
        response = self.client.post(f'/api/users/users/{self.user.id}/reset_mfa/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(mfa.is_enrolled(self.user))
        self.assertEqual(
            BlacklistedToken.objects.filter(token__user=self.user).count(),
            OutstandingToken.objects.filter(user=self.user).count(),
        )

    def test_plain_user_cannot_reset(self):
        self.enrol()
        self.as_user(self.other)
        self.assertEqual(self.client.post(f'/api/users/users/{self.user.id}/reset_mfa/').status_code, 403)
        self.assertTrue(mfa.is_enrolled(self.user))

    def test_staff_cannot_reset_a_superusers_factor_but_superuser_can(self):
        self.enrol(self.root)
        self.as_user(self.staff)
        self.assertEqual(self.client.post(f'/api/users/users/{self.root.id}/reset_mfa/').status_code, 403)
        self.enrol(self.staff)
        self.as_user(self.root)
        self.assertEqual(self.client.post(f'/api/users/users/{self.staff.id}/reset_mfa/').status_code, 200)

    def test_cannot_reset_own_via_admin_action(self):
        self.enrol(self.root)
        self.as_user(self.root)
        self.assertEqual(self.client.post(f'/api/users/users/{self.root.id}/reset_mfa/').status_code, 400)

    def test_reset_for_user_without_factor_is_400(self):
        self.as_user(self.staff)
        self.assertEqual(self.client.post(f'/api/users/users/{self.other.id}/reset_mfa/').status_code, 400)

    def test_mfa_status_is_admin_only(self):
        self.as_user(self.other)
        self.assertEqual(self.client.get(f'/api/users/users/{self.user.id}/mfa_status/').status_code, 403)
        self.as_user(self.staff)
        self.assertEqual(self.client.get(f'/api/users/users/{self.user.id}/mfa_status/').status_code, 200)

    def test_per_user_flag_set_by_staff_and_visible_to_staff_only(self):
        self.as_user(self.staff)
        response = self.client.patch(f'/api/users/users/{self.other.id}/update_user/', {'mfa_required': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.other.profile.refresh_from_db()
        self.assertTrue(self.other.profile.mfa_required)
        listing = self.client.get('/api/users/profiles/').data
        rows = listing['results'] if isinstance(listing, dict) else listing
        self.assertTrue(all('mfa_required' in r for r in rows))
        self.as_user(self.other)
        listing = self.client.get('/api/users/profiles/').data
        rows = listing['results'] if isinstance(listing, dict) else listing
        self.assertTrue(rows)
        self.assertTrue(all('mfa_required' not in r for r in rows))

    def test_staff_cannot_flag_a_superuser(self):
        self.as_user(self.staff)
        response = self.client.patch(f'/api/users/users/{self.root.id}/update_user/', {'mfa_required': True}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_employee_cannot_set_own_flag_through_profile_endpoint(self):
        self.as_user(self.other)
        response = self.client.patch(f'/api/users/profiles/{self.other.profile.id}/', {'mfa_required': True}, format='json')
        self.other.profile.refresh_from_db()
        self.assertFalse(self.other.profile.mfa_required, response.status_code)

    def test_global_switch_is_superuser_only(self):
        GlobalSettings.objects.get_or_create(pk=1)
        self.as_user(self.staff)
        self.assertEqual(self.client.patch('/api/leave-management/settings/1/', {'mfa_required': True}, format='json').status_code, 403)
        self.assertFalse(GlobalSettings.objects.get(pk=1).mfa_required)
        self.as_user(self.root)
        self.assertEqual(self.client.patch('/api/leave-management/settings/1/', {'mfa_required': True}, format='json').status_code, 200)
        self.assertTrue(GlobalSettings.objects.get(pk=1).mfa_required)

    def test_staff_can_still_edit_other_global_settings(self):
        GlobalSettings.objects.get_or_create(pk=1)
        self.as_user(self.staff)
        response = self.client.patch('/api/leave-management/settings/1/', {'carry_over_enabled': False}, format='json')
        self.assertEqual(response.status_code, 200)
