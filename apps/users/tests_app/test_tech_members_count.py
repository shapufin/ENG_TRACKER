"""The Tech list reports how many active users hold each Tech."""
from django.contrib.auth.models import User
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.users.models import Tech


class TechMembersCountTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username="tm_admin", password="x", is_staff=True)
        cls.infra = Tech.objects.create(name="Infra", code="INFRA")
        cls.db = Tech.objects.create(name="DB", code="DB")
        cls.empty = Tech.objects.create(name="Empty", code="EMP")

    def _user(self, name, techs, active=True):
        user = User.objects.create_user(username=name, password="x", is_active=active)
        user.profile.techs.set(techs)
        return user

    def _rows(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/users/techs/")
        self.assertEqual(resp.status_code, 200)
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        return {r["code"]: r for r in rows}

    def test_counts_active_members_per_tech(self):
        self._user("tm_a", [self.infra, self.db])
        self._user("tm_b", [self.infra])
        self._user("tm_gone", [self.infra], active=False)
        rows = self._rows()
        self.assertEqual(rows["INFRA"]["members_count"], 2)
        self.assertEqual(rows["DB"]["members_count"], 1)
        self.assertEqual(rows["EMP"]["members_count"], 0)

    def test_list_query_count_does_not_grow_with_techs(self):
        self._user("tm_seed", [self.infra])
        self.client.force_authenticate(self.admin)
        with CaptureQueriesContext(connection) as before:
            self.client.get("/api/users/techs/")
        for i in range(3):
            self._user(f"tm_q{i}", [Tech.objects.create(name=f"Q{i}", code=f"Q{i}")])
        with CaptureQueriesContext(connection) as after:
            self.client.get("/api/users/techs/")
        self.assertEqual(len(after), len(before))

    def test_create_response_includes_members_count(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post("/api/users/techs/", {"name": "Net", "code": "NET"}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["members_count"], 0)
