"""
Permissions app core models.

This module contains models for the custom RBAC permission system.
Implements team-based and group-based permission inheritance.
"""

from django.db import models
from django.contrib.auth.models import User
from core.models.abstract import BaseModel


class Group(BaseModel):
    """
    Group model for grouping users together.
    
    Similar to Django's Group but with custom permission support.
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    
    class Meta:
        db_table = 'permission_groups'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Role(BaseModel):
    """
    Role model for defining sets of permissions.
    
    Users are assigned roles which grant them permissions.
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    
    class Meta:
        db_table = 'roles'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Permission(BaseModel):
    """
    Permission model for defining specific permissions.
    
    Permissions are defined by module and action (e.g., 'overtime:view').
    """
    module = models.CharField(max_length=50)
    action = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    
    class Meta:
        db_table = 'permissions'
        unique_together = ['module', 'action']
        ordering = ['module', 'action']
        indexes = [
            models.Index(fields=['module']),
            models.Index(fields=['action']),
        ]
    
    def __str__(self):
        return f"{self.module}:{self.action}"
    
    @property
    def codename(self):
        """Generate codename for permission."""
        return f"{self.module}_{self.action}"


class UserRole(BaseModel):
    """
    User-Role assignment with team context.
    
    Connects users to roles within specific teams, enabling
    team-based permission inheritance (Italian TL -> Albanian TL).
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='user_roles'
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='user_assignments'
    )
    team = models.ForeignKey(
        'users.Team',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='team_roles'
    )
    
    # Permission inheritance tracking
    inherited_from = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='inherited_roles'
    )
    
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'user_roles'
        unique_together = ['user', 'role', 'team']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['role']),
            models.Index(fields=['team']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        team_str = f" ({self.team.code})" if self.team else ""
        return f"{self.user.username} - {self.role.name}{team_str}"


class UserGroup(BaseModel):
    """
    User-Group assignment.
    
    Connects users to groups for group-based permissions.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='user_groups'
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.CASCADE,
        related_name='members'
    )
    
    class Meta:
        db_table = 'user_groups'
        unique_together = ['user', 'group']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['group']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.group.name}"


class RolePermission(BaseModel):
    """
    Role-Permission assignment.
    
    Defines which permissions are granted by each role.
    """
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='permissions'
    )
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name='role_assignments'
    )
    
    class Meta:
        db_table = 'role_permissions'
        unique_together = ['role', 'permission']
        indexes = [
            models.Index(fields=['role']),
            models.Index(fields=['permission']),
        ]
    
    def __str__(self):
        return f"{self.role.name} - {self.permission}"


