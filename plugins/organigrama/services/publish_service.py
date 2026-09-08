"""
Publish/unpublish service for custom org charts.

Publishing is atomic: the current draft is validated, an immutable
``OrgChartRevision`` is created, and the chart is flipped to ``published``
in a single transaction. Viewers see only the published revision, never
a half-saved draft.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Optional

from django.db import transaction
from django.db.models import Max

from plugins.organigrama.models import OrgChart, OrgChartRevision
from .draft_service import get_draft
from .graph_validation import validate_graph, ValidationResult

__all__ = [
    "publish_chart",
    "unpublish_chart",
    "PublishValidationError",
]


class PublishValidationError(Exception):
    """Raised when a chart cannot be published because the draft is invalid."""

    def __init__(self, result: ValidationResult):
        self.result = result
        super().__init__("Draft failed validation and cannot be published.")


def _checksum(payload: Dict[str, Any]) -> str:
    """Stable SHA-256 checksum for a revision payload."""
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def publish_chart(
    chart: OrgChart,
    published_by: Optional[Any] = None,
    change_summary: str = "",
) -> OrgChartRevision:
    """Validate the draft and atomically publish a new revision.

    Raises ``PublishValidationError`` when the graph is not valid, when the
    chart has no nodes, or when the audience is ``selected`` but empty.
    """
    with transaction.atomic():
        # Lock before reading and validating the draft. Otherwise a concurrent
        # save can commit after get_draft() and publish an older snapshot.
        locked = OrgChart.objects.select_for_update().get(pk=chart.pk)
        draft = get_draft(locked)
        result = validate_graph(draft["nodes"], draft["edges"])

        # G3: an empty chart (zero nodes) is not publishable.
        if not draft["nodes"]:
            result.add("Cannot publish a chart with no nodes.")

        # G2: a "selected" audience with no roles and no groups would make the
        # chart visible to nobody — reject at publish time.
        if locked.audience_mode == "selected":
            has_roles = locked.audience_roles.exists()
            has_groups = locked.audience_groups.exists()
            if not has_roles and not has_groups:
                result.add(
                    "Cannot publish with audience_mode='selected' and no roles or groups selected.",
                )

        if not result.is_valid:
            raise PublishValidationError(result)

        payload: Dict[str, Any] = {
            "revision_number": draft["revision_number"],
            "nodes": draft["nodes"],
            "edges": draft["edges"],
        }
        checksum = _checksum(payload)
        max_version = locked.revisions.aggregate(Max("version"))["version__max"] or 0
        version = max_version + 1
        revision = OrgChartRevision.objects.create(
            chart=locked,
            version=version,
            payload=payload,
            checksum=checksum,
            change_summary=change_summary,
            published_by=published_by,
        )
        locked.published_revision = revision
        locked.status = "published"
        if published_by is not None:
            locked.updated_by = published_by
        locked.save(update_fields=["published_revision", "status", "updated_by", "updated_at"])
        chart.refresh_from_db()
        return revision


def unpublish_chart(chart: OrgChart) -> None:
    """Remove the published pointer and return the chart to draft status."""
    with transaction.atomic():
        locked = OrgChart.objects.select_for_update().get(pk=chart.pk)
        locked.published_revision = None
        locked.status = "draft"
        locked.save(update_fields=["published_revision", "status", "updated_at"])
        chart.refresh_from_db()
