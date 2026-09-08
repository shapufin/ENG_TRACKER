"""Serializers for the Skills Matrix plugin."""
from rest_framework import serializers

from .models import (
    SkillCategory,
    Skill,
    UserSkill,
    SkillRatingHistory,
)


class SkillCategorySerializer(serializers.ModelSerializer):
    """Full CRUD serializer for SkillCategory.

    ``code`` is read-only and auto-generated from ``name`` (uppercased).
    ``name`` is always stored in uppercase. Ordering is automatic (A-Z).
    """
    skill_count = serializers.SerializerMethodField()

    class Meta:
        model = SkillCategory
        fields = [
            'id', 'name', 'code', 'description',
            'is_active',
            'skill_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'code']

    def get_skill_count(self, obj):
        count = getattr(obj, '_skill_count', None)
        return count if count is not None else obj.skills.count()

    def _normalize_name(self, validated_data):
        if 'name' in validated_data:
            name = validated_data['name'].strip().upper()
            validated_data['name'] = name
            validated_data['code'] = name
        return validated_data

    def create(self, validated_data):
        validated_data = self._normalize_name(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data = self._normalize_name(validated_data)
        return super().update(instance, validated_data)


class SkillSerializer(serializers.ModelSerializer):
    """Full CRUD serializer for Skill with category info.

    ``code`` is read-only and auto-generated from ``name`` (uppercased).
    ``name`` is always stored in uppercase. Ordering is automatic (A-Z).
    """
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_code = serializers.CharField(source='category.code', read_only=True)

    class Meta:
        model = Skill
        fields = [
            'id', 'category', 'category_name', 'category_code',
            'name', 'code', 'description',
            'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'code']

    def validate_category(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "Cannot assign a skill to an inactive category."
            )
        return value

    def _normalize_name(self, validated_data):
        if 'name' in validated_data:
            name = validated_data['name'].strip().upper()
            validated_data['name'] = name
            validated_data['code'] = name
        return validated_data

    def create(self, validated_data):
        validated_data = self._normalize_name(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data = self._normalize_name(validated_data)
        return super().update(instance, validated_data)


class UserSkillSerializer(serializers.ModelSerializer):
    """Read serializer for UserSkill with skill and category info."""
    skill_name = serializers.CharField(source='skill.name', read_only=True)
    skill_code = serializers.CharField(source='skill.code', read_only=True)
    category_name = serializers.CharField(source='skill.category.name', read_only=True)
    category_code = serializers.CharField(source='skill.category.code', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    last_updated_by_name = serializers.CharField(
        source='last_updated_by.username', read_only=True, default=None
    )

    class Meta:
        model = UserSkill
        fields = [
            'id', 'user', 'username', 'skill', 'skill_name', 'skill_code',
            'category_name', 'category_code',
            'level', 'notes',
            'last_updated_by', 'last_updated_by_name',
            'last_updated_at', 'created_at',
        ]
        read_only_fields = [
            'last_updated_by', 'last_updated_at', 'created_at',
        ]


class UserSkillCreateSerializer(serializers.ModelSerializer):
    """Write serializer for employee self-service skill creation.

    Validates that the skill is active and that the (request.user, skill)
    pair is unique. Uniqueness is checked in ``UserSkillViewSet.perform_create``
    (not via ``UniqueTogetherValidator``) because ``user`` is read-only and
    set from ``request.user`` — the validator requires the field in the
    input, which conflicts with read-only.

    The ``user`` field is read-only and ignored on input —
    ``UserSkillViewSet.perform_create`` always sets it to ``request.user``
    (self-only). Cross-user admin creation is not supported via this
    endpoint; if needed in the future, add a separate admin serializer.
    """

    class Meta:
        model = UserSkill
        fields = ['id', 'user', 'skill', 'level', 'notes']
        read_only_fields = ['id', 'user']

    def validate_level(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("level must be between 1 and 5.")
        return value

    def validate_skill(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "Cannot add an inactive skill to your profile."
            )
        return value


class UserSkillUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for level/notes updates (self or TL re-rate).

    Only ``level`` and ``notes`` are writable. ``user`` and ``skill`` are
    read-only — TLs cannot change which skill or user a rating belongs to.
    """

    class Meta:
        model = UserSkill
        fields = ['id', 'user', 'skill', 'level', 'notes']
        read_only_fields = ['id', 'user', 'skill']

    def validate_level(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("level must be between 1 and 5.")
        return value


class SkillRatingHistorySerializer(serializers.ModelSerializer):
    """Read-only serializer for audit history."""
    username = serializers.CharField(source='user.username', read_only=True, default=None)
    skill_name = serializers.CharField(source='skill.name', read_only=True, default=None)
    changed_by_name = serializers.CharField(
        source='changed_by.username', read_only=True, default=None
    )

    class Meta:
        model = SkillRatingHistory
        fields = [
            'id', 'user_skill', 'user', 'username',
            'skill', 'skill_name',
            'old_level', 'new_level',
            'changed_by', 'changed_by_name',
            'source', 'changed_at',
        ]
        read_only_fields = fields


class TeamMatrixRowSerializer(serializers.Serializer):
    """One row in the TL team matrix (one user + their skills)."""
    user_id = serializers.IntegerField()
    username = serializers.CharField()
    full_name = serializers.CharField(
        help_text=(
            "Display name for the member profile column (falls back to "
            "username when the user has no first/last name)."
        ),
    )
    skills = serializers.ListField(
        child=serializers.DictField(),
        help_text=(
            "List of {user_skill_id, skill_id, skill_name, category_name, "
            "level}. user_skill_id is the UserSkill PK needed "
            "by the frontend `rate` action."
        ),
    )


class SkillCoverageSerializer(serializers.Serializer):
    """Per-skill team coverage stats."""
    skill_id = serializers.IntegerField()
    skill_name = serializers.CharField()
    category_name = serializers.CharField()
    team_count = serializers.IntegerField()
    avg_level = serializers.FloatField()
