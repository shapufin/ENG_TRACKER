from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase


class EnsureSuperuserCommandTests(TestCase):
    def _run(self, monkeypatch_env):
        import os

        old = {k: os.environ.get(k) for k in monkeypatch_env}
        os.environ.update({k: v for k, v in monkeypatch_env.items() if v is not None})
        for k, v in monkeypatch_env.items():
            if v is None:
                os.environ.pop(k, None)
        try:
            call_command("ensure_superuser")
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_noop_when_env_vars_missing(self):
        self._run({"DJANGO_SUPERUSER_USERNAME": None, "DJANGO_SUPERUSER_PASSWORD": None})
        self.assertEqual(User.objects.count(), 0)

    def test_creates_superuser_when_env_vars_set(self):
        self._run({
            "DJANGO_SUPERUSER_USERNAME": "admin",
            "DJANGO_SUPERUSER_EMAIL": "admin@example.com",
            "DJANGO_SUPERUSER_PASSWORD": "changeme123",
        })
        user = User.objects.get(username="admin")
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_staff)
        self.assertEqual(user.email, "admin@example.com")

    def test_second_run_is_noop(self):
        env = {
            "DJANGO_SUPERUSER_USERNAME": "admin",
            "DJANGO_SUPERUSER_EMAIL": "admin@example.com",
            "DJANGO_SUPERUSER_PASSWORD": "changeme123",
        }
        self._run(env)
        self._run(env)
        self.assertEqual(User.objects.filter(username="admin").count(), 1)
