"""
Serializers for the Control Room plugin.

Phase 2: access & scope management serializers.
Phase 3 will add dashboard response serializers (kept separate).
"""
from rest_framework import serializers

from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope


class ControlRoomTeamScopeSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source='team.name', read_only=True)
    team_code = serializers.CharField(source='team.code', read_only=True)

    class Meta:
        model = ControlRoomTeamScope
        fields = [
            'id',
            'access',
            'team',
            'team_name',
            'team_code',
            'include_subteams',
            'created_at',
        ]
        read_only_fields = ['id', 'access', 'team_name', 'team_code', 'created_at']


class ControlRoomAccessSerializer(serializers.ModelSerializer):
    """Read serializer for access records — includes nested team scopes."""
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    phone = serializers.CharField(source='user.profile.phone', read_only=True)
    team_scopes = ControlRoomTeamScopeSerializer(many=True, read_only=True)
    team_ids = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True, allow_null=True
    )
    updated_by_name = serializers.CharField(
        source='updated_by.get_full_name', read_only=True, allow_null=True
    )

    class Meta:
        model = ControlRoomAccess
        fields = [
            'id',
            'user',
            'username',
            'user_name',
            'email',
            'first_name',
            'last_name',
            'phone',
            'is_active',
            'display_name',
            'timezone',
            'team_scopes',
            'team_ids',
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'username', 'user_name', 'email', 'first_name', 'last_name',
            'phone', 'team_scopes', 'team_ids',
            'created_by', 'created_by_name', 'updated_by', 'updated_by_name',
            'created_at', 'updated_at',
        ]

    def get_team_ids(self, obj) -> list:
        # Iterate the (prefetched) team_scopes list to avoid a per-row
        # query. The viewset uses prefetch_related('team_scopes__team').
        return [scope.team_id for scope in obj.team_scopes.all()]


class ControlRoomAccessCreateSerializer(serializers.ModelSerializer):
    """Write serializer for creating access records with initial team scopes."""
    team_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
        help_text="Initial team IDs to scope this user to. Empty = no visibility.",
    )

    class Meta:
        model = ControlRoomAccess
        fields = ['user', 'is_active', 'display_name', 'timezone', 'team_ids']
        extra_kwargs = {
            'is_active': {'default': True},
            'display_name': {'required': False, 'allow_blank': True},
            'timezone': {'required': False, 'allow_blank': True},
        }

    def validate_user(self, value):
        # Reject duplicate access records with a clear message.
        if ControlRoomAccess.objects.filter(user=value).exists():
            raise serializers.ValidationError(
                "This user already has Control Room access. Use PATCH to update it."
            )
        return value

    def validate_team_ids(self, value):
        from apps.users.models.core import Team
        if not value:
            return value
        if len(value) != len(set(value)):
            raise serializers.ValidationError('team_ids must not contain duplicates.')
        existing = set(Team.objects.filter(id__in=value).values_list('id', flat=True))
        missing = set(value) - existing
        if missing:
            raise serializers.ValidationError(
                f"Unknown team IDs: {sorted(missing)}"
            )
        return value


class ControlRoomAccessUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for updating access records (no team_ids; use nested action)."""
    class Meta:
        model = ControlRoomAccess
        fields = ['is_active', 'display_name', 'timezone']
        extra_kwargs = {
            'display_name': {'required': False, 'allow_blank': True},
            'timezone': {'required': False, 'allow_blank': True},
        }


class ControlRoomTeamScopeCreateSerializer(serializers.ModelSerializer):
    """Write serializer for adding a team scope to an existing access record."""
    class Meta:
        model = ControlRoomTeamScope
        fields = ['team', 'include_subteams']
        extra_kwargs = {
            'include_subteams': {'default': False},
        }

    def validate_team(self, value):
        access_id = self.context.get('access_id')
        if access_id:
            existing = ControlRoomTeamScope.objects.filter(
                access_id=access_id, team=value
            ).exists()
            if existing:
                raise serializers.ValidationError(
                    "This team is already in the user's scope."
                )
        return value

    def validate_include_subteams(self, value):
        if value:
            raise serializers.ValidationError(
                'include_subteams is not supported in the MVP.'
            )
        return value
