"""
Persistent custom-chart models for the Organigrama plugin.

These models back administrator-authored custom org charts (draft → publish).
The existing live company chart remains a read-only projection of UserProfile
data and is NOT stored here. A custom chart node MAY link to a real User, but
linking is optional and never mutates TL/Team/Tech/permission relationships.

Conventions follow the project's plugin pattern (see ticket_kpi): plain
``models.Model`` with explicit ``created_at``/``updated_at``. Soft delete is
not used (CONTEXT.md "Model Conventions"). All migrations must be reversible.
"""
import uuid

from django.conf import settings
from django.db import models

# --------------------------------------------------------------------------- #
# Controlled vocabularies (allowlists — never accept arbitrary values)
# --------------------------------------------------------------------------- #
SHAPE_TYPES = [
    "person", "position", "vacant", "external",
    "department", "division", "team", "location",
    "label", "section", "placeholder",
]

EDGE_TYPES = [
    "reports_to", "dotted_line", "assistant", "association", "contains",
]

# Hierarchy edge types are cycle-checked and root-counted. Non-hierarchy edges
# (dotted_line, assistant, association) may form cycles without corrupting the
# reporting tree.
HIERARCHY_EDGE_TYPES = ["reports_to", "contains"]

SOURCE_MODES = ["live", "custom"]
CHART_STATUS = ["draft", "published", "archived"]
AUDIENCE_MODES = ["all_authenticated", "selected", "private_admin"]
NODE_STATUS = ["active", "vacant", "planned", "archived"]

# Container shapes that may serve as a visual group target (group_uuid).
# Grouping under a leaf shape (person, position, vacant, external, label,
# placeholder) is rejected so grouping never becomes a hidden hierarchy edge
# to a non-container node.
CONTAINER_SHAPE_TYPES = ["section", "department", "division", "team", "location"]

# Canonical role codes (seeded by apps/permissions/migrations/0004). Audience
# role targeting uses these codes only; legacy profile flags are not consulted.
ROLE_CODES = ["employee", "italian_tl", "albanian_tl", "hr", "cr_admin"]

# Allowlisted theme style keys (plan §5.2: "style_key from an allowlisted
# theme registry"; plan §10: "style keys and shape types are allowlisted").
# Empty until a theme registry is introduced; the only accepted value is "".
# This prevents attacker-controlled CSS/SVG tokens from reaching a renderer.
STYLE_KEYS: list = []

# Bounded graph limits (plan §11: 500-node target with a path to 2000).
MAX_NODES_PER_CHART = 500
MAX_EDGES_PER_CHART = 750
MAX_CUSTOM_FIELDS_BYTES = 16 * 1024
MAX_CUSTOM_FIELDS_KEYS = 50
# Canvas coordinate bounds (reasonable editor extents).
COORD_MIN = -100_000.0
COORD_MAX = 100_000.0
NODE_MIN_DIM = 40
NODE_MAX_DIM = 1000


class OrgChart(models.Model):
    """A custom (or reserved live) org chart, edited as a draft.

    ``revision_number`` is the optimistic-concurrency token for draft saves.
    ``published_revision`` points to the immutable snapshot viewers see; it is
    ``SET_NULL`` so deleting a revision never deletes the chart.
    """
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)
    source_mode = models.CharField(max_length=20, choices=[(m, m) for m in SOURCE_MODES], default="custom")
    status = models.CharField(max_length=20, choices=[(s, s) for s in CHART_STATUS], default="draft")
    audience_mode = models.CharField(
        max_length=20, choices=[(m, m) for m in AUDIENCE_MODES], default="private_admin",
    )
    is_featured = models.BooleanField(default=False)
    revision_number = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_orgcharts",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="updated_orgcharts",
    )
    published_revision = models.ForeignKey(
        "OrgChartRevision", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="published_for_chart",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organigrama_orgchart"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["source_mode"]),
            models.Index(fields=["is_featured"]),
            models.Index(fields=["status", "audience_mode"]),  # For list_visible_chart_ids filtering
        ]

    def __str__(self):
        return self.name


class OrgChartNode(models.Model):
    """One node in a custom chart's draft graph.

    ``node_uuid`` is stable within a chart (used by the builder/inspector and
    by validation error reporting). ``linked_user`` is optional and
    ``SET_NULL`` — deactivating/deleting a user never deletes the node.
    """
    chart = models.ForeignKey(OrgChart, on_delete=models.CASCADE, related_name="nodes")
    node_uuid = models.UUIDField(default=uuid.uuid4, editable=False)

    shape_type = models.CharField(max_length=20, choices=[(s, s) for s in SHAPE_TYPES])
    display_name = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=200, blank=True, default="")
    role_title = models.CharField(max_length=100, blank=True, default="")
    department_label = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=[(s, s) for s in NODE_STATUS], default="active")

    linked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="linked_orgchart_nodes",
    )
    group = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="grouped_nodes",
    )

    sort_order = models.IntegerField(default=0)
    position_x = models.FloatField(default=0.0)
    position_y = models.FloatField(default=0.0)
    width = models.PositiveIntegerField(default=180)
    height = models.PositiveIntegerField(default=80)
    style_key = models.CharField(max_length=40, blank=True, default="")
    custom_fields = models.JSONField(default=dict, blank=True)
    is_searchable = models.BooleanField(default=True)
    is_visible = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organigrama_orgchartnode"
        ordering = ["chart", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["chart", "node_uuid"], name="node_uuid_unique_per_chart"),
        ]
        indexes = [
            models.Index(fields=["chart", "group"]),
            models.Index(fields=["chart", "shape_type"]),
            models.Index(fields=["chart", "linked_user"]),
            # Supports the get_draft ORDER BY (chart, sort_order, id) path at
            # the plan's 500–2000-node target without an in-memory sort.
            models.Index(fields=["chart", "sort_order"]),
        ]

    def __str__(self):
        return f"{self.display_name} ({self.shape_type})"


class OrgChartEdge(models.Model):
    """One directed edge between two nodes in a chart's draft graph."""
    chart = models.ForeignKey(OrgChart, on_delete=models.CASCADE, related_name="edges")
    edge_uuid = models.UUIDField(default=uuid.uuid4, editable=False)

    source = models.ForeignKey(OrgChartNode, on_delete=models.CASCADE, related_name="outgoing_edges")
    target = models.ForeignKey(OrgChartNode, on_delete=models.CASCADE, related_name="incoming_edges")
    edge_type = models.CharField(max_length=20, choices=[(t, t) for t in EDGE_TYPES])
    label = models.CharField(max_length=100, blank=True, default="")
    sort_order = models.IntegerField(default=0)
    style_key = models.CharField(max_length=40, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organigrama_orgchartedge"
        ordering = ["chart", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["chart", "edge_uuid"], name="edge_uuid_unique_per_chart"),
            models.UniqueConstraint(
                fields=["chart", "source", "target", "edge_type"],
                name="edge_unique_per_chart_pair_type",
            ),
        ]
        indexes = [
            models.Index(fields=["chart", "source"]),
            models.Index(fields=["chart", "target"]),
            # Supports the get_draft ORDER BY (chart, sort_order, id) path.
            models.Index(fields=["chart", "sort_order"]),
        ]

    def __str__(self):
        return f"{self.edge_type}: {self.source_id} -> {self.target_id}"


class OrgChartAudienceRole(models.Model):
    """A canonical role code granted viewer access to a chart."""
    chart = models.ForeignKey(OrgChart, on_delete=models.CASCADE, related_name="audience_roles")
    role_code = models.CharField(max_length=20, choices=[(r, r) for r in ROLE_CODES])

    class Meta:
        db_table = "organigrama_orgchartaudiencerole"
        constraints = [
            models.UniqueConstraint(fields=["chart", "role_code"], name="audience_role_unique"),
        ]
        indexes = [
            models.Index(fields=["chart", "role_code"]),
        ]

    def __str__(self):
        return f"{self.chart_id}: {self.role_code}"


class OrgChartAudienceGroup(models.Model):
    """A resource-access Group granted viewer access to a chart."""
    chart = models.ForeignKey(OrgChart, on_delete=models.CASCADE, related_name="audience_groups")
    group = models.ForeignKey(
        "permissions.Group", on_delete=models.CASCADE, related_name="orgchart_audiences",
    )

    class Meta:
        db_table = "organigrama_orgchartaudiencegroup"
        constraints = [
            models.UniqueConstraint(fields=["chart", "group"], name="audience_group_unique"),
        ]
        indexes = [
            models.Index(fields=["chart", "group"]),
        ]

    def __str__(self):
        return f"{self.chart_id}: {self.group_id}"


class OrgChartRevision(models.Model):
    """An immutable published snapshot of a chart's validated graph.

    The draft tables remain the editable working copy; a revision is a
    read-only point-in-time payload so viewers never see a half-saved draft.
    """
    chart = models.ForeignKey(OrgChart, on_delete=models.CASCADE, related_name="revisions")
    version = models.PositiveIntegerField()
    payload = models.JSONField()
    checksum = models.CharField(max_length=64)
    change_summary = models.TextField(blank=True, default="")
    schema_version = models.CharField(max_length=20, default="1")

    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="published_orgchart_revisions",
    )
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "organigrama_orgchartrevision"
        ordering = ["chart", "-version"]
        constraints = [
            models.UniqueConstraint(fields=["chart", "version"], name="revision_version_unique"),
        ]
        indexes = [
            models.Index(fields=["chart", "version"]),
            models.Index(fields=["chart", "published_at"]),
        ]

    def __str__(self):
        return f"{self.chart_id} v{self.version}"
