"""
Deployment tests for dev-mode settings and security posture.

These tests verify dev-mode-safe hardening: health endpoints, throttle
configuration, and schema enum collision resolution. Production settings
contract tests will be added when the production deployment profile is
built (per the hardening plan Phase 4, deferred until Postgres/Redis are
introduced).
"""
from __future__ import annotations

from django.test import SimpleTestCase, TestCase, override_settings


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


class ProxyForwardedProtoTests(TestCase):
    """Verify the SECURE_PROXY_SSL_HEADER contract nginx must honour.

    nginx never terminates TLS itself (no ``ssl`` listener in
    ``frontend/docker/nginx.conf``) — it must forward whatever
    ``X-Forwarded-Proto`` it received from the layer in front of it
    (Cloudflare Tunnel, or any TLS-terminating proxy per the README),
    never substitute its own ``$scheme`` (always "http"). This test locks
    down the Django-side half of that contract: it does not run nginx, but
    it proves what nginx's forwarded header must say to avoid a redirect
    loop on every request behind Cloudflare Tunnel or a TLS-terminating
    proxy — a plain-HTTP request straight to Django without the header
    still correctly redirects (fails closed), and a request carrying
    ``X-Forwarded-Proto: https`` does not.
    """

    def test_request_with_forwarded_proto_https_is_not_redirected(self):
        with override_settings(
            SECURE_SSL_REDIRECT=True,
            SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
            # Health endpoints are exempt by default (P0-7) — force the
            # redirect check to actually run here, so a pass proves the
            # header did its job rather than the exemption doing it instead.
            SECURE_REDIRECT_EXEMPT=[],
        ):
            response = self.client.get(
                "/api/health/ready/",
                secure=False,
                HTTP_X_FORWARDED_PROTO="https",
            )
            self.assertNotEqual(response.status_code, 301)

    def test_request_without_forwarded_proto_still_redirects(self):
        with override_settings(
            SECURE_SSL_REDIRECT=True,
            SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
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
        """P2-12: CORS_ALLOW_CREDENTIALS must be False in production.

        The SPA calls the API same-origin (relative /api proxied by nginx), so
        CORS never applies to its cookie-bearing refresh request. Enabling
        credentials would only add cross-origin cookie/CSRF risk. If the API is
        ever hosted on a different origin, this must be revisited (the
        refresh_token cookie would then need credentials).
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
            self.assertFalse(CORS_ALLOW_CREDENTIALS)
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


class NginxTemplateProxyContractTests(SimpleTestCase):
    """Every location that proxies to Django must forward X-Forwarded-Proto.

    Django runs with SECURE_SSL_REDIRECT behind a TLS-terminating proxy; a
    proxied location that omits the header gets a 301 to https for every
    request (a redirect loop for e.g. /static/ admin assets).
    """

    @staticmethod
    def _backend_locations():
        import re
        from pathlib import Path

        from django.conf import settings

        text = (Path(settings.BASE_DIR) / 'frontend' / 'docker' / 'nginx.conf.template').read_text(
            encoding='utf-8'
        )
        blocks = {}
        for match in re.finditer(r'^\s*location\s+([^\s{]+)\s*\{', text, re.MULTILINE):
            depth, pos = 1, match.end()
            while depth and pos < len(text):
                depth += {'{': 1, '}': -1}.get(text[pos], 0)
                pos += 1
            body = text[match.end():pos]
            if 'proxy_pass http://backend' in body:
                blocks[match.group(1)] = body
        return blocks

    def test_template_has_backend_locations(self):
        self.assertTrue({'/api/', '/media/', '/static/', '/admin/'} <= set(self._backend_locations()))

    def test_every_backend_location_forwards_x_forwarded_proto(self):
        for path, body in self._backend_locations().items():
            with self.subTest(location=path):
                self.assertIn('proxy_set_header X-Forwarded-Proto', body)


class DockerIgnoreContractTests(SimpleTestCase):
    """The images COPY their build context, which ignores .gitignore.

    Local-only secrets, databases and scratch data must be excluded explicitly or
    they ship inside the production image.
    """

    @staticmethod
    def _patterns(relative_path):
        from pathlib import Path

        from django.conf import settings

        text = (Path(settings.BASE_DIR) / relative_path).read_text(encoding='utf-8')
        return {
            line.strip().rstrip('/') for line in text.splitlines()
            if line.strip() and not line.strip().startswith('#')
        }

    def test_backend_context_excludes_secrets_databases_and_scratch(self):
        patterns = self._patterns('.dockerignore')
        required = {
            '*.pem', '.env', '.env.*', '*.sqlite3', '*.sqlite3-journal', '*.xlsx',
            '*.patch', 'time_tracker_export.json', '.worktrees', '.devin', '.agents',
            '.claude', 'tmp-probe', 'frontend',
            # Other agents' state, scratch venvs and the repo-root node_modules.
            '.windsurf', '.verdent', '.superpowers', '.trace-mcp', '.fallow', '.mcheck',
            'opencode.json', '$TEMP', 'node_modules',
        }
        self.assertEqual(required - patterns, set())

    def test_backend_context_keeps_the_example_env(self):
        self.assertIn('!.env.example', self._patterns('.dockerignore'))

    def test_frontend_context_excludes_test_artifacts_and_env_files(self):
        patterns = self._patterns('frontend/.dockerignore')
        required = {'e2e', 'e2e-observed', 'test-results', 'playwright-report', '.env', '.env.*'}
        self.assertEqual(required - patterns, set())


class EntrypointContractTests(SimpleTestCase):
    """docker/entrypoint.sh must prepare the app in a safe order before serving."""

    @staticmethod
    def _commands():
        from pathlib import Path

        from django.conf import settings

        text = (Path(settings.BASE_DIR) / 'docker' / 'entrypoint.sh').read_text(encoding='utf-8')
        return [
            line.strip() for line in text.splitlines()
            if line.strip().startswith(('python manage.py', 'exec '))
        ]

    def test_migrates_then_syncs_plugins_then_serves(self):
        commands = self._commands()
        migrate = commands.index('python manage.py migrate --noinput')
        sync = commands.index('python manage.py sync_plugins')
        serve = next(i for i, c in enumerate(commands) if c.startswith('exec '))
        self.assertLess(migrate, sync)
        self.assertLess(sync, serve)


class FrontendPublicAssetsTests(SimpleTestCase):
    """Everything under frontend/public is copied into dist/ and served to the internet."""

    @staticmethod
    def _public_files():
        from pathlib import Path

        from django.conf import settings

        root = Path(settings.BASE_DIR) / 'frontend' / 'public'
        return [p for p in root.rglob('*') if p.is_file()]

    def test_no_dev_only_pages(self):
        offenders = [p.name for p in self._public_files() if p.name.startswith('_dev')]
        self.assertEqual(offenders, [])

    def test_no_embedded_jwts(self):
        import re

        jwt = re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.')
        offenders = []
        for path in self._public_files():
            if path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.ico', '.webp', '.woff', '.woff2'}:
                continue
            if jwt.search(path.read_text(encoding='utf-8-sig', errors='ignore')):
                offenders.append(path.name)
        self.assertEqual(offenders, [])
