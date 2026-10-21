"""SEC-12: ``UserViewSet.get_permissions`` overrides every ``@action(permission_classes=...)``.

An action missing from its ``IsAdminUser`` list is silently open to any
authenticated user. This guard fails when a new ``@action`` is neither admin
gated nor explicitly reviewed below.
"""
from django.test import SimpleTestCase
from rest_framework.permissions import IsAdminUser

from apps.users.viewsets import UserViewSet

# Reviewed non-admin actions: name -> why open access is acceptable.
REVIEWED_NON_ADMIN_ACTIONS = {
    'me': 'GET, returns the caller\'s own record',
    'my_team_members': 'GET, scoped to the caller\'s managed team',
    'italian_team_members': 'GET, scoped to the caller\'s managed team',
    'team_leaders': 'GET, TL picker (identity fields only)',
    'italian_team_leaders': 'GET, TL picker (identity fields only)',
    'albanian_team_leaders': 'GET, TL picker (identity fields only)',
    'assign_clients': 'POST, writes only request.user.profile.clients',
    'assign_member_clients': 'POST, enforces staff / TL-of-target scope inside the action',
    'eligible_for_control_room': 'GET, has its own IsCRAdminOrStaff branch in get_permissions',
}


class UserViewSetActionGuardTests(SimpleTestCase):
    def test_every_action_is_admin_gated_or_explicitly_reviewed(self):
        unreviewed = []
        for extra in UserViewSet.get_extra_actions():
            view = UserViewSet()
            view.action = extra.__name__
            admin_gated = any(isinstance(p, IsAdminUser) for p in view.get_permissions())
            if not admin_gated and extra.__name__ not in REVIEWED_NON_ADMIN_ACTIONS:
                unreviewed.append(extra.__name__)
        self.assertEqual(
            unreviewed, [],
            'New UserViewSet @action(s) are open to any authenticated user. Add them to the '
            'IsAdminUser list in UserViewSet.get_permissions, or review and list them here.',
        )

    def test_write_actions_are_never_silently_open(self):
        safe = {'get', 'head', 'options'}
        for extra in UserViewSet.get_extra_actions():
            if set(extra.mapping) <= safe:
                continue
            view = UserViewSet()
            view.action = extra.__name__
            admin_gated = any(isinstance(p, IsAdminUser) for p in view.get_permissions())
            if not admin_gated:
                self.assertIn(
                    extra.__name__, ('assign_clients', 'assign_member_clients'),
                    f'{extra.__name__} writes data but is not admin gated.',
                )
