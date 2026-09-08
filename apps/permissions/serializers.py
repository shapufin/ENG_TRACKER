"""
Permissions app serializers.
"""

from django.db import IntegrityError
from rest_framework import serializers
from .models import (
    Group, Role, Permission, UserRole, UserGroup,
    RolePermission
)


class GroupSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    plugin_access = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            'id', 'name', 'code', 'description', 'created_at', 'member_count',
            'plugin_access',
        ]

    def get_plugin_access(self, obj):
        return [
            {'plugin_name': permission.plugin_name, 'action': permission.action}
            for permission in obj.plugin_permissions.all()
        ]


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['id', 'name', 'code', 'description', 'created_at']


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'module', 'action', 'description', 'created_at']


class UserRoleSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    role_name = serializers.CharField(source='role.name', read_only=True)
    team_name = serializers.CharField(source='team.name', read_only=True)
    
    class Meta:
        model = UserRole
        fields = ['id', 'user', 'user_name', 'role', 'role_name', 'team', 'team_name', 'is_active']


class UserGroupSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = UserGroup
        fields = ['id', 'user', 'user_name', 'group', 'group_name']

    def validate_user(self, value):
        # ``value`` is a User instance resolved by PrimaryKeyRelatedField;
        # existence is already guaranteed. We only enforce the active policy.
        if not value.is_active:
            raise serializers.ValidationError('A valid active user is required.')
        return value

    def validate(self, attrs):
        user = attrs.get('user')
        group = attrs.get('group')
        if user is not None and group is not None:
            if UserGroup.objects.filter(user=user, group=group).exists():
                raise serializers.ValidationError(
                    'This user is already a member of this group.'
                )
        return attrs

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError(
                'This user is already a member of this group.'
            ) from exc


class RolePermissionSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.name', read_only=True)
    permission_codename = serializers.CharField(source='permission.codename', read_only=True)
    permission_module = serializers.CharField(source='permission.module', read_only=True)
    permission_action = serializers.CharField(source='permission.action', read_only=True)

    class Meta:
        model = RolePermission
        fields = ['id', 'role', 'role_name', 'permission', 'permission_codename', 'permission_module', 'permission_action']


