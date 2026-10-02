"""Tests for manifest-backed HBPR-only plugin denial.

HBPR-only users are denied Calendar, Leave, Organigrama, Skills, Ticket KPI,
and Engagement. A multi-role HBPR+HR/TL/CR-admin keeps the other role's
access; a plain ``employee`` role never overrides the denial. Public plugin
access for ordinary users is preserved.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission

User = get_user_model()

BLOCKED_PLUGINS = ("engagement", "organigrama", "skills", "ticket_kpi")


def _user(name, **kwargs):
    return User.objects.create_user(username=name, password="testpass", **kwargs)


class PluginDenialTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        for code, name in [
            ("hbpr", "HBPR"),
            ("albanian_tl", "Albanian TL"),
            ("italian_tl", "Italian TL"),
            ("hr", "HR"),
            ("employee", "Employee"),
            ("cr_admin", "CR Admin"),
        ]:
            Role.objects.get_or_create(code=code, defaults={"name": name})

        cls.hbpr_only = _user("hbpr-only")
        assign_role(cls.hbpr_only, "hbpr")

        cls.hbpr_hr = _user("hbpr-hr")
        assign_role(cls.hbpr_hr, "hbpr")
        assign_role(cls.hbpr_hr, "hr")

        cls.hbpr_tl = _user("hbpr-tl")
        assign_role(cls.hbpr_tl, "hbpr")
        assign_role(cls.hbpr_tl, "albanian_tl")

        cls.employee = _user("employee")
        assign_role(cls.employee, "employee")

        cls.staff = _user("staff", is_staff=True)

    def _sync_manifest(self, plugin_name, manifest):
        """Seed PluginPermission rows the way sync_plugin_permission_manifest does."""
        for action, settings in manifest.items():
            perm, _ = PluginPermission.objects.get_or_create(
                plugin_name=plugin_name, action=action,
                defaults={"is_public": settings.get("public", False)},
            )
            perm.is_public = settings.get("public", False)
            perm.save(update_fields=["is_public"])
            perm.allowed_roles.set(
                Role.objects.filter(code__in=settings.get("roles", []))
            )
            perm.denied_roles.set(
                Role.objects.filter(code__in=settings.get("denied_roles", []))
            )
            perm.denial_override_roles.set(
                Role.objects.filter(
                    code__in=settings.get("denial_override_roles", [])
                )
            )


class HasAccessDenialTests(PluginDenialTestBase):
    def _permission(self, plugin_name, action="view"):
        return PluginPermission.objects.get(
            plugin_name=plugin_name, action=action
        )

    def test_denied_role_beats_public_for_hbpr_only(self):
        self._sync_manifest("engagement", {
            "view": {
                "roles": [], "denied_roles": ["hbpr"],
                "denial_override_roles": [], "public": True,
            },
        })
        perm = self._permission("engagement")
        self.assertFalse(perm.has_access(self.hbpr_only))

    def test_denial_override_beats_denial_for_multi_role(self):
        self._sync_manifest("skills", {
            "view": {
                "roles": ["employee"], "denied_roles": ["hbpr"],
                "denial_override_roles": ["hr"], "public": True,
            },
        })
        perm = self._permission("skills")
        self.assertTrue(perm.has_access(self.hbpr_hr))

    def test_employee_role_does_not_override_denial(self):
        self._sync_manifest("skills", {
            "view": {
                "roles": ["employee"], "denied_roles": ["hbpr"],
                "denial_override_roles": [], "public": True,
            },
        })
        perm = self._permission("skills")
        self.assertFalse(perm.has_access(self.hbpr_only))

    def test_public_access_preserved_for_ordinary_employee(self):
        self._sync_manifest("organigrama", {
            "view": {
                "roles": ["employee"], "denied_roles": ["hbpr"],
                "denial_override_roles": [], "public": True,
            },
        })
        perm = self._permission("organigrama")
        self.assertTrue(perm.has_access(self.employee))

    def test_staff_bypasses_denial(self):
        self._sync_manifest("ticket_kpi", {
            "view": {
                "roles": [], "denied_roles": ["hbpr"],
                "denial_override_roles": [], "public": True,
            },
        })
        perm = self._permission("ticket_kpi")
        self.assertTrue(perm.has_access(self.staff))

    def test_denies_access_helper(self):
        self._sync_manifest("engagement", {
            "view": {
                "roles": [], "denied_roles": ["hbpr"],
                "denial_override_roles": [], "public": True,
            },
        })
        perm = self._permission("engagement")
        self.assertTrue(perm.denies_access(self.hbpr_only))
        self.assertFalse(perm.denies_access(self.employee))
        self.assertFalse(perm.denies_access(self.staff))


class ManifestValidationTests(PluginDenialTestBase):
    def test_validate_manifest_accepts_denied_roles(self):
        from apps.plugins.services.permission_manifest import validate_manifest

        validate_manifest({
            "view": {
                "roles": ["employee"], "denied_roles": ["hbpr"],
                "denial_override_roles": ["hr"], "public": True,
            },
        })

    def test_validate_manifest_rejects_unknown_denied_role(self):
        from apps.plugins.services.permission_manifest import validate_manifest

        with self.assertRaisesMessage(ValueError, "nonexistent_role"):
            validate_manifest({
                "view": {
                    "roles": [], "denied_roles": ["nonexistent_role"],
                    "denial_override_roles": [], "public": False,
                },
            })

    def test_validate_manifest_rejects_unknown_override_role(self):
        from apps.plugins.services.permission_manifest import validate_manifest

        with self.assertRaisesMessage(ValueError, "nonexistent_role"):
            validate_manifest({
                "view": {
                    "roles": [], "denied_roles": [],
                    "denial_override_roles": ["nonexistent_role"],
                    "public": False,
                },
            })


class ActiveMetadataDenialTests(PluginDenialTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from core.plugins.registry import PluginRegistry

        PluginRegistry().discover_plugins()
        for name in BLOCKED_PLUGINS:
            from apps.plugins.models import Plugin

            Plugin.objects.update_or_create(
                name=name,
                defaults={
                    'verbose_name': name,
                    'description': 'x',
                    'version': '1.0.0',
                    'is_enabled': True,
                },
            )

    def _metadata_names(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get(reverse("plugin-management-active-metadata"))
        self.assertEqual(response.status_code, 200)
        return [row["name"] for row in response.data]

    def test_blocked_plugins_absent_for_hbpr_only(self):
        for name in BLOCKED_PLUGINS:
            self._sync_manifest(name, {
                "view": {
                    "roles": [], "denied_roles": ["hbpr"],
                    "denial_override_roles": [], "public": True,
                },
            })
        names = self._metadata_names(self.hbpr_only)
        for name in BLOCKED_PLUGINS:
            self.assertNotIn(name, names)

    def test_self_service_metadata_still_absent_when_denied(self):
        """A denied plugin must not fall through to self-service metadata."""
        self._sync_manifest("tl_scorecard", {
            "view": {
                "roles": [], "denied_roles": ["hbpr"],
                "denial_override_roles": [], "public": True,
            },
        })
        names = self._metadata_names(self.hbpr_only)
        self.assertNotIn("tl_scorecard", names)

    def test_multi_role_user_keeps_allowed_plugin(self):
        self._sync_manifest("skills", {
            "view": {
                "roles": ["employee"], "denied_roles": ["hbpr"],
                "denial_override_roles": ["hr"], "public": True,
            },
        })
        names = self._metadata_names(self.hbpr_hr)
        self.assertIn("skills", names)

    def test_ordinary_employee_still_sees_public_plugin(self):
        self._sync_manifest("organigrama", {
            "view": {
                "roles": ["employee"], "denied_roles": ["hbpr"],
                "denial_override_roles": [], "public": True,
            },
        })
        names = self._metadata_names(self.employee)
        self.assertIn("organigrama", names)

    def test_metadata_query_count_does_not_grow_with_blocked_plugins(self):
        """The denial branch must not run a query per plugin."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        for name in BLOCKED_PLUGINS:
            self._sync_manifest(name, {
                "view": {
                    "roles": [], "denied_roles": ["hbpr"],
                    "denial_override_roles": [], "public": True,
                },
            })
        client = APIClient()
        client.force_authenticate(user=self.hbpr_only)
        with CaptureQueriesContext(connection) as ctx:
            response = client.get(reverse("plugin-management-active-metadata"))
        self.assertEqual(response.status_code, 200)
        # A per-plugin query would add >= 4 queries (one per blocked plugin);
        # the prefetched map keeps this bounded regardless of plugin count.
        self.assertLess(len(ctx.captured_queries), 25)
