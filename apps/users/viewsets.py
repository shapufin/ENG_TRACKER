"""
Users app viewsets.

This module contains DRF viewsets for User, UserProfile, and Team models.
"""

import logging
from datetime import date

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from .permissions import IsAdminOrReadOnly
from django.contrib.auth.models import User
from django.db import DatabaseError, models, transaction
from django.db.models import Count, Q, Sum
from django.db.utils import OperationalError
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from .models import Tech, Team, UserProfile
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    TechSerializer,
    TeamSerializer,
    TeamHierarchySerializer,
    ApprovalPeriodSerializer,
)
from core.mixins.permissions import (
    SuperuserPermissionMixin,
    StaffFilterMixin,
    HRReadOnlyMixin,
    IsCRAdminOrStaff,
    is_cr_admin,
    is_hr_only,
    has_hr_role,
    has_team_leader_role,
)

logger = logging.getLogger(__name__)


class UserViewSet(HRReadOnlyMixin, StaffFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for User model.
    
    Provides read access to all users, write access restricted to admin.
    """
    queryset = User.objects.all().select_related('profile').prefetch_related('profile__teams', 'profile__techs', 'profile__team_memberships__team', 'profile__clients', 'italian_team_members', 'albanian_team_members', 'led_teams', 'user_roles__role', 'control_room_access').order_by('username')
    serializer_class = UserSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['username', 'email', 'first_name', 'last_name']
    filterset_fields = ['is_active', 'is_staff']

    def get_permissions(self):
        if self.action == 'eligible_for_control_room':
            return [IsCRAdminOrStaff()]
        if self.action in ['destroy', 'bulk_delete', 'bulk_update']:
            return [IsAdminUser()]
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAdminOrReadOnly()]
        return [IsAuthenticated()]

    def filter_for_regular_user(self, queryset, user):
        if is_cr_admin(user):
            try:
                from plugins.control_room.models import ControlRoomAccess
                cr_user_ids = ControlRoomAccess.objects.filter(
                    is_active=True
                ).values_list('user_id', flat=True)
                return queryset.filter(id__in=cr_user_ids)
            except Exception:
                logger.warning(
                    'CR admin user %s could not load ControlRoomAccess; '
                    'returning empty user list.',
                    getattr(user, 'id', None),
                )
                return queryset.none()
        if has_hr_role(user):
            return queryset
        return queryset.filter(id=user.id)

    @action(detail=False, methods=['get'])
    def eligible_for_control_room(self, request):
        """Return minimum identity data for users eligible for CR access.

        This is intentionally separate from the general users endpoint: CR
        admins may search users they can grant access to, without broadening
        their normal user-list visibility.
        """
        from rest_framework.pagination import PageNumberPagination

        queryset = User.objects.filter(
            is_active=True,
        ).exclude(
            control_room_access__is_active=True,
        ).order_by('username')
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )

        paginator = PageNumberPagination()
        paginator.page_size_query_param = 'page_size'
        paginator.max_page_size = 50
        page = paginator.paginate_queryset(queryset, request, view=self)
        results = page if page is not None else queryset[:50]
        data = [
            {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'full_name': user.get_full_name(),
            }
            for user in results
        ]
        if page is None:
            return Response({'count': queryset.count(), 'results': data})
        return paginator.get_paginated_response(data)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def me(self, request):
        """
        Get current authenticated user's details.
        """
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated()])
    def assign_clients(self, request):
        """Let the authenticated user self-assign the clients they work for.

        Accepts ``{"client_ids": [1, 2, ...]}``. IDs are validated against
        active clients only — inactive or unknown IDs are rejected with 400.
        Staff/superusers are allowed but typically manage all clients, so this
        is mainly for employees/TLs/HR. The assignment updates
        ``request.user.profile.clients`` and returns the updated ``client_ids``
        plus ``clients_detail`` for immediate UI refresh.
        """
        from apps.overtime.models import Client

        client_ids = request.data.get('client_ids')
        if not isinstance(client_ids, list):
            return Response(
                {'error': 'client_ids must be a list of integers'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Validate every entry is an int
        try:
            client_ids = [int(c) for c in client_ids]
        except (TypeError, ValueError):
            return Response(
                {'error': 'client_ids must contain only integers'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        active_ids = set(Client.objects.filter(is_active=True).values_list('id', flat=True))
        invalid = [c for c in client_ids if c not in active_ids]
        if invalid:
            return Response(
                {'error': f'Invalid or inactive client IDs: {invalid}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = request.user.profile
        profile.clients.set(client_ids)
        # Re-serialize for the response so the frontend can refresh auth state
        serializer = self.get_serializer(request.user)
        data = serializer.data
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated()])
    def assign_member_clients(self, request, pk=None):
        """TL/admin assign: set a team member's clients (single-select UI).

        Plan: plan-tl-client-assignment-2026-09-04 §5.1. Never use
        self.get_object() here — the TL queryset is self-only
        (filter_for_regular_user), so scoped members would 404.
        Pure HR is rejected explicitly: custom @action permission classes
        bypass HRReadOnlyMixin.
        """
        from apps.overtime.models import Client

        target = User.objects.filter(pk=pk).select_related('profile').first()
        if target is None or not hasattr(target, 'profile'):
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        if user.is_staff or user.is_superuser:
            pass
        elif is_hr_only(user):
            return Response(
                {'error': 'Pure HR users cannot assign clients'},
                status=status.HTTP_403_FORBIDDEN,
            )
        else:
            profile = getattr(user, 'profile', None)
            if profile is None or not profile.is_team_leader:
                return Response(
                    {'error': 'Not in your team scope'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if target.id not in profile.get_team_member_ids():
                return Response(
                    {'error': 'Not in your team scope'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        client_ids = request.data.get('client_ids')
        if not isinstance(client_ids, list):
            return Response(
                {'error': 'client_ids must be a list of integers'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            client_ids = [int(c) for c in client_ids]
        except (TypeError, ValueError):
            return Response(
                {'error': 'client_ids must contain only integers'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(client_ids) > 1:
            return Response(
                {'error': 'client_ids must contain at most one client'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        active_ids = set(Client.objects.filter(is_active=True).values_list('id', flat=True))
        invalid = [c for c in client_ids if c not in active_ids]
        if invalid:
            return Response(
                {'error': f'Invalid or inactive client IDs: {invalid}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target.profile.clients.set(client_ids)
        # Re-serialize the TARGET so the caller can refresh row state
        serializer = self.get_serializer(target)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def team_leaders(self, request):
        """
        Get all users who are team leaders (Italian or Albanian TLs).
        Query params:
          - type: 'italian', 'albanian', or 'all' (default: all)
        Includes users with the TL role flag OR users who have team members assigned.
        """
        tl_type = request.query_params.get('type', 'all')
        queryset = self.get_queryset()

        # role_codes__icontains is SQLite-compatible (no JSON __contains).
        # Safe for current role codes: 'italian_tl', 'albanian_tl', 'hr' are
        # not substrings of each other or of 'cr_admin'/'admin'/'employee'.
        # Do NOT use __icontains='admin' — it would match 'cr_admin'.
        if tl_type == 'italian':
            queryset = queryset.filter(
                models.Q(italian_team_members__isnull=False) |
                models.Q(profile__is_italian_tl_role=True) |
                models.Q(profile__role_codes__icontains='italian_tl')
            ).distinct()
        elif tl_type == 'albanian':
            queryset = queryset.filter(
                models.Q(albanian_team_members__isnull=False) |
                models.Q(profile__is_albanian_tl_role=True) |
                models.Q(profile__role_codes__icontains='albanian_tl')
            ).distinct()
        else:
            queryset = queryset.filter(
                models.Q(italian_team_members__isnull=False) |
                models.Q(profile__is_italian_tl_role=True) |
                models.Q(profile__role_codes__icontains='italian_tl') |
                models.Q(albanian_team_members__isnull=False) |
                models.Q(profile__is_albanian_tl_role=True) |
                models.Q(profile__role_codes__icontains='albanian_tl')
            ).distinct()

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def italian_team_leaders(self, request):
        """
        Get all users who are Italian team leaders, with their member counts.
        Includes users with the role flag OR users with team members assigned.
        """
        from django.db.models import Q
        
        queryset = User.objects.filter(
            Q(profile__is_italian_tl_role=True) |
            Q(profile__role_codes__icontains='italian_tl')
        ).distinct().annotate(
            member_count=Count('italian_team_members', distinct=True)
        ).select_related('profile').prefetch_related('profile__teams')

        results = []
        for u in queryset:
            results.append({
                'id': u.id,
                'username': u.username,
                'full_name': f"{u.first_name} {u.last_name}".strip() or u.username,
                'team_name': u.profile.get_primary_team().name if hasattr(u, 'profile') and u.profile.get_primary_team() else None,
                'member_count': u.member_count
            })
        
        return Response(results)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def albanian_team_leaders(self, request):
        """
        Get all users who are Albanian team leaders, with their member counts.
        Includes users with the role flag OR users with team members assigned.
        """
        from django.db.models import Q
        
        queryset = User.objects.filter(
            Q(profile__is_albanian_tl_role=True) |
            Q(profile__role_codes__icontains='albanian_tl')
        ).distinct().annotate(
            member_count=Count('albanian_team_members', distinct=True)
        ).select_related('profile').prefetch_related('profile__teams')

        results = []
        for u in queryset:
            results.append({
                'id': u.id,
                'username': u.username,
                'full_name': f"{u.first_name} {u.last_name}".strip() or u.username,
                'team_name': u.profile.get_primary_team().name if hasattr(u, 'profile') and u.profile.get_primary_team() else None,
                'member_count': u.member_count
            })
        
        return Response(results)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser()])
    def reset_password(self, request, pk=None):
        """
        Admin resets a user's password.
        Expects {'new_password': '...'} in request body.
        """
        user = self.get_object()
        new_password = request.data.get('new_password')
        if not new_password or len(new_password) < 6:
            return Response(
                {'error': 'Password must be at least 6 characters.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.set_password(new_password)
        user.save()
        return Response({'detail': 'Password reset successfully.'}, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser()])
    def bulk_update_tl_roles(self, request):
        """
        Admin bulk updates TL role boolean flags for multiple users.
        Payload: {user_ids: number[], is_italian_tl_role?: boolean, is_albanian_tl_role?: boolean}
        """
        data = request.data
        user_ids = data.get('user_ids', [])
        is_italian_tl_role = data.get('is_italian_tl_role')
        is_albanian_tl_role = data.get('is_albanian_tl_role')

        if not user_ids or not isinstance(user_ids, list):
            return Response({'error': 'user_ids array is required'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.permissions.services.role_service import assign_role, revoke_role
        profiles = UserProfile.objects.filter(user_id__in=user_ids).select_related('user')
        updated_count = 0

        for profile in profiles:
            updated = False
            if is_italian_tl_role is not None:
                profile.is_italian_tl_role = bool(is_italian_tl_role)
                updated = True
            if is_albanian_tl_role is not None:
                profile.is_albanian_tl_role = bool(is_albanian_tl_role)
                updated = True
            
            if updated:
                profile.save()
                if is_italian_tl_role is not None:
                    (assign_role if is_italian_tl_role else revoke_role)(
                        profile.user, 'italian_tl'
                    )
                if is_albanian_tl_role is not None:
                    (assign_role if is_albanian_tl_role else revoke_role)(
                        profile.user, 'albanian_tl'
                    )
                updated_count += 1

        return Response({
            'detail': f'Successfully updated TL roles for {updated_count} users.',
            'updated_count': updated_count
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser()])
    def bulk_update(self, request):
        """Apply selected core user-management fields atomically.

        Payload accepts ``user_ids`` plus any of: ``teams`` (complete M2M
        replacement), ``italian_tl``, ``albanian_tl``, ``is_hr``,
        ``is_italian_tl_role``, and ``is_albanian_tl_role``. Omitted fields
        remain unchanged. This endpoint is intentionally full-admin-only;
        CR-only admins use the Control Room plugin bulk endpoint instead.
        """
        data = request.data
        user_ids = data.get('user_ids')
        if not isinstance(user_ids, list) or not user_ids:
            return Response(
                {'error': 'user_ids must be a non-empty array'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(user_ids) > 100:
            return Response(
                {'error': 'A maximum of 100 users can be updated at once'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user_ids = [int(user_id) for user_id in user_ids]
        except (TypeError, ValueError):
            return Response(
                {'error': 'user_ids must contain only integers'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(set(user_ids)) != len(user_ids):
            return Response(
                {'error': 'user_ids must not contain duplicates'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_fields = {
            'teams', 'techs', 'italian_tl', 'albanian_tl', 'is_hr',
            'is_italian_tl_role', 'is_albanian_tl_role',
        }
        unknown_fields = sorted(set(data.keys()) - {'user_ids'} - allowed_fields)
        if unknown_fields:
            return Response(
                {'error': f'Unsupported bulk fields: {", ".join(unknown_fields)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (set(data.keys()) & allowed_fields):
            return Response(
                {'error': 'At least one bulk field is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if 'teams' in data:
            teams = data['teams']
            if not isinstance(teams, list):
                return Response(
                    {'error': 'teams must be an array of team IDs'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                team_ids = [int(team_id) for team_id in teams]
            except (TypeError, ValueError):
                return Response(
                    {'error': 'teams must contain only integers'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(set(team_ids)) != len(team_ids):
                return Response(
                    {'error': 'teams must not contain duplicates'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            existing_team_ids = set(Team.objects.filter(id__in=team_ids).values_list('id', flat=True))
            invalid_team_ids = sorted(set(team_ids) - existing_team_ids)
            if invalid_team_ids:
                return Response(
                    {'error': f'Unknown team IDs: {invalid_team_ids}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            team_ids = None

        if 'techs' in data:
            techs = data['techs']
            if not isinstance(techs, list):
                return Response(
                    {'error': 'techs must be an array of Tech IDs'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                tech_ids = [int(tech_id) for tech_id in techs]
            except (TypeError, ValueError):
                return Response(
                    {'error': 'techs must contain only integers'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(set(tech_ids)) != len(tech_ids):
                return Response(
                    {'error': 'techs must not contain duplicates'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            existing_tech_ids = set(
                Tech.objects.filter(id__in=tech_ids, is_active=True)
                .values_list('id', flat=True)
            )
            invalid_tech_ids = sorted(set(tech_ids) - existing_tech_ids)
            if invalid_tech_ids:
                return Response(
                    {'error': f'Unknown or inactive Tech IDs: {invalid_tech_ids}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            tech_ids = None

        for field in ('is_hr', 'is_italian_tl_role', 'is_albanian_tl_role'):
            if field in data and not isinstance(data[field], bool):
                return Response(
                    {'error': f'{field} must be a boolean'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        leader_ids = {}
        for field in ('italian_tl', 'albanian_tl'):
            if field not in data:
                continue
            value = data[field]
            if value in (None, ''):
                leader_ids[field] = None
                continue
            try:
                leader_ids[field] = int(value)
            except (TypeError, ValueError):
                return Response(
                    {'error': f'{field} must be a user ID or null'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        referenced_leader_ids = {value for value in leader_ids.values() if value is not None}
        if referenced_leader_ids:
            existing_leader_ids = set(
                User.objects.filter(id__in=referenced_leader_ids).values_list('id', flat=True)
            )
            invalid_leader_ids = sorted(referenced_leader_ids - existing_leader_ids)
            if invalid_leader_ids:
                return Response(
                    {'error': f'Unknown team leader user IDs: {invalid_leader_ids}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from .services.user_creation import _sync_legacy_roles

        with transaction.atomic():
            profiles = list(
                UserProfile.objects.filter(user_id__in=user_ids).select_related('user')
            )
            found_ids = {profile.user_id for profile in profiles}
            missing_ids = sorted(set(user_ids) - found_ids)
            if missing_ids:
                return Response(
                    {'error': f'Unknown user IDs: {missing_ids}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            for profile in profiles:
                if team_ids is not None:
                    profile.teams.set(team_ids)
                if tech_ids is not None:
                    profile.techs.set(tech_ids)
                if 'italian_tl' in leader_ids:
                    profile.italian_tl_id = leader_ids['italian_tl']
                if 'albanian_tl' in leader_ids:
                    profile.albanian_tl_id = leader_ids['albanian_tl']
                if 'is_hr' in data:
                    profile.is_hr_user = data['is_hr']
                if 'is_italian_tl_role' in data:
                    profile.is_italian_tl_role = data['is_italian_tl_role']
                if 'is_albanian_tl_role' in data:
                    profile.is_albanian_tl_role = data['is_albanian_tl_role']
                profile.save()
                _sync_legacy_roles(
                    profile.user,
                    is_hr=data.get('is_hr'),
                    is_italian_tl_role=data.get('is_italian_tl_role'),
                    is_albanian_tl_role=data.get('is_albanian_tl_role'),
                )

        return Response({
            'detail': f'Successfully updated {len(profiles)} users.',
            'updated_count': len(profiles),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser()])
    def bulk_delete(self, request):
        """
        Admin bulk deletes multiple users.
        Payload: {ids: number[]}
        """
        ids = request.data.get('ids', [])
        if not ids or not isinstance(ids, list):
            return Response({'error': 'ids array is required'}, status=status.HTTP_400_BAD_REQUEST)

        logger.info(f"Bulk delete requested for user IDs: {ids}")
        users = User.objects.filter(id__in=ids)
        logger.info(f"Found {users.count()} users in database for IDs: {ids}")

        deleted_count = 0
        failed_users = []  # Changed to list of dicts with reasons

        for user in users:
            logger.info(f"Processing user {user.id} ({user.username}), is_superuser={user.is_superuser}")

            if user.is_superuser:
                logger.warning(f"Skipping user {user.id} - is superuser")
                failed_users.append({'id': user.id, 'reason': 'is_superuser'})
                continue

            # Check UserProfile existence
            has_profile = hasattr(user, 'profile')
            logger.info(f"User {user.id} has UserProfile: {has_profile}")

            # Check TL references
            italian_tl_count = UserProfile.objects.filter(italian_tl=user).count()
            albanian_tl_count = UserProfile.objects.filter(albanian_tl=user).count()
            logger.info(f"User {user.id} TL references: {italian_tl_count} Italian, {albanian_tl_count} Albanian")

            # Check team leader references
            team_leader_count = Team.objects.filter(team_leader=user).count()
            logger.info(f"User {user.id} team leader references: {team_leader_count}")

            try:
                # Clear TL references before deletion to avoid constraint violations
                UserProfile.objects.filter(italian_tl=user).update(italian_tl=None)
                UserProfile.objects.filter(albanian_tl=user).update(albanian_tl=None)

                # Clear team leader references
                Team.objects.filter(team_leader=user).update(team_leader=None)

                logger.info(f"Clearing references for user {user.id} complete, attempting deletion")
                user.delete()
                deleted_count += 1
                logger.info(f"User {user.id} deleted successfully")
            except Exception as e:
                logger.error(f"Failed to delete user {user.id}: {type(e).__name__}: {str(e)}")
                failed_users.append({'id': user.id, 'reason': f"{type(e).__name__}: {str(e)}"})

        logger.info(f"Bulk delete complete: {deleted_count} deleted, {len(failed_users)} failed")
        return Response({
            'deleted_count': deleted_count,
            'failed_users': failed_users,
            'total_requested': len(ids)
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser()])
    def create_user(self, request):
        """
        Admin creates a new user with profile in one call.
        Payload: {username, email, first_name, last_name, password, phone, team, albanian_tl, italian_tl, is_hr, is_italian_tl_role, is_albanian_tl_role, is_cr_admin}
        """
        from .services.user_creation import create_user_with_profile
        data = request.data
        required = ['username', 'email', 'password']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return Response({'error': f'Missing required fields: {", ".join(missing)}'}, status=status.HTTP_400_BAD_REQUEST)

        tech_ids = data.get('techs')
        if tech_ids is not None:
            if not isinstance(tech_ids, list):
                return Response({'error': 'techs must be an array of Tech IDs'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                tech_ids = [int(tech_id) for tech_id in tech_ids]
            except (TypeError, ValueError):
                return Response({'error': 'techs must contain only integers'}, status=status.HTTP_400_BAD_REQUEST)
            existing_tech_ids = set(Tech.objects.filter(id__in=tech_ids, is_active=True).values_list('id', flat=True))
            invalid_tech_ids = sorted(set(tech_ids) - existing_tech_ids)
            if invalid_tech_ids:
                return Response({'error': f'Unknown or inactive Tech IDs: {invalid_tech_ids}'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = create_user_with_profile(
                username=data['username'],
                email=data['email'],
                password=data['password'],
                first_name=data.get('first_name', ''),
                last_name=data.get('last_name', ''),
                phone=data.get('phone', ''),
                team=data.get('team'),
                teams=data.get('teams'),
                techs=data.get('techs'),
                albanian_tl_id=data.get('albanian_tl'),
                italian_tl_id=data.get('italian_tl'),
                is_hr=data.get('is_hr', False),
                is_italian_tl_role=data.get('is_italian_tl_role', False),
                is_albanian_tl_role=data.get('is_albanian_tl_role', False),
                is_cr_admin=data.get('is_cr_admin', False),
                roles=data.get('roles'),
            )
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['put', 'patch'], permission_classes=[IsAdminUser()])
    def update_user(self, request, pk=None):
        """
        Admin updates a user and their profile in one call.
        Payload: any of {email, first_name, last_name, phone, team, albanian_tl, italian_tl, is_hr, is_italian_tl_role, is_albanian_tl_role, is_cr_admin}
        """
        from .services.user_creation import _set_cr_admin_role, _sync_legacy_roles, _sync_roles
        user = self.get_object()
        data = request.data
        if 'email' in data:
            user.email = data['email']
        if 'first_name' in data:
            user.first_name = data['first_name']
        if 'last_name' in data:
            user.last_name = data['last_name']
        user.save()
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if 'phone' in data:
            profile.phone = data['phone']
        if 'teams' in data:
            profile.teams.set(data['teams'])
        if 'techs' in data:
            tech_ids = data['techs']
            if not isinstance(tech_ids, list):
                return Response({'error': 'techs must be an array of Tech IDs'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                tech_ids = [int(tech_id) for tech_id in tech_ids]
            except (TypeError, ValueError):
                return Response({'error': 'techs must contain only integers'}, status=status.HTTP_400_BAD_REQUEST)
            # Match serializer validate_techs: active Techs are always allowed;
            # inactive Techs are allowed only if already assigned to this user.
            existing_active_ids = set(
                Tech.objects.filter(id__in=tech_ids, is_active=True).values_list('id', flat=True)
            )
            already_assigned_ids = set(profile.techs.values_list('id', flat=True))
            valid_ids = existing_active_ids | {tid for tid in tech_ids if tid in already_assigned_ids}
            invalid_tech_ids = sorted(set(tech_ids) - valid_ids)
            if invalid_tech_ids:
                return Response({'error': f'Unknown or inactive Tech IDs: {invalid_tech_ids}'}, status=status.HTTP_400_BAD_REQUEST)
            profile.techs.set(tech_ids)
        if 'team' in data:
            # Backward compatibility: if single team provided, set as only team
            if data['team']:
                profile.teams.set([data['team']])
            else:
                profile.teams.clear()
        if 'albanian_tl' in data:
            profile.albanian_tl_id = data['albanian_tl'] if data['albanian_tl'] else None
        if 'italian_tl' in data:
            profile.italian_tl_id = data['italian_tl'] if data['italian_tl'] else None
        if 'hire_date' in data:
            profile.hire_date = data['hire_date'] or None
        # When 'roles' is provided, _sync_roles overwrites the legacy flags
        # below — skip the redundant direct set. Only set flags directly for
        # the legacy path (no 'roles' key in payload).
        if 'roles' not in data:
            if 'is_hr' in data:
                profile.is_hr_user = bool(data['is_hr'])
            if 'is_italian_tl_role' in data:
                profile.is_italian_tl_role = bool(data['is_italian_tl_role'])
            if 'is_albanian_tl_role' in data:
                profile.is_albanian_tl_role = bool(data['is_albanian_tl_role'])
        profile.save()
        if 'roles' in data:
            _sync_roles(user, data['roles'])
        else:
            _sync_legacy_roles(
                user,
                is_hr=bool(data['is_hr']) if 'is_hr' in data else None,
                is_italian_tl_role=(
                    bool(data['is_italian_tl_role'])
                    if 'is_italian_tl_role' in data else None
                ),
                is_albanian_tl_role=(
                    bool(data['is_albanian_tl_role'])
                    if 'is_albanian_tl_role' in data else None
                ),
            )
        if 'roles' in data:
            _set_cr_admin_role(user, active='cr_admin' in data['roles'])
        elif 'is_cr_admin' in data:
            _set_cr_admin_role(user, active=bool(data['is_cr_admin']))
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def my_team_members(self, request):
        """
        Get team members for the current user (TL-specific endpoint).
        Returns all users in the user's team(s).
        """
        user = request.user

        # Check if user is a TL, staff, or superuser
        is_tl = has_team_leader_role(user)

        if not is_tl and not user.is_staff and not user.is_superuser:
            return Response(
                {'error': 'Only team leaders can access this endpoint.'},
                status=status.HTTP_403_FORBIDDEN
            )

        current_date = timezone.localdate()
        start_of_month = current_date.replace(day=1)
        if current_date.month == 12:
            next_month = date(current_date.year + 1, 1, 1)
        else:
            next_month = date(current_date.year, current_date.month + 1, 1)

        profile = getattr(user, 'profile', None)
        if not profile:
            return Response([])

        try:
            target_user_ids = profile.get_team_member_ids()
        except (DatabaseError, OperationalError) as e:
            return Response(
                {'error': f'Database error retrieving team members: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        if not target_user_ids:
            return Response([])

        try:
            members = (
                UserProfile.objects.filter(user_id__in=target_user_ids)
                .select_related('user')
                .prefetch_related('teams', 'techs', 'team_memberships__team', 'user__user_groups__group', 'user__italian_team_members', 'user__albanian_team_members', 'user__led_teams')
                .annotate(
                    current_month_overtime_hours=Coalesce(
                        Sum(
                            'user__overtime_logs__hours',
                            filter=Q(
                                user__overtime_logs__status='approved',
                                user__overtime_logs__date__gte=start_of_month,
                                user__overtime_logs__date__lt=next_month,
                            ),
                        ),
                        models.Value(0),
                        output_field=models.DecimalField(max_digits=7, decimal_places=2),
                    ),
                    current_month_standby_hours=Coalesce(
                        Sum(
                            'user__standby_logs__hours',
                            filter=Q(
                                user__standby_logs__status='approved',
                                user__standby_logs__date__gte=start_of_month,
                                user__standby_logs__date__lt=next_month,
                            ),
                        ),
                        models.Value(0),
                        output_field=models.DecimalField(max_digits=7, decimal_places=2),
                    ),
                )
                .order_by('user__first_name', 'user__last_name', 'user__username')
                .distinct()
            )

            serializer = UserProfileSerializer(members, many=True)
            return Response(serializer.data)
        except (DatabaseError, OperationalError) as e:
            return Response(
                {'error': f'Database error retrieving team members: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def italian_team_members(self, request):
        """
        Get team members for a specific Italian TL.
        Query param: italian_tl_id (required)
        """
        italian_tl_id = request.query_params.get('italian_tl_id')

        if not italian_tl_id:
            return Response(
                {'error': 'italian_tl_id query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        members = (
            UserProfile.objects.filter(italian_tl_id=italian_tl_id)
            .select_related('user', 'italian_tl')
            .prefetch_related('teams', 'techs')
            .order_by('user__first_name', 'user__last_name', 'user__username')
        )

        serializer = UserProfileSerializer(members, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def stats(self, request):
        """
        Get user statistics for admin dashboard.
        Returns counts for total users, Italian TLs, Albanian TLs, users with no TL, and active today.
        """
        from django.utils import timezone
        
        current_date = timezone.localdate()
        
        # Total users
        total_users = User.objects.count()
        
        # Italian TL count (role flag OR has assigned members OR database role)
        italian_tl_count = User.objects.filter(
            Q(profile__is_italian_tl_role=True) |
            Q(profile__role_codes__icontains='italian_tl') |
            Q(italian_team_members__isnull=False)
        ).distinct().count()
        
        # Albanian TL count (role flag OR has assigned members OR database role)
        albanian_tl_count = User.objects.filter(
            Q(profile__is_albanian_tl_role=True) |
            Q(profile__role_codes__icontains='albanian_tl') |
            Q(albanian_team_members__isnull=False)
        ).distinct().count()
        
        # No TL count (neither role flag, database role, nor assigned TLs)
        no_tl_count = User.objects.filter(
            Q(profile__is_italian_tl_role=False) &
            Q(profile__is_albanian_tl_role=False) &
            ~Q(profile__role_codes__icontains='italian_tl') &
            ~Q(profile__role_codes__icontains='albanian_tl') &
            Q(profile__italian_tl__isnull=True) &
            Q(profile__albanian_tl__isnull=True)
        ).count()
        
        # Active today (users with last_login today)
        active_today_count = User.objects.filter(
            last_login__date=current_date
        ).count()
        
        return Response({
            'total_users': total_users,
            'italian_tl_count': italian_tl_count,
            'albanian_tl_count': albanian_tl_count,
            'no_tl_count': no_tl_count,
            'active_today_count': active_today_count
        })


class UserProfileViewSet(SuperuserPermissionMixin, StaffFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for UserProfile model.

    Provides CRUD operations for user profiles.
    Write operations restricted to admin users.
    """
    queryset = UserProfile.objects.all().select_related('user').prefetch_related('teams', 'techs', 'team_memberships__team', 'user__user_groups__group', 'user__italian_team_members', 'user__albanian_team_members', 'user__led_teams').order_by('-id')
    serializer_class = UserProfileSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'user__email']
    filterset_fields = ['albanian_tl', 'italian_tl', 'is_hr_user']

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers
        if self.action == 'destroy':
            return [IsAdminUser()]
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAdminOrReadOnly()]
        return [IsAuthenticated()]

    def filter_for_regular_user(self, queryset, user):
        """Scope visible profiles by role.

        CR admins (non-staff) see only profiles of users with active
        ControlRoomAccess — mirrors UserViewSet.filter_for_regular_user.
        HR sees all profiles. Everyone else sees only their own profile.
        """
        if is_cr_admin(user):
            try:
                from plugins.control_room.models import ControlRoomAccess
                cr_user_ids = ControlRoomAccess.objects.filter(
                    is_active=True
                ).values_list('user_id', flat=True)
                return queryset.filter(user_id__in=cr_user_ids)
            except Exception:
                logger.warning(
                    'CR admin user %s could not load ControlRoomAccess; '
                    'returning empty profile list.',
                    getattr(user, 'id', None),
                )
                return queryset.none()
        if has_hr_role(user):
            return queryset
        return queryset.filter(user=user)


class ApprovalPeriodViewSet(viewsets.ViewSet):
    """TL-controlled monthly approval-period close actions."""
    permission_classes = [IsAuthenticated]
    serializer_class = ApprovalPeriodSerializer

    def _require_scope(self, request):
        if not (
            request.user.is_staff
            or request.user.is_superuser
            or has_team_leader_role(request.user)
        ):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only team leaders and administrators can access approval periods.')

    @staticmethod
    def _parse_period(value):
        try:
            parsed = date.fromisoformat(value)
        except (TypeError, ValueError):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'period': 'Use a valid YYYY-MM-DD date.'})
        return parsed.replace(day=1)

    @staticmethod
    def _serialize_close(close):
        if close is None:
            return None
        return {
            'id': close.id,
            'period': close.period.isoformat(),
            'closed_at': close.closed_at.isoformat(),
            'closed_by': close.closed_by_id,
            'status': 'finalized',
            'affected_member_count': close.members.count(),
            'affected_team_count': close.members.exclude(source_team_id=None).values('source_team_id').distinct().count(),
        }

    @action(detail=False, methods=['get'])
    def status(self, request):
        self._require_scope(request)
        from apps.users.services.approval_periods import get_actor_close, next_period, normalize_period

        period = self._parse_period(request.query_params.get('period'))
        close = get_actor_close(request.user, period)
        return Response({
            'period': normalize_period(period).isoformat(),
            'requested_processing_period': next_period(normalize_period(period)).isoformat(),
            'status': 'finalized' if close else 'open',
            'close': self._serialize_close(close),
        })

    @action(detail=False, methods=['post'])
    def finalize(self, request):
        self._require_scope(request)
        from apps.users.services.approval_periods import finalize_period, next_period, normalize_period

        period = self._parse_period(request.data.get('period'))
        close, created = finalize_period(request.user, period)
        if created:
            try:
                from plugins.audit_log.signals import log_action
                log_action(
                    request.user,
                    'approval_period_finalize',
                    description=(
                        f'Finalized {normalize_period(period):%Y-%m} '
                        f'for managed scope; members={close.members.count()}'
                    ),
                    obj=close,
                    new_values={
                        'period': normalize_period(period).isoformat(),
                        'closed_at': close.closed_at.isoformat(),
                        'member_count': close.members.count(),
                    },
                )
            except Exception:
                logger.exception('Approval-period audit logging failed')
        data = self._serialize_close(close)
        data.update({
            'requested_processing_period': next_period(normalize_period(period)).isoformat(),
            'already_finalized': not created,
        })
        return Response(data, status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED)


class TechViewSet(viewsets.ModelViewSet):
    """CRUD endpoint for the independent technology catalog.

    Custom actions:
    - GET    /techs/:id/users/         — list users assigned to this tech.
    - POST   /techs/:id/add_users/     — add users (user_ids) to this tech.
    - POST   /techs/:id/remove_users/  — remove users (user_ids) from this tech.
    """

    queryset = Tech.objects.all().order_by('name')
    serializer_class = TechSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'code', 'description']
    filterset_fields = ['is_active']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy',
                           'add_users', 'remove_users']:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['get'], url_path='users')
    def list_users(self, request, pk=None):
        """List users assigned to this tech (paginated, lightweight)."""
        tech = self.get_object()
        members = (
            User.objects
            .filter(profile__techs=tech, is_active=True)
            .select_related('profile')
            .order_by('username')
        )
        page = self.paginate_queryset(members)
        if page is not None:
            data = [
                {
                    'id': u.id,
                    'username': u.username,
                    'email': u.email,
                    'full_name': u.get_full_name() or u.username,
                }
                for u in page
            ]
            return self.get_paginated_response(data)
        data = [
            {
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'full_name': u.get_full_name() or u.username,
            }
            for u in members
        ]
        return Response({'results': data, 'count': len(data)})

    @action(detail=True, methods=['post'], url_path='add_users')
    def add_users(self, request, pk=None):
        """Add users to this tech. Idempotent — skips existing members."""
        tech = self.get_object()
        user_ids = request.data.get('user_ids', [])
        if not isinstance(user_ids, list):
            return Response(
                {'detail': 'user_ids must be a list of integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user_ids = [int(uid) for uid in user_ids]
        except (TypeError, ValueError):
            return Response(
                {'detail': 'user_ids must contain only integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        existing = set(
            User.objects
            .filter(profile__techs=tech, id__in=user_ids)
            .values_list('id', flat=True)
        )
        new_ids = [uid for uid in user_ids if uid not in existing]
        if not new_ids:
            return Response({'added': 0})
        users = User.objects.filter(id__in=new_ids)
        found_ids = set(users.values_list('id', flat=True))
        missing = set(new_ids) - found_ids
        if missing:
            return Response(
                {'detail': f'Unknown user IDs: {sorted(missing)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for user in users:
            user.profile.techs.add(tech)
        return Response({'added': len(new_ids)})

    @action(detail=True, methods=['post'], url_path='remove_users')
    def remove_users(self, request, pk=None):
        """Remove users from this tech. Idempotent."""
        tech = self.get_object()
        user_ids = request.data.get('user_ids', [])
        if not isinstance(user_ids, list):
            return Response(
                {'detail': 'user_ids must be a list of integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user_ids = [int(uid) for uid in user_ids]
        except (TypeError, ValueError):
            return Response(
                {'detail': 'user_ids must contain only integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Bulk-remove via the M2M through model (single DELETE instead of N).
        profile_ids = list(
            UserProfile.objects.filter(techs=tech, user_id__in=user_ids)
            .values_list('id', flat=True)
        )
        if profile_ids:
            UserProfile.techs.through.objects.filter(
                tech=tech, userprofile_id__in=profile_ids
            ).delete()
        return Response({'removed': len(profile_ids)})


class TeamViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for Team model.

    Provides CRUD operations for teams and team hierarchy.
    Write operations restricted to admin users.
    """
    serializer_class = TeamSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'code', 'description']
    filterset_fields = ['calendar_group']
    lookup_field = 'pk'

    def get_queryset(self):
        """
        Return queryset with annotations for team stats.
        """
        queryset = Team.objects.all().select_related('team_leader', 'parent_team').annotate(
            sub_teams_count_annotated=Count('sub_teams', distinct=True),
            members_count_annotated=Count('members', distinct=True),
        ).order_by('name')

        calendar_group_param = self.request.query_params.get('calendar_group')
        has_calendar_group = self.request.query_params.get('has_calendar_group')

        if calendar_group_param:
            queryset = queryset.filter(calendar_group=calendar_group_param.strip())
        elif has_calendar_group is not None:
            normalized = has_calendar_group.strip().lower()
            if normalized in {'true', '1', 'yes'}:
                queryset = queryset.exclude(calendar_group__isnull=True).exclude(calendar_group='')
            elif normalized in {'false', '0', 'no'}:
                queryset = queryset.filter(models.Q(calendar_group__isnull=True) | models.Q(calendar_group=''))

        return queryset

    @action(detail=False, methods=['get'])
    def list_for_reports(self, request):
        """
        Return simplified team list for HR report filters.
        Includes id, name, code, and member count.
        """
        from rest_framework.response import Response
        from apps.users.serializers import TeamSerializer

        queryset = Team.objects.all().annotate(
            members_count=Count('members', distinct=True)
        ).order_by('name')

        serializer = TeamSerializer(queryset, many=True)
        data = [
            {
                'id': team['id'],
                'name': team['name'],
                'code': team['code'],
                'members_count': team.get('members_count', 0)
            }
            for team in serializer.data
        ]
        return Response(data)

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers
        if self.action in [
            'create', 'update', 'partial_update', 'destroy',
            'bulk_update_calendar_group', 'rename_calendar_group',
            'clear_calendar_group',
        ]:
            return [IsAdminUser()]
        return [IsAuthenticated()]
    
    @action(detail=True, methods=['get'])
    def hierarchy(self, request, pk=None):
        """
        Get the full team hierarchy including sub-teams.
        """
        team = self.get_object()
        serializer = TeamHierarchySerializer(team)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        """
        Get all members of this team.

        If the team belongs to a shared calendar group, also include members of
        the other teams in that group. This keeps the calendar view in sync for
        teams that share a calendar visibility scope.
        """
        team = self.get_object()
        target_team_ids = {team.id}

        for sub_team in team.get_all_sub_teams():
            target_team_ids.add(sub_team.id)

        if team.calendar_group:
            target_team_ids.update(
                Team.objects.filter(calendar_group=team.calendar_group)
                .values_list('id', flat=True)
            )

        members = (
            UserProfile.objects.filter(teams__in=target_team_ids)
            .select_related('user')
            .prefetch_related('teams', 'techs')
            .order_by('user__first_name', 'user__last_name', 'user__username')
            .distinct()
        )
        serializer = UserProfileSerializer(members, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def root_teams(self, request):
        """
        Get all root teams (teams without parent).
        """
        root_teams = Team.objects.filter(parent_team__isnull=True)
        serializer = self.get_serializer(root_teams, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def calendar_groups(self, request):
        """
        Get all distinct calendar_group values in use, with team counts.
        """
        from django.db.models import Count
        groups = (
            Team.objects.exclude(calendar_group='')
            .values('calendar_group')
            .annotate(team_count=Count('id'))
            .order_by('calendar_group')
        )
        return Response(list(groups))

    @action(detail=False, methods=['get'])
    def calendar_group_stats(self, request):
        """
        Return statistics for calendar groups:
        - active_groups: count of distinct calendar_group values
        - teams_grouped: count of teams with calendar_group set
        - teams_ungrouped: count of teams without calendar_group
        - groups: list of groups with team counts
        """
        from django.db.models import Count, Q

        total_teams = Team.objects.count()
        teams_grouped = Team.objects.exclude(
            Q(calendar_group__isnull=True) | Q(calendar_group='')
        ).count()
        teams_ungrouped = total_teams - teams_grouped

        groups = (
            Team.objects.exclude(calendar_group='')
            .values('calendar_group')
            .annotate(team_count=Count('id'))
            .order_by('calendar_group')
        )

        return Response({
            'active_groups': groups.count(),
            'teams_grouped': teams_grouped,
            'teams_ungrouped': teams_ungrouped,
            'total_teams': total_teams,
            'groups': list(groups)
        })

    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser])
    def bulk_update_calendar_group(self, request):
        """
        Bulk update calendar_group for selected teams.
        Request body: { team_ids: [1, 2, 3], calendar_group: "msc_siae" }
        """
        team_ids = request.data.get('team_ids', [])
        calendar_group = request.data.get('calendar_group', '')

        if not team_ids:
            return Response({'error': 'team_ids required'}, status=400)

        updated = Team.objects.filter(id__in=team_ids).update(calendar_group=calendar_group)

        return Response({
            'updated_count': updated,
            'calendar_group': calendar_group
        })

    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser])
    def rename_calendar_group(self, request):
        """
        Rename a calendar group for all teams.
        Request body: { old_name: "msc_siae", new_name: "msc_siae_v2" }
        """
        old_name = request.data.get('old_name')
        new_name = request.data.get('new_name')

        if not old_name or not new_name:
            return Response({'error': 'old_name and new_name required'}, status=400)

        updated = Team.objects.filter(calendar_group=old_name).update(calendar_group=new_name)

        return Response({'updated_count': updated})

    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser])
    def clear_calendar_group(self, request):
        """
        Clear calendar_group for all teams with a specific group value.
        Request body: { calendar_group: "msc_siae" }
        """
        calendar_group = request.data.get('calendar_group')

        if not calendar_group:
            return Response({'error': 'calendar_group required'}, status=400)

        updated = Team.objects.filter(calendar_group=calendar_group).update(calendar_group='')

        return Response({'updated_count': updated})
