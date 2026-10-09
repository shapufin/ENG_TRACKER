"""Shape and size limits for the saved dashboard layout JSON (UserDashboardPreference.layout)."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.dashboard.models import UserDashboardPreference

URL = "/api/dashboard/preferences/"


def widget(wid="kpi-strip", x=0, y=0, w=12, h=2):
    return {"id": wid, "position": {"x": x, "y": y}, "size": {"w": w, "h": h}}


class DashboardLayoutValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin_u", password="x", is_staff=True)
        self.client.force_authenticate(self.user)

    def save(self, layout, dashboard_type="admin"):
        return self.client.post(
            URL, {"dashboard_type": dashboard_type, "layout": layout}, format="json"
        )

    def assertRejected(self, layout):
        response = self.save(layout)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("layout", response.data)
        self.assertFalse(UserDashboardPreference.objects.exists())

    # --- layouts the app really writes keep working -------------------------------------

    def test_current_version_2_admin_layout_is_accepted(self):
        layout = {
            "version": 2,
            "columns": 12,
            "widgets": [widget(), widget("shortcuts", 0, 27, 12, 1)],
            "layouts": {"md": [widget("kpi-strip", 0, 0, 6, 3)]},
        }
        response = self.save(layout)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(UserDashboardPreference.objects.get().layout, layout)

    def test_legacy_four_column_admin_layout_is_accepted(self):
        layout = {
            "columns": 4,
            "widgets": [
                {"id": "total-users", "position": {"x": 0, "y": 0}, "size": {"w": 1, "h": 1}},
                {"id": "pending-approvals", "position": {"x": 1, "y": 0}, "size": {"w": 1, "h": 1}},
            ],
        }
        self.assertEqual(self.save(layout).status_code, status.HTTP_201_CREATED)

    def test_empty_default_layout_is_accepted_for_every_dashboard_type(self):
        # The model default is {}: what a row holds before anything was arranged.
        for dashboard_type in ("admin", "hr", "team_leader", "employee"):
            response = self.save({}, dashboard_type)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, (dashboard_type, response.data))

    def test_other_dashboard_types_keep_a_plain_columns_and_widgets_layout(self):
        layout = {"columns": 4, "widgets": [widget("my-hours", 0, 0, 2, 2)]}
        for dashboard_type in ("hr", "team_leader", "employee"):
            response = self.save(layout, dashboard_type)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, (dashboard_type, response.data))

    def test_unrelated_extra_keys_are_left_alone(self):
        response = self.save({"columns": 12, "widgets": [], "theme": "dense"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_update_through_put_is_validated_too(self):
        created = self.save({"columns": 12, "widgets": []})
        response = self.client.put(
            f"{URL}{created.data['id']}/",
            {"dashboard_type": "admin", "layout": {"columns": 99, "widgets": []}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- shape ---------------------------------------------------------------------------

    def test_layout_must_be_an_object(self):
        for bad in ([], "x", 3, None):
            self.assertRejected(bad)

    def test_widgets_must_be_a_list_of_objects(self):
        self.assertRejected({"widgets": "nope"})
        self.assertRejected({"widgets": {"id": "a"}})
        self.assertRejected({"widgets": ["kpi-strip"]})

    def test_at_most_100_widgets(self):
        ok = [widget(f"w{i}") for i in range(100)]
        self.assertEqual(self.save({"widgets": ok}).status_code, status.HTTP_201_CREATED)
        UserDashboardPreference.objects.all().delete()
        self.assertRejected({"widgets": ok + [widget("w100")]})

    def test_widget_id_must_be_a_short_string(self):
        self.assertRejected({"widgets": [{**widget(), "id": 5}]})
        self.assertRejected({"widgets": [{**widget(), "id": ""}]})
        self.assertRejected({"widgets": [{**widget(), "id": "x" * 65}]})
        bad = widget()
        del bad["id"]
        self.assertRejected({"widgets": [bad]})
        self.assertEqual(
            self.save({"widgets": [{**widget(), "id": "x" * 64}]}).status_code,
            status.HTTP_201_CREATED,
        )

    def test_position_and_size_are_required_objects(self):
        no_pos = widget()
        del no_pos["position"]
        self.assertRejected({"widgets": [no_pos]})
        no_size = widget()
        del no_size["size"]
        self.assertRejected({"widgets": [no_size]})
        self.assertRejected({"widgets": [{**widget(), "position": [0, 0]}]})

    def test_coordinates_must_be_integers_in_0_to_200(self):
        for pos in ({"x": -1, "y": 0}, {"x": 0, "y": 201}, {"x": 1.5, "y": 0}, {"x": "1", "y": 0},
                    {"x": True, "y": 0}, {"x": 0}, {"x": 0, "y": None}):
            self.assertRejected({"widgets": [{**widget(), "position": pos}]})
        for size in ({"w": -1, "h": 1}, {"w": 1, "h": 201}, {"w": 2.5, "h": 1}, {"w": 1}):
            self.assertRejected({"widgets": [{**widget(), "size": size}]})

    def test_boundary_values_are_accepted(self):
        layout = {"widgets": [widget("a", 0, 0, 0, 0), widget("b", 200, 200, 200, 200)]}
        self.assertEqual(self.save(layout).status_code, status.HTTP_201_CREATED)

    def test_out_of_range_is_rejected_not_clamped(self):
        response = self.save({"widgets": [widget("a", 0, 5000, 4, 4)]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserDashboardPreference.objects.exists())

    def test_columns_is_an_int_from_1_to_24(self):
        for bad in (0, 25, -3, 4.5, "12", True):
            self.assertRejected({"columns": bad, "widgets": []})
        for ok in (1, 12, 24):
            UserDashboardPreference.objects.all().delete()
            self.assertEqual(
                self.save({"columns": ok, "widgets": []}).status_code, status.HTTP_201_CREATED
            )

    def test_version_must_be_an_integer_when_present(self):
        self.assertRejected({"version": "2", "widgets": []})
        self.assertRejected({"version": 2.5, "widgets": []})

    def test_layouts_is_an_object_of_widget_lists_with_the_same_rules(self):
        self.assertRejected({"widgets": [], "layouts": []})
        self.assertRejected({"widgets": [], "layouts": {"md": "x"}})
        self.assertRejected({"widgets": [], "layouts": {"md": [widget("a", 0, 999, 1, 1)]}})
        self.assertRejected({"widgets": [], "layouts": {"md": [widget(f"w{i}") for i in range(101)]}})
        self.assertRejected({"widgets": [], "layouts": {f"bp{i}": [] for i in range(9)}})

    def test_error_names_the_offending_widget(self):
        response = self.save({"widgets": [widget(), widget("b", 0, 999, 1, 1)]})
        self.assertIn("widgets[1]", str(response.data["layout"]))
