from django.test import SimpleTestCase
from rest_framework.permissions import SAFE_METHODS, IsAdminUser

from apps.users.viewsets import UserViewSet

# Self-service writes that authorize inline (own record, or a TL's own team).
# Adding a write action to UserViewSet means choosing: admin-only in
# get_permissions(), or listed here with its inline check reviewed.
SELF_SERVICE_WRITE_ACTIONS = {'assign_clients', 'assign_member_clients'}


class UserViewSetWriteActionTests(SimpleTestCase):
    def test_every_write_action_is_admin_only_or_reviewed_self_service(self):
        # get_permissions() overrides per-@action permission_classes and defaults
        # to IsAuthenticated, so a new write action is silently open to everyone.
        for method in UserViewSet.get_extra_actions():
            if set(method.mapping) <= {m.lower() for m in SAFE_METHODS}:
                continue
            with self.subTest(action=method.__name__):
                view = UserViewSet()
                view.action = method.__name__
                admin_only = any(isinstance(p, IsAdminUser) for p in view.get_permissions())
                self.assertTrue(
                    admin_only or method.__name__ in SELF_SERVICE_WRITE_ACTIONS,
                    f'{method.__name__} writes but is open to any authenticated user.',
                )
