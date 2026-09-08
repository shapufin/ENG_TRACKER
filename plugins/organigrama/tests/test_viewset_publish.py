"""
Phase D — Publish and audience ViewSet tests.

Verifies that staff can publish/unpublish, public endpoints enforce
audience, and non-staff cannot mutate.
"""
import uuid

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status

from apps.permissions.models import Group, Role, UserGroup, UserRole
from apps.plugins.models import PluginPermission
from plugins.organigrama.models import OrgChart
from plugins.organigrama.viewsets import OrgChartViewSet


def _node(shape="person", name="Node", **overrides):
    base = {
        "node_uuid": str(uuid.uuid4()),
        "shape_type": shape,
        "display_name": name,
        "position_x": 0.0,
        "position_y": 0.0,
        "width": 180,
        "height": 80,
        "custom_fields": {},
    }
    base.update(overrides)
    return base


def _edge(source, target, **overrides):
    base = {
        "edge_uuid": str(uuid.uuid4()),
        "source_uuid": source["node_uuid"],
        "target_uuid": target["node_uuid"],
        "edge_type": "reports_to",
    }
    base.update(overrides)
    return base


class OrgChartPublishViewSetTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(
            username="staff", password="testpass", is_staff=True
        )
        cls.user = User.objects.create_user(
            username="user", password="testpass"
        )
        cls.hr_user = User.objects.create_user(
            username="hr_user", password="testpass"
        )
        perm, _ = PluginPermission.objects.update_or_create(
            plugin_name="organigrama", action="view",
            defaults={"is_public": True},
        )
        perm.is_public = True
        perm.save()
        cls.hr_role, _ = Role.objects.get_or_create(
            code="hr", defaults={"name": "HR"}
        )
        UserRole.objects.create(user=cls.hr_user, role=cls.hr_role, is_active=True)
        cls.group = Group.objects.get_or_create(
            code="eng", defaults={"name": "Engineering"}
        )[0]
        cls.group_user = User.objects.create_user(
            username="group_user", password="testpass"
        )
        UserGroup.objects.create(user=cls.group_user, group=cls.group)

    def _make_request(
        self, method, path, user, data=None, view_kwargs=None, action_map=None
    ):
        factory = APIRequestFactory()
        view = OrgChartViewSet.as_view(action_map)
        if method == "get":
            request = factory.get(path)
        elif method == "post":
            request = factory.post(path, data, format="json")
        elif method == "put":
            request = factory.put(path, data, format="json")
        elif method == "patch":
            request = factory.patch(path, data, format="json")
        elif method == "delete":
            request = factory.delete(path)
        else:
            raise ValueError(f"Unknown method {method}")
        force_authenticate(request, user)
        return view(request, **(view_kwargs or {}))

    def _create_and_publish(self, user, audience_mode="all_authenticated", name="Publish Test"):
        create_resp = self._make_request(
            "post", "/charts/", self.staff,
            data={"name": name},
            action_map={"post": "create"},
        )
        chart_id = create_resp.data["id"]
        a = _node(name="Root")
        b = _node(name="Child")
        edge = _edge(a, b)
        self._make_request(
            "put", f"/charts/{chart_id}/draft/", self.staff,
            data={"revision_number": 0, "nodes": [a, b], "edges": [edge]},
            view_kwargs={"pk": chart_id},
            action_map={"put": "draft"},
        )
        self._make_request(
            "patch", f"/charts/{chart_id}/", self.staff,
            data={
                "audience_mode": audience_mode,
                **({"audience_role_codes": ["hr"]} if audience_mode == "selected" else {}),
            },
            view_kwargs={"pk": chart_id},
            action_map={"patch": "partial_update"},
        )
        self._make_request(
            "post", f"/charts/{chart_id}/publish/", self.staff,
            data={},
            view_kwargs={"pk": chart_id},
            action_map={"post": "publish"},
        )
        return chart_id

    def test_staff_can_publish_and_unpublish(self):
        chart_id = self._create_and_publish(self.staff)
        chart = OrgChart.objects.get(pk=chart_id)
        self.assertEqual(chart.status, "published")

        resp = self._make_request(
            "post", f"/charts/{chart_id}/unpublish/", self.staff,
            data={},
            view_kwargs={"pk": chart_id},
            action_map={"post": "unpublish"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        chart.refresh_from_db()
        self.assertEqual(chart.status, "draft")

    def test_published_visible_to_all_authenticated(self):
        chart_id = self._create_and_publish(self.user, audience_mode="all_authenticated", name="Public Chart")
        resp = self._make_request(
            "get", f"/charts/{chart_id}/published/", self.user,
            view_kwargs={"pk": chart_id},
            action_map={"get": "published"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("nodes", resp.data)

    def test_published_denies_non_matching_user(self):
        chart_id = self._create_and_publish(self.hr_user, audience_mode="selected", name="HR Only")
        # Add a role that the regular user does not have.
        chart = OrgChart.objects.get(pk=chart_id)
        chart.audience_roles.create(role_code="italian_tl")

        resp = self._make_request(
            "get", f"/charts/{chart_id}/published/", self.user,
            view_kwargs={"pk": chart_id},
            action_map={"get": "published"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_visible_charts_returns_only_eligible(self):
        public_id = self._create_and_publish(self.user, audience_mode="all_authenticated", name="Public Visible")
        selected_id = self._create_and_publish(self.hr_user, audience_mode="selected", name="HR Visible")
        chart = OrgChart.objects.get(pk=selected_id)
        chart.audience_roles.get_or_create(role_code="hr")

        resp = self._make_request(
            "get", "/charts/visible/", self.hr_user,
            action_map={"get": "visible_charts"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        slugs = {r["slug"] for r in results}
        self.assertEqual(len(slugs), 2)

        resp = self._make_request(
            "get", "/charts/visible/", self.user,
            action_map={"get": "visible_charts"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.data.get("results", resp.data)
        slugs = {r["slug"] for r in results}
        self.assertEqual(slugs, {OrgChart.objects.get(pk=public_id).slug})

    def test_non_staff_cannot_publish(self):
        create_resp = self._make_request(
            "post", "/charts/", self.staff,
            data={"name": "No Publish Permission"},
            action_map={"post": "create"},
        )
        chart_id = create_resp.data["id"]
        resp = self._make_request(
            "post", f"/charts/{chart_id}/publish/", self.user,
            data={},
            view_kwargs={"pk": chart_id},
            action_map={"post": "publish"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_publish_rejects_change_summary_over_500_characters(self):
        chart_id = self._create_and_publish(self.staff, name="Summary Limit")
        resp = self._make_request(
            "post", f"/charts/{chart_id}/publish/", self.staff,
            data={"change_summary": "x" * 501},
            view_kwargs={"pk": chart_id},
            action_map={"post": "publish"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_publish_rejects_non_string_change_summary(self):
        """A non-string change_summary must be rejected with 400."""
        chart_id = self._create_and_publish(self.staff, name="Non String Summary")
        resp = self._make_request(
            "post", f"/charts/{chart_id}/publish/", self.staff,
            data={"change_summary": 12345},
            view_kwargs={"pk": chart_id},
            action_map={"post": "publish"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_publish_accepts_missing_change_summary(self):
        """Omitting change_summary publishes normally (it is optional)."""
        chart_id = self._create_and_publish(self.staff, name="Missing Summary")
        # _create_and_publish already publishes with no change_summary; verify
        # the final publish response succeeded by re-publishing with no key.
        resp = self._make_request(
            "post", f"/charts/{chart_id}/publish/", self.staff,
            data={},
            view_kwargs={"pk": chart_id},
            action_map={"post": "publish"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_publish_accepts_valid_change_summary(self):
        """A valid string change_summary publishes normally."""
        chart_id = self._create_and_publish(self.staff, name="Valid Summary")
        resp = self._make_request(
            "post", f"/charts/{chart_id}/publish/", self.staff,
            data={"change_summary": "Updated reporting lines"},
            view_kwargs={"pk": chart_id},
            action_map={"post": "publish"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
