from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.permissions.services.role_service import TeamLeaderRevokeBlockedError
from apps.users.services.user_creation import update_user_profile

User = get_user_model()


class UpdateUserProfileTlRevokeBlockTests(TestCase):
    """update_user_profile is the choke point used by the data importer
    (plugins/data_import/importers/users.py) and must apply the same
    TL-revoke dependent block as the admin viewsets — otherwise a CSV
    import can silently create the exact dangling-FK bug the cascade
    block exists to prevent."""

    def setUp(self):
        self.tl = User.objects.create_user(username='ucp-tl', password='x')
        self.dependent = User.objects.create_user(username='ucp-dep', password='x')

    def test_raises_when_revoking_italian_tl_role_with_dependent_fk_remaining(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        with self.assertRaises(TeamLeaderRevokeBlockedError) as ctx:
            update_user_profile(self.tl, is_italian_tl_role=False)

        self.assertEqual(ctx.exception.blocked_revocations[0]['role'], 'italian_tl')
        self.tl.profile.refresh_from_db()
        self.assertTrue(self.tl.profile.is_italian_tl_role)

    def test_succeeds_when_no_dependents_remain(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()

        update_user_profile(self.tl, is_italian_tl_role=False)

        self.tl.profile.refresh_from_db()
        self.assertFalse(self.tl.profile.is_italian_tl_role)

    def test_does_not_check_when_role_field_not_supplied(self):
        self.tl.profile.is_italian_tl_role = True
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        # Unrelated field update — must not raise even though a dependent exists.
        update_user_profile(self.tl, phone='555-1234')

        self.tl.profile.refresh_from_db()
        self.assertEqual(self.tl.profile.phone, '555-1234')

    def test_blocked_even_when_role_granted_via_role_codes_not_legacy_flag(self):
        self.tl.profile.role_codes = ['italian_tl']
        self.tl.profile.save()
        self.dependent.profile.italian_tl = self.tl
        self.dependent.profile.save()

        with self.assertRaises(TeamLeaderRevokeBlockedError):
            update_user_profile(self.tl, is_italian_tl_role=False)
