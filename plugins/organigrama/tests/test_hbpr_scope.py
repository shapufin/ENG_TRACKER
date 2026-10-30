"""An HBPR sees the org chart, limited to the Albanian TLs assigned to them."""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.services.hbpr_assignments import create_assignment
from plugins.organigrama.plugin import OrganigramaPlugin
from plugins.organigrama.viewsets import OrganigramaViewSet


def _usernames(nodes):
    found = set()
    for node in nodes:
        if node["type"] == "person":
            found.add(node["username"])
        found |= _usernames(node["children"])
    return found


class HbprOrganigramaTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        for code in ("hbpr", "albanian_tl", "italian_tl", "employee"):
            Role.objects.get_or_create(code=code, defaults={"name": code})
        cls.it_tl = User.objects.create_user("hb_it", password="x")
        assign_role(cls.it_tl, "italian_tl")
        cls.hbpr = User.objects.create_user("hb_hbpr", password="x")
        assign_role(cls.hbpr, "hbpr")
        cls.mine, cls.other = (
            User.objects.create_user(name, password="x") for name in ("hb_al1", "hb_al2")
        )
        for al in (cls.mine, cls.other):
            assign_role(al, "albanian_tl")
            al.profile.italian_tl = cls.it_tl
            al.profile.save()
        cls.emp_mine = User.objects.create_user("hb_emp1", password="x")
        cls.emp_other = User.objects.create_user("hb_emp2", password="x")
        for emp, al in ((cls.emp_mine, cls.mine), (cls.emp_other, cls.other)):
            emp.profile.albanian_tl = al
            emp.profile.save()
        create_assignment(
            hbpr=cls.hbpr, albanian_tl=cls.mine, cadence="weekly",
            effective_from=date(2020, 1, 1),
        )

    def _get(self, path="/organigrama/", user=None, **params):
        request = APIRequestFactory().get(path, params)
        force_authenticate(request, user=user or self.hbpr)
        return OrganigramaViewSet.as_view()(request)

    def test_manifest_no_longer_denies_hbpr(self):
        view = OrganigramaPlugin().get_permission_manifest()["view"]
        self.assertNotIn("hbpr", view.get("denied_roles", []))

    def test_tree_holds_only_assigned_tl_and_their_team(self):
        response = self._get()
        self.assertEqual(response.status_code, 200)
        names = _usernames(response.data["roots"])
        self.assertEqual(names, {"hb_it", "hb_al1", "hb_emp1"})

    def test_hbpr_without_assignment_sees_nothing(self):
        lonely = User.objects.create_user("hb_lonely", password="x")
        assign_role(lonely, "hbpr")
        response = self._get(user=lonely)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["roots"], [])

    def test_lazy_load_inside_scope_is_allowed(self):
        response = self._get(
            "/organigrama/subtree/", node_id=self.mine.id, node_type="person"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual({r["username"] for r in response.data["results"]}, {"hb_emp1"})

    def test_lazy_load_outside_scope_is_refused(self):
        response = self._get(
            "/organigrama/subtree/", node_id=self.other.id, node_type="person"
        )
        self.assertEqual(response.status_code, 403)

    def test_tech_lazy_load_hides_out_of_scope_members(self):
        from apps.users.models.core import Tech, UserTech

        tech = Tech.objects.create(name="Net", code="net")
        for emp in (self.emp_mine, self.emp_other):
            UserTech.objects.create(user_profile=emp.profile, tech=tech)
        response = self._get("/organigrama/subtree/", node_id=tech.id, node_type="tech")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({r["username"] for r in response.data["results"]}, {"hb_emp1"})
