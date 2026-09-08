"""
Production settings for Engineering Time Tracker
"""
import os

from .settings import *  # noqa: F403

DEBUG = False

ALLOWED_HOSTS = [h for h in os.getenv('ALLOWED_HOSTS', '').split(',') if h]

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
# unauthenticated users cannot enumerate endpoints (P0-4).
ENABLE_API_DOCS = False

# DRF throttle trust: set NUM_PROXIES so DRF extracts the real client IP
# from X-Forwarded-For instead of using the entire header as the throttle
# key (P1-9). With one nginx proxy, NUM_PROXIES=1 takes the last XFF entry
# (the IP nginx appended). If a Cloudflare/ALB layer is added in front,
# set NUM_PROXIES=2 and revert nginx to $proxy_add_x_forwarded_for.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405 — inherit base config
    'NUM_PROXIES': 1,
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
# JWT-only SPA: credentials (cookies) are not needed for cross-origin
# requests. The SPA uses the Authorization header, not cookies (P2-12).
CORS_ALLOW_CREDENTIALS = True
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
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'ERROR',
            'propagate': True,
        },
        # P2-1: security events — auth failures, permission denied,
        # suspicious requests, etc.
        'django.security': {
            'handlers': ['security_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'engtracker.security': {
            'handlers': ['security_file'],
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

# Cache
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}
