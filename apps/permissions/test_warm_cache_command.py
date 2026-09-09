"""Coverage for apps/core/management/commands/warm_cache.py.

`apps.core` is not registered in INSTALLED_APPS, so `call_command('warm_cache')`
can't resolve it through Django's app registry - the Command class is
imported and invoked directly instead, which exercises the same `handle()`
logic. This lives in apps.permissions (an installed, testable app) since
that's the models the command actually warms."""
from django.core.cache import cache
from django.test import TestCase

from apps.core.cache_constants import CacheKey
from apps.core.management.commands.warm_cache import Command
from apps.permissions.models import Group, Permission, Role


class WarmCacheCommandTests(TestCase):
    def setUp(self):
        cache.clear()
        self.role = Role.objects.create(name='warm_cache_role', code='warm_cache_role')
        self.permission = Permission.objects.create(module='reports', action='view')
        self.group = Group.objects.create(name='warm_cache_group')

    def tearDown(self):
        cache.clear()

    def test_warm_cache_populates_role_permission_and_group_keys(self):
        Command().handle()

        cached_role = cache.get(CacheKey.role(self.role.id))
        self.assertIsNotNone(cached_role)
        self.assertEqual(cached_role.id, self.role.id)

        cached_perm = cache.get(f"perm:all:{self.permission.module}:{self.permission.action}")
        self.assertIsNotNone(cached_perm)
        self.assertEqual(cached_perm.id, self.permission.id)

        cached_group = cache.get(f"group:{self.group.id}")
        self.assertIsNotNone(cached_group)
        self.assertEqual(cached_group.id, self.group.id)

    def test_warm_cache_output_is_ascii_safe(self):
        """Regression: stdout must not contain non-ASCII characters (e.g. a
        unicode checkmark), since Windows consoles using the default cp1252
        codepage raise UnicodeEncodeError on write() for those bytes."""
        import io
        out = io.StringIO()
        Command(stdout=out).handle()
        output = out.getvalue()
        output.encode('cp1252')
