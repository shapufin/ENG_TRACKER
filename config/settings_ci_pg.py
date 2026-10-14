"""Settings for the Postgres test job in CI (``backend-postgres`` in ci.yml).

Same as the dev settings (so none of the production guards fire: no
ALLOWED_HOSTS / SECRET_KEY / SSL redirect), but the database is the Postgres
service container. Every connection value comes from the environment; a missing
one raises KeyError instead of silently falling back to SQLite.
Select with ``--settings=config.settings_ci_pg``. Never use outside CI.
"""
import os

from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['DB_NAME'],
        'USER': os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST': os.environ['DB_HOST'],
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}
