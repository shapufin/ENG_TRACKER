from django.db import models
from django.utils.translation import gettext_lazy as _
from apps.permissions.models import Role, Group

class Plugin(models.Model):
    name = models.CharField(_("Internal Name"), max_length=100, unique=True)
    verbose_name = models.CharField(_("Display Name"), max_length=200)
    description = models.TextField(_("Description"), blank=True)
    version = models.CharField(_("Version"), max_length=20)
    is_enabled = models.BooleanField(_("Enabled"), default=False)
    config = models.JSONField(_("Configuration"), default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Plugin")
        verbose_name_plural = _("Plugins")
        ordering = ["verbose_name"]

    def __str__(self):
        return f"{self.verbose_name} ({self.version})"


class PluginPermission(models.Model):
    """
    Plugin-level permission configuration.
    
    Defines which roles and groups have access to specific plugin actions.
    By default, only superusers/staff have access. Extend access by adding
    roles and groups to the allowed_roles and allowed_groups fields.
    """
    ACTION_CHOICES = [
        ('view', 'View'),
        ('manage', 'Manage'),
        ('configure', 'Configure'),
        ('export', 'Export'),
    ]
    
    plugin_name = models.CharField(
        max_length=100,
        help_text="Name of the plugin (e.g., 'analytics', 'budget')"
    )
    action = models.CharField(
        max_length=20,
        choices=ACTION_CHOICES,
        help_text="Action type (view, manage, configure, export)"
    )
    
    # Access control
    allowed_roles = models.ManyToManyField(
        Role,
        blank=True,
        related_name='plugin_permissions',
        help_text="Roles that have access to this plugin action"
    )
    allowed_groups = models.ManyToManyField(
        Group,
        blank=True,
        related_name='plugin_permissions',
        help_text="Groups that have access to this plugin action"
    )
    
    # Metadata
    is_public = models.BooleanField(
        _("Public Access"),
        default=False,
        help_text=_("If checked, all authenticated users will have this permission regardless of roles/groups.")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'plugin_permissions'
        unique_together = ['plugin_name', 'action']
        ordering = ['plugin_name', 'action']
        indexes = [
            models.Index(fields=['plugin_name']),
            models.Index(fields=['action']),
        ]
    
    def __str__(self):
        return f"{self.plugin_name}:{self.action}"
    
    def has_access(self, user, *, role_ids=None, group_ids=None):
        """Check access, optionally using preloaded role/group ID sets."""
        if user.is_superuser or user.is_staff or self.is_public:
            return True

        if role_ids is None:
            role_ids = set(
                user.user_roles.filter(is_active=True).values_list('role_id', flat=True)
            )
        if group_ids is None:
            group_ids = set(user.user_groups.values_list('group_id', flat=True))

        allowed_role_ids = {
            role.id for role in self.allowed_roles.all()
        }
        if allowed_role_ids.intersection(role_ids):
            return True

        allowed_group_ids = {
            group.id for group in self.allowed_groups.all()
        }
        return bool(allowed_group_ids.intersection(group_ids))
    
    @classmethod
    def get_user_permissions(cls, user, plugin_name=None):
        """
        Get all permissions for a user, optionally filtered by plugin.
        
        Returns dict with plugin_name -> list of actions user can perform.
        Optimized to avoid N+1 queries using prefetch_related.
        """
        # Superuser/staff have all permissions
        if user.is_superuser or user.is_staff:
            if plugin_name:
                return {plugin_name: ['view', 'manage', 'configure', 'export']}
            else:
                # Return all plugins with full permissions
                from apps.plugins.models import Plugin
                plugins = Plugin.objects.all()
                return {p.name: ['view', 'manage', 'configure', 'export'] for p in plugins}
        
        # Load user memberships and permission relations once. This avoids
        # querying roles/groups for every plugin action row.
        role_ids = set(
            user.user_roles.filter(is_active=True).values_list('role_id', flat=True)
        )
        group_ids = set(user.user_groups.values_list('group_id', flat=True))
        query = cls.objects.prefetch_related('allowed_roles', 'allowed_groups')
        if plugin_name:
            query = query.filter(plugin_name=plugin_name)

        perms_by_plugin = {}
        for perm in query:
            if perm.plugin_name not in perms_by_plugin:
                perms_by_plugin[perm.plugin_name] = []
            if perm.has_access(user, role_ids=role_ids, group_ids=group_ids):
                perms_by_plugin[perm.plugin_name].append(perm.action)

        return perms_by_plugin
