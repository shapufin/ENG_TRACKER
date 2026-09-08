"""
Phase B — Persistent custom chart foundation: model constraints and lifecycle.

Covers OrgChart / OrgChartNode / OrgChartEdge / OrgChartAudienceRole /
OrgChartAudienceGroup / OrgChartRevision defaults, unique constraints, choice
validation, FK cascade/SET_NULL semantics, and migration reversibility.

No viewer/API exposure is asserted here (Phase B gate: backend foundation only).
"""
from django.contrib.auth.models import User
from django.core.management import call_command
from django.db import connection, IntegrityError
from django.test import TestCase, TransactionTestCase

from apps.permissions.models.core import Group
from plugins.organigrama.models import (
    OrgChart,
    OrgChartNode,
    OrgChartEdge,
    OrgChartAudienceRole,
    OrgChartAudienceGroup,
    OrgChartRevision,
    EDGE_TYPES,
    HIERARCHY_EDGE_TYPES,
)


def _make_chart(**kwargs):
    defaults = dict(name="Engineering Org", slug="engineering-org")
    defaults.update(kwargs)
    return OrgChart.objects.create(**defaults)


class OrgChartDefaultsTestCase(TestCase):
    def test_default_status_source_and_audience(self):
        chart = _make_chart()
        self.assertEqual(chart.status, "draft")
        self.assertEqual(chart.source_mode, "custom")
        self.assertEqual(chart.audience_mode, "private_admin")
        self.assertEqual(chart.revision_number, 0)
        self.assertFalse(chart.is_featured)

    def test_slug_unique(self):
        _make_chart(slug="unique-slug")
        with self.assertRaises(IntegrityError):
            _make_chart(slug="unique-slug")

    def test_invalid_status_rejected_by_full_clean(self):
        chart = _make_chart(status="bogus")
        with self.assertRaises(Exception):
            chart.full_clean()

    def test_invalid_audience_mode_rejected_by_full_clean(self):
        chart = _make_chart(audience_mode="public")
        with self.assertRaises(Exception):
            chart.full_clean()


class OrgChartNodeTestCase(TestCase):
    def setUp(self):
        self.chart = _make_chart()
        self.node = OrgChartNode.objects.create(
            chart=self.chart,
            shape_type="person",
            display_name="CEO",
        )

    def test_node_uuid_unique_within_chart(self):
        # self.node already exists with a generated node_uuid. Creating a
        # second node in the same chart with that UUID must fail.
        with self.assertRaises(IntegrityError):
            OrgChartNode.objects.create(
                chart=self.chart, shape_type="person", display_name="Dup",
                node_uuid=self.node.node_uuid,
            )

    def test_invalid_shape_type_rejected(self):
        node = OrgChartNode(
            chart=self.chart, shape_type="not_a_shape", display_name="X",
        )
        with self.assertRaises(Exception):
            node.full_clean()

    def test_linked_user_set_null_on_user_delete(self):
        user = User.objects.create_user(username="linked", password="p")
        self.node.linked_user = user
        self.node.save(update_fields=["linked_user"])
        user.delete()
        self.node.refresh_from_db()
        self.assertIsNone(self.node.linked_user)
        # Node itself is preserved (deactivating/deleting a user must not delete
        # the custom node — it becomes unlinked).
        self.assertTrue(OrgChartNode.objects.filter(pk=self.node.pk).exists())

    def test_default_dimensions_and_coordinates(self):
        node = OrgChartNode.objects.create(
            chart=self.chart, shape_type="label", display_name="L",
        )
        self.assertEqual(node.width, 180)
        self.assertEqual(node.height, 80)
        self.assertEqual(node.position_x, 0)
        self.assertEqual(node.position_y, 0)
        self.assertTrue(node.is_searchable)
        self.assertTrue(node.is_visible)


class OrgChartEdgeTestCase(TestCase):
    def setUp(self):
        self.chart = _make_chart()
        self.a = OrgChartNode.objects.create(
            chart=self.chart, shape_type="person", display_name="A",
        )
        self.b = OrgChartNode.objects.create(
            chart=self.chart, shape_type="person", display_name="B",
        )

    def test_duplicate_edge_type_rejected(self):
        OrgChartEdge.objects.create(
            chart=self.chart, source=self.a, target=self.b, edge_type="reports_to",
        )
        with self.assertRaises(IntegrityError):
            OrgChartEdge.objects.create(
                chart=self.chart, source=self.a, target=self.b, edge_type="reports_to",
            )

    def test_same_pair_different_edge_type_allowed(self):
        OrgChartEdge.objects.create(
            chart=self.chart, source=self.a, target=self.b, edge_type="reports_to",
        )
        # A distinct edge type between the same pair is allowed (e.g. dotted line).
        OrgChartEdge.objects.create(
            chart=self.chart, source=self.a, target=self.b, edge_type="dotted_line",
        )
        self.assertEqual(self.chart.edges.count(), 2)

    def test_invalid_edge_type_rejected(self):
        edge = OrgChartEdge(
            chart=self.chart, source=self.a, target=self.b, edge_type="manages",
        )
        with self.assertRaises(Exception):
            edge.full_clean()

    def test_hierarchy_edge_types_defined(self):
        # Cycle detection is only meaningful for hierarchy edge types.
        self.assertIn("reports_to", HIERARCHY_EDGE_TYPES)
        self.assertIn("contains", HIERARCHY_EDGE_TYPES)
        self.assertIn("reports_to", EDGE_TYPES)
        self.assertIn("dotted_line", EDGE_TYPES)


class OrgChartAudienceTestCase(TestCase):
    def setUp(self):
        self.chart = _make_chart()
        self.group = Group.objects.create(name="Ops", code="OPS")

    def test_audience_role_unique_per_chart(self):
        OrgChartAudienceRole.objects.create(chart=self.chart, role_code="hr")
        with self.assertRaises(IntegrityError):
            OrgChartAudienceRole.objects.create(chart=self.chart, role_code="hr")

    def test_audience_group_unique_per_chart(self):
        OrgChartAudienceGroup.objects.create(chart=self.chart, group=self.group)
        with self.assertRaises(IntegrityError):
            OrgChartAudienceGroup.objects.create(chart=self.chart, group=self.group)

    def test_invalid_role_code_rejected(self):
        role = OrgChartAudienceRole(chart=self.chart, role_code="superuser")
        with self.assertRaises(Exception):
            role.full_clean()


class OrgChartRevisionTestCase(TestCase):
    def setUp(self):
        self.chart = _make_chart()
        self.user = User.objects.create_user(username="pub", password="p", is_staff=True)

    def test_revision_version_unique_per_chart(self):
        OrgChartRevision.objects.create(
            chart=self.chart, version=1, payload={}, checksum="a",
            published_by=self.user,
        )
        with self.assertRaises(IntegrityError):
            OrgChartRevision.objects.create(
                chart=self.chart, version=1, payload={}, checksum="b",
                published_by=self.user,
            )

    def test_published_revision_set_null_on_revision_delete(self):
        rev = OrgChartRevision.objects.create(
            chart=self.chart, version=1, payload={}, checksum="a",
            published_by=self.user,
        )
        self.chart.published_revision = rev
        self.chart.save(update_fields=["published_revision"])
        rev.delete()
        self.chart.refresh_from_db()
        self.assertIsNone(self.chart.published_revision)


class CascadeTestCase(TestCase):
    def test_deleting_chart_cascades_to_children(self):
        chart = _make_chart()
        a = OrgChartNode.objects.create(
            chart=chart, shape_type="person", display_name="A",
        )
        b = OrgChartNode.objects.create(
            chart=chart, shape_type="person", display_name="B",
        )
        OrgChartEdge.objects.create(
            chart=chart, source=a, target=b, edge_type="reports_to",
        )
        OrgChartAudienceRole.objects.create(chart=chart, role_code="hr")
        OrgChartRevision.objects.create(
            chart=chart, version=1, payload={}, checksum="x",
        )
        chart_id = chart.id
        chart.delete()
        self.assertFalse(OrgChartNode.objects.filter(chart_id=chart_id).exists())
        self.assertFalse(OrgChartEdge.objects.filter(chart_id=chart_id).exists())
        self.assertFalse(OrgChartAudienceRole.objects.filter(chart_id=chart_id).exists())
        self.assertFalse(OrgChartRevision.objects.filter(chart_id=chart_id).exists())


class MigrationReversibilityTestCase(TransactionTestCase):
    """The 0001_initial migration must be reversible (apply → zero → apply).

    Uses the full app set (no ``available_apps`` restriction) because the
    organigrama migration depends on auth.User and permissions.Group, and
    those apps have their own cross-app migration dependencies that a
    restricted graph cannot resolve.
    """

    def _organigrama_tables(self):
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name LIKE 'organigrama_%'"
            )
            return {row[0] for row in cursor.fetchall()}

    def test_migration_reverses_to_zero(self):
        tables_before = self._organigrama_tables()
        self.assertTrue(tables_before)  # tables created by test setup
        call_command("migrate", "organigrama", "zero", verbosity=0, run_syncdb=False)
        self.assertEqual(self._organigrama_tables(), set())
        # Re-apply — tables must come back.
        call_command("migrate", "organigrama", verbosity=0, run_syncdb=False)
        self.assertTrue(self._organigrama_tables())
