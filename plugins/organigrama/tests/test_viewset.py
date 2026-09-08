"""
Phase C — Admin chart directory, draft API, and builder authorization.

Verifies staff/superuser access, create/list, draft save/load,
validation errors, optimistic concurrency, and non-admin denial.
"""
import uuid

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status

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


class OrgChartViewSetTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(
            username="staff", password="testpass", is_staff=True
        )
        cls.superuser = User.objects.create_user(
            username="su", password="testpass", is_superuser=True, is_staff=True
        )
        cls.user = User.objects.create_user(
            username="user", password="testpass"
        )

    def _make_request(self, method, path, user, data=None, view_kwargs=None, action_map=None):
        factory = APIRequestFactory()
        if action_map is None:
            action_map = {"get": "list", "post": "create"}
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

    def test_unauthenticated_user_is_denied(self):
        factory = APIRequestFactory()
        view = OrgChartViewSet.as_view({"get": "list"})
        request = factory.get("/charts/")
        response = view(request)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_staff_cannot_list_charts(self):
        response = self._make_request("get", "/charts/", self.user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_create_and_list_charts(self):
        create_resp = self._make_request(
            "post",
            "/charts/",
            self.staff,
            data={"name": "Engineering", "description": "Org chart"},
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_resp.data["name"], "Engineering")
        self.assertTrue(create_resp.data["slug"])

        list_resp = self._make_request("get", "/charts/", self.staff)
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(list_resp.data["count"], 1)
        self.assertEqual(list_resp.data["results"][0]["name"], "Engineering")

    def test_chart_list_includes_node_count(self):
        OrgChart.objects.create(name="Sales", slug="sales")
        OrgChart.objects.create(name="Marketing", slug="marketing")
        list_resp = self._make_request("get", "/charts/", self.staff)
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = {r["slug"]: r["node_count"] for r in list_resp.data["results"]}
        self.assertEqual(results["sales"], 0)
        self.assertEqual(results["marketing"], 0)

    def test_can_save_and_get_draft(self):
        create_resp = self._make_request(
            "post", "/charts/", self.staff, data={"name": "Team"}
        )
        chart_id = create_resp.data["id"]
        a = _node(name="CEO")
        b = _node(name="Engineering Lead")
        edge = _edge(a, b)
        save_resp = self._make_request(
            "put",
            f"/charts/{chart_id}/draft/",
            self.staff,
            data={"revision_number": 0, "nodes": [a, b], "edges": [edge]},
            view_kwargs={"pk": chart_id},
            action_map={"put": "draft"},
        )
        self.assertEqual(save_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(save_resp.data["nodes"]), 2)
        self.assertEqual(len(save_resp.data["edges"]), 1)

        get_resp = self._make_request(
            "get",
            f"/charts/{chart_id}/draft/",
            self.staff,
            view_kwargs={"pk": chart_id},
            action_map={"get": "draft"},
        )
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(get_resp.data["revision_number"], save_resp.data["revision_number"])
        self.assertEqual(len(get_resp.data["nodes"]), 2)

    def test_invalid_draft_returns_400_with_errors(self):
        create_resp = self._make_request(
            "post", "/charts/", self.staff, data={"name": "Bad"}
        )
        chart_id = create_resp.data["id"]
        a = _node(name="A")
        bad_edge = _edge(a, a)  # self-edge
        save_resp = self._make_request(
            "put",
            f"/charts/{chart_id}/draft/",
            self.staff,
            data={"revision_number": 0, "nodes": [a], "edges": [bad_edge]},
            view_kwargs={"pk": chart_id},
            action_map={"put": "draft"},
        )
        self.assertEqual(save_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("errors", save_resp.data)

    def test_validate_action_returns_structured_errors(self):
        create_resp = self._make_request(
            "post", "/charts/", self.staff, data={"name": "Check"}
        )
        chart_id = create_resp.data["id"]
        a = _node(name="A")
        bad_edge = _edge(a, a)
        resp = self._make_request(
            "post",
            f"/charts/{chart_id}/validate/",
            self.staff,
            data={"revision_number": 0, "nodes": [a], "edges": [bad_edge]},
            view_kwargs={"pk": chart_id},
            action_map={"post": "validate"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data["is_valid"])
        self.assertTrue(any("Self-edge" in e["message"] for e in resp.data["errors"]))

    def test_stale_revision_returns_conflict(self):
        create_resp = self._make_request(
            "post", "/charts/", self.staff, data={"name": "Conflict"}
        )
        chart_id = create_resp.data["id"]
        a = _node(name="A")
        self._make_request(
            "put",
            f"/charts/{chart_id}/draft/",
            self.staff,
            data={"revision_number": 0, "nodes": [a], "edges": []},
            view_kwargs={"pk": chart_id},
            action_map={"put": "draft"},
        )
        second_resp = self._make_request(
            "put",
            f"/charts/{chart_id}/draft/",
            self.staff,
            data={"revision_number": 0, "nodes": [a], "edges": []},
            view_kwargs={"pk": chart_id},
            action_map={"put": "draft"},
        )
        self.assertEqual(second_resp.status_code, status.HTTP_409_CONFLICT)

    def test_can_partial_update_chart_metadata(self):
        create_resp = self._make_request(
            "post", "/charts/", self.staff, data={"name": "Meta"}
        )
        chart_id = create_resp.data["id"]
        patch_resp = self._make_request(
            "patch",
            f"/charts/{chart_id}/",
            self.staff,
            data={"description": "Updated"},
            view_kwargs={"pk": chart_id},
            action_map={"patch": "partial_update"},
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.data["description"], "Updated")

    def test_non_staff_cannot_access_draft(self):
        create_resp = self._make_request(
            "post", "/charts/", self.staff, data={"name": "Private"}
        )
        chart_id = create_resp.data["id"]
        resp = self._make_request(
            "get",
            f"/charts/{chart_id}/draft/",
            self.user,
            view_kwargs={"pk": chart_id},
            action_map={"get": "draft"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
