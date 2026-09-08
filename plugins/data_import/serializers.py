from rest_framework import serializers
from .models import ImportProfile, ImportBatch


class ImportProfileListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for dropdown lists."""
    class Meta:
        model = ImportProfile
        fields = ['id', 'name', 'target_key', 'is_active']


class ImportProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportProfile
        fields = [
            'id', 'name', 'target_key', 'field_mapping', 'default_values',
            'options', 'is_active', 'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def validate(self, data):
        target_key = data.get('target_key')
        if not target_key:
            raise serializers.ValidationError({'target_key': 'Target key is required.'})
        return data


class ImportBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportBatch
        fields = [
            'id', 'target_key', 'profile', 'original_filename', 'total_rows',
            'created_count', 'updated_count', 'skipped_count', 'error_count',
            'row_errors', 'created_at',
        ]
        read_only_fields = fields