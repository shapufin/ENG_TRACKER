from rest_framework import serializers

from .models import BackupRecord


class BackupRecordSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = BackupRecord
        fields = [
            'id', 'filename', 'size_bytes', 'checksum', 'migration_state_hash',
            'db_row_count', 'media_file_count', 'note', 'created_by_username', 'created_at',
        ]
        read_only_fields = fields


class CreateBackupSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, default='', max_length=255)
    include_media = serializers.BooleanField(required=False, default=True)


class RestorePreviewSerializer(serializers.Serializer):
    file = serializers.FileField(required=False)
    backup_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if not attrs.get('file') and not attrs.get('backup_id'):
            raise serializers.ValidationError('Provide either an uploaded file or a backup_id.')
        return attrs


class RestoreCommitSerializer(serializers.Serializer):
    file = serializers.FileField(required=False)
    backup_id = serializers.IntegerField(required=False)
    approved_models = serializers.ListField(child=serializers.CharField(), allow_empty=False)
    delete_missing_models = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    restore_media = serializers.BooleanField(required=False, default=False)
    confirmed = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get('file') and not attrs.get('backup_id'):
            raise serializers.ValidationError('Provide either an uploaded file or a backup_id.')
        return attrs
