"""
Pure graph validation service for custom org charts.

``validate_graph`` operates on in-memory node/edge dicts (the shape a draft
save accepts) and returns a structured ``ValidationResult``. It performs NO
database access — cycle, ownership, and root checks run over the passed-in
graph only. This keeps validation deterministic, fast, and unit-testable
without a DB.

Validation rules (plan §8 Phase 1):
  * valid shape and edge types (allowlists only — never arbitrary values);
  * edge source/target reference nodes present in the same graph;
  * no self-edges;
  * no duplicate edges (same source + target + edge_type);
  * no cycles in hierarchy edge types (reports_to, contains);
  * bounded node dimensions and canvas coordinates;
  * maximum node/edge counts per chart;
  * custom_fields is a bounded JSON object with identifier-only keys (no
    HTML/SVG/JS/event-handler injection surface);
  * at least one root for hierarchy charts (a node with no incoming
    hierarchy edge) unless ``allow_freeform`` is set.

The result carries per-error ``node_uuid``/``edge_uuid``/``field``/``message``
so the future inspector can focus the invalid item.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from django.contrib.auth.models import User

from plugins.organigrama.models import (
    SHAPE_TYPES,
    EDGE_TYPES,
    HIERARCHY_EDGE_TYPES,
    STYLE_KEYS,
    NODE_STATUS,
    CONTAINER_SHAPE_TYPES,
    MAX_NODES_PER_CHART,
    MAX_EDGES_PER_CHART,
    MAX_CUSTOM_FIELDS_BYTES,
    MAX_CUSTOM_FIELDS_KEYS,
    COORD_MIN,
    COORD_MAX,
    NODE_MIN_DIM,
    NODE_MAX_DIM,
)

# Re-export limits so callers/tests can import them from one place.
__all__ = [
    "validate_graph",
    "ValidationResult",
    "ValidationError",
    "MAX_NODES_PER_CHART",
    "MAX_EDGES_PER_CHART",
    "MAX_CUSTOM_FIELDS_BYTES",
]

# Identifier-only custom-field keys: letters, digits, underscore; must start
# with a non-digit. Rejects anything resembling HTML/SVG/JS/event handlers.
_CUSTOM_FIELD_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

_VALID_SHAPES: Set[str] = set(SHAPE_TYPES)
_VALID_EDGE_TYPES: Set[str] = set(EDGE_TYPES)
_HIERARCHY_EDGE_TYPES: Set[str] = set(HIERARCHY_EDGE_TYPES)
_VALID_NODE_STATUS: Set[str] = set(NODE_STATUS)
_CONTAINER_SHAPE_TYPES: Set[str] = set(CONTAINER_SHAPE_TYPES)
# Empty string is always allowed (the default). Non-empty values must appear
# in the STYLE_KEYS registry.
_VALID_STYLE_KEYS: Set[str] = set(STYLE_KEYS) | {""}


@dataclass
class ValidationError:
    """A single structured validation error.

    ``node_uuid``/``edge_uuid``/``field`` are optional (a graph-level error
    such as "too many nodes" has none).
    """
    message: str
    type: str = "error"
    node_uuid: Optional[str] = None
    edge_uuid: Optional[str] = None
    field: Optional[str] = None


@dataclass
class ValidationResult:
    errors: List[ValidationError] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def error_fields_for(self, node_uuid: str) -> List[str]:
        return [e.field for e in self.errors if e.node_uuid == node_uuid and e.field]

    def has_error_for_edge(self, edge_uuid: str) -> bool:
        return any(e.edge_uuid == edge_uuid for e in self.errors)

    def add(
        self,
        message: str,
        *,
        node_uuid: Optional[str] = None,
        edge_uuid: Optional[str] = None,
        field: Optional[str] = None,
    ) -> None:
        self.errors.append(
            ValidationError(
                message=message, node_uuid=node_uuid, edge_uuid=edge_uuid, field=field,
            )
        )


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _validate_node(
    node: Dict[str, Any], result: ValidationResult, active_user_ids: Set[int],
) -> None:
    nuuid = node.get("node_uuid")

    shape = node.get("shape_type")
    if shape not in _VALID_SHAPES:
        result.add(
            f"Unknown shape type '{shape}'.",
            node_uuid=nuuid, field="shape_type",
        )

    status = node.get("status", "active")
    if status not in _VALID_NODE_STATUS:
        result.add(
            f"Invalid status '{status}'. Must be one of: {', '.join(sorted(_VALID_NODE_STATUS))}.",
            node_uuid=nuuid, field="status",
        )

    # Validate linked_user_id if provided (membership checked against the
    # batched active-user set gathered by the caller).
    linked_user_id = node.get("linked_user_id")
    if linked_user_id is not None:
        if (
            not isinstance(linked_user_id, int)
            or isinstance(linked_user_id, bool)
            or linked_user_id not in active_user_ids
        ):
            result.add(
                f"Invalid or inactive user ID: {linked_user_id}.",
                node_uuid=nuuid, field="linked_user_id",
            )

    style_key = node.get("style_key", "")
    if style_key not in _VALID_STYLE_KEYS:
        result.add(
            f"Unknown style_key '{style_key}'.",
            node_uuid=nuuid, field="style_key",
        )

    width = node.get("width")
    height = node.get("height")
    if not _is_number(width) or not (NODE_MIN_DIM <= width <= NODE_MAX_DIM):
        result.add(
            f"width must be between {NODE_MIN_DIM} and {NODE_MAX_DIM}.",
            node_uuid=nuuid, field="width",
        )
    if not _is_number(height) or not (NODE_MIN_DIM <= height <= NODE_MAX_DIM):
        result.add(
            f"height must be between {NODE_MIN_DIM} and {NODE_MAX_DIM}.",
            node_uuid=nuuid, field="height",
        )

    px = node.get("position_x")
    py = node.get("position_y")
    if not _is_number(px) or not (COORD_MIN <= px <= COORD_MAX):
        result.add(
            f"position_x out of range [{COORD_MIN}, {COORD_MAX}].",
            node_uuid=nuuid, field="position_x",
        )
    if not _is_number(py) or not (COORD_MIN <= py <= COORD_MAX):
        result.add(
            f"position_y out of range [{COORD_MIN}, {COORD_MAX}].",
            node_uuid=nuuid, field="position_y",
        )

    _validate_custom_fields(node.get("custom_fields"), nuuid, result)


def _validate_custom_fields(
    custom_fields: Any, node_uuid: Optional[str], result: ValidationResult,
) -> None:
    if custom_fields is None:
        return
    if not isinstance(custom_fields, dict):
        result.add(
            "custom_fields must be a JSON object.",
            node_uuid=node_uuid, field="custom_fields",
        )
        return
    if len(custom_fields) > MAX_CUSTOM_FIELDS_KEYS:
        result.add(
            f"custom_fields has too many keys (max {MAX_CUSTOM_FIELDS_KEYS}).",
            node_uuid=node_uuid, field="custom_fields",
        )
    for key in custom_fields:
        if not isinstance(key, str) or not _CUSTOM_FIELD_KEY_RE.match(key):
            result.add(
                f"custom_fields key '{key}' is not a valid identifier.",
                node_uuid=node_uuid, field="custom_fields",
            )
    try:
        encoded = json.dumps(custom_fields, ensure_ascii=False)
    except (TypeError, ValueError):
        result.add(
            "custom_fields is not JSON-serializable.",
            node_uuid=node_uuid, field="custom_fields",
        )
        return
    if len(encoded.encode("utf-8")) > MAX_CUSTOM_FIELDS_BYTES:
        result.add(
            f"custom_fields exceeds {MAX_CUSTOM_FIELDS_BYTES} bytes.",
            node_uuid=node_uuid, field="custom_fields",
        )


def _detect_cycle(node_uuids: Set[str], hierarchy_edges: List[Dict[str, Any]]) -> bool:
    """Return True if the hierarchy-edge subgraph contains a cycle."""
    adj: Dict[str, List[str]] = {u: [] for u in node_uuids}
    for e in hierarchy_edges:
        src = e.get("source_uuid")
        dst = e.get("target_uuid")
        if src in adj and dst in adj:
            adj[src].append(dst)

    WHITE, GRAY, BLACK = 0, 1, 2
    color = {u: WHITE for u in node_uuids}

    def dfs(u: str) -> bool:
        color[u] = GRAY
        for v in adj[u]:
            if color[v] == GRAY:
                return True
            if color[v] == WHITE and dfs(v):
                return True
        color[u] = BLACK
        return False

    return any(color[u] == WHITE and dfs(u) for u in node_uuids)


def validate_graph(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    *,
    allow_freeform: bool = False,
) -> ValidationResult:
    """Validate an in-memory draft graph.

    Database access is limited to one batched query for active linked users.
    """
    result = ValidationResult()

    # --- Graph-size limits --------------------------------------------------
    if len(nodes) > MAX_NODES_PER_CHART:
        result.add(
            f"Too many nodes: {len(nodes)} (max {MAX_NODES_PER_CHART}).",
        )
    if len(edges) > MAX_EDGES_PER_CHART:
        result.add(
            f"Too many edges: {len(edges)} (max {MAX_EDGES_PER_CHART}).",
        )

    # --- Active linked-user batch lookup ------------------------------------
    linked_user_ids: Set[int] = {
        uid
        for uid in (node.get("linked_user_id") for node in nodes)
        if isinstance(uid, int) and not isinstance(uid, bool)
    }
    active_user_ids: Set[int] = set()
    if linked_user_ids:
        active_user_ids = set(
            User.objects.filter(
                id__in=linked_user_ids, is_active=True,
            ).values_list("id", flat=True)
        )

    # --- Nodes --------------------------------------------------------------
    # Detect duplicate node_uuid values explicitly. Without this guard the
    # set-based collection below would silently collapse duplicates, and the
    # draft service's UUID->obj map would be shorter than the input list,
    # misaligning positional group assignment. Each duplicate must surface a
    # structured graph-level error so the caller can map it back to a field.
    node_uuid_set: Set[str] = set()
    seen_node_uuids: Set[str] = set()
    for node in nodes:
        nuuid = node.get("node_uuid")
        if nuuid is None:
            result.add("Node is missing node_uuid.", field="node_uuid")
            continue
        if nuuid in seen_node_uuids:
            result.add(
                f"Duplicate node_uuid '{nuuid}'.",
                node_uuid=nuuid, field="node_uuid",
            )
            # Still record the UUID in the set so edge/group references that
            # point at it resolve, but skip per-node validation for the
            # duplicate copy — the first occurrence was already validated.
            continue
        seen_node_uuids.add(nuuid)
        node_uuid_set.add(nuuid)
        _validate_node(node, result, active_user_ids)

    # --- Edges --------------------------------------------------------------
    seen_pairs: Set[tuple] = set()
    hierarchy_edges: List[Dict[str, Any]] = []
    incoming_hierarchy: Set[str] = set()

    for edge in edges:
        euuid = edge.get("edge_uuid")
        src = edge.get("source_uuid")
        dst = edge.get("target_uuid")
        etype = edge.get("edge_type")

        if etype not in _VALID_EDGE_TYPES:
            result.add(
                f"Unknown edge type '{etype}'.",
                edge_uuid=euuid, field="edge_type",
            )
            continue

        edge_style = edge.get("style_key", "")
        if edge_style not in _VALID_STYLE_KEYS:
            result.add(
                f"Unknown style_key '{edge_style}'.",
                edge_uuid=euuid, field="style_key",
            )
            continue

        if src not in node_uuid_set or dst not in node_uuid_set:
            result.add(
                "Edge references an unknown node.",
                edge_uuid=euuid, field="source_uuid",
            )
            continue

        if src == dst:
            result.add(
                "Self-edges are not allowed.",
                edge_uuid=euuid, field="target_uuid",
            )
            continue

        key = (src, dst, etype)
        if key in seen_pairs:
            result.add(
                "Duplicate edge (same source, target, and edge type).",
                edge_uuid=euuid, field="edge_type",
            )
            continue
        seen_pairs.add(key)

        if etype in _HIERARCHY_EDGE_TYPES:
            hierarchy_edges.append(edge)
            incoming_hierarchy.add(dst)

    # --- Group references ---------------------------------------------------
    # Build a uuid -> shape_type map so group targets can be checked for
    # container-ness. A group_uuid pointing at a leaf shape (person, position,
    # etc.) is rejected so grouping never becomes a hidden hierarchy edge.
    node_shape_by_uuid: Dict[str, str] = {
        node["node_uuid"]: node.get("shape_type", "")
        for node in nodes
        if node.get("node_uuid") is not None
    }
    visual_group_edges: List[Dict[str, Any]] = []
    for node in nodes:
        nuuid = node.get("node_uuid")
        group_uuid = node.get("group_uuid")
        if group_uuid is not None:
            if group_uuid not in node_uuid_set:
                result.add(
                    "Node references an unknown group_uuid.",
                    node_uuid=nuuid, field="group_uuid",
                )
            elif group_uuid == nuuid:
                result.add(
                    "A node cannot be its own group.",
                    node_uuid=nuuid, field="group_uuid",
                )
            elif node_shape_by_uuid.get(group_uuid) not in _CONTAINER_SHAPE_TYPES:
                result.add(
                    f"group_uuid target must be a container shape "
                    f"({', '.join(sorted(_CONTAINER_SHAPE_TYPES))}).",
                    node_uuid=nuuid, field="group_uuid",
                )
            else:
                visual_group_edges.append(
                    {"source_uuid": nuuid, "target_uuid": group_uuid}
                )

    if visual_group_edges and _detect_cycle(node_uuid_set, visual_group_edges):
        result.add("Cycle detected in visual group membership.")

    # --- Hierarchy cycle + root requirement ---------------------------------
    if hierarchy_edges and _detect_cycle(node_uuid_set, hierarchy_edges):
        result.add(
            "Cycle detected in hierarchy edges (reports_to/contains).",
        )

    if hierarchy_edges and not allow_freeform:
        roots = [u for u in node_uuid_set if u not in incoming_hierarchy]
        if not roots:
            result.add(
                "Hierarchy chart has no root node (every node has an incoming "
                "hierarchy edge).",
            )

    return result
