"""Serializers for the previous-years surface (plan Y4)."""
from rest_framework import serializers

from .models import YearSnapshot, YearSnapshotFile


class YearSnapshotFileSerializer(serializers.ModelSerializer):
    """One downloadable ZIP. Paths stay server-side; the client only needs a link."""

    class Meta:
        model = YearSnapshotFile
        fields = [
            'id', 'kind', 'leader_name', 'team_name', 'sha256', 'size',
            'status', 'error', 'created_at',
        ]
        read_only_fields = fields


class YearSnapshotSerializer(serializers.ModelSerializer):
    file_count = serializers.SerializerMethodField()

    class Meta:
        model = YearSnapshot
        fields = [
            'id', 'year', 'version', 'status', 'readiness', 'started_at',
            'completed_at', 'total_bytes', 'file_count', 'created_at',
        ]
        read_only_fields = fields

    def get_file_count(self, obj) -> int:
        return obj.files.count()
