"""
Serializers for the Ticket KPI plugin — Dynamic Schema Edition.
"""

from datetime import timedelta

from rest_framework import serializers
from apps.overtime.models.core import Client
from .models import (
    ExportProfile,
    TicketImportBatch,
    NormalizedTicket,
    MonthlyKPI,
    KPIEvidence,
    TicketOvertimeLink,
)


class ClientMiniSerializer(serializers.ModelSerializer):
    """Minimal client representation for embedding in batches."""
    class Meta:
        model = Client
        fields = ['id', 'name', 'code']


class ExportProfileSerializer(serializers.ModelSerializer):
    """Full serializer for ExportProfile CRUD."""
    created_by_username = serializers.CharField(
        source='created_by.username',
        read_only=True
    )
    assigned_client_ids = serializers.PrimaryKeyRelatedField(
        source='assigned_clients',
        queryset=Client.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = ExportProfile
        fields = [
            'id', 'name', 'description', 'is_active',
            'field_mapping', 'value_transforms', 'required_fields',
            'compute_resolution_time', 'compute_sla',
            'is_global', 'assigned_client_ids',
            'created_by', 'created_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']


class ExportProfileListSerializer(serializers.ModelSerializer):
    """Lightweight list view."""
    class Meta:
        model = ExportProfile
        fields = ['id', 'name', 'description', 'is_active', 'is_global', 'created_at']


class MappingPreviewSerializer(serializers.Serializer):
    """Input serializer for testing a mapping against a file."""
    file = serializers.FileField()
    profile_id = serializers.IntegerField(required=False, allow_null=True)


class MappingPreviewResponseSerializer(serializers.Serializer):
    """Output serializer for mapping preview results."""
    total_records = serializers.IntegerField()
    preview_rows = serializers.ListField(child=serializers.DictField())
    issues = serializers.DictField()
    field_breakdowns = serializers.DictField()
    status_breakdown = serializers.DictField()
    priority_breakdown = serializers.DictField()
    category_breakdown = serializers.DictField()
    detected_columns = serializers.ListField(child=serializers.CharField())
    detected_field_map = serializers.DictField()


class TicketImportBatchSerializer(serializers.ModelSerializer):
    """Serializer for user's import batches."""
    profile_name = serializers.CharField(source='profile.name', read_only=True, default=None)
    username = serializers.CharField(source='user.username', read_only=True)
    clients = ClientMiniSerializer(many=True, read_only=True)
    client_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list
    )
    raw_file = serializers.SerializerMethodField()
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True, default=None)
    is_reviewed = serializers.SerializerMethodField()

    def get_is_reviewed(self, obj) -> bool:
        return obj.reviewed_by_id is not None

    class Meta:
        model = TicketImportBatch
        fields = [
            'id', 'user', 'username', 'month', 'profile', 'profile_name',
            'clients', 'client_ids', 'detected_columns', 'detected_field_map',
            'raw_file', 'record_count', 'is_overridden',
            'overridden_by', 'overridden_at',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'is_reviewed',
            'created_at',
        ]
        read_only_fields = [
            'user', 'record_count', 'is_overridden',
            'overridden_by', 'overridden_at',
            'reviewed_by', 'reviewed_at', 'created_at',
            'detected_columns', 'detected_field_map', 'raw_file',
        ]

    def get_raw_file(self, obj) -> str | None:
        """Return the file URL safely, or None if the file/storage is missing."""
        if not obj.raw_file:
            return None
        try:
            return obj.raw_file.url
        except Exception:
            return None

    def create(self, validated_data):
        client_ids = validated_data.pop('client_ids', [])
        instance = super().create(validated_data)
        if client_ids:
            instance.clients.set(client_ids)
        return instance

    def update(self, instance, validated_data):
        client_ids = validated_data.pop('client_ids', None)
        instance = super().update(instance, validated_data)
        if client_ids is not None:
            instance.clients.set(client_ids)
        return instance


class NormalizedTicketSerializer(serializers.ModelSerializer):
    """Serializer for individual normalized tickets."""
    class Meta:
        model = NormalizedTicket
        fields = [
            'id', 'batch', 'row_index',
            'ticket_id', 'title', 'status',
            'created_at', 'resolved_at',
            'assignee', 'requester', 'priority', 'category',
            'time_to_resolution_hours', 'sla_breached',
            'raw_data',
        ]


class TicketOvertimeLinkSerializer(serializers.ModelSerializer):
    """Serialize and validate links between overtime and KPI tickets."""
    overtime_user = serializers.SerializerMethodField()
    overtime_date = serializers.DateField(source='overtime_log.date', read_only=True)
    overtime_hours = serializers.DecimalField(
        source='overtime_log.hours', max_digits=5, decimal_places=2, read_only=True
    )
    overtime_client_name = serializers.CharField(
        source='overtime_log.client.name', read_only=True
    )
    ticket_id = serializers.CharField(source='normalized_ticket.ticket_id', read_only=True)
    ticket_title = serializers.CharField(source='normalized_ticket.title', read_only=True)
    ticket_status = serializers.CharField(source='normalized_ticket.status', read_only=True)
    batch_month = serializers.DateField(source='normalized_ticket.batch.month', read_only=True)
    linked_by_username = serializers.CharField(
        source='linked_by.username', read_only=True, default=''
    )

    class Meta:
        model = TicketOvertimeLink
        fields = [
            'id', 'overtime_log', 'normalized_ticket',
            'linked_by', 'linked_by_username', 'linked_at',
            'link_method', 'review_status', 'reviewed_by', 'reviewed_at',
            'note', 'overtime_user', 'overtime_date', 'overtime_hours',
            'overtime_client_name', 'ticket_id', 'ticket_title',
            'ticket_status', 'batch_month',
        ]
        read_only_fields = [
            'linked_by', 'linked_at', 'link_method', 'reviewed_by', 'reviewed_at',
        ]

    def get_overtime_user(self, obj):
        return obj.overtime_log.user.username

    def validate(self, attrs):
        """Validate client/month scope for create and partial updates."""
        overtime_log = attrs.get('overtime_log') or self.instance.overtime_log
        ticket = attrs.get('normalized_ticket') or self.instance.normalized_ticket
        batch = ticket.batch
        batch_client_ids = set(batch.clients.values_list('id', flat=True))
        if batch_client_ids and overtime_log.client_id not in batch_client_ids:
            raise serializers.ValidationError(
                "Overtime client does not match the KPI batch's clients."
            )

        month_start = batch.month
        month_end = (
            month_start.replace(day=28) + timedelta(days=4)
        ).replace(day=1) - timedelta(days=1)
        if not (month_start <= overtime_log.date <= month_end):
            raise serializers.ValidationError(
                f"Overtime date {overtime_log.date} is outside the KPI batch "
                f"month {month_start:%Y-%m}."
            )
        return attrs


class MonthlyKPISerializer(serializers.ModelSerializer):
    """Serializer for pre-computed monthly KPIs."""
    class Meta:
        model = MonthlyKPI
        fields = [
            'id', 'user', 'month',
            'total_tickets', 'closed_tickets', 'open_tickets',
            'avg_resolution_hours', 'min_resolution_hours', 'max_resolution_hours',
            'p50_resolution_hours', 'p75_resolution_hours', 'p90_resolution_hours',
            'sla_compliance_pct', 'sla_breached_count',
            'by_category', 'by_priority', 'by_status',
            'field_breakdowns',
            'computed_at',
        ]


class UploadPreviewSerializer(serializers.Serializer):
    """Response for upload preview step."""
    preview_rows = serializers.ListField(child=serializers.DictField())
    record_count = serializers.IntegerField()
    errors = serializers.ListField(child=serializers.CharField())
    detected_columns = serializers.ListField(child=serializers.CharField())
    suggested_mapping = serializers.DictField()
    field_breakdowns = serializers.DictField()
    profile_id = serializers.IntegerField(required=False, allow_null=True)
    profile_name = serializers.CharField(required=False)
    has_existing_upload = serializers.BooleanField(required=False)
    existing_record_count = serializers.IntegerField(required=False)


class UploadCommitSerializer(serializers.Serializer):
    """Request to commit an upload."""
    profile_id = serializers.IntegerField(required=False, allow_null=True)
    month = serializers.DateField()
    override = serializers.BooleanField(default=False)
    client_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list
    )


class YearlyReportSerializer(serializers.Serializer):
    """Response for yearly report endpoint."""
    year = serializers.IntegerField()
    users_with_data = serializers.IntegerField()
    total_tickets = serializers.IntegerField()
    avg_resolution_hours = serializers.FloatField(required=False)
    sla_compliance_pct = serializers.FloatField(required=False)
    monthly_breakdown = serializers.ListField(child=serializers.DictField())
    per_user_summary = serializers.ListField(child=serializers.DictField())
    field_breakdowns = serializers.DictField(required=False)


class KPIEvidenceSerializer(serializers.ModelSerializer):
    """Serializer for KPI evidence uploads and reviews."""
    username = serializers.CharField(source='user.username', read_only=True)
    clients = ClientMiniSerializer(many=True, read_only=True)
    client_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list
    )
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True, default=None)
    is_reviewed = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = KPIEvidence
        fields = [
            'id', 'user', 'username', 'month', 'clients', 'client_ids',
            'evidence_type', 'file', 'file_url', 'file_name', 'description',
            'status', 'reviewed_by', 'reviewed_by_username', 'reviewed_at',
            'is_reviewed', 'parsed_email', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'user', 'status', 'reviewed_by', 'reviewed_at',
            'parsed_email', 'created_at', 'updated_at',
        ]

    def get_is_reviewed(self, obj) -> bool:
        return obj.reviewed_by_id is not None

    def get_file_url(self, obj) -> str | None:
        if not obj.file:
            return None
        try:
            return obj.file.url
        except Exception:
            return None

    def get_file_name(self, obj) -> str | None:
        if not obj.file:
            return None
        return obj.file.name.rsplit('/', 1)[-1] if '/' in obj.file.name else obj.file.name

    def create(self, validated_data):
        client_ids = validated_data.pop('client_ids', [])
        instance = super().create(validated_data)
        if client_ids:
            instance.clients.set(client_ids)
        return instance

    def update(self, instance, validated_data):
        client_ids = validated_data.pop('client_ids', None)
        instance = super().update(instance, validated_data)
        if client_ids is not None:
            instance.clients.set(client_ids)
        return instance
