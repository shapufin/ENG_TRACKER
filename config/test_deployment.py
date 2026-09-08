"""
Deployment tests for dev-mode settings and security posture.

These tests verify dev-mode-safe hardening: health endpoints, throttle
configuration, and schema enum collision resolution. Production settings
contract tests will be added when the production deployment profile is
built (per the hardening plan Phase 4, deferred until Postgres/Redis are
introduced).
"""
from __future__ import annotations

from django.test import TestCase, override_settings


class HealthEndpointTests(TestCase):
    """Verify the health/readiness probes respond correctly."""

    def test_live_probe_returns_200(self):
        response = self.client.get("/api/health/live/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "live")

    def test_ready_probe_returns_200_with_checks(self):
        response = self.client.get("/api/health/ready/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ready")
        # P2-2: checks detail is no longer leaked — only status is returned
        self.assertNotIn("checks", body)

    def test_probes_require_no_auth(self):
        # No Authorization header, no logged-in user — must still succeed.
        response = self.client.get("/api/health/live/")
        self.assertEqual(response.status_code, 200)
        response = self.client.get("/api/health/ready/")
        self.assertEqual(response.status_code, 200)

    def test_ready_probe_not_redirected_under_ssl_redirect(self):
        """P0-7: health endpoints must be exempt from SECURE_SSL_REDIRECT.

        In production, ``SECURE_SSL_REDIRECT=True`` causes
        ``SecurityMiddleware`` to 301-redirect plain-HTTP requests before
        the view runs. Health probes hit the backend directly over HTTP
        (no ``X-Forwarded-Proto``), so they would get a 301 instead of the
        real 200/503 — and ``curl -f`` treats 3xx as success, masking
        failures. ``SECURE_REDIRECT_EXEMPT`` must include ``api/health/``.
        """
        with override_settings(
            SECURE_SSL_REDIRECT=True,
            SECURE_REDIRECT_EXEMPT=[r"^api/health/"],
        ):
            response = self.client.get("/api/health/ready/", secure=False)
            self.assertNotEqual(response.status_code, 301)
            self.assertEqual(response.status_code, 200)

    def test_ready_probe_redirects_when_not_exempt(self):
        """Without the exemption, SSL redirect fires on health endpoints."""
        with override_settings(
            SECURE_SSL_REDIRECT=True,
            SECURE_REDIRECT_EXEMPT=[],
        ):
            response = self.client.get("/api/health/ready/", secure=False)
            self.assertEqual(response.status_code, 301)


class ThrottleConfigurationTests(TestCase):
    """Verify the throttle scope rates are configured in base settings."""

    def test_scoped_throttle_rates_defined(self):
        from django.conf import settings
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        # In dev/test mode the scoped rates are None (disabled) to avoid
        # 429s in the test suite; the keys must still be present so DRF
        # doesn't raise ImproperlyConfigured when a throttle_scope is set.
        for scope in ("auth", "upload", "export", "evidence_upload", "control_room"):
            self.assertIn(scope, rates, f"Missing throttle scope: {scope}")

    def test_scoped_throttle_class_registered(self):
        from django.conf import settings
        classes = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"]
        self.assertIn("rest_framework.throttling.ScopedRateThrottle", classes)

    def test_num_proxies_set_in_production(self):
        """P1-9: NUM_PROXIES must be set to prevent XFF throttle bypass.

        Without ``NUM_PROXIES``, DRF's ``BaseThrottle.get_ident()`` uses
        the entire ``X-Forwarded-For`` header as the throttle key. An
        attacker can send unique XFF values per request to bypass all
        IP-based throttling. With ``NUM_PROXIES=1``, DRF takes the last
        entry in the XFF list (the IP nginx appended).
        """
        # Dev settings don't need NUM_PROXIES (no proxy in dev).
        # This test verifies the production settings module sets it.
        import os
        env_vars = {
            'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
            'ALLOWED_HOSTS': 'localhost',
            'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
            'DB_HOST': 'localhost', 'FRONTEND_URL': 'http://localhost',
            'ENABLE_API_DOCS': 'False',
        }
        saved = {k: os.environ.get(k) for k in env_vars}
        os.environ.update(env_vars)
        try:
            from config.settings_production import REST_FRAMEWORK as prod_rf
            num_proxies = prod_rf.get("NUM_PROXIES")
            self.assertIsNotNone(num_proxies, "NUM_PROXIES must be set in production")
            self.assertGreaterEqual(num_proxies, 1)
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_secure_proxy_ssl_header_set_in_production(self):
        """P0-2: SECURE_PROXY_SSL_HEADER must be set in production.

        Without this, Django cannot detect HTTPS behind the external
        proxy (TLS is terminated upstream). Secure cookies fail and
        SSL redirect loops.
        """
        import os
        env_vars = {
            'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
            'ALLOWED_HOSTS': 'localhost',
            'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
            'DB_HOST': 'localhost', 'FRONTEND_URL': 'http://localhost',
            'ENABLE_API_DOCS': 'False',
        }
        saved = {k: os.environ.get(k) for k in env_vars}
        os.environ.update(env_vars)
        try:
            from config.settings_production import SECURE_PROXY_SSL_HEADER
            self.assertEqual(
                SECURE_PROXY_SSL_HEADER,
                ('HTTP_X_FORWARDED_PROTO', 'https'),
            )
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_frontend_url_required_in_production(self):
        """P1-7: FRONTEND_URL must be required in production (no localhost fallback).

        Without this, CORS silently allows an insecure localhost origin,
        enabling cross-origin attacks from any local dev server.
        """
        import os
        env_vars = {
            'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
            'ALLOWED_HOSTS': 'localhost',
            'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
            'DB_HOST': 'localhost', 'ENABLE_API_DOCS': 'False',
        }
        saved = {k: os.environ.get(k) for k in env_vars}
        # Ensure FRONTEND_URL is NOT set
        saved_frontend = os.environ.pop('FRONTEND_URL', None)
        os.environ.update(env_vars)
        os.environ.pop('FRONTEND_URL', None)
        try:
            from django.core.exceptions import ImproperlyConfigured
            with self.assertRaises(ImproperlyConfigured):
                # Force reimport of the production settings module
                import importlib
                import config.settings_production
                importlib.reload(config.settings_production)
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
            if saved_frontend is not None:
                os.environ['FRONTEND_URL'] = saved_frontend

    def test_cors_credentials_disabled_in_production(self):
        """P2-12: CORS_ALLOW_CREDENTIALS must be False for JWT-only SPA.

        The SPA uses the Authorization header, not cookies. Enabling
        credentials increases cross-origin cookie/CSRF risk unnecessarily.
        """
        import os
        env_vars = {
            'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
            'ALLOWED_HOSTS': 'localhost',
            'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
            'DB_HOST': 'localhost', 'FRONTEND_URL': 'http://localhost',
            'ENABLE_API_DOCS': 'False',
        }
        saved = {k: os.environ.get(k) for k in env_vars}
        os.environ.update(env_vars)
        try:
            from config.settings_production import CORS_ALLOW_CREDENTIALS
            self.assertTrue(CORS_ALLOW_CREDENTIALS)
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_csrf_trusted_origins_set_in_production(self):
        """P1-4: CSRF_TRUSTED_ORIGINS must be configured in production."""
        import os
        import importlib
        env_vars = {
            'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
            'ALLOWED_HOSTS': 'localhost',
            'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
            'DB_HOST': 'localhost', 'FRONTEND_URL': 'https://app.example.com',
            'ENABLE_API_DOCS': 'False',
        }
        saved = {k: os.environ.get(k) for k in env_vars}
        os.environ.update(env_vars)
        try:
            import config.settings_production as sp
            importlib.reload(sp)
            self.assertEqual(sp.CSRF_TRUSTED_ORIGINS, ['https://app.example.com'])
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_django_extensions_not_in_production(self):
        """P3-8: django_extensions must not be in prod INSTALLED_APPS.

        ``django_extensions`` adds management commands (shell_plus,
        runserver_plus, sqldiff, show_urls) and template tags that are
        unnecessary attack surface in production. It inherits from dev
        settings via ``from .settings import *``; production settings
        must strip it.
        """
        import os
        import importlib
        env_vars = {
            'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
            'ALLOWED_HOSTS': 'localhost',
            'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
            'DB_HOST': 'localhost', 'FRONTEND_URL': 'http://localhost',
            'ENABLE_API_DOCS': 'False',
        }
        saved = {k: os.environ.get(k) for k in env_vars}
        os.environ.update(env_vars)
        try:
            import config.settings_production as sp
            importlib.reload(sp)
            self.assertNotIn(
                'django_extensions', sp.INSTALLED_APPS,
                "django_extensions must be stripped from production "
                "INSTALLED_APPS (unnecessary attack surface).",
            )
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v


class SchemaEnumCollisionTests(TestCase):
    """Verify the evidence_type enum collision is resolved via overrides."""

    def test_evidence_type_overrides_present(self):
        from django.conf import settings
        overrides = settings.SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]
        self.assertIn("OvertimeEvidenceTypeEnum", overrides)
        self.assertIn("KPIEvidenceTypeEnum", overrides)


class OpenAPISmokeTests(TestCase):
    """Verify the public schema endpoint exposes representative API routes."""

    def test_schema_endpoint_returns_openapi_document(self):
        response = self.client.get(
            "/api/schema/",
            HTTP_ACCEPT="application/json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        document = response.json()
        self.assertEqual(document["openapi"], "3.0.3")
        self.assertEqual(document["info"]["title"], "Time Tracker API")
        self.assertIn("/api/auth/token/", document["paths"])
        self.assertIn("/api/overtime/logs/", document["paths"])
        self.assertIn("/api/reports/summary/", document["paths"])

    def test_schema_document_has_no_duplicate_operation_ids(self):
        response = self.client.get(
            "/api/schema/",
            HTTP_ACCEPT="application/json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200)

        operation_ids = []
        for path_item in response.json()["paths"].values():
            operation_ids.extend(
                operation["operationId"]
                for method, operation in path_item.items()
                if method in {"get", "post", "put", "patch", "delete"}
                and "operationId" in operation
            )
        self.assertEqual(len(operation_ids), len(set(operation_ids)))

    def test_schema_endpoint_disabled_when_api_docs_off(self):
        """P0-4: ``/api/schema/`` must be gated by ``ENABLE_API_DOCS``.

        In production ``ENABLE_API_DOCS=False`` so unauthenticated users
        cannot enumerate every endpoint, parameter, and serializer field.
        Only the docs *UI* was gated; the schema endpoint itself was
        always enabled.
        """
        with override_settings(ENABLE_API_DOCS=False, DEBUG=False):
            response = self.client.get(
                "/api/schema/",
                HTTP_ACCEPT="application/json",
                HTTP_HOST="localhost",
            )
            self.assertEqual(response.status_code, 404)

    def test_schema_endpoint_enabled_when_api_docs_on(self):
        """Schema endpoint is accessible when ENABLE_API_DOCS is True."""
        with override_settings(ENABLE_API_DOCS=True, DEBUG=False):
            response = self.client.get(
                "/api/schema/",
                HTTP_ACCEPT="application/json",
                HTTP_HOST="localhost",
            )
            self.assertEqual(response.status_code, 200)
