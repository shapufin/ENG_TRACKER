"""
Transactional draft CRUD service for custom org charts.

This is the ONLY path that mutates a chart's draft graph. It validates the
whole graph in one transaction, replaces all nodes/edges atomically, and
bumps ``revision_number``. A save carrying a stale ``expected_revision_number``
fails with ``DraftConflictError`` rather than silently overwriting a newer
draft (optimistic concurrency).

Phase B scope: service layer only. No serializers, ViewSets, or API endpoints
are exposed here — those arrive in Phase C. No viewer/published-read path is
touched; ``get_draft`` is admin-side only.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.utils.text import slugify

from plugins.organigrama.models import (
    OrgChart,
    OrgChartNode,
    OrgChartEdge,
)
from .graph_validation import validate_graph, ValidationResult

__all__ = [
    "create_chart",
    "get_draft",
    "save_draft",
    "delete_chart",
    "DraftConflictError",
    "GraphValidationError",
]


class DraftConflictError(Exception):
    """Raised when a save carries a stale ``expected_revision_number``."""


class GraphValidationError(Exception):
    """Raised when a draft graph fails validation.

    Carries the structured ``ValidationResult`` so callers (the future API
    layer) can map errors back to specific node/edge UUIDs and fields.
    """

    def __init__(self, result: ValidationResult):
        self.result = result
        super().__init__("Graph validation failed")


def create_chart(
    *,
    name: str,
    slug: Optional[str] = None,
    description: str = "",
    created_by: Optional[Any] = None,
    **kwargs: Any,
) -> OrgChart:
    """Create a new draft custom chart.

    Generates a unique slug from the name when one is not supplied.
    """
    if not name or not name.strip():
        raise ValueError("Chart name is required.")
    slug = slug or slugify(name)
    if not slug:
        # name had no slugifiable characters — fall back to a short uuid.
        slug = f"chart-{uuid.uuid4().hex[:8]}"
    chart = OrgChart(
        name=name,
        slug=slug,
        description=description,
        created_by=created_by,
        updated_by=created_by,
        **kwargs,
    )
    chart.save()
    return chart


def save_draft(
    chart: OrgChart,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    *,
    expected_revision_number: int,
    updated_by: Optional[Any] = None,
) -> OrgChart:
    """Validate and atomically replace a chart's draft graph.

    Raises ``GraphValidationError`` if validation fails (the prior graph is
    left intact) and ``DraftConflictError`` if ``expected_revision_number``
    does not match the chart's current ``revision_number``.
    """
    result = validate_graph(nodes, edges)
    if not result.is_valid:
        raise GraphValidationError(result)

    with transaction.atomic():
        # Optimistic concurrency: lock the chart row and re-check the revision.
        locked = OrgChart.objects.select_for_update().get(pk=chart.pk)
        if locked.revision_number != expected_revision_number:
            raise DraftConflictError(
                f"Stale draft: expected revision {expected_revision_number}, "
                f"current is {locked.revision_number}."
            )
        # Replace the graph in one transaction.
        OrgChartNode.objects.filter(chart=locked).delete()
        OrgChartEdge.objects.filter(chart=locked).delete()

        node_uuid_to_obj: Dict[str, OrgChartNode] = {}
        node_objs: List[OrgChartNode] = []
        for n in nodes:
            nuuid = n["node_uuid"]
            obj = OrgChartNode(chart=locked)
            _apply_node_fields(obj, n)
            node_objs.append(obj)
            node_uuid_to_obj[nuuid] = obj

        OrgChartNode.objects.bulk_create(node_objs)
        # bulk_create on SQLite/PG returns PKs; group resolution needs PKs.
        # Re-fetch is avoided: group_uuid is resolved via the in-memory map
        # and saved in a second pass below.

        # Resolve group FK (self-referential) in a bounded second pass.
        # NOTE: the legacy ``parent`` FK was removed in Phase 1 semantic lock.
        # Hierarchy is expressed solely by reports_to/contains edges.
        # Group assignment uses explicit UUID lookup — never positional
        # correspondence — so duplicate UUID payloads (rejected upstream by
        # validate_graph) cannot misalign group FKs.
        grouped_nodes: List[OrgChartNode] = []
        for n in nodes:
            nuuid = n["node_uuid"]
            obj = node_uuid_to_obj.get(nuuid)
            if obj is None:
                continue
            group_uuid = n.get("group_uuid")
            if group_uuid and group_uuid in node_uuid_to_obj:
                obj.group = node_uuid_to_obj[group_uuid]
                grouped_nodes.append(obj)
        # Only bulk_update the nodes that actually have a group — avoids
        # sending all N nodes' data to the DB when only a subset are grouped.
        if grouped_nodes:
            OrgChartNode.objects.bulk_update(
                grouped_nodes,
                ["group"],
                batch_size=500,
            )

        edge_objs: List[OrgChartEdge] = []
        for e in edges:
            src = node_uuid_to_obj.get(e["source_uuid"])
            dst = node_uuid_to_obj.get(e["target_uuid"])
            if src is None or dst is None:
                # validate_graph already rejected unknown references; defensive.
                continue
            obj = OrgChartEdge(chart=locked, source=src, target=dst)
            _apply_edge_fields(obj, e)
            edge_objs.append(obj)
        if edge_objs:
            OrgChartEdge.objects.bulk_create(edge_objs)

        locked.revision_number = locked.revision_number + 1
        if updated_by is not None:
            locked.updated_by = updated_by
        locked.save(update_fields=["revision_number", "updated_by", "updated_at"])
        chart.refresh_from_db()
        return chart


def get_draft(chart: OrgChart) -> Dict[str, Any]:
    """Return the draft graph as a bounded payload (no per-node queries).

    Three queries total (nodes, edges, chart refresh), regardless of graph
    size. Nodes/edges are ordered deterministically. Edges reference node
    UUIDs (stable across saves), not DB primary keys.
    """
    nodes_list = list(
        OrgChartNode.objects.filter(chart=chart)
        .order_by("sort_order", "id")
        .values("id", "node_uuid", "shape_type", "display_name", "subtitle",
                "role_title", "department_label", "description", "status",
                "linked_user_id", "group_id", "sort_order", "position_x",
                "position_y", "width", "height", "style_key", "custom_fields",
                "is_searchable", "is_visible")
    )
    edges_list = list(
        OrgChartEdge.objects.filter(chart=chart)
        .order_by("sort_order", "id")
        .values("edge_uuid", "source_id", "target_id", "edge_type", "label",
                "sort_order", "style_key")
    )

    id_to_uuid = {n["id"]: str(n["node_uuid"]) for n in nodes_list}

    serialized_nodes = []
    for n in nodes_list:
        n = dict(n)
        n.pop("id", None)
        n["node_uuid"] = str(n["node_uuid"])
        # Resolve group PK to stable uuid when possible. The legacy parent FK
        # was removed; hierarchy is expressed by reports_to/contains edges.
        n["group_uuid"] = id_to_uuid.get(n.get("group_id")) if n.get("group_id") else None
        n.pop("group_id", None)
        serialized_nodes.append(n)

    serialized_edges = []
    for e in edges_list:
        e = dict(e)
        e["edge_uuid"] = str(e["edge_uuid"])
        e["source_uuid"] = id_to_uuid.get(e.pop("source_id"))
        e["target_uuid"] = id_to_uuid.get(e.pop("target_id"))
        serialized_edges.append(e)

    chart.refresh_from_db()
    return {
        "revision_number": chart.revision_number,
        "nodes": serialized_nodes,
        "edges": serialized_edges,
    }


def delete_chart(chart: OrgChart) -> None:
    """Delete a chart and its entire draft graph (cascade)."""
    chart.delete()


def _apply_node_fields(obj: OrgChartNode, data: Dict[str, Any]) -> None:
    obj.node_uuid = data["node_uuid"]
    obj.shape_type = data["shape_type"]
    obj.display_name = data["display_name"]
    obj.subtitle = data.get("subtitle", "")
    obj.role_title = data.get("role_title", "")
    obj.department_label = data.get("department_label", "")
    obj.description = data.get("description", "")
    obj.status = data.get("status", "active")
    obj.linked_user_id = data.get("linked_user_id")
    obj.sort_order = data.get("sort_order", 0)
    obj.position_x = data.get("position_x", 0.0)
    obj.position_y = data.get("position_y", 0.0)
    obj.width = data.get("width", 180)
    obj.height = data.get("height", 80)
    obj.style_key = data.get("style_key", "")
    obj.custom_fields = data.get("custom_fields", {}) or {}
    obj.is_searchable = data.get("is_searchable", True)
    obj.is_visible = data.get("is_visible", True)


def _apply_edge_fields(obj: OrgChartEdge, data: Dict[str, Any]) -> None:
    obj.edge_uuid = data["edge_uuid"]
    obj.edge_type = data["edge_type"]
    obj.label = data.get("label", "")
    obj.sort_order = data.get("sort_order", 0)
    obj.style_key = data.get("style_key", "")
