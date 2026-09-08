"""
Phase B — Pure graph validation service tests.

The validator runs on in-memory node/edge dicts (the shape a draft save accepts)
and returns a structured list of errors keyed by node/edge UUID and field, so
the future inspector can focus the invalid item. It must NOT touch the database
for cycle/ownership checks beyond what the caller passes in.
"""
import uuid

from django.test import SimpleTestCase

from plugins.organigrama.services.graph_validation import (
    validate_graph,
    MAX_NODES_PER_CHART,
    MAX_EDGES_PER_CHART,
    MAX_CUSTOM_FIELDS_BYTES,
)
from plugins.organigrama.models import HIERARCHY_EDGE_TYPES


def _node(**overrides):
    base = {
        "node_uuid": str(uuid.uuid4()),
        "shape_type": "person",
        "display_name": "N",
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


class ValidGraphTestCase(SimpleTestCase):
    def test_empty_graph_is_valid(self):
        result = validate_graph([], [])
        self.assertTrue(result.is_valid)
        self.assertEqual(result.errors, [])

    def test_simple_two_node_hierarchy_is_valid(self):
        a = _node(display_name="A")
        b = _node(display_name="B")
        result = validate_graph([a, b], [_edge(a, b)])
        self.assertTrue(result.is_valid, result.errors)


class ShapeAndEdgeTypeTestCase(SimpleTestCase):
    def test_invalid_shape_type_rejected(self):
        bad = _node(shape_type="rocket")
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)
        self.assertIn("shape_type", result.error_fields_for(bad["node_uuid"]))

    def test_invalid_edge_type_rejected(self):
        a, b = _node(), _node()
        e = _edge(a, b, edge_type="manages")
        result = validate_graph([a, b], [e])
        self.assertFalse(result.is_valid)
        self.assertTrue(result.has_error_for_edge(e["edge_uuid"]))


class SelfEdgeAndDuplicateTestCase(SimpleTestCase):
    def test_self_edge_rejected(self):
        a = _node()
        e = _edge(a, a)
        result = validate_graph([a], [e])
        self.assertFalse(result.is_valid)
        self.assertTrue(any("self" in err.message.lower() for err in result.errors))

    def test_duplicate_edge_rejected(self):
        a, b = _node(), _node()
        e1 = _edge(a, b)
        e2 = _edge(a, b, edge_uuid=str(uuid.uuid4()))
        result = validate_graph([a, b], [e1, e2])
        self.assertFalse(result.is_valid)
        self.assertTrue(any("duplicate" in err.message.lower() for err in result.errors))

    def test_same_pair_distinct_type_allowed(self):
        a, b = _node(), _node()
        result = validate_graph(
            [a, b],
            [_edge(a, b, edge_type="reports_to"), _edge(a, b, edge_type="dotted_line")],
        )
        self.assertTrue(result.is_valid, result.errors)


class EdgeOwnershipTestCase(SimpleTestCase):
    def test_edge_to_unknown_node_rejected(self):
        a = _node()
        ghost = _node()
        e = _edge(a, ghost)
        result = validate_graph([a], [e])  # ghost not in node list
        self.assertFalse(result.is_valid)
        self.assertTrue(any("unknown" in err.message.lower() for err in result.errors))


class CycleTestCase(SimpleTestCase):
    def _cycle(self, edge_type):
        a, b, c = _node(), _node(), _node()
        edges = [
            _edge(a, b, edge_type=edge_type),
            _edge(b, c, edge_type=edge_type),
            _edge(c, a, edge_type=edge_type),
        ]
        return validate_graph([a, b, c], edges)

    def test_cycle_in_reports_to_rejected(self):
        result = self._cycle("reports_to")
        self.assertFalse(result.is_valid)
        self.assertTrue(any("cycle" in err.message.lower() for err in result.errors))

    def test_cycle_in_contains_rejected(self):
        result = self._cycle("contains")
        self.assertFalse(result.is_valid)

    def test_cycle_in_non_hierarchy_edge_allowed(self):
        # dotted_line / association are not hierarchy edges; cycles there are
        # not structural hierarchy cycles and must not be rejected.
        result = self._cycle("dotted_line")
        self.assertTrue(result.is_valid, result.errors)
        self.assertNotIn("dotted_line", HIERARCHY_EDGE_TYPES)  # sanity


class BoundsAndSizeTestCase(SimpleTestCase):
    def test_oversized_width_rejected(self):
        bad = _node(width=100000)
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)
        self.assertIn("width", result.error_fields_for(bad["node_uuid"]))

    def test_undersized_height_rejected(self):
        bad = _node(height=5)
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)

    def test_out_of_range_coordinate_rejected(self):
        bad = _node(position_x=1e9)
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)

    def test_max_nodes_exceeded(self):
        nodes = [_node(display_name=f"n{i}") for i in range(MAX_NODES_PER_CHART + 1)]
        result = validate_graph(nodes, [])
        self.assertFalse(result.is_valid)
        self.assertTrue(any("too many" in err.message.lower() for err in result.errors))

    def test_max_edges_exceeded(self):
        a, b = _node(), _node()
        edges = [
            _edge(a, b, edge_type=t)
            for t in ["reports_to", "dotted_line", "assistant", "association", "contains"]
        ]
        # Pad with distinct node pairs to exceed MAX_EDGES without dup constraint.
        nodes = [a, b]
        edges = []
        for i in range(MAX_EDGES_PER_CHART + 1):
            s = _node(display_name=f"s{i}")
            t = _node(display_name=f"t{i}")
            nodes.extend([s, t])
            edges.append(_edge(s, t))
        result = validate_graph(nodes, edges)
        self.assertFalse(result.is_valid)
        self.assertTrue(any("too many" in err.message.lower() for err in result.errors))


class CustomFieldsTestCase(SimpleTestCase):
    def test_oversized_custom_fields_rejected(self):
        bad = _node(custom_fields={"k" * 100: "v" * (MAX_CUSTOM_FIELDS_BYTES + 1)})
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)

    def test_invalid_custom_field_key_rejected(self):
        # Keys must be simple identifiers — no HTML/JS/event-handler injection.
        bad = _node(custom_fields={"<script>": "x"})
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)
        self.assertIn("custom_fields", result.error_fields_for(bad["node_uuid"]))

    def test_non_object_custom_fields_rejected(self):
        bad = _node(custom_fields="not-a-dict")
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)


class StyleKeyAllowlistTestCase(SimpleTestCase):
    """style_key must come from an allowlist (plan §10: CSS/SVG injection gate).

    Until a theme registry is defined, the only allowed value is the empty
    string (default). Any non-empty style_key must be rejected so a future
    renderer never receives an attacker-controlled style token.
    """
    def test_empty_style_key_allowed(self):
        node = _node(style_key="")
        result = validate_graph([node], [])
        self.assertTrue(result.is_valid, result.errors)

    def test_non_empty_style_key_rejected(self):
        bad = _node(style_key="background:url('javascript:alert(1)')")
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)
        self.assertIn("style_key", result.error_fields_for(bad["node_uuid"]))

    def test_edge_style_key_rejected(self):
        a, b = _node(), _node()
        e = _edge(a, b, style_key="evil-css")
        result = validate_graph([a, b], [e])
        self.assertFalse(result.is_valid)
        self.assertTrue(any(
            err.edge_uuid == e["edge_uuid"] and err.field == "style_key"
            for err in result.errors
        ))


class RootRequirementTestCase(SimpleTestCase):
    def test_hierarchy_chart_requires_at_least_one_root(self):
        # Two nodes, each reports to the other → no root (and it's a cycle).
        a, b = _node(), _node()
        result = validate_graph([a, b], [_edge(a, b), _edge(b, a)])
        self.assertFalse(result.is_valid)

    def test_freeform_chart_allows_no_root(self):
        a, b = _node(), _node()
        # association edges are non-hierarchy; with allow_freeform, no root needed.
        result = validate_graph(
            [a, b], [_edge(a, b, edge_type="association")], allow_freeform=True,
        )
        self.assertTrue(result.is_valid, result.errors)

    def test_hierarchy_chart_with_root_is_valid(self):
        root = _node(display_name="root")
        child = _node(display_name="child")
        result = validate_graph([root, child], [_edge(root, child)])
        self.assertTrue(result.is_valid, result.errors)


class ResultShapeTestCase(SimpleTestCase):
    def test_result_carries_node_and_edge_ids(self):
        bad = _node(shape_type="rocket")
        result = validate_graph([bad], [])
        self.assertFalse(result.is_valid)
        err = result.errors[0]
        self.assertEqual(err.node_uuid, bad["node_uuid"])
        self.assertIsNotNone(err.field)
        self.assertIsNotNone(err.message)


class DuplicateNodeUuidTestCase(SimpleTestCase):
    """Duplicate ``node_uuid`` values must be rejected explicitly.

    Without this guard, ``validate_graph`` collapses duplicate UUIDs into a
    set, so each duplicate node still runs through per-node validation while
    ``save_draft`` later builds a shorter ``node_uuid_to_obj`` map and uses
    positional ``zip()`` to assign group FKs — silently attaching groups to
    the wrong node. The validator must surface a structured graph-level error
    so the draft service never reaches the mapping step.
    """

    def test_duplicate_node_uuid_is_rejected(self):
        shared_uuid = str(uuid.uuid4())
        a = _node(node_uuid=shared_uuid, display_name="A")
        b = _node(node_uuid=shared_uuid, display_name="B")
        result = validate_graph([a, b], [])
        self.assertFalse(result.is_valid)
        self.assertTrue(
            any(
                "duplicate" in err.message.lower() and err.field == "node_uuid"
                for err in result.errors
            ),
            result.errors,
        )

    def test_duplicate_node_uuid_error_carries_uuid(self):
        shared_uuid = str(uuid.uuid4())
        a = _node(node_uuid=shared_uuid)
        b = _node(node_uuid=shared_uuid)
        result = validate_graph([a, b], [])
        self.assertFalse(result.is_valid)
        self.assertTrue(any(err.node_uuid == shared_uuid for err in result.errors))


class GroupValidationTestCase(SimpleTestCase):
    def test_group_reference_is_valid(self):
        group = _node(shape_type="section", display_name="G")
        child = _node(group_uuid=group["node_uuid"])
        result = validate_graph([group, child], [])
        self.assertTrue(result.is_valid, result.errors)

    def test_unknown_group_uuid_is_invalid(self):
        child = _node(group_uuid="00000000-0000-0000-0000-000000000000")
        result = validate_graph([child], [])
        self.assertFalse(result.is_valid)
        self.assertTrue(any(e.field == "group_uuid" for e in result.errors))

    def test_self_group_is_invalid(self):
        node = _node(group_uuid="self")
        node["group_uuid"] = node["node_uuid"]
        result = validate_graph([node], [])
        self.assertFalse(result.is_valid)
        self.assertTrue(any(e.field == "group_uuid" for e in result.errors))

    def test_group_does_not_create_hierarchy(self):
        group = _node(shape_type="section", display_name="G")
        child = _node(group_uuid=group["node_uuid"])
        # No root should still be valid because group_uuid is not a hierarchy edge.
        result = validate_graph([group, child], [])
        self.assertTrue(result.is_valid, result.errors)

    def test_group_target_must_be_container_shape(self):
        # A person is not a container; grouping under it must be rejected so
        # grouping never becomes a hidden hierarchy edge to a leaf node.
        person = _node(shape_type="person", display_name="P")
        child = _node(group_uuid=person["node_uuid"])
        result = validate_graph([person, child], [])
        self.assertFalse(result.is_valid)
        self.assertTrue(any(e.field == "group_uuid" for e in result.errors))

    def test_visual_group_cycle_is_rejected(self):
        outer = _node(shape_type="section", display_name="Outer")
        inner = _node(shape_type="department", display_name="Inner")
        outer["group_uuid"] = inner["node_uuid"]
        inner["group_uuid"] = outer["node_uuid"]
        result = validate_graph([outer, inner], [])
        self.assertFalse(result.is_valid)
        self.assertTrue(any("cycle" in e.message.lower() for e in result.errors))
