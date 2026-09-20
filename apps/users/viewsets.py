"""
Users app viewsets.

This module contains DRF viewsets for User, UserProfile, and Team models.
"""

import logging
from datetime import date

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.pagination import PageNumberPagination
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
from .models import Tech, TechLevel, Team, UserProfile, UserTech
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    TechSerializer,
    TechLevelSerializer,
    TeamSerializer,
    TeamHierarchySerializer,
    ApprovalPeriodSerializer,
)
from .services.tech_assignments import (
    TechAssignmentError,
    apply_tech_assignments,
    normalize_tech_payload,
    set_tech_assignments,
    validate_tech_assignments,
)
from core.mixins.permissions import (
    SuperuserPermissionMixin,
    StaffFilterMixin,
    HRReadOnlyMixin,
    IsCRAdminOrStaff,
    IsHR,
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
    queryset = User.objects.all().select_related('profile').prefetch_related('profile__teams', 'profile__techs', 'profile__tech_assignments__tech', 'profile__tech_assignments__level', 'profile__team_memberships__team', 'profile__clients', 'italian_team_members', 'albanian_team_members', 'led_teams', 'user_roles__role', 'control_room_access').order_by('username')
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
        """TL/admin assign: set a team member's full client set (multi-select).

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
            # Accepts plain ids or {tech, level} objects — see
            # services.tech_assignments.normalize_tech_payload. The inactive-Tech
            # rule is per user (it depends on what each already holds), so it is
            # applied inside the loop below, not here.
            try:
                tech_entries = normalize_tech_payload(data['techs'])
                validate_tech_assignments(tech_entries, check_inactive=False)
            except TechAssignmentError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        else:
            tech_entries = None

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
        from apps.permissions.services.role_service import find_blocked_tl_revocations_bulk

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

            # Block revoking a TL role (True -> False) while another
            # profile's italian_tl/albanian_tl FK still points at this
            # user — that FK is how is_team_leader is actually computed
            # (apps.users.models.core.UserProfile), so leaving it dangling
            # would keep the revoked user functioning as TL for whoever
            # still points at them. Reject the whole request (matches this
            # endpoint's existing all-or-nothing validation style) rather
            # than partially applying it.
            new_state = {}
            if data.get('is_italian_tl_role') is False:
                new_state['italian_tl'] = False
            if data.get('is_albanian_tl_role') is False:
                new_state['albanian_tl'] = False
            blocked_revocations = (
                find_blocked_tl_revocations_bulk(
                    [profile.user for profile in profiles], new_state
                )
                if new_state
                else []
            )
            if blocked_revocations:
                summary = '; '.join(
                    f"{b['username']} ({b['role']}): still assigned to "
                    f"{', '.join(d['username'] for d in b['dependents'])}"
                    for b in blocked_revocations
                )
                return Response(
                    {
                        'error': (
                            'Cannot revoke TL role while other users are still '
                            'assigned to them: ' + summary
                        ),
                        'blocked_revocations': blocked_revocations,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # One query for every target's current Techs, so the per-user
            # inactive-Tech check below costs nothing extra.
            assigned_by_profile = {}
            if tech_entries is not None:
                for row in UserTech.objects.filter(
                    user_profile__in=profiles
                ).values_list('user_profile_id', 'tech_id'):
                    assigned_by_profile.setdefault(row[0], set()).add(row[1])

            for profile in profiles:
                if team_ids is not None:
                    profile.teams.set(team_ids)
                if tech_entries is not None:
                    try:
                        validate_tech_assignments(
                            tech_entries,
                            profile=profile,
                            already_assigned_ids=assigned_by_profile.get(profile.id, set()),
                        )
                    except TechAssignmentError as exc:
                        return Response(
                            {'error': f'{profile.user.username}: {exc}'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    apply_tech_assignments(
                        profile, tech_entries, assigned_by=request.user
                    )
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

        if data.get('techs') is not None:
            try:
                # A brand-new user has no existing assignments, so inactive
                # Techs are rejected outright.
                validate_tech_assignments(
                    normalize_tech_payload(data['techs']), for_new_user=True
                )
            except TechAssignmentError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

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
        from apps.permissions.services.role_service import find_blocked_tl_revocations
        user = self.get_object()
        data = request.data

        # Block revoking a TL role (True -> False) while another profile's
        # italian_tl/albanian_tl FK still points at this user — see
        # find_blocked_tl_revocations for the full rationale. Must cover
        # BOTH ways this endpoint can revoke: the legacy is_italian_tl_role/
        # is_albanian_tl_role booleans, and the newer `roles` array (the
        # actual live edit-user form sends both together, with `roles`
        # taking priority — see _sync_roles below). A role_code omitted
        # from new_state is "not touched by this request" and is never
        # checked.
        profile_for_check = getattr(user, 'profile', None)
        if 'roles' in data:
            requested_roles = set(data['roles'] or [])
            new_state = {
                'italian_tl': 'italian_tl' in requested_roles,
                'albanian_tl': 'albanian_tl' in requested_roles,
            }
        else:
            new_state = {}
            if 'is_italian_tl_role' in data:
                new_state['italian_tl'] = bool(data['is_italian_tl_role'])
            if 'is_albanian_tl_role' in data:
                new_state['albanian_tl'] = bool(data['is_albanian_tl_role'])
        blocked_revocations = (
            find_blocked_tl_revocations(user, new_state)
            if profile_for_check and new_state
            else []
        )
        if blocked_revocations:
            summary = '; '.join(
                f"{b['role']}: still assigned to "
                f"{', '.join(d['username'] for d in b['dependents'])}"
                for b in blocked_revocations
            )
            return Response(
                {
                    'error': (
                        'Cannot revoke TL role while other users are still '
                        'assigned to them: ' + summary
                    ),
                    'blocked_revocations': blocked_revocations,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            # Passing the profile keeps the pre-existing rule: an inactive Tech
            # is allowed only when this user already has it assigned.
            try:
                set_tech_assignments(profile, data['techs'], assigned_by=request.user)
            except TechAssignmentError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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


class UserProfilePagination(PageNumberPagination):
    """The Admin Users table has no pager UI — it renders whatever the list
    endpoint returns as the full result set. The default site-wide page size
    (50) silently truncated any org above that, with the truncation
    invisible to the user. 200 comfortably covers realistic org headcount;
    `page_size` stays overridable for callers that do want to page."""
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 1000


class UserProfileViewSet(SuperuserPermissionMixin, StaffFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for UserProfile model.

    Provides CRUD operations for user profiles.
    Write operations restricted to admin users.
    """
    # teams__team_leader__profile__tech_assignments: teams_detail nests
    # TeamSerializer, whose team_leader is a UserSerializer — and its get_techs
    # reaches leader.profile. Without this the leader's Tech read is one query
    # per team-with-a-leader on every page.
    queryset = UserProfile.objects.all().select_related('user').prefetch_related('teams', 'techs', 'tech_assignments__tech', 'tech_assignments__level', 'teams__team_leader__profile__tech_assignments__tech', 'teams__team_leader__profile__tech_assignments__level', 'team_memberships__team', 'user__user_groups__group', 'user__italian_team_members', 'user__albanian_team_members', 'user__led_teams').order_by('-id')
    serializer_class = UserProfileSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'user__email']
    filterset_fields = ['albanian_tl', 'italian_tl', 'is_hr_user']
    pagination_class = UserProfilePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = self._apply_role_filter(queryset, self.request.query_params.get('role'))
        # Team is orthogonal to the tech facet counts (unlike tech/no_tech
        # below), so it narrows the queryset even during tech_facets — picking
        # Infrastructure should scope the per-tech counts to that team too.
        team_ids = self._id_list_param('team')
        if team_ids:
            queryset = queryset.filter(teams__id__in=team_ids).distinct()
        # tech_facets counts each tech (and no-tech) against this same
        # queryset, so the `tech`/`no_tech` params there select what to
        # count, not which profiles to keep — applying them here would
        # zero out every sibling count.
        if self.action != 'tech_facets':
            if self.request.query_params.get('no_tech', '').lower() == 'true':
                queryset = queryset.filter(techs__isnull=True)
            else:
                queryset = self._apply_tech_filters(queryset)
        return queryset

    def _apply_tech_filters(self, queryset):
        """Filter by Tech and by the level held in it.

        Tech, level and minimum rank are combined inside ONE
        ``tech_assignments`` lookup so they all have to match the same
        assignment row. Split across separate ``.filter()`` calls, an
        Infrastructure L3 who is also a Database junior would wrongly answer
        "Database at rank >= 2".
        """
        conditions = Q()
        tech_ids = self._id_list_param('tech')
        if tech_ids:
            conditions &= Q(tech_assignments__tech_id__in=tech_ids)
        level_ids = self._id_list_param('tech_level')
        if level_ids:
            conditions &= Q(tech_assignments__level_id__in=level_ids)
        min_rank = self.request.query_params.get('min_tech_level_rank')
        if min_rank:
            # Never silently drop it: an ignored filter returns the full list,
            # which reads as "nothing was excluded" and hides the mistake.
            try:
                parsed_rank = int(min_rank)
            except (TypeError, ValueError):
                raise DRFValidationError(
                    {'min_tech_level_rank': 'Must be a positive integer.'}
                )
            if parsed_rank < 1:
                raise DRFValidationError(
                    {'min_tech_level_rank': 'Must be a positive integer.'}
                )
            conditions &= Q(tech_assignments__level__rank__gte=parsed_rank)
        if not conditions:
            return queryset
        return queryset.filter(conditions).distinct()

    def _id_list_param(self, key):
        """Accept both repeated (`?tech=1&tech=2`) and comma-joined
        (`?tech=1,2`) forms — the frontend sends the latter since axios'
        default array serialization (`tech[]=1`) doesn't match DRF's
        `getlist('tech')` key."""
        ids = []
        for value in self.request.query_params.getlist(key):
            ids.extend(part for part in value.split(',') if part)
        return ids

    def _tech_ids_param(self):
        """Back-compat alias — callers outside this class still use it."""
        return self._id_list_param('tech')

    def _apply_role_filter(self, queryset, role):
        """Server-side equivalent of the Admin Users role tabs (UserFilterTabs)."""
        if role == 'italian_tl':
            return queryset.filter(
                Q(is_italian_tl_role=True)
                | Q(role_codes__icontains='italian_tl')
                | Q(user__italian_team_members__isnull=False)
            ).distinct()
        if role == 'albanian_tl':
            return queryset.filter(
                Q(is_albanian_tl_role=True)
                | Q(role_codes__icontains='albanian_tl')
                | Q(user__albanian_team_members__isnull=False)
            ).distinct()
        if role == 'no_tl':
            return queryset.filter(
                Q(is_italian_tl_role=False)
                & Q(is_albanian_tl_role=False)
                & ~Q(role_codes__icontains='italian_tl')
                & ~Q(role_codes__icontains='albanian_tl')
                & Q(italian_tl__isnull=True)
                & Q(albanian_tl__isnull=True)
            )
        return queryset

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def tech_facets(self, request):
        """Live per-tech profile counts for the Admin Users tech-filter chips.

        Scoped by the currently active role tab and search term (same as the
        main list), but NOT by other selected tech chips — a faceted-search
        selection on one tech must not zero out the sibling counts.
        """
        queryset = self.filter_queryset(self.get_queryset())
        profile_ids = list(queryset.values_list('id', flat=True))
        tech_counts = (
            Tech.objects.filter(is_active=True)
            .annotate(profile_count=Count('users', filter=Q(users__id__in=profile_ids), distinct=True))
            .values('id', 'name', 'code', 'profile_count')
        )
        levels_by_tech, ungraded_by_tech = self._level_facets(profile_ids)
        facets = [
            {
                'id': row['id'],
                'name': row['name'],
                'code': row['code'],
                'count': row['profile_count'],
                'levels': levels_by_tech.get(row['id'], []),
                'no_level_count': ungraded_by_tech.get(row['id'], 0),
            }
            for row in tech_counts
        ]
        no_tech_count = queryset.filter(techs__isnull=True).distinct().count()
        return Response({'techs': facets, 'no_tech_count': no_tech_count})

    def _level_facets(self, profile_ids):
        """Per-level counts plus an ungraded count, keyed by tech id.

        Two aggregate queries for the whole chip grid, not one per level.
        Every active level is returned even at zero so a chip never vanishes
        mid-filter.
        """
        level_counts = (
            TechLevel.objects.filter(is_active=True, tech__is_active=True)
            .annotate(profile_count=Count(
                'assignments',
                filter=Q(assignments__user_profile_id__in=profile_ids),
                distinct=True,
            ))
            .order_by('tech_id', 'rank')
            .values('id', 'tech_id', 'name', 'code', 'rank', 'profile_count')
        )
        levels_by_tech = {}
        for row in level_counts:
            levels_by_tech.setdefault(row['tech_id'], []).append({
                'id': row['id'],
                'name': row['name'],
                'code': row['code'],
                'rank': row['rank'],
                'count': row['profile_count'],
            })

        ungraded = (
            UserTech.objects
            .filter(user_profile_id__in=profile_ids, level__isnull=True)
            .values('tech_id')
            .annotate(total=Count('id'))
        )
        ungraded_by_tech = {row['tech_id']: row['total'] for row in ungraded}
        return levels_by_tech, ungraded_by_tech

    @action(detail=True, methods=['post'], url_path='set_team_leader')
    def set_team_leader(self, request, pk=None):
        """HR/admin: set or clear which TL an existing employee reports to.

        Payload: {role: 'italian_tl'|'albanian_tl', team_leader_user_id: int|null}.
        Writes only the employee's own italian_tl/albanian_tl FK — never
        touches is_italian_tl_role/is_albanian_tl_role (that's a TL's own
        role grant/revoke, handled by bulk_update/update_user, including the
        dependents cascade block there). Narrowly scoped on purpose: HR gets
        exactly this one capability, not full user-management write access.
        """
        profile = self.get_object()
        role = request.data.get('role')
        if role not in ('italian_tl', 'albanian_tl'):
            return Response(
                {'error': "role must be 'italian_tl' or 'albanian_tl'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_leader_id = request.data.get('team_leader_user_id')
        if raw_leader_id in (None, ''):
            setattr(profile, f'{role}_id', None)
            profile.save(update_fields=[f'{role}_id'])
            return Response(UserProfileSerializer(profile).data)

        try:
            leader_id = int(raw_leader_id)
        except (TypeError, ValueError):
            return Response(
                {'error': 'team_leader_user_id must be an integer or null'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        leader_profile = UserProfile.objects.filter(user_id=leader_id).select_related('user').first()
        is_valid_tl = leader_profile is not None and (
            leader_profile.is_italian_tl if role == 'italian_tl' else leader_profile.is_albanian_tl
        )
        if not is_valid_tl:
            return Response(
                {'error': f'User {leader_id} is not currently an active {role} team leader'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        setattr(profile, f'{role}_id', leader_id)
        profile.save(update_fields=[f'{role}_id'])
        return Response(UserProfileSerializer(profile).data)

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers
        if self.action == 'destroy':
            return [IsAdminUser()]
        if self.action in ['create', 'update', 'partial_update']:
            return [IsAdminOrReadOnly()]
        if self.action == 'set_team_leader':
            return [IsHR()]
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
    - POST   /techs/:id/add_users/     — add users (user_ids, optional level).
    - POST   /techs/:id/remove_users/  — remove users (user_ids) from this tech.
    - POST   /techs/:id/reorder_levels/ — rewrite the level ranks in one go.
    """

    queryset = Tech.objects.all().prefetch_related('levels').order_by('name')
    serializer_class = TechSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'code', 'description']
    filterset_fields = ['is_active']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy',
                           'add_users', 'remove_users', 'reorder_levels']:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['post'], url_path='reorder_levels')
    def reorder_levels(self, request, pk=None):
        """Rewrite every level rank for this Tech from the given order.

        One transaction, and the full list is required: a partial list would
        leave the omitted levels holding stale ranks. Ranks are written to a
        temporary high offset first because ``(tech, rank)`` is unique and the
        old and new orderings overlap mid-update.
        """
        tech = self.get_object()
        level_ids = request.data.get('level_ids', [])
        if not isinstance(level_ids, list):
            return Response(
                {'detail': 'level_ids must be a list of integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            level_ids = [int(lid) for lid in level_ids]
        except (TypeError, ValueError):
            return Response(
                {'detail': 'level_ids must contain only integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(set(level_ids)) != len(level_ids):
            return Response(
                {'detail': 'level_ids must not contain duplicates.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        owned_ids = set(tech.levels.values_list('id', flat=True))
        if set(level_ids) != owned_ids:
            return Response(
                {'detail': 'level_ids must list every level of this Tech exactly once.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Offset from the highest existing RANK, not the highest level id: ids
        # and ranks are unrelated, and an id-derived offset can land on a rank
        # that is still in use and trip tech_level_rank_unique mid-reorder.
        highest_rank = tech.levels.aggregate(top=models.Max('rank'))['top'] or 0
        offset = highest_rank + 1
        with transaction.atomic():
            for index, level_id in enumerate(level_ids):
                TechLevel.objects.filter(id=level_id).update(rank=offset + index)
            for index, level_id in enumerate(level_ids, start=1):
                TechLevel.objects.filter(id=level_id).update(rank=index)
        return Response({'reordered': len(level_ids)})

    @action(detail=True, methods=['get'], url_path='users')
    def list_users(self, request, pk=None):
        """List users assigned to this tech with the level each holds."""
        tech = self.get_object()
        members = (
            User.objects
            .filter(profile__techs=tech, is_active=True)
            .select_related('profile')
            .order_by('username')
        )
        page = self.paginate_queryset(members)
        rows = page if page is not None else members
        levels = self._member_levels(tech, rows)
        data = [
            {
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'full_name': u.get_full_name() or u.username,
                'level': levels.get(u.id),
            }
            for u in rows
        ]
        if page is not None:
            return self.get_paginated_response(data)
        return Response({'results': data, 'count': len(data)})

    @staticmethod
    def _member_levels(tech, users):
        """Map user id to their level payload in this tech — one query."""
        assignments = (
            UserTech.objects
            .filter(tech=tech, user_profile__user__in=[u.id for u in users])
            .select_related('level', 'user_profile')
        )
        return {
            assignment.user_profile.user_id: (
                {
                    'id': assignment.level.id,
                    'name': assignment.level.name,
                    'code': assignment.level.code,
                    'rank': assignment.level.rank,
                }
                if assignment.level_id and assignment.level.is_active
                else None
            )
            for assignment in assignments
        }

    @action(detail=True, methods=['post'], url_path='add_users')
    def add_users(self, request, pk=None):
        """Add users to this tech, optionally at a level.

        Idempotent on membership. When a ``level`` is supplied it is applied to
        every listed user, including ones already in the tech — that is how the
        members dialog re-grades an existing member.
        """
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

        raw_level = request.data.get('level')
        level = None
        if raw_level is not None:
            try:
                level = TechLevel.objects.select_related('tech').get(id=int(raw_level))
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'level must be an integer id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except TechLevel.DoesNotExist:
                return Response(
                    {'detail': f'Unknown Tech level id: {raw_level}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if level.tech_id != tech.id:
                return Response(
                    {'detail': f"Level '{level.code}' belongs to {level.tech.code}, "
                               f'not {tech.code}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        existing = set(
            User.objects
            .filter(profile__techs=tech, id__in=user_ids)
            .values_list('id', flat=True)
        )
        new_ids = [uid for uid in user_ids if uid not in existing]
        users = User.objects.filter(id__in=user_ids).select_related('profile')
        found_ids = set(users.values_list('id', flat=True))
        missing = set(user_ids) - found_ids
        if missing:
            return Response(
                {'detail': f'Unknown user IDs: {sorted(missing)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        regraded = 0
        with transaction.atomic():
            for user in users:
                # assigned_at/assigned_by are stamped on every write, matching
                # apply_tech_assignments — the field must not mean two things.
                defaults = {'assigned_at': now, 'assigned_by': request.user}
                if level is not None:
                    defaults['level'] = level
                assignment, created = UserTech.objects.update_or_create(
                    user_profile=user.profile, tech=tech, defaults=defaults,
                )
                if not created and level is not None:
                    regraded += 1
        # 'added' counts new members only; a re-grade is a different outcome and
        # reporting it as 0 work done would be misleading.
        return Response({'added': len(new_ids), 'regraded': regraded})

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
        # Bulk-remove via the through model (single DELETE instead of N).
        profile_ids = list(
            UserProfile.objects.filter(techs=tech, user_id__in=user_ids)
            .values_list('id', flat=True)
        )
        if profile_ids:
            UserTech.objects.filter(
                tech=tech, user_profile_id__in=profile_ids
            ).delete()
        return Response({'removed': len(profile_ids)})


class TechLevelViewSet(viewsets.ModelViewSet):
    """CRUD for the per-Tech level scale (Infrastructure L1/L2/L3).

    Reads are open to any authenticated user because level chips and badges
    render across the app; writes are admin-only, matching TechViewSet.
    """

    queryset = TechLevel.objects.all().select_related('tech').order_by('tech__name', 'rank')
    serializer_class = TechLevelSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'code', 'description']
    filterset_fields = ['tech', 'is_active']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdminUser()]
        return [IsAuthenticated()]


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

    def _reject_calendar_group_write_from_hr(self, serializer):
        # calendar_group sharing is deliberately admin-only
        # (bulk_update_calendar_group/rename_calendar_group/clear_calendar_group
        # stay IsAdminUser-gated) — a plain HR grantee must not reach the
        # same effect one team at a time through create/update.
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return
        if 'calendar_group' in serializer.validated_data:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only admin users can change a team\'s calendar group.')

    def perform_create(self, serializer):
        self._reject_calendar_group_write_from_hr(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self._reject_calendar_group_write_from_hr(serializer)
        serializer.save()

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers.
        # HR gets create/update (needed for the HR-native /hr/teams page);
        # destroy and the bulk cross-team calendar-group actions stay
        # admin/superuser-only (IsHR already admits is_staff/is_superuser).
        if self.action in ('create', 'update', 'partial_update'):
            return [IsHR()]
        if self.action in (
            'destroy', 'bulk_update_calendar_group', 'rename_calendar_group',
            'clear_calendar_group',
        ):
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
