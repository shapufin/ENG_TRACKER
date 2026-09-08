"""
Serializers for the Organigrama custom chart admin API.

* ``OrgChartSerializer`` — list/retrieve chart metadata.
* ``OrgChartWriteSerializer`` — create/update chart metadata and audience.
* ``OrgChartDraftSaveSerializer`` — write payload for draft save/validate.
* ``OrgChartDraftReadSerializer`` — read-only draft graph payload.
* ``OrgChartRevisionSerializer`` — published revision metadata.
* ``PublishedOrgChartSerializer`` — public viewer directory.
* ``OrgChartPublishedPayloadSerializer`` — published revision graph payload.
* ``RoleMiniSerializer`` / ``GroupMiniSerializer`` — audience selectors.
"""
from rest_framework import serializers

from django.db import transaction

from apps.permissions.models import Group, Role
from .models import (
    OrgChart,
    OrgChartEdge,
    OrgChartRevision,
    OrgChartAudienceRole,
    OrgChartAudienceGroup,
    ROLE_CODES,
    MAX_NODES_PER_CHART,
    MAX_EDGES_PER_CHART,
)


class RoleMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "name", "code"]


class GroupMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name", "code"]


class OrgChartEdgeSerializer(serializers.ModelSerializer):
    source_uuid = serializers.SerializerMethodField()
    target_uuid = serializers.SerializerMethodField()

    class Meta:
        model = OrgChartEdge
        fields = [
            "edge_uuid", "source_uuid", "target_uuid", "edge_type",
            "label", "sort_order", "style_key",
        ]

    def get_source_uuid(self, obj):
        return str(obj.source.node_uuid)

    def get_target_uuid(self, obj):
        return str(obj.target.node_uuid)


class OrgChartAudienceRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgChartAudienceRole
        fields = ["role_code"]


class OrgChartAudienceGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgChartAudienceGroup
        fields = ["group"]


class OrgChartSerializer(serializers.ModelSerializer):
    node_count = serializers.IntegerField(read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_name = serializers.CharField(source="updated_by.username", read_only=True)
    audience_role_codes = serializers.SerializerMethodField()
    audience_group_ids = serializers.SerializerMethodField()
    published_at = serializers.SerializerMethodField()
    published_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OrgChart
        fields = [
            "id", "name", "slug", "description", "source_mode", "status",
            "audience_mode", "is_featured", "revision_number", "node_count",
            "created_by", "created_by_name", "updated_by", "updated_by_name",
            "published_revision", "published_at", "published_by_name",
            "audience_role_codes", "audience_group_ids",
            "created_at", "updated_at",
        ]

    def get_audience_role_codes(self, obj):
        # Defensive check: if prefetch was not applied, this will still work
        # but may issue an extra query per object. This is safe but slower.
        # ViewSet.get_queryset() always prefetches; this guard handles edge cases.
        return sorted({r.role_code for r in obj.audience_roles.all()})

    def get_audience_group_ids(self, obj):
        # Defensive check: if prefetch was not applied, this will still work
        # but may issue an extra query per object. This is safe but slower.
        # ViewSet.get_queryset() always prefetches; this guard handles edge cases.
        return sorted({g.group_id for g in obj.audience_groups.all()})

    def get_published_at(self, obj):
        if obj.published_revision:
            return obj.published_revision.published_at
        return None

    def get_published_by_name(self, obj):
        if obj.published_revision and obj.published_revision.published_by:
            return obj.published_revision.published_by.username
        return None


class OrgChartWriteSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    audience_role_codes = serializers.ListField(
        child=serializers.CharField(max_length=20),
        required=False,
        write_only=True,
    )
    audience_group_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        write_only=True,
    )

    class Meta:
        model = OrgChart
        fields = [
            "id", "name", "slug", "description", "source_mode", "status",
            "audience_mode", "is_featured", "revision_number",
            "created_by", "updated_by", "published_revision",
            "audience_role_codes", "audience_group_ids",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "revision_number", "created_by", "updated_by",
            "published_revision", "created_at", "updated_at",
        ]

    def validate_slug(self, value):
        if not value:
            return value
        value = value.strip().lower()
        existing = OrgChart.objects.filter(slug=value)
        if self.instance is not None:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("A chart with this slug already exists.")
        return value

    def validate(self, attrs):
        """Validate audience targets and selected-mode requirements."""
        mode = attrs.get("audience_mode", getattr(self.instance, "audience_mode", None))
        role_codes = attrs.get("audience_role_codes", None)
        group_ids = attrs.get("audience_group_ids", None)

        # Validate explicitly supplied targets regardless of audience mode so
        # ignored metadata cannot be silently persisted at the API boundary.
        if role_codes is not None:
            invalid_roles = set(role_codes) - set(ROLE_CODES)
            if invalid_roles:
                raise serializers.ValidationError(
                    f"Unknown audience role code(s): {', '.join(sorted(invalid_roles))}."
                )
        if group_ids is not None:
            valid_groups = set(
                Group.objects.filter(id__in=set(group_ids)).values_list("id", flat=True)
            )
            if set(group_ids) - valid_groups:
                raise serializers.ValidationError("One or more audience groups do not exist.")

        if mode == "selected":
            # On create, both default to None → not provided → empty.
            # On update, None means "not changed" → use instance values.
            if role_codes is None and self.instance is not None:
                role_codes = sorted(
                    {r.role_code for r in self.instance.audience_roles.all()}
                )
            if group_ids is None and self.instance is not None:
                group_ids = sorted(
                    {g.group_id for g in self.instance.audience_groups.all()}
                )
            if not role_codes and not group_ids:
                raise serializers.ValidationError(
                    "audience_mode='selected' requires at least one role or group."
                )
        return attrs

    def _apply_audience(self, chart, role_codes, group_ids):
        if role_codes is not None:
            chart.audience_roles.all().delete()
            role_objs = [
                OrgChartAudienceRole(chart=chart, role_code=code)
                for code in set(role_codes)
                if code and code in ROLE_CODES
            ]
            if role_objs:
                OrgChartAudienceRole.objects.bulk_create(role_objs)
        if group_ids is not None:
            chart.audience_groups.all().delete()
            valid_ids = set(Group.objects.filter(id__in=group_ids).values_list("id", flat=True))
            group_objs = [
                OrgChartAudienceGroup(chart=chart, group_id=gid)
                for gid in valid_ids
            ]
            if group_objs:
                OrgChartAudienceGroup.objects.bulk_create(group_objs)

    def create(self, validated_data):
        user = self.context["request"].user
        validated_data.pop("created_by", None)
        validated_data.pop("updated_by", None)
        role_codes = validated_data.pop("audience_role_codes", None)
        group_ids = validated_data.pop("audience_group_ids", None)
        from .services.draft_service import create_chart
        # Atomic: chart metadata and audience rows commit or roll back
        # together. A failure in audience bulk_create must not leave a chart
        # row with missing/stale targeting.
        with transaction.atomic():
            chart = create_chart(created_by=user, **validated_data)
            self._apply_audience(chart, role_codes, group_ids)
        return chart

    def update(self, instance, validated_data):
        user = self.context["request"].user
        validated_data.pop("created_by", None)
        validated_data.pop("updated_by", None)
        role_codes = validated_data.pop("audience_role_codes", None)
        group_ids = validated_data.pop("audience_group_ids", None)
        # Atomic: chart field save and audience replacement commit or roll
        # back together. A failure during audience bulk_create must not leave
        # the chart with updated fields but missing/stale targeting, and the
        # audience delete must roll back with a failed bulk_create so the
        # prior targeting survives.
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.updated_by = user
            instance.save()
            self._apply_audience(instance, role_codes, group_ids)
        return instance


class OrgChartDraftSaveSerializer(serializers.Serializer):
    revision_number = serializers.IntegerField(min_value=0)
    nodes = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=True,
    )
    edges = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=True,
    )

    def validate_nodes(self, value):
        if len(value) > MAX_NODES_PER_CHART:
            raise serializers.ValidationError(f"Too many nodes (max {MAX_NODES_PER_CHART}).")
        return value

    def validate_edges(self, value):
        if len(value) > MAX_EDGES_PER_CHART:
            raise serializers.ValidationError(f"Too many edges (max {MAX_EDGES_PER_CHART}).")
        return value


class OrgChartDraftReadSerializer(serializers.Serializer):
    revision_number = serializers.IntegerField()
    nodes = serializers.ListField(child=serializers.DictField())
    edges = serializers.ListField(child=serializers.DictField())


class OrgChartRevisionSerializer(serializers.ModelSerializer):
    published_by_name = serializers.CharField(
        source="published_by.username", read_only=True
    )

    class Meta:
        model = OrgChartRevision
        fields = [
            "id", "version", "checksum", "change_summary",
            "schema_version", "published_by", "published_by_name",
            "published_at",
        ]


class PublishedOrgChartSerializer(serializers.ModelSerializer):
    node_count = serializers.IntegerField(read_only=True)
    published_at = serializers.SerializerMethodField()
    published_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OrgChart
        fields = [
            "id", "name", "slug", "description", "source_mode",
            "status", "is_featured", "published_at", "published_by_name",
            "node_count",
        ]

    def get_published_at(self, obj):
        return obj.published_revision.published_at if obj.published_revision else None

    def get_published_by_name(self, obj):
        if obj.published_revision and obj.published_revision.published_by:
            return obj.published_revision.published_by.username
        return None


class OrgChartPublishedPayloadSerializer(serializers.Serializer):
    payload = serializers.JSONField()


class OrgChartPublishSerializer(serializers.Serializer):
    """Validate the optional publish ``change_summary`` field.

    Moved here from inline ViewSet checks so input validation follows the
    serializer-first DRF pattern. ``allow_blank=True`` preserves the
    "omitted or empty" behavior; ``max_length=500`` matches the prior
    inline cap. Non-string inputs (e.g. numbers) are rejected explicitly
    rather than coerced, matching the prior ``isinstance`` guard.
    """

    change_summary = serializers.CharField(
        max_length=500, allow_blank=True, required=False, default=""
    )

    def validate_change_summary(self, value):
        # CharField coerces non-string inputs to strings by default. The
        # prior inline guard rejected non-strings explicitly, so re-check
        # the raw request payload here to preserve that contract.
        raw = self.initial_data.get("change_summary")
        if raw is not None and not isinstance(raw, str):
            raise serializers.ValidationError(
                "Must be a string of at most 500 characters."
            )
        return value
