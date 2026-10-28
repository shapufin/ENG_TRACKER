"""Site-wide maintenance mode: state, public status, and the 503 gate.

Gate tests use real JWTs: DRF's ``force_authenticate`` bypasses authenticators
entirely, so it would silently skip the guard this file exists to prove.
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.cache_constants import CacheKey
from apps.dashboard.models import MaintenanceState, SiteBranding
from apps.reports.models import AuditLog
from core.maintenance import clear_maintenance_cache, get_maintenance_state, is_maintenance_active

STATUS_URL = '/api/dashboard/maintenance/'
LOGIN_URL = '/api/auth/token/'
REFRESH_URL = '/api/auth/token/refresh/'
ME_URL = '/api/users/users/me/'


def enable(**overrides):
    defaults = {
        'is_active': True,
        'title': 'Upgrade window',
        'message': 'Back shortly.',
        'started_at': timezone.now(),
    }
    defaults.update(overrides)
    state, _ = MaintenanceState.objects.update_or_create(pk=1, defaults=defaults)
    return state


def disable():
    MaintenanceState.objects.update_or_create(pk=1, defaults={'is_active': False})
    clear_maintenance_cache()


def bearer(user):
    return {'HTTP_AUTHORIZATION': f'Bearer {RefreshToken.for_user(user).access_token}'}


class MaintenanceTestBase(TestCase):
    def setUp(self):
        # Django's TestCase does not clear the cache between tests.
        clear_maintenance_cache()
        cache.delete(CacheKey.maintenance_state())
        self.client = APIClient()
        self.employee = User.objects.create_user(username='employee', password='testpass123')
        self.staff = User.objects.create_user(
            username='staff', password='testpass123', is_staff=True
        )
        self.superuser = User.objects.create_superuser(
            username='root', password='testpass123', email='root@example.com'
        )

    def tearDown(self):
        clear_maintenance_cache()


class MaintenanceStatusTests(MaintenanceTestBase):
    def test_status_is_public_and_never_creates_branding(self):
        response = self.client.get(STATUS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(response.data['active'])
        self.assertEqual(response.data['site_name'], 'Engineering Tracker')
        self.assertIsNone(response.data['logo_url'])
        self.assertFalse(SiteBranding.objects.exists())

    def test_status_embeds_site_branding(self):
        SiteBranding.objects.create(pk=1, site_name='Acme Tracker')

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.data['site_name'], 'Acme Tracker')

    def test_blank_site_name_falls_back_to_the_default(self):
        SiteBranding.objects.create(pk=1, site_name='')

        response = self.client.get(STATUS_URL)

        self.assertEqual(response.data['site_name'], 'Engineering Tracker')

    def test_status_is_served_without_queries_when_cached(self):
        self.client.get(STATUS_URL)  # warm the cache

        with self.assertNumQueries(0):
            response = self.client.get(STATUS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_branding_rename_is_visible_immediately(self):
        SiteBranding.objects.create(pk=1, site_name='Old Name')
        clear_maintenance_cache()
        self.client.get(STATUS_URL)

        self.client.patch(
            '/api/dashboard/branding/1/',
            {'site_name': 'New Name'},
            format='json',
            **bearer(self.staff),
        )

        response = self.client.get(STATUS_URL)
        self.assertEqual(response.data['site_name'], 'New Name')

    def test_status_ok_with_stale_non_staff_token(self):
        enable()

        response = self.client.get(STATUS_URL, **bearer(self.employee))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data['active'])

    def test_status_payload_has_no_user_data(self):
        enable()

        response = self.client.get(STATUS_URL)

        self.assertEqual(
            set(response.data),
            {
                'active', 'title', 'message', 'started_at', 'ends_at',
                'updated_at', 'site_name', 'logo_url',
            },
        )

    def test_status_has_its_own_throttle_bucket(self):
        """The page polls this every 30s; it must not drain the shared `anon` bucket."""
        from rest_framework.throttling import ScopedRateThrottle

        from apps.dashboard.viewsets import MaintenanceView

        self.assertEqual(MaintenanceView.throttle_scope, 'maintenance')
        self.assertEqual(
            [type(t) for t in MaintenanceView().get_throttles()],
            [ScopedRateThrottle],
        )


class MaintenanceToggleTests(MaintenanceTestBase):
    def test_staff_can_enable_and_disable(self):
        ends_at = timezone.now() + timedelta(hours=2)

        response = self.client.patch(
            STATUS_URL,
            {'is_active': True, 'title': 'Upgrade window', 'ends_at': ends_at.isoformat()},
            format='json',
            **bearer(self.staff),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data['active'])
        self.assertIsNotNone(response.data['started_at'])
        state = MaintenanceState.objects.get(pk=1)
        self.assertTrue(state.is_active)
        self.assertEqual(state.updated_by, self.staff)

        response = self.client.patch(
            STATUS_URL, {'is_active': False}, format='json', **bearer(self.staff)
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(response.data['active'])
        state.refresh_from_db()
        self.assertIsNone(state.started_at)
        self.assertIsNone(state.ends_at)

    def test_non_staff_cannot_patch(self):
        response = self.client.patch(
            STATUS_URL, {'is_active': True}, format='json', **bearer(self.employee)
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
        self.assertFalse(MaintenanceState.objects.filter(is_active=True).exists())

    def test_non_staff_patch_is_503_while_active(self):
        enable()

        response = self.client.patch(
            STATUS_URL, {'is_active': False}, format='json', **bearer(self.employee)
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, response.data)
        self.assertTrue(MaintenanceState.objects.get(pk=1).is_active)

    def test_enable_rejects_past_ends_at(self):
        response = self.client.patch(
            STATUS_URL,
            {'is_active': True, 'ends_at': (timezone.now() - timedelta(minutes=1)).isoformat()},
            format='json',
            **bearer(self.staff),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn('ends_at', response.data)
        self.assertFalse(MaintenanceState.objects.filter(is_active=True).exists())

    def test_editing_an_active_window_keeps_started_at(self):
        state = enable()
        started_at = state.started_at

        response = self.client.patch(
            STATUS_URL, {'title': 'New title'}, format='json', **bearer(self.staff)
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        state.refresh_from_db()
        self.assertEqual(state.started_at, started_at)
        self.assertEqual(state.title, 'New title')

    def test_message_only_patch_while_off_preserves_a_prestaged_window(self):
        """A copy edit while off must not wipe a pre-staged expected end: the
        admin fills the form before flipping the switch."""
        ends_at = timezone.now() + timedelta(hours=2)

        self.client.patch(
            STATUS_URL,
            {'title': 'Prestaged', 'message': 'Ready', 'ends_at': ends_at.isoformat()},
            format='json',
            **bearer(self.staff),
        )

        state = MaintenanceState.objects.get(pk=1)
        self.assertFalse(state.is_active)
        self.assertIsNotNone(state.ends_at)

        self.client.patch(STATUS_URL, {'is_active': True}, format='json', **bearer(self.staff))

        state.refresh_from_db()
        self.assertTrue(state.is_active)
        self.assertEqual(state.ends_at, ends_at)
        self.assertIsNotNone(state.started_at)

    def test_audit_rows_written(self):
        self.client.patch(STATUS_URL, {'is_active': True}, format='json', **bearer(self.staff))
        self.client.patch(STATUS_URL, {'is_active': False}, format='json', **bearer(self.staff))

        self.assertTrue(AuditLog.objects.filter(action='MAINTENANCE_ON').exists())
        self.assertTrue(AuditLog.objects.filter(action='MAINTENANCE_OFF').exists())

    def test_django_admin_cannot_change_the_switch(self):
        """The admin GUI owns the write path: a Django-admin save would arm the
        switch without stamping started_at/ends_at, silently dropping the
        auto-expire safety net and the 'closed since' display."""
        from django.contrib.admin import site as admin_site
        from django.test import RequestFactory

        from apps.dashboard.admin import MaintenanceStateAdmin

        request = RequestFactory().get('/')
        request.user = self.superuser
        model_admin = MaintenanceStateAdmin(MaintenanceState, admin_site)

        self.assertFalse(model_admin.has_change_permission(request))
        self.assertFalse(model_admin.has_add_permission(request))
        self.assertFalse(model_admin.has_delete_permission(request))


class MaintenanceGateTests(MaintenanceTestBase):
    def test_non_staff_login_blocked(self):
        enable()

        response = self.client.post(
            LOGIN_URL, {'username': 'employee', 'password': 'testpass123'}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, response.data)
        self.assertEqual(response.data['code'], 'maintenance')
        self.assertNotIn('access', response.data)

    def test_maintenance_refusal_is_not_recorded_as_a_failed_login(self):
        """A closed platform is not a credential failure: a window full of
        refusals must not read like a brute-force burst in the security audit."""
        enable()

        response = self.client.post(
            LOGIN_URL, {'username': 'employee', 'password': 'testpass123'}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, response.data)
        self.assertFalse(
            AuditLog.objects.filter(
                action='LOGIN_FAILED', extra_data__username='employee'
            ).exists()
        )
        blocked = AuditLog.objects.filter(action='MAINTENANCE_BLOCKED')
        self.assertTrue(blocked.exists())
        self.assertEqual(blocked.first().extra_data['username'], 'employee')

    def test_staff_login_allowed(self):
        enable()

        response = self.client.post(
            LOGIN_URL, {'username': 'staff', 'password': 'testpass123'}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('access', response.data)

    def test_superuser_login_allowed(self):
        enable()

        response = self.client.post(
            LOGIN_URL, {'username': 'root', 'password': 'testpass123'}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_non_staff_api_call_blocked(self):
        enable()

        response = self.client.get(ME_URL, **bearer(self.employee))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, response.data)
        self.assertEqual(response.data['code'], 'maintenance')
        self.assertEqual(response['Retry-After'], '60')

    def test_staff_api_call_allowed(self):
        enable()

        response = self.client.get(ME_URL, **bearer(self.staff))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_non_staff_refresh_blocked_and_token_not_blacklisted(self):
        enable()
        refresh = RefreshToken.for_user(self.employee)

        blocked = self.client.post(
            REFRESH_URL, {'refresh': str(refresh)}, format='json'
        )
        self.assertEqual(blocked.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, blocked.data)
        self.assertEqual(blocked.data['code'], 'maintenance')

        disable()
        allowed = self.client.post(
            REFRESH_URL, {'refresh': str(refresh)}, format='json'
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.data)

    def test_staff_refresh_allowed(self):
        enable()
        refresh = RefreshToken.for_user(self.staff)

        response = self.client.post(REFRESH_URL, {'refresh': str(refresh)}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_mfa_verify_blocked(self):
        enable()
        with patch(
            'apps.users.views.auth.mfa_service.read_challenge', return_value=self.employee
        ), patch('apps.users.views.auth.mfa_service.verify_second_factor'):
            response = self.client.post(
                '/api/auth/token/mfa-verify/', {'mfa_token': 'x', 'code': '123456'}, format='json'
            )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, response.data)
        self.assertEqual(response.data['code'], 'maintenance')

    def test_health_endpoints_stay_available(self):
        enable()

        self.assertEqual(self.client.get('/api/health/live/').status_code, 200)
        self.assertEqual(self.client.get('/api/health/ready/').status_code, 200)

    def test_disabling_restores_access(self):
        enable()
        self.assertEqual(self.client.get(ME_URL, **bearer(self.employee)).status_code, 503)

        disable()

        self.assertEqual(self.client.get(ME_URL, **bearer(self.employee)).status_code, 200)


class MaintenanceExpiryTests(MaintenanceTestBase):
    def test_expired_window_is_inactive_and_self_heals(self):
        enable(ends_at=timezone.now() - timedelta(minutes=5))
        clear_maintenance_cache()

        self.assertFalse(is_maintenance_active())
        self.assertFalse(MaintenanceState.objects.get(pk=1).is_active)

    def test_self_heal_bumps_updated_at(self):
        state = enable(ends_at=timezone.now() - timedelta(minutes=5))
        before = state.updated_at
        clear_maintenance_cache()

        self.assertFalse(is_maintenance_active())
        state.refresh_from_db()
        self.assertGreater(state.updated_at, before)

    def test_future_window_stays_active(self):
        enable(ends_at=timezone.now() + timedelta(hours=1))
        clear_maintenance_cache()

        self.assertTrue(is_maintenance_active())

    def test_open_ended_window_stays_active(self):
        enable(ends_at=None)
        clear_maintenance_cache()

        self.assertTrue(is_maintenance_active())


class MaintenanceCacheTests(MaintenanceTestBase):
    def test_cache_is_cleared_on_save(self):
        self.assertFalse(get_maintenance_state()['active'])

        enable()

        self.assertTrue(is_maintenance_active())

    def test_cache_failure_falls_back_to_the_database(self):
        enable()
        with patch('core.maintenance.state.cache.get', side_effect=RuntimeError('redis down')):
            self.assertTrue(is_maintenance_active())
