from django.db import transaction
from rest_framework import viewsets, status, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.plugins.models import Plugin
from core.plugins.registry import plugin_registry
from core.mixins.permissions import PluginPermissionMixin
from core.utils import get_client_ip

class PluginSerializer(serializers.ModelSerializer):
    is_installed = serializers.SerializerMethodField()
    table_names = serializers.SerializerMethodField()
    user_permissions = serializers.SerializerMethodField()

    class Meta:
        model = Plugin
        fields = '__all__'

    def get_is_installed(self, obj) -> bool:
        instance = plugin_registry.get_plugin(obj.name)
        if instance:
            return instance.is_installed()
        return False

    def get_table_names(self, obj) -> list[str]:
        instance = plugin_registry.get_plugin(obj.name)
        if instance:
            return instance.get_table_names()
        return []
    
    def get_user_permissions(self, obj) -> list[str]:
        """Get permissions user has for this plugin."""
        request = self.context.get('request')
        if not request:
            return []
        
        from apps.plugins.models import PluginPermission
        
        user = request.user
        
        # Get user permissions using optimized helper method
        user_perms = PluginPermission.get_user_permissions(user, obj.name)
        return user_perms.get(obj.name, [])

class PluginPermissionSerializer(serializers.ModelSerializer):
    allowed_role_codes = serializers.SerializerMethodField()

    class Meta:
        from apps.plugins.models import PluginPermission
        model = PluginPermission
        fields = '__all__'

    def get_allowed_role_codes(self, obj):
        return list(obj.allowed_roles.values_list('code', flat=True))

class PluginViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing plugins.
    
    Provides endpoints for:
    - List all plugins
    - Create new plugin records
    - Retrieve plugin details
    - Update plugin configuration
    - Delete plugins
    - Discover and sync plugins
    - Toggle plugin enabled status
    - Get active plugin metadata
    
    Permission checks:
    - Superuser/staff: Full access to all plugins
    - Other users: Access based on PluginPermission configuration
    """
    queryset = Plugin.objects.all()
    serializer_class = PluginSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    plugin_name = 'plugins'  # Default plugin name for permission checks

    def check_permissions(self, request):
        """
        Override to bypass plugin-level permission checks for meta-actions.
        These actions should be accessible to all authenticated users.
        """
        if self.action in ['user_permissions', 'active_metadata', 'check_permission']:
            # Skip PluginPermissionMixin's check_permissions but still run DRF's standard permission checks
            return super(PluginPermissionMixin, self).check_permissions(request)
        
        # For other actions, run full checks including plugin-level permissions
        return super().check_permissions(request)

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAdminUser])
    def discover(self, request):
        """
        Force a re-discovery of plugins and sync with database.
        """
        plugin_registry.discover_plugins()
        discovered = plugin_registry.get_all_plugins()
        
        synced_plugins = []
        for name, plugin_instance in discovered.items():
            plugin_obj, created = Plugin.objects.get_or_create(
                name=name,
                defaults={
                    'verbose_name': plugin_instance.verbose_name,
                    'description': plugin_instance.description,
                    'version': plugin_instance.version,
                }
            )
            if not created:
                # Update metadata if changed
                plugin_obj.verbose_name = plugin_instance.verbose_name
                plugin_obj.description = plugin_instance.description
                plugin_obj.version = plugin_instance.version
                plugin_obj.save()
            synced_plugins.append(plugin_obj)
            
        serializer = self.get_serializer(synced_plugins, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def toggle(self, request, pk=None):
        plugin_obj = self.get_object()
        enabling = not plugin_obj.is_enabled

        instance = plugin_registry.get_plugin(plugin_obj.name)

        # When enabling, ensure the plugin's tables/migrations exist BEFORE
        # marking it enabled. activate() is idempotent (no-op if already
        # installed) and runs `migrate <plugin>` via PluginTableManager.
        if enabling and instance:
            try:
                if not instance.is_installed() and not instance.activate():
                    return Response(
                        {"error": f"Failed to create tables for plugin {plugin_obj.name}. "
                                  f"Run `python manage.py ensure_plugins --plugin {plugin_obj.name}` to generate migrations."},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
            except Exception as e:
                return Response(
                    {"error": f"Failed to initialize plugin {plugin_obj.name}: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        plugin_obj.is_enabled = enabling
        plugin_obj.save()

        # If enabled, call ready(), if disabled call disable()
        if instance:
            try:
                if plugin_obj.is_enabled:
                    instance.ready()
                else:
                    instance.disable()
            except Exception as e:
                return Response({"error": f"Plugin action failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'status': 'success',
            'is_enabled': plugin_obj.is_enabled
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def user_permissions(self, request):
        """
        Get all plugin permissions for the current user.
        
        Returns a list of plugins with their available actions for the user.
        Optimized to avoid N+1 queries using prefetch_related.
        """
        from apps.plugins.models import PluginPermission
        
        user = request.user
        all_plugins = Plugin.objects.all()
        
        # Get permissions efficiently using helper method
        user_perms = PluginPermission.get_user_permissions(user)
        
        result = []
        for plugin in all_plugins:
            permissions_list = user_perms.get(plugin.name, [])
            
            result.append({
                'plugin_name': plugin.name,
                'verbose_name': plugin.verbose_name,
                'permissions': permissions_list,
                'has_access': len(permissions_list) > 0
            })
        
        return Response(result)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def check_permission(self, request, pk=None):
        """
        Check if user has a specific permission for a plugin.
        
        Query params:
        - action: The action to check (view, manage, configure, export)
        
        Returns:
        - has_permission: bool
        - reason: str (why permission was granted/denied)
        """
        from apps.plugins.models import PluginPermission
        
        plugin_obj = self.get_object()
        action = request.query_params.get('action', 'view')
        user = request.user
        
        # Superuser/staff always have access
        if user.is_superuser or user.is_staff:
            return Response({
                'has_permission': True,
                'reason': 'User is superuser/staff'
            })
        
        # Get user permissions for this plugin
        user_perms = PluginPermission.get_user_permissions(user, plugin_obj.name)
        has_permission = action in user_perms.get(plugin_obj.name, [])
        
        if has_permission:
            return Response({
                'has_permission': True,
                'reason': 'User has required role or group'
            })
        else:
            return Response({
                'has_permission': False,
                'reason': 'User does not have required role or group'
            })

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def active_metadata(self, request):
        """
        Returns metadata for all active plugins for the frontend to use.
        
        Filters plugins based on user permissions.
        """
        active_plugins = plugin_registry.get_active_plugins()
        user = request.user
        
        from apps.plugins.models import PluginPermission
        user_perms = PluginPermission.get_user_permissions(user)
        metadata = []
        for plugin in active_plugins.values():
            # Control Room is special: dashboard visibility is scoped by
            # ControlRoomAccess, not generic PluginPermission(view).
            if plugin.name == 'control_room':
                from plugins.control_room.services.scope_service import can_access_dashboard
                if can_access_dashboard(user):
                    metadata.append(plugin.get_frontend_metadata())
                    continue
            if user.is_superuser or user.is_staff or 'view' in user_perms.get(plugin.name, []):
                metadata.append(plugin.get_frontend_metadata())

        return Response(metadata)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAdminUser])
    def details(self, request, pk=None):
        """
        Get detailed information about a plugin including configuration schema.
        """
        plugin_obj = self.get_object()
        instance = plugin_registry.get_plugin(plugin_obj.name)
        
        if not instance:
            return Response(
                {"error": "Plugin instance not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response({
            'id': plugin_obj.id,
            'name': plugin_obj.name,
            'verbose_name': plugin_obj.verbose_name,
            'description': plugin_obj.description,
            'version': plugin_obj.version,
            'is_enabled': plugin_obj.is_enabled,
            'config': plugin_obj.config,
            'metadata': instance.get_frontend_metadata(),
            'config_schema': instance.get_config_schema() if hasattr(instance, 'get_config_schema') else {},
            'permission_actions': instance.get_permission_actions(),
        })

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def configure(self, request, pk=None):
        """
        Update plugin configuration.
        """
        plugin_obj = self.get_object()
        config_data = request.data.get('config', {})

        # Validate input
        if not isinstance(config_data, dict):
            return Response(
                {"error": "Configuration must be a valid JSON object"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate configuration if schema exists
        instance = plugin_registry.get_plugin(plugin_obj.name)
        if instance and hasattr(instance, 'validate_config'):
            try:
                instance.validate_config(config_data)
            except ValueError as e:
                return Response(
                    {"error": f"Configuration validation failed: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Update configuration
        plugin_obj.config = config_data
        plugin_obj.save()

        return Response({
            'status': 'success',
            'config': plugin_obj.config
        })

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def activate(self, request, pk=None):
        """
        Activate a plugin by creating its database tables.
        Idempotent - safe to call multiple times.
        """
        plugin_obj = self.get_object()
        instance = plugin_registry.get_plugin(plugin_obj.name)
        
        if not instance:
            return Response(
                {"error": f"Plugin {plugin_obj.name} not found in registry"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            # Check if already installed
            if instance.is_installed():
                return Response({
                    'status': 'success',
                    'message': f'Plugin {plugin_obj.name} tables already exist. No action needed.'
                })
            
            # Try to activate
            if instance.activate():
                return Response({
                    'status': 'success',
                    'message': f'Plugin {plugin_obj.name} initialized successfully'
                })
            else:
                return Response(
                    {"error": f"Failed to initialize plugin {plugin_obj.name}. Check logs for details."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        except Exception as e:
            return Response(
                {"error": f"Error initializing plugin {plugin_obj.name}: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def deactivate(self, request, pk=None):
        """
        Deactivate a plugin by disabling it (tables are preserved).
        """
        plugin_obj = self.get_object()
        if plugin_registry.deactivate_plugin(plugin_obj.name):
            return Response({
                'status': 'success',
                'message': f'Plugin {plugin_obj.name} deactivated successfully'
            })
        return Response(
            {"error": f"Failed to deactivate plugin {plugin_obj.name}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def uninstall(self, request, pk=None):
        """
        Uninstall a plugin by dropping its database tables and removing
        its Plugin / PluginPermission rows.

        Requires confirmation in request body. Does NOT delete source code
        — use `python manage.py purge_plugin <name>` for that.

        Audit-logs the uninstall (best-effort; no-op if audit_log plugin
        is disabled).
        """
        plugin_obj = self.get_object()
        confirmation = request.data.get('confirm', False)
        backup_data = request.data.get('backup_data', False)
        plugin_name = plugin_obj.name

        if not confirmation:
            return Response(
                {"error": "Confirmation required. Send {confirm: true} in request body."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Capture metadata before uninstall (the row gets deleted).
        plugin_meta = {
            "name": plugin_name,
            "verbose_name": plugin_obj.verbose_name,
            "version": plugin_obj.version,
            "backup_data": backup_data,
        }

        if plugin_registry.uninstall_plugin(plugin_name, backup_data=backup_data):
            # Best-effort audit log. log_action swallows exceptions if the
            # audit_log plugin is disabled/missing.
            try:
                from plugins.audit_log.signals import log_action
                log_action(
                    user=request.user,
                    action='plugin_uninstall',
                    description=f"Uninstalled plugin {plugin_name}",
                    new_values=plugin_meta,
                    ip_address=get_client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                )
            except Exception:
                pass
            return Response({
                'status': 'success',
                'message': f'Plugin {plugin_name} uninstalled successfully. '
                           f'Run `python manage.py purge_plugin {plugin_name}` '
                           f'to remove source code.'
            })
        return Response(
            {"error": f"Failed to uninstall plugin {plugin_name}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    @action(detail=True, methods=['get', 'post'])
    def permissions(self, request, pk=None):
        """
        Manage permissions for a specific plugin.
        GET: List all permission records for this plugin (staff admins).
        POST: Create or update a permission record (superusers only).
        """
        from apps.plugins.models import PluginPermission
        from core.mixins.permissions import IsSuperuser
        plugin_obj = self.get_object()

        if request.method == 'GET':
            self.permission_classes = [permissions.IsAdminUser]
            self.check_permissions(request)
            perms = PluginPermission.objects.filter(plugin_name=plugin_obj.name)
            serializer = PluginPermissionSerializer(perms, many=True)
            return Response(serializer.data)

        if request.method == 'POST':
            self.permission_classes = [IsSuperuser]
            self.check_permissions(request)

            action_name = request.data.get('action')
            valid_actions = {choice[0] for choice in PluginPermission.ACTION_CHOICES}
            if action_name not in valid_actions:
                return Response(
                    {"error": f"Action must be one of: {', '.join(sorted(valid_actions))}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            role_objects = None
            if 'allowed_role_codes' in request.data:
                from apps.permissions.models import Role
                role_codes = request.data['allowed_role_codes']
                if not isinstance(role_codes, list) or not all(
                    isinstance(code, str) for code in role_codes
                ):
                    return Response(
                        {"error": "allowed_role_codes must be a list of strings"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                role_objects = list(Role.objects.filter(code__in=role_codes))
                found_codes = {role.code for role in role_objects}
                unknown_codes = set(role_codes) - found_codes
                if unknown_codes:
                    return Response(
                        {"error": f"Unknown role code(s): {', '.join(sorted(unknown_codes))}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            group_ids = None
            if 'allowed_groups' in request.data:
                from apps.permissions.models import Group
                group_ids = request.data['allowed_groups']
                if not isinstance(group_ids, list) or not all(
                    isinstance(gid, int) and not isinstance(gid, bool)
                    for gid in group_ids
                ):
                    return Response(
                        {"error": "allowed_groups must be a list of integers"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                existing_ids = set(
                    Group.objects.filter(id__in=group_ids).values_list('id', flat=True)
                )
                unknown_ids = set(group_ids) - existing_ids
                if unknown_ids:
                    return Response(
                        {"error": f"Unknown group id(s): {', '.join(sorted(str(i) for i in unknown_ids))}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            with transaction.atomic():
                perm, created = PluginPermission.objects.get_or_create(
                    plugin_name=plugin_obj.name,
                    action=action_name
                )

                if 'is_public' in request.data:
                    perm.is_public = request.data['is_public']
                if role_objects is not None:
                    perm.allowed_roles.set(role_objects)
                elif 'allowed_roles' in request.data:
                    perm.allowed_roles.set(request.data['allowed_roles'])
                if group_ids is not None:
                    perm.allowed_groups.set(group_ids)
                perm.save()

            serializer = PluginPermissionSerializer(perm)
            return Response(serializer.data)
