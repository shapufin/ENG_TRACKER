"""
Phase B — Transactional draft CRUD service + optimistic concurrency.

The service is the only path that mutates a chart's draft graph. It validates
the whole graph in one transaction, replaces all nodes/edges atomically, and
bumps revision_number. A save carrying a stale expected_revision_number must
fail with a conflict rather than silently overwriting a newer draft.
"""
import uuid

from django.contrib.auth.models import User
from django.test import TestCase

from plugins.organigrama.models import OrgChart, OrgChartNode, OrgChartEdge
from plugins.organigrama.services.draft_service import (
    create_chart,
    get_draft,
    save_draft,
    delete_chart,
    DraftConflictError,
    GraphValidationError,
)


def _node(shape="person", name="N", **overrides):
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


class CreateChartTestCase(TestCase):
    def test_create_chart_with_defaults(self):
        user = User.objects.create_user(username="adm", password="p", is_staff=True)
        chart = create_chart(name="Eng", slug="eng", created_by=user)
        self.assertEqual(chart.status, "draft")
        self.assertEqual(chart.source_mode, "custom")
        self.assertEqual(chart.revision_number, 0)
        self.assertEqual(chart.created_by, user)

    def test_create_chart_generates_slug_if_omitted(self):
        chart = create_chart(name="Engineering Ops")
        self.assertTrue(chart.slug)
        self.assertEqual(chart.name, "Engineering Ops")


class SaveDraftTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="adm", password="p", is_staff=True)
        self.chart = create_chart(name="Eng", slug="eng", created_by=self.user)

    def test_save_draft_persists_nodes_and_edges(self):
        a = _node(name="A")
        b = _node(name="B")
        save_draft(self.chart, [a, b], [_edge(a, b)], expected_revision_number=0)
        self.assertEqual(self.chart.nodes.count(), 2)
        self.assertEqual(self.chart.edges.count(), 1)
        self.chart.refresh_from_db()
        self.assertEqual(self.chart.revision_number, 1)

    def test_save_draft_replaces_graph_atomically(self):
        a = _node(name="A")
        b = _node(name="B")
        save_draft(self.chart, [a, b], [_edge(a, b)], expected_revision_number=0)
        # Second save with a brand new single node replaces everything.
        c = _node(name="C")
        save_draft(self.chart, [c], [], expected_revision_number=1)
        self.assertEqual(self.chart.nodes.count(), 1)
        self.assertEqual(self.chart.edges.count(), 0)
        self.assertTrue(OrgChartNode.objects.filter(display_name="C").exists())
        self.assertFalse(OrgChartNode.objects.filter(display_name="A").exists())

    def test_save_draft_invalid_graph_rolls_back(self):
        a = _node(name="A")
        b = _node(name="B")
        save_draft(self.chart, [a, b], [_edge(a, b)], expected_revision_number=0)
        # Now attempt a save with an invalid graph (self-edge). Nothing should
        # change: the prior graph must remain intact.
        bad = _node(name="BAD")
        with self.assertRaises(GraphValidationError):
            save_draft(
                self.chart, [bad], [_edge(bad, bad)], expected_revision_number=1,
            )
        # Prior graph untouched.
        self.assertEqual(self.chart.nodes.count(), 2)
        self.assertEqual(self.chart.edges.count(), 1)
        self.chart.refresh_from_db()
        self.assertEqual(self.chart.revision_number, 1)

    def test_get_draft_returns_payload_and_revision(self):
        a = _node(name="A")
        b = _node(name="B")
        save_draft(self.chart, [a, b], [_edge(a, b)], expected_revision_number=0)
        payload = get_draft(self.chart)
        self.assertEqual(payload["revision_number"], 1)
        self.assertEqual(len(payload["nodes"]), 2)
        self.assertEqual(len(payload["edges"]), 1)
        self.assertEqual(payload["nodes"][0]["display_name"], "A")


class OptimisticConcurrencyTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="adm", password="p", is_staff=True)
        self.chart = create_chart(name="Eng", slug="eng", created_by=self.user)
        self.a = _node(name="A")
        save_draft(self.chart, [self.a], [], expected_revision_number=0)
        # revision_number is now 1.

    def test_stale_revision_number_raises_conflict(self):
        with self.assertRaises(DraftConflictError):
            save_draft(self.chart, [self.a], [], expected_revision_number=0)

    def test_concurrent_save_does_not_silently_overwrite(self):
        # Simulate a second editor loading the draft at revision 1.
        stale = 1
        # First editor saves successfully, bumping to 2.
        b = _node(name="B")
        save_draft(self.chart, [self.a, b], [_edge(self.a, b)], expected_revision_number=1)
        self.chart.refresh_from_db()
        self.assertEqual(self.chart.revision_number, 2)
        # Second editor (still holding revision 1) must be rejected.
        c = _node(name="C")
        with self.assertRaises(DraftConflictError):
            save_draft(self.chart, [self.a, c], [], expected_revision_number=stale)
        # The first editor's graph survives.
        self.assertEqual(self.chart.nodes.count(), 2)


class DeleteChartTestCase(TestCase):
    def test_delete_chart_removes_graph(self):
        user = User.objects.create_user(username="adm", password="p", is_staff=True)
        chart = create_chart(name="Eng", slug="eng", created_by=user)
        a = _node(name="A")
        save_draft(chart, [a], [], expected_revision_number=0)
        chart_id = chart.id
        delete_chart(chart)
        self.assertFalse(OrgChart.objects.filter(id=chart_id).exists())
        self.assertEqual(OrgChartNode.objects.filter(chart_id=chart_id).count(), 0)
        self.assertEqual(OrgChartEdge.objects.filter(chart_id=chart_id).count(), 0)


class QueryBudgetTestCase(TestCase):
    """Draft load must be a bounded payload, not one query per node/edge."""

    def setUp(self):
        self.user = User.objects.create_user(username="adm", password="p", is_staff=True)
        self.chart = create_chart(name="Eng", slug="eng", created_by=self.user)
        nodes = [_node(name=f"n{i}") for i in range(20)]
        edges = [_edge(nodes[i], nodes[i + 1]) for i in range(19)]
        save_draft(self.chart, nodes, edges, expected_revision_number=0)

    def test_get_draft_is_bounded(self):
        # 1 query for nodes + 1 for edges + 1 for chart refresh = 3 total,
        # regardless of node/edge count.
        with self.assertNumQueries(3):
            get_draft(self.chart)


class GroupRoundTripTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="adm", password="p", is_staff=True)
        self.chart = create_chart(name="Eng", slug="eng", created_by=self.user)

    def test_group_uuid_is_preserved_through_save_and_load(self):
        group = _node(shape_type="section", name="G")
        child = _node(name="C", group_uuid=group["node_uuid"])
        save_draft(self.chart, [group, child], [], expected_revision_number=0)
        draft = get_draft(self.chart)
        by_uuid = {n["node_uuid"]: n for n in draft["nodes"]}
        self.assertEqual(by_uuid[child["node_uuid"]]["group_uuid"], group["node_uuid"])
        self.assertEqual(by_uuid[group["node_uuid"]]["shape_type"], "section")


class DuplicateNodeUuidTestCase(TestCase):
    """Duplicate ``node_uuid`` payloads must not corrupt the existing graph.

    Regression for the positional ``zip(nodes, node_uuid_to_obj.values())``
    mapping: when two nodes share a UUID, the dict collapses to one entry
    while the input list keeps two, so the zip misaligns group assignments
    without raising. ``validate_graph`` now rejects duplicates upfront, so
    ``save_draft`` must raise ``GraphValidationError`` and leave the prior
    graph and revision untouched.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="adm", password="p", is_staff=True)
        self.chart = create_chart(name="Eng", slug="eng", created_by=self.user)

    def test_save_draft_rejects_duplicate_node_uuid(self):
        # First, establish a valid graph at revision 1.
        group = _node(shape_type="section", name="G")
        child = _node(name="C", group_uuid=group["node_uuid"])
        save_draft(self.chart, [group, child], [], expected_revision_number=0)
        self.assertEqual(self.chart.nodes.count(), 2)

        # Now attempt a save with a duplicate UUID and no other validation
        # issue. The validator must reject it before any mutation, so the
        # prior graph and revision survive.
        shared_uuid = str(uuid.uuid4())
        a = _node(node_uuid=shared_uuid, name="A")
        b = _node(node_uuid=shared_uuid, name="B")
        with self.assertRaises(GraphValidationError):
            save_draft(self.chart, [a, b], [], expected_revision_number=1)
        self.assertEqual(self.chart.nodes.count(), 2)
        self.assertEqual(self.chart.edges.count(), 0)
        self.chart.refresh_from_db()
        self.assertEqual(self.chart.revision_number, 1)

    def test_save_draft_group_assignment_uses_uuid_lookup(self):
        """Group FKs are resolved by UUID lookup, never positional zip.

        Construct a graph where positional alignment would mis-assign the
        group: the grouped node appears BEFORE the group node in the input
        list, and an unrelated ungrouped node appears between them. The
        grouped node must end up with ``group`` pointing at the section
        node, and the ungrouped node must have no group.
        """
        group = _node(shape_type="section", name="G")
        unrelated = _node(name="U")
        child = _node(name="C", group_uuid=group["node_uuid"])
        # Pass them in an order that would break positional mapping.
        save_draft(
            self.chart,
            [child, unrelated, group],
            [],
            expected_revision_number=0,
        )
        child_obj = OrgChartNode.objects.get(chart=self.chart, display_name="C")
        unrelated_obj = OrgChartNode.objects.get(chart=self.chart, display_name="U")
        group_obj = OrgChartNode.objects.get(chart=self.chart, display_name="G")
        self.assertEqual(child_obj.group_id, group_obj.pk)
        self.assertIsNone(unrelated_obj.group_id)


class ParentUuidRemovedTestCase(TestCase):
    """Phase 1 semantic lock: the ``parent`` FK is removed.

    Hierarchy is expressed solely by ``reports_to``/``contains`` edges
    (validated, cycle-checked, root-counted). Visual grouping is expressed
    by the ``group`` FK. The legacy ``parent_uuid`` payload field must be
    silently dropped on save and absent from the serialized draft so no
    unvalidated back-door hierarchy can persist.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="adm", password="p", is_staff=True)
        self.chart = create_chart(name="Eng", slug="eng", created_by=self.user)

    def test_save_draft_ignores_parent_uuid(self):
        a = _node(name="A")
        b = _node(name="B", parent_uuid=a["node_uuid"])
        save_draft(self.chart, [a, b], [], expected_revision_number=0)
        # The parent FK was removed; the payload field is silently dropped
        # and no back-door hierarchy relationship persists.
        b_obj = OrgChartNode.objects.get(chart=self.chart, display_name="B")
        self.assertFalse(hasattr(b_obj, "parent"))

    def test_get_draft_does_not_serialize_parent_uuid(self):
        a = _node(name="A")
        b = _node(name="B")
        save_draft(self.chart, [a, b], [_edge(a, b)], expected_revision_number=0)
        draft = get_draft(self.chart)
        for n in draft["nodes"]:
            self.assertNotIn("parent_uuid", n)
            self.assertNotIn("parent_id", n)
