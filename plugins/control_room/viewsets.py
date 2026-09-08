"""
ViewSets for the Control Room plugin.

Phase 2: access & scope management. All management endpoints require
staff/superuser (enforced via `can_manage_access` and IsAdminUser).

Audit logging is best-effort via `plugins.audit_log.signals.log_action`
— no-op if the audit_log plugin is disabled.
"""
import logging

from django.db import transaction
from django_filters import rest_framework as df_filters
from rest_framework import viewsets, status, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.serializers import (
    ControlRoomAccessSerializer,
    ControlRoomAccessCreateSerializer,
    ControlRoomAccessUpdateSerializer,
    ControlRoomTeamScopeSerializer,
    ControlRoomTeamScopeCreateSerializer,
)
from plugins.control_room.services.scope_service import (
    get_access_for_user, get_allowed_team_ids,
)
from core.mixins.permissions import PluginPermissionMixin, IsCRAdminOrStaff

logger = logging.getLogger(__name__)


class CappedUserIdInFilter(df_filters.BaseInFilter):
    """``BaseInFilter`` that rejects CSV lists longer than ``max_length``.

    Prevents oversized IN clauses (e.g. thousands of IDs) from a malicious
    or buggy caller. Raises DRF ``ValidationError`` (400) on overflow.
    """
    max_length = 100

    def filter(self, queryset, value):
        if value and len(value) > self.max_length:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'user_id__in': (
                    f'Too many user IDs ({len(value)}); '
                    f'max is {self.max_length}.'
                )
            })
        return super().filter(queryset, value)


class ControlRoomAccessFilterSet(df_filters.FilterSet):
    """Custom filterset for ControlRoomAccess.

    Adds ``user_id__in`` (CSV) so the core UsersPage badge column can resolve
    CR status for a page of users in O(1) query:

        GET /access/?user_id__in=1,2,3&is_active=true

    The CSV is capped at ``CappedUserIdInFilter.max_length`` entries.
    """
    user_id__in = CappedUserIdInFilter(field_name='user_id', lookup_expr='in')

    class Meta:
        model = ControlRoomAccess
        fields = ['is_active']


def _log_audit(user, action_label, description, new_values=None, old_values=None):
    """Best-effort audit log. Swallows exceptions if audit_log plugin missing.

    Passes empty strings (not None) for ip_address/user_agent because the
    AuditLog model has blank=True but not null=True on those fields.
    """
    try:
        from plugins.audit_log.signals import log_action
        log_action(
            user=user,
            action=action_label,
            description=description,
            new_values=new_values or {},
            old_values=old_values or {},
            ip_address='',
            user_agent='',
        )
    except Exception:
        logger.warning('Control Room audit logging failed', exc_info=True)


class ControlRoomAccessViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    Manage Control Room access grants and team scopes.

    - List/Retrieve/Create/Update/Delete access records.
    - Nested team-scope actions: POST/DELETE under /access/{id}/teams/.
    - All actions require staff/superuser (`can_manage_access`).
    """
    plugin_name = 'control_room'
    queryset = ControlRoomAccess.objects.all().select_related(
        'user', 'user__profile', 'created_by', 'updated_by'
    ).prefetch_related('team_scopes__team')
    permission_classes = [IsCRAdminOrStaff]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'user__email', 'display_name']
    filterset_class = ControlRoomAccessFilterSet
    pagination_class = None
    # Throttle management writes in production. Disabled in dev/test via
    # the `None` rate in DEFAULT_THROTTLE_RATES to avoid 429s in the suite.
    throttle_scope = 'control_room'

    def get_permissions(self):
        """Allow any authenticated user to access /me; CR admin/staff for everything else."""
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def check_permissions(self, request):
        """Bypass plugin-level permission checks for the /me self-info action.

        For all other actions, the PluginPermissionMixin check runs normally.
        CR admins pass because the cr_admin role is wired into
        PluginPermission.allowed_roles for control_room:view + manage
        (via data migration 0003_seed_cr_admin_role).
        """
        if self.action == 'me':
            return super(PluginPermissionMixin, self).check_permissions(request)
        return super().check_permissions(request)

    def get_serializer_class(self):
        if self.action == 'create':
            return ControlRoomAccessCreateSerializer
        if self.action in ('update', 'partial_update'):
            return ControlRoomAccessUpdateSerializer
        return ControlRoomAccessSerializer

    def perform_create(self, serializer):
        actor = self.request.user
        team_ids = serializer.validated_data.pop('team_ids', [])
        with transaction.atomic():
            access = serializer.save(created_by=actor, updated_by=actor)
            if team_ids:
                scopes = [
                    ControlRoomTeamScope(access=access, team_id=tid, created_by=actor)
                    for tid in team_ids
                ]
                ControlRoomTeamScope.objects.bulk_create(scopes)

        _log_audit(
            user=actor,
            action_label='control_room_access_create',
            description=f"Granted Control Room access to {access.user.username}",
            new_values={
                'target_user_id': access.user_id,
                'target_username': access.user.username,
                'team_ids_after': team_ids,
                'is_active_after': access.is_active,
            },
        )

    def perform_update(self, serializer):
        actor = self.request.user
        old = {
            'target_user_id': serializer.instance.user_id,
            'target_username': serializer.instance.user.username,
            'team_ids_before': list(
                serializer.instance.team_scopes.values_list('team_id', flat=True)
            ),
            'is_active_before': serializer.instance.is_active,
        }
        with transaction.atomic():
            access = serializer.save(updated_by=actor)

        _log_audit(
            user=actor,
            action_label='control_room_access_update',
            description=f"Updated Control Room access for {access.user.username}",
            old_values=old,
            new_values={
                'target_user_id': access.user_id,
                'target_username': access.user.username,
                'is_active_after': access.is_active,
                'display_name_after': access.display_name,
            },
        )

    def perform_destroy(self, instance):
        actor = self.request.user
        target_username = instance.user.username
        target_user_id = instance.user_id
        old_team_ids = list(instance.team_scopes.values_list('team_id', flat=True))
        old_is_active = instance.is_active
        with transaction.atomic():
            instance.delete()
        _log_audit(
            user=actor,
            action_label='control_room_access_delete',
            description=f"Revoked Control Room access for {target_username}",
            old_values={
                'target_user_id': target_user_id,
                'target_username': target_username,
                'team_ids_before': old_team_ids,
                'is_active_before': old_is_active,
            },
        )

    @action(detail=True, methods=['post'], permission_classes=[IsCRAdminOrStaff])
    def teams(self, request, pk=None):
        """Add a team to this access record's scope.

        Payload: {"team": <team_id>, "include_subteams": false}
        """
        access = self.get_object()
        ctx = {'access_id': access.id}
        serializer = ControlRoomTeamScopeCreateSerializer(data=request.data, context=ctx)
        serializer.is_valid(raise_exception=True)
        scope = serializer.save(access=access, created_by=request.user)

        _log_audit(
            user=request.user,
            action_label='control_room_scope_add',
            description=f"Added team {scope.team.name} to {access.user.username}'s scope",
            new_values={
                'target_user_id': access.user_id,
                'target_username': access.user.username,
                'team_id_added': scope.team_id,
            },
        )
        return Response(
            ControlRoomTeamScopeSerializer(scope).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=['delete'],
        url_path=r'teams/(?P<team_id>\d+)',
        permission_classes=[IsCRAdminOrStaff],
    )
    def remove_team(self, request, pk=None, team_id=None):
        """Remove a team from this access record's scope."""
        access = self.get_object()
        deleted, _ = ControlRoomTeamScope.objects.filter(
            access=access, team_id=team_id
        ).delete()
        if not deleted:
            return Response(
                {'error': 'Team scope not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _log_audit(
            user=request.user,
            action_label='control_room_scope_remove',
            description=f"Removed team {team_id} from {access.user.username}'s scope",
            old_values={
                'target_user_id': access.user_id,
                'target_username': access.user.username,
                'team_id_removed': int(team_id),
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], permission_classes=[IsCRAdminOrStaff])
    def create_cr_user(self, request):
        """Create a new Django user AND grant them Control Room access in one
        atomic transaction.

        This is the one-step "Create CR User" flow. The created user is a
        normal Django user (no schema change, no flag on UserProfile); only
        the ControlRoomAccess + ControlRoomTeamScope rows are plugin-owned
        and removable with the plugin.

        Payload:
            username: str (required, >=3 chars)
            email:    str (required, valid email)
            password: str (required, >=6 chars)
            team_ids: number[] (optional, default [] — empty = no visibility)
            display_name: str (optional)
            is_active: bool (optional, default true)

        Returns: ControlRoomAccessSerializer payload, HTTP 201.
        On error: HTTP 400 with {error: str}.
        """
        from apps.users.services.user_creation import create_user_with_profile
        from apps.users.models.core import Team

        data = request.data
        required = ['username', 'email', 'password']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return Response(
                {'error': f'Missing required fields: {", ".join(missing)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team_ids = data.get('team_ids', []) or []
        if not isinstance(team_ids, list):
            return Response(
                {'error': 'team_ids must be a list of integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate team_ids before opening the transaction (cheap read query).
        if team_ids:
            if len(team_ids) != len(set(team_ids)):
                return Response(
                    {'error': 'team_ids must not contain duplicates.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            existing = set(Team.objects.filter(id__in=team_ids).values_list('id', flat=True))
            missing_teams = set(team_ids) - existing
            if missing_teams:
                return Response(
                    {'error': f'Unknown team IDs: {sorted(missing_teams)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        actor = request.user
        try:
            with transaction.atomic():
                user = create_user_with_profile(
                    username=data['username'],
                    email=data['email'],
                    password=data['password'],
                    first_name=data.get('first_name', ''),
                    last_name=data.get('last_name', ''),
                )
                access = ControlRoomAccess.objects.create(
                    user=user,
                    is_active=bool(data.get('is_active', True)),
                    display_name=data.get('display_name', '') or '',
                    created_by=actor,
                    updated_by=actor,
                )
                if team_ids:
                    scopes = [
                        ControlRoomTeamScope(access=access, team_id=tid, created_by=actor)
                        for tid in team_ids
                    ]
                    ControlRoomTeamScope.objects.bulk_create(scopes)
                # Re-fetch with prefetches for the serializer.
                access = (
                    ControlRoomAccess.objects
                    .select_related('user', 'user__profile', 'created_by', 'updated_by')
                    .prefetch_related('team_scopes__team')
                    .get(pk=access.pk)
                )
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception('create_cr_user failed')
            return Response(
                {'error': 'Failed to create Control Room user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _log_audit(
            user=actor,
            action_label='control_room_user_created',
            description=(
                f"Created Control Room user {user.username} "
                f"with scope team_ids={team_ids}"
            ),
            new_values={
                'target_user_id': user.id,
                'target_username': user.username,
                'team_ids': team_ids,
                'is_active': access.is_active,
            },
        )
        return Response(
            ControlRoomAccessSerializer(access).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], permission_classes=[IsCRAdminOrStaff])
    def update_cr_user(self, request):
        """Update a Control Room user's basic info + team scopes in one call.

        This is the CR admin's simplified edit endpoint. It updates the
        Django user's first_name/last_name/email, the profile's phone, the
        ControlRoomAccess is_active flag, and replaces all team scopes.

        Payload:
            user_id:    int (required — the CR user to update)
            first_name: str (optional)
            last_name:  str (optional)
            email:      str (optional)
            phone:      str (optional)
            team_ids:   number[] (optional — replaces all scopes; [] = empty)
            is_active:  bool (optional — toggles CR access)

        Returns: ControlRoomAccessSerializer payload, HTTP 200.
        On error: HTTP 400/404 with {error: str}.
        """
        from apps.users.models.core import Team

        data = request.data
        user_id = data.get('user_id')
        if not user_id:
            return Response(
                {'error': 'user_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target_user_id = int(user_id)
        except (TypeError, ValueError):
            return Response(
                {'error': 'user_id must be an integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team_ids = data.get('team_ids')
        if team_ids is not None:
            if not isinstance(team_ids, list):
                return Response(
                    {'error': 'team_ids must be a list of integers.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(team_ids) != len(set(team_ids)):
                return Response(
                    {'error': 'team_ids must not contain duplicates.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if team_ids:
                existing = set(Team.objects.filter(id__in=team_ids).values_list('id', flat=True))
                missing_teams = set(team_ids) - existing
                if missing_teams:
                    return Response(
                        {'error': f'Unknown team IDs: {sorted(missing_teams)}'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        actor = request.user
        try:
            with transaction.atomic():
                access = (
                    ControlRoomAccess.objects
                    .select_related('user', 'user__profile')
                    .select_for_update()
                    .get(user_id=target_user_id)
                )
                user = access.user
                old_values = {
                    'target_user_id': user.id,
                    'target_username': user.username,
                    'first_name_before': user.first_name,
                    'last_name_before': user.last_name,
                    'email_before': user.email,
                    'phone_before': getattr(user.profile, 'phone', ''),
                    'team_ids_before': list(
                        access.team_scopes.values_list('team_id', flat=True)
                    ),
                    'is_active_before': access.is_active,
                }

                # Update basic user info
                if 'first_name' in data:
                    user.first_name = data['first_name'] or ''
                if 'last_name' in data:
                    user.last_name = data['last_name'] or ''
                if 'email' in data:
                    user.email = data['email'] or ''
                user.save()

                # Update profile phone
                if 'phone' in data:
                    user.profile.phone = data['phone'] or ''
                    user.profile.save()

                # Update CR access active state
                if 'is_active' in data:
                    access.is_active = bool(data['is_active'])
                access.updated_by = actor
                access.save()

                # Replace team scopes
                if team_ids is not None:
                    access.team_scopes.all().delete()
                    if team_ids:
                        scopes = [
                            ControlRoomTeamScope(access=access, team_id=tid, created_by=actor)
                            for tid in team_ids
                        ]
                        ControlRoomTeamScope.objects.bulk_create(scopes)

                # Re-fetch with prefetches for the serializer.
                access = (
                    ControlRoomAccess.objects
                    .select_related('user', 'user__profile', 'created_by', 'updated_by')
                    .prefetch_related('team_scopes__team')
                    .get(pk=access.pk)
                )
        except ControlRoomAccess.DoesNotExist:
            return Response(
                {'error': 'This user does not have Control Room access.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.exception('update_cr_user failed')
            return Response(
                {'error': f'Failed to update Control Room user: {e}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _log_audit(
            user=actor,
            action_label='control_room_user_updated',
            description=f"Updated Control Room user {user.username}",
            old_values=old_values,
            new_values={
                'target_user_id': user.id,
                'target_username': user.username,
                'first_name_after': user.first_name,
                'last_name_after': user.last_name,
                'email_after': user.email,
                'phone_after': user.profile.phone,
                'team_ids_after': team_ids if team_ids is not None else old_values['team_ids_before'],
                'is_active_after': access.is_active,
            },
        )
        return Response(ControlRoomAccessSerializer(access).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[IsCRAdminOrStaff])
    def bulk_update_cr_users(self, request):
        """Bulk update Control Room access records in one call.

        Applies the same field set as the single-user ``update_cr_user``
        endpoint, but for multiple users at once. Per-user fields
        (first_name/last_name/email/phone) are NOT supported in bulk —
        only the CR-relevant fields: team scopes (replace) and is_active.

        Payload:
            user_ids:  int[] (required, 1–100 IDs)
            team_ids:  int[] (optional — replaces all scopes for every
                       target; [] = clear scopes; omit = leave unchanged)
            is_active: bool (optional — toggles CR access for every target)

        Returns: HTTP 200 with {updated_count, failed_ids, total_requested}.
        On validation error: HTTP 400 with {error: str}.
        """
        from apps.users.models.core import Team

        data = request.data
        user_ids = data.get('user_ids')
        if not isinstance(user_ids, list) or not user_ids:
            return Response(
                {'error': 'user_ids must be a non-empty list of integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(user_ids) > 100:
            return Response(
                {'error': f'Too many user IDs ({len(user_ids)}); max is 100.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user_ids = [int(uid) for uid in user_ids]
        except (TypeError, ValueError):
            return Response(
                {'error': 'user_ids must contain only integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(user_ids) != len(set(user_ids)):
            return Response(
                {'error': 'user_ids must not contain duplicates.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        team_ids = data.get('team_ids')
        if team_ids is not None:
            if not isinstance(team_ids, list):
                return Response(
                    {'error': 'team_ids must be a list of integers.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(team_ids) != len(set(team_ids)):
                return Response(
                    {'error': 'team_ids must not contain duplicates.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if team_ids:
                existing = set(Team.objects.filter(id__in=team_ids).values_list('id', flat=True))
                missing_teams = set(team_ids) - existing
                if missing_teams:
                    return Response(
                        {'error': f'Unknown team IDs: {sorted(missing_teams)}'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        is_active = data.get('is_active')
        if is_active is not None and not isinstance(is_active, bool):
            return Response(
                {'error': 'is_active must be a boolean.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Nothing to do — caller supplied neither team_ids nor is_active.
        if team_ids is None and is_active is None:
            return Response(
                {'error': 'Provide at least one of team_ids or is_active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor = request.user
        accesses = list(
            ControlRoomAccess.objects.select_related('user')
            .filter(user_id__in=user_ids)
        )
        found_ids = {a.user_id for a in accesses}
        missing_user_ids = sorted(set(user_ids) - found_ids)
        if missing_user_ids:
            return Response(
                {'error': f'No Control Room access for user IDs: {missing_user_ids}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_count = 0
        failed_ids = []
        with transaction.atomic():
            for access in accesses:
                try:
                    if is_active is not None:
                        access.is_active = is_active
                    access.updated_by = actor
                    access.save()

                    if team_ids is not None:
                        access.team_scopes.all().delete()
                        if team_ids:
                            scopes = [
                                ControlRoomTeamScope(access=access, team_id=tid, created_by=actor)
                                for tid in team_ids
                            ]
                            ControlRoomTeamScope.objects.bulk_create(scopes)
                    updated_count += 1
                except Exception:
                    logger.exception(
                        'bulk_update_cr_users failed for user_id=%s',
                        access.user_id,
                    )
                    failed_ids.append(access.user_id)

        _log_audit(
            user=actor,
            action_label='control_room_users_bulk_updated',
            description=(
                f"Bulk updated {updated_count} Control Room users "
                f"(team_ids={team_ids}, is_active={is_active})"
            ),
            new_values={
                'target_user_ids': user_ids,
                'team_ids': team_ids,
                'is_active': is_active,
                'updated_count': updated_count,
                'failed_ids': failed_ids,
            },
        )
        return Response(
            {
                'updated_count': updated_count,
                'failed_ids': failed_ids,
                'total_requested': len(user_ids),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """Return the current user's Control Room access + scope, if any.

        Used by the frontend to decide whether to show the Control Room
        nav item and which teams to pre-select.

        Resolution order:
        1. staff/superuser        -> global scope (team_ids=None).
        2. ControlRoomAccess row  -> scoped to that row's team scopes.
        3. cr_admin role (no row) -> scoped to the user's own team
           memberships (dashboard visibility for the team they are part of).
        4. otherwise              -> no access.
        """
        from core.mixins.permissions import is_cr_admin

        user = request.user
        if user.is_staff or user.is_superuser:
            return Response({
                'has_access': True,
                'is_global': True,
                'team_ids': None,
                'access': None,
            })

        access = get_access_for_user(user)
        if access is not None:
            team_ids = get_allowed_team_ids(user)
            return Response({
                'has_access': True,
                'is_global': False,
                'team_ids': sorted(team_ids) if team_ids is not None else None,
                'access': ControlRoomAccessSerializer(access).data,
            })

        if is_cr_admin(user):
            team_ids = get_allowed_team_ids(user)
            return Response({
                'has_access': True,
                'is_global': False,
                'team_ids': sorted(team_ids) if team_ids else [],
                'access': None,
            })

        return Response({
            'has_access': False,
            'is_global': False,
            'team_ids': [],
            'access': None,
        })


class ControlRoomDashboardViewSet(PluginPermissionMixin, viewsets.ViewSet):
    """
    Read-only dashboard endpoints for Control Room users.

    All endpoints enforce team scope via dashboard_service → scope_service.
    Non-admin users need an active ControlRoomAccess record with at least
    one team scope to see any data (empty scope = no data, not global).

    Access is granted by the ControlRoomAccess record (not the
    PluginPermission role/group system). We override check_permissions
    to use can_access_dashboard as the gate.

    Endpoints:
    - GET /dashboard/summary/   — aggregate stats + coverage by team
    - GET /dashboard/trend/     — daily planned vs approved hours
    - GET /dashboard/roster/    — current standby roster with user/team info
    """
    plugin_name = 'control_room'
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    # Throttle dashboard reads in production. Disabled in dev/test via the
    # `None` rate in DEFAULT_THROTTLE_RATES to avoid 429s in the test suite.
    throttle_scope = 'control_room'

    def check_permissions(self, request):
        """Use can_access_dashboard instead of PluginPermission role checks.

        The ControlRoomAccess record is the source of truth for dashboard
        access. Staff/superuser bypass. Non-staff need an active access
        record. The PluginPermissionMixin role/group system is not used
        here because Control Room has its own access model.
        """
        # Call DRF's base check_permissions (IsAuthenticated).
        super(PluginPermissionMixin, self).check_permissions(request)

        from plugins.control_room.services.scope_service import can_access_dashboard
        if not can_access_dashboard(request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                detail="You do not have Control Room access."
            )

    def _parse_pagination(self, request):
        """Parse bounded roster pagination parameters."""
        try:
            page = int(request.query_params.get('page', '1'))
            page_size = int(request.query_params.get('page_size', '50'))
        except (TypeError, ValueError):
            raise ValueError('page and page_size must be integers')
        if page < 1:
            raise ValueError('page must be at least 1')
        if page_size < 1 or page_size > 500:
            raise ValueError('page_size must be between 1 and 500')
        return page, page_size

    def _parse_params(self, request):
        """Extract and validate common query parameters.

        Team filtering accepts either ``team_ids`` (comma-separated list,
        e.g. ``?team_ids=1,2,3``) or a single ``team_id`` (backward
        compatibility). Both are parsed into a list of ints.
        """
        date_from = request.query_params.get('date_from', '')
        date_to = request.query_params.get('date_to', '')
        status_mode = request.query_params.get('status_mode', 'pending_approved')
        search = request.query_params.get('search', '')

        # Parse team_ids (comma-separated) or legacy single team_id.
        team_ids_raw = request.query_params.get('team_ids')
        team_id_legacy = request.query_params.get('team_id')

        team_ids = None
        if team_ids_raw not in (None, ''):
            parts = [p.strip() for p in team_ids_raw.split(',') if p.strip()]
            try:
                team_ids = [int(p) for p in parts]
            except (TypeError, ValueError):
                raise ValueError('team_ids must be a comma-separated list of integers')
        elif team_id_legacy not in (None, ''):
            try:
                team_ids = [int(team_id_legacy)]
            except (TypeError, ValueError):
                raise ValueError('team_id must be an integer')

        if status_mode not in ('pending_approved', 'approved_only', 'all'):
            raise ValueError(
                'status_mode must be one of: pending_approved, approved_only, all'
            )

        raw_include_rejected = request.query_params.get('include_rejected', 'false').lower()
        if raw_include_rejected not in ('true', 'false'):
            raise ValueError('include_rejected must be true or false')
        include_rejected = raw_include_rejected == 'true'

        return date_from, date_to, team_ids, status_mode, include_rejected, search

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get dashboard summary: aggregate stats + coverage by team."""
        from plugins.control_room.services.dashboard_service import build_summary

        try:
            date_from, date_to, team_ids, status_mode, include_rejected, _ = (
                self._parse_params(request)
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not date_from and not date_to:
            from datetime import date, timedelta
            today = date.today()
            date_from = today.isoformat()
            date_to = (today + timedelta(days=6)).isoformat()

        try:
            result = build_summary(
                request.user, date_from, date_to, team_ids,
                status_mode, include_rejected,
            )
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if 'error' in result:
            return Response(result, status=status.HTTP_403_FORBIDDEN)
        return Response(result)

    @action(detail=False, methods=['get'])
    def trend(self, request):
        """Get daily trend: planned vs approved hours per day."""
        from plugins.control_room.services.dashboard_service import build_daily_trend

        try:
            date_from, date_to, team_ids, status_mode, include_rejected, _ = (
                self._parse_params(request)
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not date_from and not date_to:
            from datetime import date, timedelta
            today = date.today()
            date_from = today.isoformat()
            date_to = (today + timedelta(days=6)).isoformat()

        try:
            result = build_daily_trend(
                request.user, date_from, date_to, team_ids,
                status_mode, include_rejected,
            )
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)

    @action(detail=False, methods=['get'])
    def roster(self, request):
        """Get current standby roster with user/team info."""
        from plugins.control_room.services.dashboard_service import build_roster

        try:
            date_from, date_to, team_ids, status_mode, include_rejected, search = (
                self._parse_params(request)
            )
            page, page_size = self._parse_pagination(request)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not date_from and not date_to:
            from datetime import date, timedelta
            today = date.today()
            date_from = today.isoformat()
            date_to = (today + timedelta(days=6)).isoformat()

        try:
            result = build_roster(
                request.user, date_from, date_to, team_ids,
                status_mode, include_rejected, search, page, page_size,
            )
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)
