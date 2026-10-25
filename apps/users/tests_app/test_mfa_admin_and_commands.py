"""Django-admin login gate and the break-glass / key-check commands."""

from io import StringIO

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import UserMFA
from apps.users.services import mfa

User = get_user_model()
PASSWORD = 'pw-Strong-123'


def enrol(user):
    setup = mfa.begin_setup(user)
    mfa.activate(user, mfa.code_at(setup['secret'], mfa.current_step()))
    return setup['secret']


class DjangoAdminLoginTests(TestCase):
    """A Django admin session authenticates /api/* too, so it must honour MFA."""

    def setUp(self):
        self.staff = User.objects.create_user('staff', 's@example.com', PASSWORD, is_staff=True, is_superuser=True)

    def post(self, **extra):
        return self.client.post('/django-admin/login/', {'username': 'staff', 'password': PASSWORD, 'next': '/django-admin/', **extra})

    def test_login_page_shows_the_code_field(self):
        self.assertContains(self.client.get('/django-admin/login/'), 'name="otp"')

    def test_unenrolled_staff_logs_in_with_password_only(self):
        self.assertEqual(self.post().status_code, 302)

    def test_enrolled_staff_needs_the_code(self):
        secret = enrol(self.staff)
        self.assertEqual(self.post().status_code, 200)
        self.assertNotIn('_auth_user_id', self.client.session)
        self.assertEqual(self.post(otp='000000').status_code, 200)
        self.assertNotIn('_auth_user_id', self.client.session)
        self.assertEqual(self.post(otp=mfa.code_at(secret, mfa.current_step() + 1)).status_code, 302)
        self.assertIn('_auth_user_id', self.client.session)

    def test_session_from_admin_cannot_reach_api_without_the_code(self):
        enrol(self.staff)
        self.post()
        self.assertEqual(self.client.get('/api/users/users/me/').status_code, 401)

    def test_required_but_unenrolled_staff_is_refused_with_guidance(self):
        self.staff.profile.mfa_required = True
        self.staff.profile.save()
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Sign in to the app once to set it up')
        self.assertNotIn('_auth_user_id', self.client.session)


class CommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('lost', 'l@example.com', PASSWORD)
        enrol(self.user)

    def test_reset_user_mfa_removes_factor_and_ends_sessions(self):
        RefreshToken.for_user(self.user)
        out = StringIO()
        call_command('reset_user_mfa', 'lost', stdout=out)
        self.assertFalse(UserMFA.objects.filter(user=self.user).exists())
        self.assertEqual(
            BlacklistedToken.objects.filter(token__user=self.user).count(),
            OutstandingToken.objects.filter(user=self.user).count(),
        )

    def test_reset_unknown_user_is_an_error(self):
        with self.assertRaises(CommandError):
            call_command('reset_user_mfa', 'nobody')

    def test_check_mfa_key_passes_then_fails_with_wrong_key(self):
        call_command('check_mfa_key', stdout=StringIO())
        with override_settings(MFA_ENCRYPTION_KEYS=[Fernet.generate_key().decode()]):
            with self.assertRaises(CommandError):
                call_command('check_mfa_key', stdout=StringIO(), stderr=StringIO())

    def test_rotation_with_reencrypt(self):
        from django.conf import settings
        new_key = Fernet.generate_key().decode()
        with override_settings(MFA_ENCRYPTION_KEYS=[new_key, *settings.MFA_ENCRYPTION_KEYS]):
            call_command('check_mfa_key', '--reencrypt', stdout=StringIO())
        # The old key can now be retired.
        with override_settings(MFA_ENCRYPTION_KEYS=[new_key]):
            call_command('check_mfa_key', stdout=StringIO())
