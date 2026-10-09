"""A user's dashboard preferences are personal: staff never read or overwrite someone else's row."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.dashboard.models import UserDashboardPreference

URL = "/api/dashboard/preferences/"


def results(response):
    data = response.data
    return data["results"] if isinstance(data, dict) and "results" in data else data


class PreferenceScopeTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="adm", password="x", is_staff=True)
        self.other = User.objects.create_user(username="oth", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.theirs = UserDashboardPreference.objects.create(
            user=self.other, dashboard_type="admin", layout={"columns": 12, "widgets": []}
        )
        self.mine_tl = UserDashboardPreference.objects.create(
            user=self.admin, dashboard_type="team_leader", layout={"columns": 4, "widgets": []}
        )
        self.mine_admin = UserDashboardPreference.objects.create(
            user=self.admin, dashboard_type="admin", layout={"columns": 12, "widgets": []}
        )

    def test_staff_list_contains_only_own_rows(self):
        ids = {row["id"] for row in results(self.client.get(URL))}
        self.assertEqual(ids, {self.mine_tl.id, self.mine_admin.id})

    def test_dashboard_type_filter_returns_that_type_only(self):
        rows = results(self.client.get(URL, {"dashboard_type": "admin"}))
        self.assertEqual([row["id"] for row in rows], [self.mine_admin.id])

    def test_staff_cannot_update_someone_elses_row(self):
        response = self.client.put(
            f"{URL}{self.theirs.id}/",
            {"dashboard_type": "admin", "layout": {"columns": 12, "widgets": []}},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
