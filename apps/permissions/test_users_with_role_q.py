"""users_with_role_q matches exact active role grants, never a substring of the cache.

Replaces the ``profile__role_codes__icontains`` filters (audithandover.md S2): a role
code 'xhr' must not match an 'hr' filter, and an inactive grant must not match.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import users_with_role_q

User = get_user_model()


class UsersWithRoleQTests(TestCase):
    def setUp(self):
        self.hr_role = Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})[0]
        self.xhr_role = Role.objects.get_or_create(code='xhr', defaults={'name': 'XHR'})[0]
        self.hr_user = User.objects.create_user(username='q_hr', password='x')
        UserRole.objects.create(user=self.hr_user, role=self.hr_role, is_active=True)
        self.xhr_user = User.objects.create_user(username='q_xhr', password='x')
        UserRole.objects.create(user=self.xhr_user, role=self.xhr_role, is_active=True)
        # A stale cache that still contains the code must not match on its own.
        self.xhr_user.profile.role_codes = ['hr', 'xhr']
        self.xhr_user.profile.save(update_fields=['role_codes'])
        self.inactive_user = User.objects.create_user(username='q_inactive', password='x')
        UserRole.objects.create(user=self.inactive_user, role=self.hr_role, is_active=False)

    def _usernames(self, q, queryset=None):
        base = queryset if queryset is not None else User.objects.all()
        return set(base.filter(q).values_list('username', flat=True))

    def test_matches_active_exact_role_only(self):
        self.assertEqual(self._usernames(users_with_role_q('hr')), {'q_hr'})

    def test_substring_role_code_does_not_match(self):
        self.assertEqual(self._usernames(users_with_role_q('xhr')), {'q_xhr'})

    def test_negation_excludes_holders(self):
        names = self._usernames(~users_with_role_q('hr'))
        self.assertNotIn('q_hr', names)
        self.assertIn('q_xhr', names)
        self.assertIn('q_inactive', names)

    def test_profile_rooted_prefix(self):
        from apps.users.models.core import UserProfile
        profiles = UserProfile.objects.filter(users_with_role_q('hr', prefix='user__'))
        self.assertEqual(
            set(profiles.values_list('user__username', flat=True)), {'q_hr'},
        )
