"""
Production settings for Engineering Time Tracker
"""
import os

from .settings import *  # noqa: F403

DEBUG = False

ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', '').split(',') if h.strip()]
# DEP-10: an empty list makes every request a 400 in production; fail at boot
# with a clear message instead (same pattern as the SECRET_KEY guard below).
if not ALLOWED_HOSTS:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        "ALLOWED_HOSTS must list at least one hostname in production "
        "(comma-separated, e.g. ALLOWED_HOSTS=app.example.com)."
    )

# The base settings derive a dev key from SECRET_KEY when this is unset. In
# production the seeds must be encrypted with a key that is carried to a new
# server on purpose, so require it explicitly (docs/deploy/production-runbook.md).
if not os.getenv('MFA_ENCRYPTION_KEYS', '').strip():
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        "MFA_ENCRYPTION_KEYS is required in production (comma-separated Fernet keys; "
        "generate one with: python -c \"from cryptography.fernet import Fernet; "
        "print(Fernet.generate_key().decode())\"). Keep it with SECRET_KEY: losing it "
        "locks out every user who enrolled a second factor."
    )

# P3-8: Strip django_extensions from production INSTALLED_APPS.
# It adds management commands (shell_plus, runserver_plus, sqldiff,
# show_urls) and template tags that are unnecessary attack surface in
# prod. It inherits from dev settings via `from .settings import *`.
INSTALLED_APPS = [  # noqa: F405
    app for app in INSTALLED_APPS if app != 'django_extensions'  # noqa: F405
]

# WhiteNoise: serve static files (admin CSS/JS, collectstatic output)
# directly from the backend without needing nginx /static/ config (P0-8).
# The middleware must be after SecurityMiddleware but before all others.
MIDDLEWARE = [  # noqa: F405
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    *MIDDLEWARE[1:],  # noqa: F405
]
# Override the staticfiles storage to use WhiteNoise's compressed manifest
# storage. This enables efficient static file serving with far-future cache
# headers and content-hash-based URLs.
from django.conf import settings as _django_settings  # noqa: E402
STORAGES = {
    **_django_settings.STORAGES,
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# Security
SECURE_SSL_REDIRECT = True
# Trust the external proxy's HTTPS header (P0-2). The upstream proxy
# (Cloudflare / load balancer / nginx) terminates TLS and forwards
# X-Forwarded-Proto: https. Without this, Django can't detect HTTPS
# behind the proxy and SSL redirect loops or secure cookies fail.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
# Health endpoints are probed directly over HTTP (no X-Forwarded-Proto),
# so they must be exempt from the SSL redirect — otherwise the middleware
# returns 301 before the view runs and curl -f treats 3xx as success,
# masking real 503 failures (P0-7).
SECURE_REDIRECT_EXEMPT = [r'^api/health/']
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
# P2-7: session cookie hardening
SESSION_COOKIE_HTTPONLY = True
# DEP-14: Django's default session lifetime is two weeks. The SPA authenticates
# with JWTs; the session only backs the Django admin, so keep it to a work day.
SESSION_COOKIE_AGE = 8 * 60 * 60
# DEP-14: explicit request-body ceiling for non-file data (Django's default,
# 2.5 MiB). Uploaded files stream to disk and are exempt from this limit, so no
# existing upload needs a higher value; raise it only with evidence.
DATA_UPLOAD_MAX_MEMORY_SIZE = 2621440
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Lax'
# P2-8: SECURE_BROWSER_XSS_FILTER is deprecated and can introduce
# XSS vulnerabilities via auditor bypass. Removed in Django 4.0+.
# nginx still sets X-XSS-Protection for legacy browsers.
# P2-6: referrer policy
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
X_FRAME_OPTIONS = 'DENY'

# Disable API docs (schema + Swagger/Redoc UI) in production so
# unauthenticated users cannot enumerate endpoints (P0-4). Hardcoded on
# purpose: there is no env switch (DEP-11).
ENABLE_API_DOCS = False

# DRF throttle trust: set NUM_PROXIES so DRF extracts the real client IP
# from X-Forwarded-For instead of using the entire header as the throttle
# key (P1-9). With one nginx proxy, NUM_PROXIES=1 takes the last XFF entry
# (the IP nginx appended). If a Cloudflare/ALB layer is added in front,
# set NUM_PROXIES=2 and revert nginx to $proxy_add_x_forwarded_for.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405 — inherit base config
    'NUM_PROXIES': 1,
    # SEC-01: explicit literals. The base settings compute the scoped rates as
    # None while their DEBUG env default is on, and DEBUG is only forced False
    # above, after that dict was built.
    'DEFAULT_THROTTLE_RATES': {
        **REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],  # noqa: F405
        'auth': '20/min',
        'mfa': '10/min',
        'upload': '30/hour',
        'export': '20/hour',
        'evidence_upload': '60/hour',
        'control_room': '120/hour',
        'health': '60/min',
        # Public maintenance status polled by the SPA while the site is closed.
        'maintenance': '120/min',
    },
}

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        'HOST': os.getenv('DB_HOST'),
        'PORT': os.getenv('DB_PORT', '5432'),
        # DEP-04: reuse connections instead of a new Postgres+SSL handshake per
        # request. With sync gunicorn each worker holds one connection, so
        # replicas x GUNICORN_WORKERS must stay below Postgres max_connections.
        # CONN_HEALTH_CHECKS drops a stale persistent connection before reuse.
        'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
        'CONN_HEALTH_CHECKS': True,
        # P1-10: SSL connection to the database.
        # 'prefer' = use SSL if available (local Docker), 'require' = force SSL
        # (managed DBs like RDS/Azure Postgres). Set via DB_SSL_MODE env var.
        'OPTIONS': {
            'sslmode': os.getenv('DB_SSL_MODE', 'prefer'),
        },
    }
}

# CORS — FRONTEND_URL is required in production (P1-7).
# No insecure localhost fallback: if missing, raise ImproperlyConfigured.
_frontend_url = os.getenv('FRONTEND_URL')
if not _frontend_url:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        "FRONTEND_URL environment variable is required in production. "
        "Set it to the HTTPS URL of your frontend (e.g. https://app.example.com)."
    )
CORS_ALLOWED_ORIGINS = [_frontend_url]
# The SPA calls the API same-origin (relative /api via the nginx proxy), so
# cross-origin credentials are not needed. Access tokens go in the
# Authorization header; the refresh_token cookie is same-origin only (P2-12).
# If the API is ever served from a different origin, revisit this.
CORS_ALLOW_CREDENTIALS = False
# CSRF trusted origins — derived from FRONTEND_URL for session-auth
# routes (e.g. Django admin) (P1-4).
CSRF_TRUSTED_ORIGINS = [_frontend_url]

# Email configuration
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)

# Logging — P2-1: security event logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        # DEP-03: stdout/stderr so `docker logs` shows application logs.
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
        },
        'file': {
            'level': 'ERROR',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(BASE_DIR, 'logs', 'django.log'),  # noqa: F405
            'maxBytes': 1024 * 1024 * 5,  # 5 MB
            'backupCount': 5,
        },
        'security_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(BASE_DIR, 'logs', 'security.log'),  # noqa: F405
            'maxBytes': 1024 * 1024 * 5,  # 5 MB
            'backupCount': 10,
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'ERROR',
            'propagate': True,
        },
        # Request errors (4xx/5xx) reach the root console handler.
        'django.request': {
            'level': 'WARNING',
            'propagate': True,
        },
        # P2-1: security events — auth failures, permission denied,
        # suspicious requests, etc.
        'django.security': {
            'handlers': ['security_file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
        'engtracker.security': {
            'handlers': ['security_file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# P2-3: Secrets guard — fail fast if SECRET_KEY looks like a placeholder.
# This prevents deploying with a default/insecure secret key.
_secret_key = os.getenv('SECRET_KEY', '')
if (not _secret_key
        or _secret_key.startswith('django-insecure-')
        or _secret_key in ('changeme', 'secret', 'test-secret', 'ci-deploy-check-secret')
        or len(_secret_key) < 50):
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        "SECRET_KEY must be set to a secure random value of at least 50 "
        "characters in production. Generate one with: "
        "python -c \"from django.core.management.utils import "
        "get_random_secret_key; print(get_random_secret_key())\""
    )

# P2-10: Password policy hardening
AUTH_PASSWORD_VALIDATORS = [  # noqa: F405
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Static files
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')  # noqa: F405

# Media files
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')  # noqa: F405
# P0-6: Serve media files in production via a guarded view. The nginx
# /media/ proxy forwards to the backend, which serves from MEDIA_ROOT.
# For CDN/S3 deployments, set this to False and use django-storages.
SERVE_MEDIA_IN_PROD = True

# Exports and year snapshots live on their own volumes, outside MEDIA_ROOT. The
# frontend nginx mounts them read-only and serves them through internal
# /_protected/ locations; Django only validates the signed link and answers
# X-Accel-Redirect, so gunicorn's 120 s worker timeout never cuts a download.
EXPORT_ROOT = os.environ.get('EXPORT_ROOT', '/app/exports')
SNAPSHOT_ROOT = os.environ.get('SNAPSHOT_ROOT', '/app/snapshots')
USE_X_ACCEL_REDIRECT = True
EXPORT_JOBS_INLINE = False

# SEC-18: Web Push keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY only.
# Without them the push features raise ImproperlyConfigured instead of
# generating throwaway keys into the container filesystem.
VAPID_REQUIRE_ENV = True

# Cache
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            # DEP-05: mirror the dev block in settings.py. Short socket timeouts
            # plus IGNORE_EXCEPTIONS turn a Redis outage into cache misses
            # instead of 500s. Trade-off: DRF throttles live in this cache, so
            # they fail open while Redis is down (availability over throttling;
            # nginx still rate-limits /api/ and admin login).
            'SOCKET_CONNECT_TIMEOUT': 5,
            'SOCKET_TIMEOUT': 5,
            'IGNORE_EXCEPTIONS': True,
        }
    }
}
