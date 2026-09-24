from rest_framework import serializers

from apps.overtime.models.core import Client

from .models import Document, Folder


class OnboardingClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ['id', 'name', 'code']


class FolderSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    child_count = serializers.IntegerField(read_only=True, default=0)
    document_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Folder
        fields = [
            'id', 'client', 'parent', 'name', 'created_by', 'created_by_name',
            'updated_by', 'updated_by_name', 'created_at', 'updated_at',
            'child_count', 'document_count',
        ]
        read_only_fields = ['created_by', 'updated_by']
        # DRF auto-translates the model's UniqueConstraint into a
        # unique-together validator that force-requires every participating
        # field on create (enforce_required_fields) — overriding any
        # explicit `required=False`. Folder.clean() already enforces this
        # duplicate check; disable the redundant auto-validator instead of
        # fighting it.
        validators = []

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username if obj.created_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() or obj.updated_by.username if obj.updated_by else None


class DocumentSerializer(serializers.ModelSerializer):
    # Optional on input — the client may omit it and let perform_create
    # default it from the uploaded file's own name.
    name = serializers.CharField(required=False, allow_blank=True)
    uploaded_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'client', 'folder', 'name', 'size_bytes', 'uploaded_by',
            'uploaded_by_name', 'updated_by', 'updated_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['uploaded_by', 'size_bytes', 'updated_by']
        # See FolderSerializer.Meta.validators — same reason.
        validators = []

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username if obj.uploaded_by else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.get_full_name() or obj.updated_by.username if obj.updated_by else None
