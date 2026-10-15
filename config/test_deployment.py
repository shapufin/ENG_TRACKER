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

    def test_schema_generation_has_no_phase4_warnings(self):
        """The six drf_spectacular warnings from ``check --deploy`` stay fixed."""
        from drf_spectacular.drainage import GENERATOR_STATS
        from drf_spectacular.generators import SchemaGenerator

        GENERATOR_STATS.reset()
        SchemaGenerator().get_schema(request=None, public=True)
        messages = list(GENERATOR_STATS._warn_cache) + list(GENERATOR_STATS._error_cache)
        watched = (
            "get_logo_url", "get_plugin_access", "get_client_names",
            "TechAssignmentField", "TokenLogoutView", "GatedSpectacularAPIView",
        )
        offending = [m for m in messages if any(name in m for name in watched)]
        self.assertEqual(offending, [])

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

    def test_every_backend_location_overwrites_x_forwarded_for(self):
        """SEC-11: the health throttle and DRF NUM_PROXIES=1 read the *last*
        X-Forwarded-For entry, which is only the real client when nginx
        overwrites the header instead of appending to a client-supplied one."""
        for path, body in self._backend_locations().items():
            with self.subTest(location=path):
                self.assertIn('proxy_set_header X-Forwarded-For $remote_addr;', body)
                self.assertNotIn('$proxy_add_x_forwarded_for;', body)

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

    def test_backend_context_excludes_backups_exports_and_agent_state(self):
        """DEP-01: DB backups, PII exports and large local-only trees must not ship."""
        patterns = self._patterns('.dockerignore')
        required = {
            '*.bak*', 'migration/out', 'migration/*.csv', 'graphify-out', '.opencode',
            '.codex', 'admin-gui-screenshots', 'design-screenshots', 'design-fingerprints',
            '*.patch', '*.log', 'time_tracker_export.json', '*.xlsx',
            'export_skills_plugin.py', 'db.sqlite3*', '.env*',
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

    @staticmethod
    def _gated_block():
        """The text between ``if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then`` and its ``fi``."""
        from pathlib import Path

        from django.conf import settings

        text = (Path(settings.BASE_DIR) / 'docker' / 'entrypoint.sh').read_text(encoding='utf-8')
        opener = 'if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then'
        assert opener in text, 'entrypoint has no RUN_MIGRATIONS gate'
        start = text.index(opener) + len(opener)
        import re

        end = re.search(r'^fi$', text[start:], re.MULTILINE)
        return text[start:start + end.start()]

    def test_boot_commands_are_gated_by_run_migrations_defaulting_to_on(self):
        block = self._gated_block()
        for command in (
            'migrate --noinput', 'sync_plugins', 'seed_plugin_permissions',
            'grant_hbpr_plugin_access', 'purge_hbpr_archive', 'ensure_superuser',
        ):
            with self.subTest(command=command):
                self.assertIn(f'python manage.py {command}', block)

    def test_gated_boot_commands_keep_their_order(self):
        block = self._gated_block()
        order = [
            block.index(f'python manage.py {c}') for c in (
                'migrate --noinput', 'sync_plugins', 'seed_plugin_permissions',
                'grant_hbpr_plugin_access', 'purge_hbpr_archive',
            )
        ]
        self.assertEqual(order, sorted(order))

    def test_server_start_is_not_gated(self):
        block = self._gated_block()
        self.assertNotIn('exec "$@"', block)


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


class ProductionThrottleRatesTests(SimpleTestCase):
    """SEC-01: scoped throttle rates must not depend on the dev DEBUG default.

    The base settings compute the scoped rates as ``None`` when ``DEBUG`` is
    truthy (its env default is ``'1'``). Production forces ``DEBUG = False``
    only after ``import *``, so without explicit literals login throttling was
    silently off. Checked in a subprocess so the live settings are untouched.
    """

    def _production_rates(self, **extra_env):
        import json
        import os
        import subprocess
        import sys

        from django.conf import settings

        env = {k: v for k, v in os.environ.items() if k != 'DEBUG'}
        env.update({
            'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
            'ALLOWED_HOSTS': 'localhost',
            'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
            'DB_HOST': 'localhost', 'FRONTEND_URL': 'http://localhost',
            'ENABLE_API_DOCS': 'False',
        })
        env.update(extra_env)
        out = subprocess.run(
            [sys.executable, '-c',
             'import json, config.settings_production as s; '
             'print(json.dumps(s.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]))'],
            cwd=str(settings.BASE_DIR), env=env, capture_output=True,
            text=True, check=True,
        )
        return json.loads(out.stdout.strip().splitlines()[-1])

    def _assert_all_set(self, rates):
        for scope in ('anon', 'user', 'auth', 'upload', 'export',
                      'evidence_upload', 'control_room', 'health'):
            self.assertIn(scope, rates)
        for scope, rate in rates.items():
            self.assertIsNotNone(rate, f"throttle scope {scope!r} is unlimited in production")

    def test_rates_set_when_debug_env_unset(self):
        self._assert_all_set(self._production_rates())

    def test_rates_set_when_debug_env_is_one(self):
        self._assert_all_set(self._production_rates(DEBUG='1'))


class ProductionSettingsHardeningTests(SimpleTestCase):
    """DEP-03/04/05/10/11/14: production settings are read in a subprocess so the
    live (test) settings and the reload-sensitive sibling tests stay untouched."""

    BASE_ENV = {
        'SECRET_KEY': 'test-secret-key-long-enough-for-django-deploy-check-50chars',
        'ALLOWED_HOSTS': 'localhost',
        'DB_NAME': 'test', 'DB_USER': 'test', 'DB_PASSWORD': 'test',
        'DB_HOST': 'localhost', 'FRONTEND_URL': 'http://localhost',
    }

    def _run(self, expression, drop=(), **extra_env):
        import os
        import subprocess
        import sys

        from django.conf import settings

        env = {k: v for k, v in os.environ.items() if k not in ('DEBUG', *drop)}
        env.update(self.BASE_ENV)
        env.update(extra_env)
        for key in drop:
            env.pop(key, None)
        return subprocess.run(
            [sys.executable, '-c',
             'import json, config.settings_production as s; '
             f'print(json.dumps({expression}))'],
            cwd=str(settings.BASE_DIR), env=env, capture_output=True, text=True,
        )

    def _value(self, expression, **kwargs):
        import json

        out = self._run(expression, **kwargs)
        self.assertEqual(out.returncode, 0, out.stderr[-600:])
        return json.loads(out.stdout.strip().splitlines()[-1])

    def test_logging_has_console_handler_on_root_at_info(self):
        logging_cfg = self._value('s.LOGGING')
        self.assertEqual(logging_cfg['root']['level'], 'INFO')
        self.assertIn('console', logging_cfg['root']['handlers'])
        self.assertEqual(logging_cfg['handlers']['console']['class'], 'logging.StreamHandler')

    def test_logging_django_request_is_warning_and_security_file_handler_kept(self):
        logging_cfg = self._value('s.LOGGING')
        self.assertEqual(logging_cfg['loggers']['django.request']['level'], 'WARNING')
        for name in ('django.security', 'engtracker.security'):
            self.assertIn('security_file', logging_cfg['loggers'][name]['handlers'])
            self.assertIn('console', logging_cfg['loggers'][name]['handlers'])

    def test_db_connections_are_persistent_and_health_checked(self):
        db = self._value("s.DATABASES['default']", drop=('DB_CONN_MAX_AGE',))
        self.assertEqual(db['CONN_MAX_AGE'], 60)
        self.assertIs(db['CONN_HEALTH_CHECKS'], True)

    def test_db_conn_max_age_is_env_driven(self):
        db = self._value("s.DATABASES['default']", DB_CONN_MAX_AGE='5')
        self.assertEqual(db['CONN_MAX_AGE'], 5)

    def test_redis_cache_has_timeouts_and_ignores_outages(self):
        options = self._value("s.CACHES['default']['OPTIONS']")
        self.assertEqual(options['CLIENT_CLASS'], 'django_redis.client.DefaultClient')
        self.assertEqual(options['SOCKET_CONNECT_TIMEOUT'], 5)
        self.assertEqual(options['SOCKET_TIMEOUT'], 5)
        self.assertIs(options['IGNORE_EXCEPTIONS'], True)

    def test_empty_allowed_hosts_fails_fast(self):
        for value in ('', ' , '):
            with self.subTest(value=value):
                out = self._run('s.ALLOWED_HOSTS', ALLOWED_HOSTS=value)
                self.assertNotEqual(out.returncode, 0)
                self.assertIn('ALLOWED_HOSTS', out.stderr)

    def test_unset_allowed_hosts_fails_fast(self):
        out = self._run('s.ALLOWED_HOSTS', drop=('ALLOWED_HOSTS',))
        self.assertNotEqual(out.returncode, 0)
        self.assertIn('ALLOWED_HOSTS', out.stderr)

    def test_allowed_hosts_are_trimmed(self):
        self.assertEqual(
            self._value('s.ALLOWED_HOSTS', ALLOWED_HOSTS='a.example.com, b.example.com'),
            ['a.example.com', 'b.example.com'],
        )

    def test_session_lifetime_is_eight_hours(self):
        self.assertEqual(self._value('s.SESSION_COOKIE_AGE'), 8 * 60 * 60)

    def test_data_upload_limit_is_explicit(self):
        self.assertEqual(self._value('s.DATA_UPLOAD_MAX_MEMORY_SIZE'), 2621440)

    def test_api_docs_off_without_env_var(self):
        self.assertIs(self._value('s.ENABLE_API_DOCS'), False)

    def test_dead_api_docs_env_var_not_set_in_dockerfile_or_ci(self):
        from pathlib import Path

        from django.conf import settings

        for rel in ('Dockerfile', '.github/workflows/ci.yml'):
            text = (Path(settings.BASE_DIR) / rel).read_text(encoding='utf-8')
            self.assertNotIn('ENABLE_API_DOCS', text, rel)


class DockerfileGunicornContractTests(SimpleTestCase):
    """DEP-13: gunicorn flags live in the Dockerfile CMD."""

    @staticmethod
    def _cmd():
        from pathlib import Path

        from django.conf import settings

        text = (Path(settings.BASE_DIR) / 'Dockerfile').read_text(encoding='utf-8')
        return next(line for line in text.splitlines() if line.startswith('CMD '))

    def test_workers_are_env_driven_with_default_three(self):
        self.assertIn('--workers ${GUNICORN_WORKERS:-3}', self._cmd())

    def test_heartbeat_dir_is_memory_backed_and_graceful_timeout_set(self):
        cmd = self._cmd()
        self.assertIn('--worker-tmp-dir /dev/shm', cmd)
        self.assertIn('--graceful-timeout 30', cmd)

    def test_gunicorn_is_exec_ed_so_it_receives_signals(self):
        self.assertIn('exec gunicorn', self._cmd())


class NginxTemplateHardeningTests(SimpleTestCase):
    """DEP-09: server_tokens, /api/ rate limit, header coverage, report-only CSP."""

    @staticmethod
    def _text():
        from pathlib import Path

        from django.conf import settings

        return (Path(settings.BASE_DIR) / 'frontend' / 'docker' / 'nginx.conf.template').read_text(
            encoding='utf-8'
        )

    @classmethod
    def _location(cls, path):
        import re

        text = cls._text()
        match = re.search(r'^\s*location\s+(?:\S+\s+)?' + re.escape(path) + r'\s*\{', text, re.MULTILINE)
        assert match, f'no location {path}'
        depth, pos = 1, match.end()
        while depth and pos < len(text):
            depth += {'{': 1, '}': -1}.get(text[pos], 0)
            pos += 1
        return text[match.end():pos]

    @staticmethod
    def _directives(body, name):
        return [
            line.strip() for line in body.splitlines()
            if line.strip().startswith(name + ' ')
        ]

    def test_server_tokens_off(self):
        self.assertIn('server_tokens off;', self._text())

    def test_api_has_a_general_rate_limit_zone(self):
        text = self._text()
        self.assertRegex(text, r'limit_req_zone \$binary_remote_addr zone=api:\d+m rate=\d+r/s;')
        body = self._location('/api/')
        self.assertIn('limit_req zone=api burst=40 nodelay;', body)
        self.assertIn('limit_req_status 429;', body)

    def test_global_body_limit_covers_backup_restore(self):
        # 512 MB is the largest backend limit (site-backup restore); the global
        # value covers every location, so no per-location override may remain.
        text = self._text()
        server_level = text.split('location /assets/', 1)[0]
        self.assertIn('client_max_body_size 512m;', server_level)
        self.assertNotIn('100m', text)
        self.assertNotIn('/api/plugins/site_backup/', text)
        self.assertIn('client_max_body_size 512m;', server_level)
        # site_backup requests fall under /api/, which keeps the rate limit.
        self.assertIn('limit_req zone=api', self._location('/api/'))

    def test_assets_carry_hsts_and_permissions_policy(self):
        body = self._location('/assets/')
        self.assertIn('Strict-Transport-Security', body)
        self.assertIn('Permissions-Policy', body)
        self.assertIn('X-Content-Type-Options', body)

    def test_spa_keeps_enforcing_csp_and_adds_strict_report_only(self):
        body = self._location('/')
        enforcing = [d for d in self._directives(body, 'add_header')
                     if '"Content-Security-Policy"' in d or 'Content-Security-Policy ' in d]
        report_only = [d for d in self._directives(body, 'add_header')
                       if 'Content-Security-Policy-Report-Only' in d]
        self.assertEqual(len(report_only), 1)
        self.assertEqual(len(enforcing), 1)
        # D6: the enforcing policy is unchanged (still allows inline scripts)...
        self.assertIn("script-src 'self' 'unsafe-inline'", enforcing[0])
        # ...while the report-only one measures a strict script-src.
        self.assertIn("script-src 'self' ${ONLYOFFICE_ORIGIN};", report_only[0])
        self.assertNotIn("'unsafe-inline'", report_only[0].split('style-src')[0])

    def test_only_known_envsubst_variables(self):
        import re

        self.assertEqual(set(re.findall(r'\$\{(\w+)\}', self._text())), {'ONLYOFFICE_ORIGIN', 'INGRESS_TRUSTED_CIDR', 'INGRESS_REAL_IP_HEADER'})


class ComposeContractTests(SimpleTestCase):
    """DEP-06/07/13/02: compose wiring for the new env switches, backups and ingress."""

    @staticmethod
    def _service(name):
        import re
        from pathlib import Path

        from django.conf import settings

        text = (Path(settings.BASE_DIR) / 'docker-compose.yml').read_text(encoding='utf-8')
        start = re.search(rf'^  {re.escape(name)}:$', text, re.MULTILINE).start()
        end = re.search(r'^(?:  [a-z][\w-]*:|volumes:|networks:)$', text[start + 1:], re.MULTILINE)
        return text[start:start + 1 + end.start()] if end else text[start:]

    def test_backend_receives_the_new_switches(self):
        body = self._service('backend')
        for var in ('RUN_MIGRATIONS', 'GUNICORN_WORKERS', 'DB_CONN_MAX_AGE'):
            with self.subTest(var=var):
                self.assertIn(f'{var}: ${{{var}:-', body)

    def test_db_backup_is_a_scheduled_loop_with_retention_and_media(self):
        body = self._service('db-backup')
        for needle in ('pg_dump -Fc', 'sleep', 'BACKUP_RETENTION', 'BACKUP_INTERVAL_SECONDS',
                       'media_files:/media:ro', 'tar -czf', 'db_backup:/backups'):
            with self.subTest(needle=needle):
                self.assertIn(needle, body)

    def test_db_backup_only_prunes_after_a_successful_dump(self):
        body = self._service('db-backup')
        self.assertLess(body.index('pg_dump -Fc'), body.index('rm -f'))

    def test_no_ingress_service_is_claimed(self):
        text = self._service('frontend')
        self.assertNotIn('cloudflared reaches', text)
        from pathlib import Path

        from django.conf import settings

        compose = (Path(settings.BASE_DIR) / 'docker-compose.yml').read_text(encoding='utf-8')
        self.assertNotIn('--profile tunnel', compose)
        self.assertNotIn('CLOUDFLARE_TUNNEL_TOKEN', compose)


class IngressTrustConfigTests(SimpleTestCase):
    """The ingress trust boundary is env-driven and its defaults ship in the image."""

    @staticmethod
    def _read(*parts):
        from pathlib import Path

        from django.conf import settings

        return Path(settings.BASE_DIR).joinpath(*parts).read_text(encoding='utf-8')

    def test_template_uses_env_vars_not_literals(self):
        text = self._read('frontend', 'docker', 'nginx.conf.template')
        self.assertIn('set_real_ip_from ${INGRESS_TRUSTED_CIDR};', text)
        self.assertIn('real_ip_header ${INGRESS_REAL_IP_HEADER};', text)
        self.assertIn('${INGRESS_TRUSTED_CIDR} 1;', text)
        self.assertNotIn('set_real_ip_from 172.', text)

    def test_image_and_compose_default_to_the_frontend_net_subnet(self):
        dockerfile = self._read('frontend', 'Dockerfile')
        compose = self._read('docker-compose.yml')
        for source in (dockerfile, compose):
            self.assertIn('172.28.0.0/24', source)
            self.assertIn('CF-Connecting-IP', source)
        self.assertIn('ENV INGRESS_TRUSTED_CIDR=', dockerfile)
        self.assertIn('INGRESS_REAL_IP_HEADER: ${INGRESS_REAL_IP_HEADER:-CF-Connecting-IP}', compose)
