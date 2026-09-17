"""
Tests for the Organigrama plugin — company org chart tree endpoint.

Verifies:
- Tree endpoint returns 200 for authenticated users.
- Employee sees only own chain (self → albanian_tl → italian_tl).
- Albanian TL sees own subtree (direct members + team members).
- Italian TL sees own subtree (Albanian TLs reporting to them + members).
- HR/Admin see all roots (full tree).
- Unauthenticated → 401.
- Tree shape: person nodes + team nodes + children.
- No N+1 queries (assertNumQueries).
- Empty/flat hierarchy (no TL assignments) returns empty or minimal tree.
"""
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate

from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.users.models.core import Tech, TechLevel, UserTech
from plugins.organigrama.viewsets import OrganigramaViewSet


class OrganigramaTreeTestCase(TestCase):
    """Base test case with org hierarchy setup."""

    @classmethod
    def setUpTestData(cls):
        # Italian TLs
        cls.italian_tl = User.objects.create_user(
            username="it_tl", password="test123", first_name="Italian", last_name="Leader"
        )
        cls.italian_tl.profile.is_italian_tl_role = True
        cls.italian_tl.profile.save(update_fields=["is_italian_tl_role"])

        # Albanian TL (reports to Italian TL)
        cls.albanian_tl = User.objects.create_user(
            username="al_tl", password="test123", first_name="Albanian", last_name="Leader"
        )
        cls.albanian_tl.profile.is_albanian_tl_role = True
        cls.albanian_tl.profile.italian_tl = cls.italian_tl
        cls.albanian_tl.profile.save(update_fields=["is_albanian_tl_role", "italian_tl"])

        # Employees (report to Albanian TL)
        cls.emp1 = User.objects.create_user(
            username="emp1", password="test123", first_name="Emp", last_name="One"
        )
        cls.emp2 = User.objects.create_user(
            username="emp2", password="test123", first_name="Emp", last_name="Two"
        )
        cls.emp1.profile.albanian_tl = cls.albanian_tl
        cls.emp1.profile.save(update_fields=["albanian_tl"])
        cls.emp2.profile.albanian_tl = cls.albanian_tl
        cls.emp2.profile.save(update_fields=["albanian_tl"])

        # Independent technology classifications
        cls.infra_tech = Tech.objects.create(name="Infrastructure", code="INFRA_TEST")
        cls.backup_tech = Tech.objects.create(name="Backup", code="BACKUP_TEST")
        cls.database_tech = Tech.objects.create(name="Database", code="DB_TEST")
        cls.emp1.profile.techs.add(cls.infra_tech)
        cls.emp2.profile.techs.add(cls.backup_tech)

        # Admin user
        cls.admin = User.objects.create_user(
            username="admin", password="test123", is_staff=True, is_superuser=True
        )

        # HR user
        cls.hr = User.objects.create_user(
            username="hr_user", password="test123", first_name="HR", last_name="User"
        )
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save(update_fields=["is_hr_user"])

        # Standalone employee (no TL assignment)
        cls.standalone_emp = User.objects.create_user(
            username="standalone", password="test123"
        )

        # --- Second hierarchy (for negative-scoping tests) ---
        cls.italian_tl2 = User.objects.create_user(
            username="it_tl2", password="test123",
            first_name="Italian2", last_name="Leader",
        )
        cls.italian_tl2.profile.is_italian_tl_role = True
        cls.italian_tl2.profile.save(update_fields=["is_italian_tl_role"])

        cls.albanian_tl2 = User.objects.create_user(
            username="al_tl2", password="test123",
            first_name="Albanian2", last_name="Leader",
        )
        cls.albanian_tl2.profile.is_albanian_tl_role = True
        cls.albanian_tl2.profile.italian_tl = cls.italian_tl2
        cls.albanian_tl2.profile.save(
            update_fields=["is_albanian_tl_role", "italian_tl"]
        )

        cls.emp3 = User.objects.create_user(
            username="emp3", password="test123", first_name="Emp", last_name="Three"
        )
        cls.emp4 = User.objects.create_user(
            username="emp4", password="test123", first_name="Emp", last_name="Four"
        )
        cls.emp3.profile.albanian_tl = cls.albanian_tl2
        cls.emp3.profile.save(update_fields=["albanian_tl"])
        cls.emp4.profile.albanian_tl = cls.albanian_tl2
        cls.emp4.profile.save(update_fields=["albanian_tl"])

    def setUp(self):
        self.factory = APIRequestFactory()

    def _get_tree(self, user):
        """Call the tree endpoint as the given user."""
        request = self.factory.get("/api/plugins/organigrama/tree/")
        if user:
            force_authenticate(request, user=user)
        view = OrganigramaViewSet.as_view()
        return view(request)

    def _get_subtree(self, user, params=None):
        """Call the subtree endpoint as the given user with query params."""
        from urllib.parse import urlencode
        qs = urlencode(params or {})
        url = "/api/plugins/organigrama/subtree/"
        if qs:
            url = f"{url}?{qs}"
        request = self.factory.get(url)
        if user:
            force_authenticate(request, user=user)
        view = OrganigramaViewSet.as_view()
        return view(request)


class TestTreeEndpoint(OrganigramaTreeTestCase):
    """Tests for GET /api/plugins/organigrama/tree/"""

    def test_unauthenticated_returns_401(self):
        resp = self._get_tree(None)
        self.assertEqual(resp.status_code, 401)

    def test_admin_sees_full_tree(self):
        resp = self._get_tree(self.admin)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["scope"], "full")
        roots = data["roots"]
        self.assertTrue(len(roots) > 0)
        it_root = next(
            (r for r in roots if r.get("username") == "it_tl"), None
        )
        self.assertIsNotNone(it_root, "Italian TL should be a root node")
        self.assertEqual(it_root["type"], "person")
        self.assertEqual(it_root["role_badge"], "italian_tl")

    def test_admin_tree_contains_albanian_tl_under_italian_tl(self):
        resp = self._get_tree(self.admin)
        data = resp.data
        roots = data["roots"]
        it_root = next(r for r in roots if r.get("username") == "it_tl")
        children = it_root.get("children", [])
        al_node = next(
            (c for c in children if c.get("username") == "al_tl"), None
        )
        self.assertIsNotNone(al_node, "Albanian TL should be under Italian TL")
        self.assertEqual(al_node["role_badge"], "albanian_tl")

    def test_admin_tree_contains_tech_nodes_under_albanian_tl(self):
        resp = self._get_tree(self.admin)
        data = resp.data
        roots = data["roots"]
        it_root = next(r for r in roots if r.get("username") == "it_tl")
        al_node = next(c for c in it_root["children"] if c.get("username") == "al_tl")
        al_children = al_node.get("children", [])
        tech_nodes = [c for c in al_children if c.get("type") == "tech"]
        self.assertTrue(len(tech_nodes) >= 2, "Should have at least 2 tech nodes")

    def test_admin_tree_contains_employees_under_tech(self):
        resp = self._get_tree(self.admin)
        data = resp.data
        roots = data["roots"]
        it_root = next(r for r in roots if r.get("username") == "it_tl")
        al_node = next(c for c in it_root["children"] if c.get("username") == "al_tl")
        infra_node = next(
            c for c in al_node["children"] if c.get("name") == "Infrastructure"
        )
        self.assertEqual(infra_node["type"], "tech")
        emp_nodes = infra_node.get("children", [])
        self.assertTrue(any(e.get("username") == "emp1" for e in emp_nodes))

    def test_employee_sees_own_chain_only(self):
        """Employee without tech-siblings sees only own chain (self → TLs)."""
        resp = self._get_tree(self.emp1)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["scope"], "chain")
        all_usernames = self._collect_usernames(data["roots"])
        self.assertIn("emp1", all_usernames)
        self.assertIn("it_tl", all_usernames)
        # emp2 has a different tech (Backup), not shared with emp1 (Infra)
        self.assertNotIn("emp2", all_usernames)

    def test_employee_sees_tech_siblings_in_chain(self):
        """Employee with shared tech sees tech siblings under same Albanian TL.

        emp5 is under al_tl and shares the Infrastructure tech with emp1.
        emp1's chain should include a Tech node containing both emp1 and emp5.
        """
        emp5 = User.objects.create_user(
            username="emp5", password="test123", first_name="Emp", last_name="Five"
        )
        emp5.profile.albanian_tl = self.albanian_tl
        emp5.profile.save(update_fields=["albanian_tl"])
        emp5.profile.techs.add(self.infra_tech)

        resp = self._get_tree(self.emp1)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["scope"], "chain")
        all_usernames = self._collect_usernames(data["roots"])
        self.assertIn("emp1", all_usernames)
        self.assertIn("emp5", all_usernames)
        self.assertIn("it_tl", all_usernames)
        self.assertIn("al_tl", all_usernames)
        # emp2 has Backup tech, not shared with emp1 → must NOT appear
        self.assertNotIn("emp2", all_usernames)
        # emp3/emp4 are under a different Albanian TL → must NOT appear
        self.assertNotIn("emp3", all_usernames)
        self.assertNotIn("emp4", all_usernames)

    def test_employee_chain_has_tech_node_with_siblings(self):
        """Chain should contain a Tech node with the shared tech name."""
        emp5 = User.objects.create_user(
            username="emp5b", password="test123", first_name="Emp", last_name="FiveB"
        )
        emp5.profile.albanian_tl = self.albanian_tl
        emp5.profile.save(update_fields=["albanian_tl"])
        emp5.profile.techs.add(self.infra_tech)

        resp = self._get_tree(self.emp1)
        data = resp.data
        roots = data["roots"]
        # Italian TL → Albanian TL → Tech node → employees
        it_node = next(r for r in roots if r.get("username") == "it_tl")
        al_node = next(c for c in it_node["children"] if c.get("username") == "al_tl")
        tech_nodes = [c for c in al_node["children"] if c.get("type") == "tech"]
        self.assertTrue(len(tech_nodes) >= 1, "Should have tech node for shared tech")
        infra_node = next(
            (t for t in tech_nodes if t.get("name") == "Infrastructure"), None
        )
        self.assertIsNotNone(infra_node, "Infrastructure tech node should exist")
        tech_usernames = {e.get("username") for e in infra_node["children"]}
        self.assertIn("emp1", tech_usernames)
        self.assertIn("emp5b", tech_usernames)

    def test_employee_without_tech_sees_direct_child_chain(self):
        """Employee with no tech assignment appears as direct child of AL TL."""
        resp = self._get_tree(self.emp2)
        data = resp.data
        roots = data["roots"]
        it_node = next(r for r in roots if r.get("username") == "it_tl")
        al_node = next(c for c in it_node["children"] if c.get("username") == "al_tl")
        # emp2 has Backup tech, so should be under a Backup tech node, not direct
        # But let's test a truly tech-less employee
        emp_no_tech = User.objects.create_user(
            username="emp_no_tech", password="test123"
        )
        emp_no_tech.profile.albanian_tl = self.albanian_tl
        emp_no_tech.profile.save(update_fields=["albanian_tl"])

        resp = self._get_tree(emp_no_tech)
        data = resp.data
        roots = data["roots"]
        it_node = next(r for r in roots if r.get("username") == "it_tl")
        al_node = next(c for c in it_node["children"] if c.get("username") == "al_tl")
        direct_children = [
            c for c in al_node["children"] if c.get("type") == "person"
        ]
        self.assertTrue(
            any(c.get("username") == "emp_no_tech" for c in direct_children),
            "Tech-less employee should be direct child of AL TL",
        )

    def test_albanian_tl_sees_subtree(self):
        resp = self._get_tree(self.albanian_tl)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["scope"], "subtree")
        all_usernames = self._collect_usernames(data["roots"])
        self.assertIn("al_tl", all_usernames)
        self.assertIn("emp1", all_usernames)
        self.assertIn("emp2", all_usernames)
        self.assertNotIn("standalone", all_usernames)

    def test_albanian_tl_subtree_nests_employees_under_their_own_italian_tl(self):
        """One Albanian TL can be shared across teams that each have a
        different Italian TL. The Albanian TL's own subtree must nest each
        employee under THEIR team's Italian TL, not dump everyone flat under
        the Albanian TL grouped only by Tech.

        Regression: emp1/emp2 (from setUpTestData) have no italian_tl FK of
        their own, so this adds a second team under the same Albanian TL —
        emp1 keeps italian_tl unset (falls back to direct child), emp2 gets
        its own italian_tl distinct from cls.italian_tl.
        """
        second_italian_tl = User.objects.create_user(
            username="it_tl_team2", password="test123",
            first_name="Italian", last_name="TeamTwo",
        )
        second_italian_tl.profile.is_italian_tl_role = True
        second_italian_tl.profile.save(update_fields=["is_italian_tl_role"])

        self.emp2.profile.italian_tl = second_italian_tl
        self.emp2.profile.save(update_fields=["italian_tl"])

        resp = self._get_tree(self.albanian_tl)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        roots = data["roots"]
        al_root = next(r for r in roots if r.get("username") == "al_tl")

        it_team2_node = next(
            (c for c in al_root["children"] if c.get("username") == "it_tl_team2"),
            None,
        )
        self.assertIsNotNone(
            it_team2_node,
            "emp2's own Italian TL must appear as a nested node under the Albanian TL",
        )
        it_team2_usernames = self._collect_usernames(it_team2_node["children"])
        self.assertIn("emp2", it_team2_usernames)

        # emp2 must NOT also appear as a flat direct child of the Albanian TL.
        direct_usernames = {
            c.get("username") for c in al_root["children"] if c.get("type") == "person"
        }
        self.assertNotIn("emp2", direct_usernames)

    def test_employee_with_italian_tl_fk_is_not_misidentified_as_albanian_tl(self):
        """A regular employee can have their own italian_tl FK set (each
        team has its own Italian TL — a data pattern this session
        introduced) without an Albanian TL role. They must not be promoted
        into the tree as if they were an Albanian TL reporting to that
        Italian TL — that requires is_albanian_tl_role, not just the FK.
        """
        # emp1 has no Albanian TL role — only an italian_tl FK, same as any
        # regular employee under the new per-team Italian TL data pattern.
        self.emp1.profile.italian_tl = self.italian_tl
        self.emp1.profile.save(update_fields=["italian_tl"])

        resp = self._get_tree(self.admin)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        it_root = next(r for r in data["roots"] if r.get("username") == "it_tl")

        al_peer_usernames = {
            c.get("username") for c in it_root["children"] if c.get("type") == "person"
        }
        self.assertNotIn(
            "emp1", al_peer_usernames,
            "emp1 must not appear as an Albanian-TL-level peer under the Italian TL",
        )
        al_node = next(c for c in it_root["children"] if c.get("username") == "al_tl")
        self.assertEqual(al_node["role_badge"], "albanian_tl")

    def test_admin_full_tree_nests_employees_under_their_own_italian_tl(self):
        """Same regression as the Albanian-TL subtree, but for the full
        company tree (admin/HR view). An Albanian TL shared across teams
        with different Italian TLs must not have every employee flattened
        under them — employees whose own italian_tl differs from the
        Albanian TL's own manager must nest under a second Italian TL node.
        """
        second_italian_tl = User.objects.create_user(
            username="it_tl_team2", password="test123",
            first_name="Italian", last_name="TeamTwo",
        )
        second_italian_tl.profile.is_italian_tl_role = True
        second_italian_tl.profile.save(update_fields=["is_italian_tl_role"])

        self.emp2.profile.italian_tl = second_italian_tl
        self.emp2.profile.save(update_fields=["italian_tl"])

        resp = self._get_tree(self.admin)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        roots = data["roots"]

        it_root = next(r for r in roots if r.get("username") == "it_tl")
        al_node = next(c for c in it_root["children"] if c.get("username") == "al_tl")

        it_team2_node = next(
            (c for c in al_node["children"] if c.get("username") == "it_tl_team2"),
            None,
        )
        self.assertIsNotNone(
            it_team2_node,
            "emp2's own Italian TL must appear nested under the Albanian TL, "
            "not just in the Albanian TL's own subtree view",
        )
        it_team2_usernames = self._collect_usernames(it_team2_node["children"])
        self.assertIn("emp2", it_team2_usernames)

        # emp2 must NOT also appear as a flat/tech direct descendant of the
        # Albanian TL outside the nested it_tl_team2 node.
        direct_usernames = self._collect_usernames(al_node["children"])
        direct_usernames.discard("it_tl_team2")
        self.assertNotIn("emp2", direct_usernames - it_team2_usernames)

        # The common case (emp1, same Italian TL as the Albanian TL's own
        # manager) must still attach directly — no redundant duplicate
        # it_tl node for the already-shown Italian TL.
        duplicate_it_tl_nodes = [
            c for c in al_node["children"] if c.get("username") == "it_tl"
        ]
        self.assertEqual(
            duplicate_it_tl_nodes, [],
            "must not create a redundant nested node for the Italian TL "
            "already represented one level up",
        )

    def test_italian_tl_sees_subtree(self):
        resp = self._get_tree(self.italian_tl)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["scope"], "subtree")
        all_usernames = self._collect_usernames(data["roots"])
        self.assertIn("it_tl", all_usernames)
        self.assertIn("al_tl", all_usernames)
        self.assertIn("emp1", all_usernames)
        self.assertIn("emp2", all_usernames)

    def test_hr_sees_full_tree(self):
        resp = self._get_tree(self.hr)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["scope"], "full")

    def test_tree_has_total_nodes_count(self):
        resp = self._get_tree(self.admin)
        data = resp.data
        self.assertIn("total_nodes", data)
        self.assertGreater(data["total_nodes"], 0)

    def _collect_usernames(self, nodes):
        """Recursively collect all usernames from person nodes."""
        usernames = set()
        for node in nodes:
            if node.get("type") == "person" and node.get("username"):
                usernames.add(node["username"])
            usernames.update(self._collect_usernames(node.get("children", [])))
        return usernames


class TestTreePerformance(OrganigramaTreeTestCase):
    """Query count tests — no N+1."""

    def test_tree_query_count_bounded(self):
        from django.db import connection
        # Warm up
        self._get_tree(self.admin)
        initial = len(connection.queries)
        self._get_tree(self.admin)
        query_count = len(connection.queries) - initial
        # Smoke test — should be bounded, not N+1.
        self.assertLess(query_count, 20, f"Too many queries: {query_count}")


class TestTreePerformanceRealistic(TestCase):
    """Realistic N+1 test: 5 IT TLs, 10 AL TLs, 20 employees.

    Batch fetching in build_full_tree() should keep the query count
    at <= 8 (target 6) regardless of how many nodes exist.
    """

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username="admin", password="test123",
            is_staff=True, is_superuser=True,
        )
        cls.italian_tls = []
        cls.albanian_tls = []
        cls.employees = []
        for i in range(5):
            it = User.objects.create_user(
                username=f"it_{i}", password="test123",
                first_name=f"It{i}", last_name="TL",
            )
            it.profile.is_italian_tl_role = True
            it.profile.save(update_fields=["is_italian_tl_role"])
            cls.italian_tls.append(it)
            for j in range(2):
                al = User.objects.create_user(
                    username=f"al_{i}_{j}", password="test123",
                    first_name=f"Al{i}{j}", last_name="TL",
                )
                al.profile.is_albanian_tl_role = True
                al.profile.italian_tl = it
                al.profile.save(
                    update_fields=["is_albanian_tl_role", "italian_tl"]
                )
                cls.albanian_tls.append(al)
                for k in range(2):
                    emp = User.objects.create_user(
                        username=f"emp_{i}_{j}_{k}", password="test123",
                        first_name=f"Emp{i}{j}{k}", last_name="X",
                    )
                    emp.profile.albanian_tl = al
                    emp.profile.save(update_fields=["albanian_tl"])
                    cls.employees.append(emp)

    def setUp(self):
        self.factory = APIRequestFactory()

    def _get_tree(self, user):
        request = self.factory.get("/api/plugins/organigrama/tree/")
        force_authenticate(request, user=user)
        view = OrganigramaViewSet.as_view()
        return view(request)

    def test_full_tree_query_count_le_8(self):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        # Warm up so setup-related queries (e.g. content types) are excluded.
        self._get_tree(self.admin)
        with CaptureQueriesContext(connection) as ctx:
            resp = self._get_tree(self.admin)
        self.assertEqual(resp.status_code, 200)
        query_count = len(ctx.captured_queries)
        # Batch fetching should keep this at ~6; allow up to 8 for safety.
        self.assertLessEqual(
            query_count, 8,
            f"Expected <= 8 queries for full tree, got {query_count}",
        )

    def test_full_tree_query_count_does_not_grow_with_nodes(self):
        """Doubling the hierarchy must not double the query count."""
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        self._get_tree(self.admin)
        with CaptureQueriesContext(connection) as ctx1:
            self._get_tree(self.admin)
        base = len(ctx1.captured_queries)
        # Add another full hierarchy branch
        it = User.objects.create_user(username="it_x", password="t")
        it.profile.is_italian_tl_role = True
        it.profile.save(update_fields=["is_italian_tl_role"])
        for j in range(2):
            al = User.objects.create_user(username=f"al_x_{j}", password="t")
            al.profile.is_albanian_tl_role = True
            al.profile.italian_tl = it
            al.profile.save(update_fields=["is_albanian_tl_role", "italian_tl"])
            for k in range(2):
                emp = User.objects.create_user(username=f"emp_x_{j}_{k}", password="t")
                emp.profile.albanian_tl = al
                emp.profile.save(update_fields=["albanian_tl"])
        with CaptureQueriesContext(connection) as ctx2:
            self._get_tree(self.admin)
        grown = len(ctx2.captured_queries)
        self.assertEqual(
            base, grown,
            f"Query count grew with nodes: {base} -> {grown} (should be equal)",
        )


class TestNegativeScoping(OrganigramaTreeTestCase):
    """H3 — verify users cannot see outside their scope."""

    def test_employee_cannot_see_other_al_tl_employees(self):
        """Employee under first AL TL cannot see employees under second AL TL."""
        resp = self._get_tree(self.emp1)
        self.assertEqual(resp.status_code, 200)
        usernames = self._collect_usernames(resp.data["roots"])
        self.assertNotIn("emp3", usernames)
        self.assertNotIn("emp4", usernames)
        self.assertNotIn("al_tl2", usernames)

    def test_albanian_tl_cannot_see_other_al_tl_members(self):
        """Albanian TL cannot see another Albanian TL's members."""
        resp = self._get_tree(self.albanian_tl)
        self.assertEqual(resp.status_code, 200)
        usernames = self._collect_usernames(resp.data["roots"])
        self.assertIn("emp1", usernames)
        self.assertIn("emp2", usernames)
        self.assertNotIn("emp3", usernames)
        self.assertNotIn("emp4", usernames)
        self.assertNotIn("al_tl2", usernames)

    def test_italian_tl_cannot_see_other_italian_tl_subtree(self):
        """Italian TL cannot see another Italian TL's subtree."""
        resp = self._get_tree(self.italian_tl)
        self.assertEqual(resp.status_code, 200)
        usernames = self._collect_usernames(resp.data["roots"])
        self.assertIn("al_tl", usernames)
        self.assertIn("emp1", usernames)
        self.assertIn("emp2", usernames)
        self.assertNotIn("italian_tl2", usernames)
        self.assertNotIn("al_tl2", usernames)
        self.assertNotIn("emp3", usernames)
        self.assertNotIn("emp4", usernames)

    def _collect_usernames(self, nodes):
        usernames = set()
        for node in nodes:
            if node.get("type") == "person" and node.get("username"):
                usernames.add(node["username"])
            usernames.update(self._collect_usernames(node.get("children", [])))
        return usernames


class TestSubtreeEndpoint(OrganigramaTreeTestCase):
    """H7 — tests for the lazy-load subtree endpoint."""

    def test_subtree_of_italian_tl_person_returns_albanian_tls(self):
        resp = self._get_subtree(
            self.admin,
            {"node_id": self.italian_tl.id, "node_type": "person"},
        )
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get("results", resp.data.get("children", []))
        usernames = {n.get("username") for n in results if n.get("type") == "person"}
        self.assertIn("al_tl", usernames)

    def test_subtree_of_albanian_tl_person_returns_employees(self):
        resp = self._get_subtree(
            self.admin,
            {"node_id": self.albanian_tl.id, "node_type": "person"},
        )
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get("results", resp.data.get("children", []))
        usernames = {n.get("username") for n in results if n.get("type") == "person"}
        self.assertIn("emp1", usernames)
        self.assertIn("emp2", usernames)

    def test_subtree_of_tech_returns_members(self):
        resp = self._get_subtree(
            self.admin,
            {"node_id": self.infra_tech.id, "node_type": "tech"},
        )
        self.assertEqual(resp.status_code, 200)
        results = resp.data.get("results", resp.data.get("children", []))
        usernames = {n.get("username") for n in results if n.get("type") == "person"}
        self.assertIn("emp1", usernames)

    def test_subtree_missing_node_id_returns_400(self):
        resp = self._get_subtree(self.admin, {"node_type": "person"})
        self.assertEqual(resp.status_code, 400)

    def test_subtree_invalid_node_type_returns_400(self):
        resp = self._get_subtree(
            self.admin,
            {"node_id": self.italian_tl.id, "node_type": "bogus"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_subtree_node_not_found_returns_404(self):
        resp = self._get_subtree(
            self.admin,
            {"node_id": 999999, "node_type": "person"},
        )
        self.assertEqual(resp.status_code, 404)

    def test_subtree_scoping_enforced(self):
        """Employee cannot fetch subtree of an out-of-scope node."""
        # emp1 is under al_tl; italian_tl2 is a completely separate subtree.
        resp = self._get_subtree(
            self.emp1,
            {"node_id": self.italian_tl2.id, "node_type": "person"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_subtree_pagination_works(self):
        """page_size param limits the number of returned children."""
        resp = self._get_subtree(
            self.admin,
            {
                "node_id": self.italian_tl.id,
                "node_type": "person",
                "page_size": 1,
            },
        )
        self.assertEqual(resp.status_code, 200)
        # Paginated response shape
        self.assertIn("count", resp.data)
        self.assertIn("results", resp.data)
        self.assertEqual(len(resp.data["results"]), 1)


class TestTreeEmptyHierarchy(TestCase):
    """Tests for empty/flat hierarchy (no TL assignments)."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_user_with_no_tl_assignments_gets_minimal_tree(self):
        user = User.objects.create_user(username="lone", password="test123")
        request = self.factory.get("/api/plugins/organigrama/tree/")
        force_authenticate(request, user=user)
        view = OrganigramaViewSet.as_view()
        resp = view(request)
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertIn("roots", data)
        # Should contain at least self
        self.assertTrue(len(data["roots"]) > 0)


class TestTechEdgeCases(OrganigramaTreeTestCase):
    """Edge cases for Tech grouping in the org chart."""

    def test_employee_with_only_inactive_tech_is_direct_child(self):
        """Employee whose only techs are inactive appears as direct child, not under a tech node."""
        from apps.users.models.core import Tech
        inactive_tech = Tech.objects.create(name="Legacy", code="LEGACY_TEST", is_active=False)
        self.emp1.profile.techs.clear()
        self.emp1.profile.techs.add(inactive_tech)

        resp = self._get_tree(self.emp1)
        self.assertEqual(resp.status_code, 200)

        def _has_tech_node(nodes):
            for n in nodes:
                if n.get("type") == "tech":
                    return True
                if _has_tech_node(n.get("children", [])):
                    return True
            return False

        self.assertFalse(
            _has_tech_node(resp.data["roots"]),
            "Inactive tech should not produce a tech node in chain view",
        )

    def test_admin_tree_tech_node_with_zero_members_not_rendered(self):
        """Tech with no assigned employees should not appear as an empty node in full tree."""
        from apps.users.models.core import Tech
        empty_tech = Tech.objects.create(name="Empty Tech", code="EMPTY_TEST")

        resp = self._get_tree(self.admin)
        self.assertEqual(resp.status_code, 200)

        def _find_tech_node(nodes, tech_id):
            for n in nodes:
                if n.get("type") == "tech" and n.get("id") == tech_id:
                    return n
                found = _find_tech_node(n.get("children", []), tech_id)
                if found:
                    return found
            return None

        self.assertIsNone(
            _find_tech_node(resp.data["roots"], empty_tech.id),
            "Tech with zero members should not appear in tree",
        )

    def test_employee_no_tech_no_al_tl_sees_only_self(self):
        """Employee with no techs and no Albanian TL sees only themselves."""
        user = User.objects.create_user(username="notech_notl", password="test123")
        # Give them an Italian TL so the chain has 2 levels
        user.profile.italian_tl = self.italian_tl
        user.profile.save(update_fields=["italian_tl"])

        resp = self._get_tree(user)
        self.assertEqual(resp.status_code, 200)
        roots = resp.data["roots"]
        self.assertEqual(len(roots), 1)
        # Root = Italian TL, child = employee (no tech node)
        self.assertEqual(roots[0]["type"], "person")
        children = roots[0].get("children", [])
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["type"], "person")
        self.assertEqual(children[0]["username"], "notech_notl")


class RoleBadgeTestCase(OrganigramaTreeTestCase):
    """Focused tests for the shared ``role_badge`` classifier.

    The viewset's ``_person_children`` and the tree builder's ``_role_badge``
    previously duplicated the Italian/Albanian TL detection logic. Both now
    delegate to the public ``role_badge`` helper so the detection cannot
    drift. These tests cover each classification branch and the role-code
    cache vs legacy profile flag equivalence.
    """

    def test_italian_tl_profile_flag_classifies_as_italian_tl(self):
        from plugins.organigrama.services.tree_builder import role_badge
        self.assertEqual(role_badge(self.italian_tl.profile), "italian_tl")

    def test_albanian_tl_profile_flag_classifies_as_albanian_tl(self):
        from plugins.organigrama.services.tree_builder import role_badge
        self.assertEqual(role_badge(self.albanian_tl.profile), "albanian_tl")

    def test_hr_profile_flag_classifies_as_hr(self):
        from plugins.organigrama.services.tree_builder import role_badge
        self.assertEqual(role_badge(self.hr.profile), "hr")

    def test_staff_user_classifies_as_admin(self):
        from plugins.organigrama.services.tree_builder import role_badge
        self.assertEqual(role_badge(self.admin.profile), "admin")

    def test_ordinary_employee_classifies_as_employee(self):
        from plugins.organigrama.services.tree_builder import role_badge
        self.assertEqual(role_badge(self.emp1.profile), "employee")

    def test_role_code_cache_matches_legacy_profile_flag(self):
        """A profile with role_codes cache but no legacy flag still classifies correctly."""
        from plugins.organigrama.services.tree_builder import role_badge
        # The Italian TL fixture has the legacy flag set; populate the
        # role_codes cache and verify the classification is unchanged.
        self.italian_tl.profile.role_codes = ["italian_tl"]
        self.assertEqual(role_badge(self.italian_tl.profile), "italian_tl")
        # Albanian TL via role_codes only (clear the legacy flag).
        self.albanian_tl.profile.is_albanian_tl_role = False
        self.albanian_tl.profile.role_codes = ["albanian_tl"]
        self.assertEqual(role_badge(self.albanian_tl.profile), "albanian_tl")


class TestSubtreeTechLevelQueryBudget(TestCase):
    """The subtree endpoint must not read tech levels one person at a time.

    ``_person_node`` puts ``tech_levels`` on every person node, so each of the
    viewset's own child querysets needs the ``tech_assignments`` prefetch. The
    tree builder's querysets already have it; the viewset's lazy-load ones are
    a separate code path and were missed.

    Counted as growth across two member counts rather than as an absolute
    number: a prefetch over a single row renders as ``WHERE id = 1``, so only
    growth distinguishes a prefetch from a per-row read.
    """

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username="qb_admin", password="test123", is_staff=True, is_superuser=True
        )
        cls.tech = Tech.objects.create(name="QB Infra", code="QB_INFRA")
        cls.level = TechLevel.objects.create(
            tech=cls.tech, name="L3", code="L3", rank=3
        )
        cls.albanian_tl = User.objects.create_user(username="qb_al_tl", password="t")
        cls.albanian_tl.profile.is_albanian_tl_role = True
        cls.albanian_tl.profile.save(update_fields=["is_albanian_tl_role"])

    def _add_members(self, count, offset=0):
        for i in range(count):
            user = User.objects.create_user(username=f"qb_emp{offset + i}", password="t")
            user.profile.albanian_tl = self.albanian_tl
            user.profile.save(update_fields=["albanian_tl"])
            UserTech.objects.create(
                user_profile=user.profile, tech=self.tech, level=self.level
            )

    def _subtree_queries(self, params):
        from urllib.parse import urlencode

        factory = APIRequestFactory()
        request = factory.get(
            f"/api/plugins/organigrama/subtree/?{urlencode(params)}"
        )
        force_authenticate(request, user=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            resp = OrganigramaViewSet.as_view()(request)
            self.assertEqual(resp.status_code, 200)
        return len(
            [
                q
                for q in ctx.captured_queries
                if "user_profiles_techs" in q["sql"] or "tech_levels" in q["sql"]
            ]
        )

    def _assert_flat(self, params):
        self._add_members(3)
        few = self._subtree_queries({**params, "page_size": 100})
        self._add_members(12, offset=100)
        many = self._subtree_queries({**params, "page_size": 100})
        self.assertEqual(
            few,
            many,
            f"Tech queries grew {few} -> {many} as members went 3 -> 15",
        )

    def test_person_children_does_not_read_levels_per_row(self):
        self._assert_flat({"node_id": self.albanian_tl.id, "node_type": "person"})

    def test_tech_children_does_not_read_levels_per_row(self):
        self._assert_flat({"node_id": self.tech.id, "node_type": "tech"})
