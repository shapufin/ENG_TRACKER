"""Display-only rename: italian_tl is shown as Manager, albanian_tl as Line Manager.

The role codes (and database rows) are unchanged; only the label served to
clients differs. Every serializer that emits a role name must use the map.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.permissions.display_names import ROLE_DISPLAY_NAMES, role_display_name
from apps.permissions.models import Role, RolePermission, UserRole
from apps.permissions.serializers import (
    RolePermissionSerializer,
    RoleSerializer,
    UserRoleSerializer,
)
from plugins.organigrama.serializers import RoleMiniSerializer


class RoleDisplayNameTests(TestCase):
    def test_map_covers_exactly_the_two_leader_roles(self):
        self.assertEqual(
            ROLE_DISPLAY_NAMES, {"italian_tl": "Manager", "albanian_tl": "Line Manager"}
        )

    def test_unmapped_role_keeps_its_stored_name(self):
        hr = Role.objects.get(code="hr")
        self.assertEqual(role_display_name(hr.code, hr.name), hr.name)

    def test_role_serializer_uses_display_names(self):
        names = {
            r["code"]: r["name"]
            for r in RoleSerializer(Role.objects.all(), many=True).data
        }
        self.assertEqual(names["italian_tl"], "Manager")
        self.assertEqual(names["albanian_tl"], "Line Manager")
        self.assertEqual(names["hr"], Role.objects.get(code="hr").name)

    def test_organigrama_audience_selector_uses_display_names(self):
        data = RoleMiniSerializer(
            Role.objects.filter(code__in=["italian_tl", "albanian_tl"]).order_by("code"),
            many=True,
        ).data
        self.assertEqual([r["name"] for r in data], ["Line Manager", "Manager"])

    def test_user_role_serializer_uses_display_name(self):
        user = get_user_model().objects.create_user("dn_user", password="x")
        ur = UserRole.objects.create(user=user, role=Role.objects.get(code="italian_tl"))
        self.assertEqual(UserRoleSerializer(ur).data["role_name"], "Manager")

    def test_role_permission_serializer_uses_display_name(self):
        rp = RolePermission.objects.filter(role__code="albanian_tl").first()
        if rp is None:
            self.skipTest("no seeded permission for albanian_tl")
        self.assertEqual(RolePermissionSerializer(rp).data["role_name"], "Line Manager")
