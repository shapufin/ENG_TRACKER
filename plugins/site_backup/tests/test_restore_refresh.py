"""A restore changes who leads and what roles people hold: caches must follow (audit 2026-11-13)."""
from django.contrib.auth.models import User
from django.test import TestCase

from apps.permissions.models import Role, UserRole
from plugins.site_backup.services.restore import PRIVILEGE_FIELDS, refresh_after_restore


class RestoreRefreshTests(TestCase):
    def test_leader_links_need_the_privilege_confirmation(self):
        fields = PRIVILEGE_FIELDS['users.userprofile']
        self.assertIn('italian_tl', fields)
        self.assertIn('albanian_tl', fields)

    def test_role_codes_cache_is_rebuilt_from_restored_role_rows(self):
        user = User.objects.create_user(username='rr_user', password='x')
        role, _ = Role.objects.get_or_create(code='albanian_tl', defaults={'name': 'albanian_tl'})
        # Raw restore saves skip the signals, so the profile cache is left stale.
        UserRole.objects.bulk_create([UserRole(user=user, role=role, is_active=True)])
        user.profile.refresh_from_db()
        self.assertNotIn('albanian_tl', user.profile.role_codes or [])
        refresh_after_restore()
        user.profile.refresh_from_db()
        self.assertIn('albanian_tl', user.profile.role_codes)
