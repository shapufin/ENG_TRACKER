"""Settings for Playwright / role-workflow runs.

Same as dev settings, but with its own SQLite file (so seeding never touches
``db.sqlite3``) and throttling off (each spec logs in, which would otherwise
trip the 20/min auth throttle). Select with ``DJANGO_SETTINGS_MODULE=config.settings_e2e``.
Never use this outside local/CI e2e runs.
"""
from .settings import *  # noqa: F401,F403
from .settings import BASE_DIR, REST_FRAMEWORK

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.e2e.sqlite3',
        # Parallel dev-server threads write to one SQLite file; WAL plus a long
        # busy timeout stops "database is locked" 500s on slow CI disks.
        'OPTIONS': {
            'timeout': 30,
            'init_command': 'PRAGMA journal_mode=WAL;',
        },
    }
}

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_THROTTLE_RATES': {
        scope: None for scope in REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
    },
}

# Closing a year is a management action with no API; a spec closes it out of
# band, so the running server must see it on the next request instead of after
# the production 60-second cache window.
CLOSED_YEAR_CACHE_TTL_SECONDS = 0
