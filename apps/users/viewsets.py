"""
Users app viewsets.

This module contains DRF viewsets for User, UserProfile, and Team models.
"""

import logging
from datetime import date

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError as DRFValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from .permissions import IsAdminOrReadOnly
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import FieldError, ValidationError as DjangoValidationError
from django.db import DatabaseError, models, transaction
from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.db.utils import OperationalError
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from core.services.lifecycle import record_lifecycle_event
from core.utils import get_client_ip
from .models import Tech, TechLevel, Team, UserProfile, UserTech
from .models.core import normalize_calendar_group
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    TechSerializer,
    TechLevelSerializer,
    TeamSerializer,
    TeamHierarchySerializer,
    ApprovalPeriodSerializer,
    HbprAlbanianTlAssignmentSerializer,
)
from .services.hbpr_scope import get_hbpr_scope
from .services.profile_loading import with_profile_list_loading
from .services import team_lifecycle
from .services.orphan_check import find_orphans
from .services.team_suggestions import suggest_team_moves
from .services.team_membership import change_user_teams, tl_link_followup
from .services.team_leaders import derive_team_tls
from .services.tokens import revoke_refresh_tokens
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
    is_staff_user,
)
from core.pagination import LargeResultsPagination
from core.utils.timezone_local import business_today

logger = logging.getLogger(__name__)


PROTECTED_RECORD_DETAIL = (
    'This user is referenced by records that must be kept '
    '(payroll lines or an HBPR assignment). Deactivate the user instead.'
)


class ProtectedRecordConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = PROTECTED_RECORD_DETAIL
    default_code = 'protected'


class UserViewSet(HRReadOnlyMixin, StaffFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for User model.
    
    Provides read access to all users, write access restricted to admin.
    """
    queryset = User.objects.all().select_related('profile').prefetch_related('profile__teams', 'profile__techs', 'profile__tech_assignments__tech', 'profile__tech_assignments__level', 'profile__team_memberships__team', 'profile__clients', 'italian_team_members', 'albanian_team_members', 'led_teams', 'user_roles__role', 'control_room_access').order_by('username')
    # Admin pickers (HBPR assignments, leave requests) ask for ?page_size=500.
    pagination_class = LargeResultsPagination
    serializer_class = UserSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['username', 'email', 'first_name', 'last_name', 'profile__code']
    filterset_fields = ['is_active', 'is_staff']

    def get_permissions(self):
        if self.action == 'eligible_for_control_room':
            return [IsCRAdminOrStaff()]
        # Every action that writes roles, TL links, credentials or accounts must be
        # listed here: this method overrides the per-@action permission_classes,
        # so an action missing from this list is open to any authenticated user.
        if self.action in [
            'destroy', 'bulk_delete', 'bulk_update',
            'create_user', 'update_user', 'reset_password', 'reset_mfa', 'mfa_status',
            # Company-wide headcount and TL counts: TL management data, not for employees.
            'stats',
        ]:
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
        hbpr_scope = get_hbpr_scope(user)
        if hbpr_scope is not None:
            return queryset.filter(Q(id=user.id) | Q(id__in=hbpr_scope.user_ids))
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

    @staticmethod
    def _tl_directory_access(request):
        """Team confidentiality: TL names for staff/HR/TLs, member counts for staff/HR only.

        Returns whether member counts may be shown; raises 403 for everyone else.
        """
        user = request.user
        if user.is_staff or user.is_superuser or has_hr_role(user):
            return True
        if has_team_leader_role(user):
            return False
        raise PermissionDenied()

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def italian_team_leaders(self, request):
        """
        Get all users who are Italian team leaders, with their member counts.
        Includes users with the role flag OR users with team members assigned.
        Staff and HR only get member counts; team leaders get names; others are refused.
        """
        from django.db.models import Q
        show_counts = self._tl_directory_access(request)
        queryset = User.objects.filter(
            Q(profile__is_italian_tl_role=True) |
            Q(profile__role_codes__icontains='italian_tl')
        ).filter(is_staff=False, is_superuser=False).distinct().annotate(
            member_count=Count('italian_team_members', distinct=True)
        ).select_related('profile').prefetch_related('profile__team_memberships__team')

        results = []
        for u in queryset:
            row = {
                'id': u.id,
                'username': u.username,
                'full_name': f"{u.first_name} {u.last_name}".strip() or u.username,
            }
            if show_counts:
                primary_team = u.profile.get_primary_team() if hasattr(u, 'profile') else None
                row['team_name'] = primary_team.name if primary_team else None
                row['member_count'] = u.member_count
            results.append(row)
        
        return Response(results)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated()])
    def albanian_team_leaders(self, request):
        """
        Get all users who are Albanian team leaders, with their member counts.
        Includes users with the role flag OR users with team members assigned.
        Staff and HR only get member counts; team leaders get names; others are refused.
        """
        from django.db.models import Q
        show_counts = self._tl_directory_access(request)
        queryset = User.objects.filter(
            Q(profile__is_albanian_tl_role=True) |
            Q(profile__role_codes__icontains='albanian_tl')
        ).filter(is_staff=False, is_superuser=False).distinct().annotate(
            member_count=Count('albanian_team_members', distinct=True)
        ).select_related('profile').prefetch_related('profile__team_memberships__team')

        results = []
        for u in queryset:
            row = {
                'id': u.id,
                'username': u.username,
                'full_name': f"{u.first_name} {u.last_name}".strip() or u.username,
            }
            if show_counts:
                primary_team = u.profile.get_primary_team() if hasattr(u, 'profile') else None
                row['team_name'] = primary_team.name if primary_team else None
                row['member_count'] = u.member_count
            results.append(row)
        
        return Response(results)

    @staticmethod
    def _invalid_leader_error(field, leader_id):
        """Error text when ``leader_id`` does not hold the TL role for ``field``.

        Same rule as UserProfileViewSet.set_team_leader. A falsy id clears the
        link and is always valid.
        """
        if not leader_id:
            return None
        leader_profile = UserProfile.objects.filter(user_id=leader_id).first()
        is_valid_tl = leader_profile is not None and (
            leader_profile.is_italian_tl if field == 'italian_tl' else leader_profile.is_albanian_tl
        )
        if is_valid_tl:
            return None
        return f'User {leader_id} is not currently an active {field} team leader'

    @staticmethod
    def _forbid_staff_on_staff(request, target, message):
        """Credential changes on a staff or superuser account need a superuser
        (own account excepted). One rule for passwords and second factors."""
        if (
            (target.is_staff or target.is_superuser)
            and not request.user.is_superuser
            and target.pk != request.user.pk
        ):
            raise PermissionDenied(message)

    @action(detail=True, methods=['get'], permission_classes=[IsAdminUser()])
    def mfa_status(self, request, pk=None):
        """Second-factor state of one account, for the admin user panel."""
        from .services import mfa as mfa_service
        return Response(mfa_service.status_for(self.get_object()))

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser()])
    def reset_mfa(self, request, pk=None):
        """Admin removes a user's second factor (lost phone and backup codes).

        Ends their live sessions. If MFA is required for them they enrol again
        at the next sign-in. Not usable on your own account: use Settings.
        """
        from .services import mfa as mfa_service
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response(
                {'error': 'Turn off your own two-factor authentication from Settings.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self._forbid_staff_on_staff(request, user, 'Only a superuser can reset a staff or superuser second factor.')
        if not mfa_service.is_enrolled(user):
            return Response({'error': 'This user has no second factor to reset.'}, status=status.HTTP_400_BAD_REQUEST)
        mfa_service.remove_mfa(user)
        revoke_refresh_tokens(user)
        mfa_service.audit(
            request.user,
            'mfa_reset',
            f'{request.user.username} reset the second factor of {user.username}',
            user,
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        return Response({'detail': 'Second factor removed.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser()])
    def reset_password(self, request, pk=None):
        """
        Admin resets a user's password.
        Expects {'new_password': '...'} in request body.
        Only a superuser may reset a staff or superuser account (own account excepted).
        """
        from .services import mfa as mfa_service
        user = self.get_object()
        self._forbid_staff_on_staff(request, user, 'Only a superuser can reset a staff or superuser password.')
        new_password = request.data.get('new_password')
        if not new_password:
            return Response(
                {'error': 'new_password is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return Response(
                {'error': 'Password does not meet the password policy.', 'messages': list(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.set_password(new_password)
        user.save()
        # SEC-10: a reset must end sessions that are still alive on the old password.
        revoke_refresh_tokens(user)
        mfa_service.audit(
            request.user,
            'password_changed',
            f'{request.user.username} reset password for {user.username}',
            user,
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        return Response({'detail': 'Password reset successfully.'}, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'], permission_classes=[IsAdminUser()])
    def bulk_update(self, request):
        """Apply selected core user-management fields atomically.

        Payload accepts ``user_ids`` plus any of: ``teams`` (complete M2M
        replacement), ``techs``, ``italian_tl``, ``albanian_tl``, ``is_hr``,
        ``is_italian_tl_role``, ``is_albanian_tl_role``, and ``is_hbpr``.
        Omitted fields remain unchanged. This endpoint is intentionally
        full-admin-only; CR-only admins use the Control Room plugin bulk
        endpoint instead.
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
            'is_italian_tl_role', 'is_albanian_tl_role', 'is_hbpr',
        }
        unknown_fields = sorted(set(data.keys()) - {'user_ids', 'unassign_removed_tl'} - allowed_fields)
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
            found_teams = list(Team.objects.filter(id__in=team_ids))
            invalid_team_ids = sorted(set(team_ids) - {t.id for t in found_teams})
            if invalid_team_ids:
                return Response(
                    {'error': f'Unknown team IDs: {invalid_team_ids}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            archived_message = team_lifecycle.archived_team_error(found_teams)
            if archived_message:
                return Response({'error': archived_message}, status=status.HTTP_400_BAD_REQUEST)
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

        for field in ('is_hr', 'is_italian_tl_role', 'is_albanian_tl_role', 'is_hbpr'):
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
        for field, leader_id in leader_ids.items():
            leader_error = self._invalid_leader_error(field, leader_id)
            if leader_error:
                return Response({'error': leader_error}, status=status.HTTP_400_BAD_REQUEST)
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
        from apps.permissions.models import Role
        from apps.permissions.services.role_service import (
            assign_role,
            find_blocked_hbpr_revocations_bulk,
            find_blocked_tl_revocations_bulk,
            revoke_role,
        )

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

            # Same pre-check for the HBPR↔Albanian-TL assignment FK — an
            # is_hbpr=False or is_albanian_tl_role=False bulk revoke would
            # otherwise hit the guard inside revoke_role mid-loop and 500.
            hbpr_new_state = {}
            if data.get('is_hbpr') is False:
                hbpr_new_state['hbpr'] = False
            if data.get('is_albanian_tl_role') is False:
                hbpr_new_state['albanian_tl'] = False
            blocked_hbpr = (
                find_blocked_hbpr_revocations_bulk(
                    [profile.user for profile in profiles], hbpr_new_state
                )
                if hbpr_new_state
                else []
            )
            if blocked_hbpr:
                summary = '; '.join(
                    f"{b['username']} ({b['role']}): {b['assignment_count']} "
                    f"open HBPR↔Albanian TL assignment(s)"
                    for b in blocked_hbpr
                )
                return Response(
                    {
                        'error': (
                            'Cannot revoke role while an open HBPR↔Albanian TL '
                            'assignment depends on it: ' + summary
                        ),
                        'blocked_revocations': blocked_hbpr,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            hbpr_role_exists = (
                'is_hbpr' in data and Role.objects.filter(code='hbpr').exists()
            )
            if data.get('is_hbpr') and not hbpr_role_exists:
                return Response(
                    {'error': 'hbpr role is not seeded'},
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

            bulk_warnings = []
            for profile in profiles:
                team_change = None
                if team_ids is not None:
                    team_change = change_user_teams(profile, team_ids, request=request)
                if tech_entries is not None:
                    try:
                        validate_tech_assignments(
                            tech_entries,
                            profile=profile,
                            already_assigned_ids=assigned_by_profile.get(profile.id, set()),
                        )
                    except TechAssignmentError as exc:
                        # Returning normally would COMMIT the writes already
                        # made in this batch (atomic() only rolls back on an
                        # exception), breaking the all-or-nothing contract.
                        transaction.set_rollback(True)
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
                if team_change:
                    warned, _ = tl_link_followup(
                        profile, team_change, unassign=bool(data.get('unassign_removed_tl')), request=request,
                    )
                    bulk_warnings.extend(warned)
                profile.save()
                _sync_legacy_roles(
                    profile.user,
                    is_hr=data.get('is_hr'),
                    is_italian_tl_role=data.get('is_italian_tl_role'),
                    is_albanian_tl_role=data.get('is_albanian_tl_role'),
                )
                if 'is_hbpr' in data:
                    if data['is_hbpr']:
                        assign_role(profile.user, 'hbpr')
                    elif hbpr_role_exists:
                        revoke_role(profile.user, 'hbpr')

        return Response({
            'detail': f'Successfully updated {len(profiles)} users.',
            'updated_count': len(profiles),
            'warnings': bulk_warnings,
        }, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except models.ProtectedError:
            raise ProtectedRecordConflict()

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

            try:
                # HBPR↔AL-TL assignments PROTECT both participants: an
                # assigned user must have their assignments ended (history
                # retained) before the account can be deleted. Checked before
                # anything is cleared so a refusal changes nothing.
                from apps.users.models.hbpr import HbprAlbanianTlAssignment
                from apps.users.services.hbpr_assignments import unfinished_q

                open_assignments = HbprAlbanianTlAssignment.objects.filter(
                    Q(hbpr=user) | Q(albanian_tl=user), unfinished_q()
                )
                if open_assignments.exists():
                    failed_users.append({
                        'id': user.id,
                        'reason': (
                            'User has open HBPR↔Albanian TL assignments; '
                            'end or reassign them first.'
                        ),
                    })
                    continue

                # Clear TL references and delete in one savepoint: a PROTECTed
                # row (e.g. payroll lines) must not leave the references cleared.
                # PERF-14: the update row counts are logged; the old per-user COUNT
                # queries existed only to write log lines.
                with transaction.atomic():
                    italian_cleared = UserProfile.objects.filter(italian_tl=user).update(italian_tl=None)
                    albanian_cleared = UserProfile.objects.filter(albanian_tl=user).update(albanian_tl=None)
                    led_cleared = Team.objects.filter(team_leader=user).update(team_leader=None)
                    logger.info(
                        f"User {user.id} references cleared: {italian_cleared} Italian TL, "
                        f"{albanian_cleared} Albanian TL, {led_cleared} led teams"
                    )
                    user.delete()
                deleted_count += 1
                logger.info(f"User {user.id} deleted successfully")
            except models.ProtectedError:
                logger.warning(f"User {user.id} not deleted: protected records")
                failed_users.append({'id': user.id, 'reason': PROTECTED_RECORD_DETAIL})
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
        from .services.user_creation import UserValidationError, create_user_with_profile
        data = request.data
        required = ['username', 'email', 'password']
        missing = [f for f in required if not data.get(f)]
        if missing:
            body = {'error': f'Missing required fields: {", ".join(missing)}'}
            body.update({f: ['This field is required.'] for f in missing})
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

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
            validate_password(
                data['password'],
                User(
                    username=data['username'], email=data['email'],
                    first_name=data.get('first_name', ''), last_name=data.get('last_name', ''),
                ),
            )
        except DjangoValidationError as exc:
            return Response(
                {
                    'error': 'Password does not meet the password policy.',
                    'password': list(exc.messages),
                    'messages': list(exc.messages),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

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
                code=data.get('code'),
            )
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        except UserValidationError as e:
            return Response({'error': str(e), e.field: [str(e)]}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['put', 'patch'], permission_classes=[IsAdminUser()])
    @transaction.atomic
    def update_user(self, request, pk=None):
        """
        Admin updates a user and their profile in one call.
        Payload: any of {email, first_name, last_name, phone, team, add_teams, albanian_tl, italian_tl, is_hr, is_italian_tl_role, is_albanian_tl_role, is_cr_admin}
        """
        from .services.user_creation import _set_cr_admin_role, _sync_legacy_roles, _sync_roles
        from apps.permissions.services.role_service import find_blocked_tl_revocations
        from .services.hbpr_assignments import hbpr_revocation_refusal
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

        # Same pre-check for the HBPR↔Albanian-TL assignment FK (before any
        # mutation, so a refusal leaves the profile untouched).
        hbpr_refusal = hbpr_revocation_refusal(user, data)
        if hbpr_refusal:
            return Response(hbpr_refusal, status=status.HTTP_400_BAD_REQUEST)

        for leader_field in ('italian_tl', 'albanian_tl'):
            if leader_field in data:
                leader_error = self._invalid_leader_error(leader_field, data[leader_field])
                if leader_error:
                    return Response({'error': leader_error}, status=status.HTTP_400_BAD_REQUEST)

        if 'code' in data:
            from .services.user_creation import UserValidationError, validate_employee_code
            try:
                validate_employee_code(
                    data['code'],
                    exclude_profile_id=getattr(profile_for_check, 'pk', None),
                )
            except UserValidationError as exc:
                return Response({'error': str(exc), exc.field: [str(exc)]},
                                status=status.HTTP_400_BAD_REQUEST)

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
        if 'mfa_required' in data and bool(data['mfa_required']) != profile.mfa_required:
            # Same authority as a password reset: staff cannot touch staff accounts.
            self._forbid_staff_on_staff(request, user, 'Only a superuser can change the second-factor requirement of a staff or superuser.')
            from .services import mfa as mfa_service
            profile.mfa_required = bool(data['mfa_required'])
            mfa_service.audit(
                request.user, 'mfa_required_changed',
                f'{request.user.username} set per-user MFA requirement of {user.username} to {profile.mfa_required}', user,
            )
        if 'code' in data:
            profile.code = data['code']  # UserProfile.save() trims / blanks to NULL
        add_teams = None
        if 'add_teams' in data:
            # Join teams without replacing the ones the person is in now: the caller only names
            # what to add, and the server merges it with the CURRENT set inside this transaction,
            # so a page that was loaded earlier can never overwrite someone else's change.
            raw = data['add_teams']
            try:
                if not isinstance(raw, list):
                    raise ValueError
                add_teams = [int(team_id) for team_id in raw]
            except (TypeError, ValueError):
                transaction.set_rollback(True)
                return Response({'error': 'add_teams must be a list of team ids.'}, status=status.HTTP_400_BAD_REQUEST)
            unknown = sorted(set(add_teams) - set(Team.objects.filter(id__in=add_teams).values_list('id', flat=True)))
            if unknown:
                transaction.set_rollback(True)
                return Response({'error': f'Unknown team IDs: {unknown}'}, status=status.HTTP_400_BAD_REQUEST)
        archived_message = team_lifecycle.archived_error_for_refs(
            [*(data.get('teams') or []), *(add_teams or []), data.get('team')]
        )
        if archived_message:
            transaction.set_rollback(True)
            return Response({'error': archived_message, 'teams': [archived_message]}, status=status.HTTP_400_BAD_REQUEST)
        team_change = None
        if add_teams and 'teams' not in data and 'team' not in data:
            # Join-only: never rewrite the set the caller did not see. Each missing membership
            # is inserted (idempotent under the unique constraint), so concurrent adds both win.
            team_change = change_user_teams(profile, add_teams, request=request, add_only=True)
        if 'teams' in data or 'team' in data:
            # One diff for both the list and the legacy single-team field (the single one wins,
            # as before). Empty / null clears every team.
            target = data['teams'] or [] if 'teams' in data else None
            if 'team' in data:
                target = [data['team']] if data['team'] else []
            team_change = change_user_teams(profile, target, request=request)
        if 'techs' in data:
            # Passing the profile keeps the pre-existing rule: an inactive Tech
            # is allowed only when this user already has it assigned.
            try:
                set_tech_assignments(profile, data['techs'], assigned_by=request.user)
            except TechAssignmentError as exc:
                transaction.set_rollback(True)
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if 'albanian_tl' in data:
            profile.albanian_tl_id = data['albanian_tl'] if data['albanian_tl'] else None
        if 'italian_tl' in data:
            profile.italian_tl_id = data['italian_tl'] if data['italian_tl'] else None
        if 'hire_date' in data:
            profile.hire_date = data['hire_date'] or None
        tl_warnings, removed_leaders = ([], [])
        if team_change:
            tl_warnings, removed_leaders = tl_link_followup(
                profile, team_change, unassign=bool(data.get('unassign_removed_tl')), request=request,
            )
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
            try:
                _sync_roles(user, data['roles'])
            except ValueError as e:
                # e.g. the hbpr role row was never seeded — create_user
                # translates the same failure to a 400.
                transaction.set_rollback(True)
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
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
        body = UserSerializer(user).data
        if team_change:
            body = {**body, 'warnings': tl_warnings, 'removed_team_leaders': removed_leaders}
        return Response(body, status=status.HTTP_200_OK)

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

        current_date = business_today()
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
            # PERF-01: one correlated Sum per relation. Two Sum() annotations over
            # different reverse joins in one query multiply each other's rows.
            def _month_total(model):
                return Coalesce(
                    Subquery(
                        model.objects.filter(
                            user_id=OuterRef('user_id'),
                            status='approved',
                            date__gte=start_of_month,
                            date__lt=next_month,
                        )
                        .order_by()
                        .values('user_id')
                        .annotate(total=Sum('hours'))
                        .values('total'),
                        output_field=models.DecimalField(max_digits=7, decimal_places=2),
                    ),
                    models.Value(0),
                    output_field=models.DecimalField(max_digits=7, decimal_places=2),
                )

            from apps.overtime.models import OvertimeLog
            from apps.standby.models import StandbyLog

            members = (
                with_profile_list_loading(UserProfile.objects.filter(user_id__in=target_user_ids))
                .annotate(
                    current_month_overtime_hours=_month_total(OvertimeLog),
                    current_month_standby_hours=_month_total(StandbyLog),
                )
                .order_by('user__first_name', 'user__last_name', 'user__username')
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
            with_profile_list_loading(UserProfile.objects.filter(italian_tl_id=italian_tl_id))
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
        
        current_date = business_today()
        
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
    queryset = with_profile_list_loading(UserProfile.objects.all()).order_by('-id')
    serializer_class = UserProfileSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'user__email', 'user__first_name', 'user__last_name', 'code']
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
        if self.request.query_params.get('cr_access', '').lower() == 'true':
            # Filtered through the plugin's reverse relation, never an import.
            # Fails closed (empty) when control_room is not installed.
            try:
                queryset = queryset.filter(user__control_room_access__is_active=True)
            except FieldError:
                queryset = queryset.none()
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
        if role == 'assignable_employee':
            # HR's TL-assignment list: the `employee` tab minus what that tab keeps
            # reachable for the Admin Users page — Django staff/superusers, an
            # `admin` role, and anyone leading an active team. Single-condition
            # exclude() so each rule is evaluated per related row.
            return (
                self._apply_role_filter(queryset, 'employee')
                .filter(user__is_staff=False, user__is_superuser=False)
                .exclude(role_codes__icontains='admin')
                .exclude(user__led_teams__is_active=True)
            )
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
        if role == 'hbpr':
            # 'hbpr' is flagless — it lives only in the role_codes JSON cache
            # and the authoritative UserRole rows (mirrors the TL filters,
            # which check flag OR cache OR relation).
            return queryset.filter(
                Q(role_codes__icontains='hbpr')
                | Q(user__user_roles__role__code='hbpr', user__user_roles__is_active=True)
            ).distinct()
        if role == 'hr':
            return queryset.filter(
                Q(is_hr_user=True)
                | Q(role_codes__icontains='hr')
                | Q(user__user_roles__role__code='hr', user__user_roles__is_active=True)
            ).distinct()
        if role == 'cr_admin':
            # flagless like hbpr — lives in the role_codes cache + UserRole.
            return queryset.filter(
                Q(role_codes__icontains='cr_admin')
                | Q(user__user_roles__role__code='cr_admin', user__user_roles__is_active=True)
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
        if role == 'employee':
            # Plain employees: no elevated role via flag, role_codes cache,
            # or TL-via-dependents — but their own TL-assignment FKs do NOT
            # exclude them (an employee with a manager is still an employee;
            # that distinguishes this from the no_tl "unassigned" metric).
            # Deliberately NOT excluded: Django staff/superusers and users who
            # lead a Team row without holding the TL role. They carry no
            # elevated role, and no other tab can classify them (the TL tabs
            # match role/flag/own-members, not Team.team_leader), so excluding
            # them here would leave them unreachable. Documented in
            # docs/hbpr-and-scorecard.md.
            return queryset.filter(
                Q(is_italian_tl_role=False)
                & Q(is_albanian_tl_role=False)
                & Q(is_hr_user=False)
                & Q(user__italian_team_members__isnull=True)
                & Q(user__albanian_team_members__isnull=True)
                & ~Q(role_codes__icontains='italian_tl')
                & ~Q(role_codes__icontains='albanian_tl')
                & ~Q(role_codes__icontains='hbpr')
                & ~Q(role_codes__icontains='hr')
                & ~Q(role_codes__icontains='cr_admin')
            ).distinct()
        return queryset

    @action(detail=False, methods=['get'])
    def assignment_counts(self, request):
        """Totals for the HR TL-assignment tiles (the list itself is page-capped)."""
        queryset = self.get_queryset()
        return Response({
            'total': queryset.count(),
            'italian': queryset.filter(italian_tl__isnull=False).count(),
            'albanian': queryset.filter(albanian_tl__isnull=False).count(),
            'without_any': queryset.filter(
                italian_tl__isnull=True, albanian_tl__isnull=True
            ).count(),
        })

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
        hbpr_scope = get_hbpr_scope(user)
        if hbpr_scope is not None:
            return queryset.filter(Q(user=user) | Q(user_id__in=hbpr_scope.user_ids))
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
            'affected_member_count': close.members.exclude(user_id=close.closed_by_id).count(),
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

    queryset = Tech.objects.all().prefetch_related('levels').annotate(
        members_count_annotated=Count(
            'assignments',
            filter=models.Q(assignments__user_profile__user__is_active=True),
            distinct=True,
        ),
    ).order_by('name')
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
        """List users assigned to this tech with the level each holds.

        Staff and HR only (SEC-06): the rows carry every assignee's email.
        """
        if not (is_staff_user(request.user) or has_hr_role(request.user)):
            raise PermissionDenied("Only staff and HR can list a tech's users.")
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
    # The admin Teams page loads the whole directory in one request.
    pagination_class = LargeResultsPagination
    serializer_class = TeamSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'code', 'description']
    filterset_fields = ['calendar_group']
    lookup_field = 'pk'

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action == 'list':
            # Teams are few: derive every team's IT/AL TL in one pass instead
            # of one query pair per row.
            context['derived_team_tls'] = derive_team_tls()
            # Same pass for the "why can't I archive this" hint on each row. Only the people who
            # can archive get it: the reasons carry pending-request counts and HBPR status, which
            # are confidential, and every authenticated user may list teams.
            user = self.request.user
            if user.is_staff or user.is_superuser:
                context['archive_blockers'] = team_lifecycle.archive_blockers_bulk(
                    Team.objects.active().select_related('team_leader')
                )
        return context

    def get_queryset(self):
        """
        Return queryset with annotations for team stats.
        """
        queryset = Team.objects.all().select_related('team_leader', 'parent_team').annotate(
            sub_teams_count_annotated=Count('sub_teams', distinct=True),
            members_count_annotated=Count('members', distinct=True),
        ).order_by('name')

        if self.action == 'list':
            # Archived teams are hidden unless asked for: ?is_active=false (only archived) or all.
            archived = self.request.query_params.get('is_active', 'true').strip().lower()
            if archived in {'false', '0', 'no'}:
                queryset = queryset.filter(is_active=False)
            elif archived != 'all':
                queryset = queryset.filter(is_active=True)

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

        queryset = Team.objects.active().annotate(
            members_count=Count('members', distinct=True)
        ).order_by('name')

        serializer = TeamSerializer(queryset, many=True, context={'request': request})
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

    def destroy(self, request, *args, **kwargs):
        # Checked up front instead of catching a database error: a failed delete inside
        # Django's atomic block poisons the caller's transaction. A plain Response, not an
        # APIException: DRF would turn the counts into strings.
        team = self.get_object()
        blockers = team_lifecycle.delete_blockers(team)
        if blockers:
            return Response(
                {
                    'detail': 'This team cannot be deleted. Archive it instead; '
                              'delete only a team that was never used or has nothing left.',
                    'blockers': blockers,
                    'counts': team_lifecycle.protected_record_counts(team),
                    'cascade_counts': team_lifecycle.cascade_record_counts(team),
                },
                status=status.HTTP_409_CONFLICT,
            )
        record_lifecycle_event(
            request, team, 'team', 'DELETE', 'delete',
            old={'code': team.code, 'name': team.name},
        )
        self.perform_destroy(team)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Retire a team: hidden from pickers, members unassigned (history kept), records kept."""
        team = self.get_object()
        blockers = team_lifecycle.archive_blockers(team)
        if blockers:
            return Response(
                {'detail': 'This team cannot be archived yet.', 'blockers': blockers},
                status=status.HTTP_409_CONFLICT,
            )
        unassigned = team_lifecycle.archive_team(team, request)
        return Response({'id': team.pk, 'is_active': False, 'members_unassigned': unassigned})

    @action(detail=True, methods=['post'])
    def unarchive(self, request, pk=None):
        """Reactivate an archived team. Its members are not restored."""
        team = self.get_object()
        if team.is_active:
            return Response({'detail': 'Team is not archived.'}, status=status.HTTP_409_CONFLICT)
        blockers = team_lifecycle.unarchive_blockers(team)
        if blockers:
            return Response(
                {'detail': 'This team cannot be restored yet.', 'blockers': blockers},
                status=status.HTTP_409_CONFLICT,
            )
        team_lifecycle.unarchive_team(team, request)
        return Response({'id': team.pk, 'is_active': True})

    @action(detail=True, methods=['get'])
    def lifecycle(self, request, pk=None):
        """What the lifecycle dialog shows: counts, blockers, last activity, purge date."""
        return Response(team_lifecycle.lifecycle_summary(self.get_object()))

    @action(detail=False, methods=['get'])
    def orphans(self, request):
        """Users, teams and clients nothing points at (read-only, admin page "Data check")."""
        return Response(find_orphans())

    @action(detail=False, methods=['get'])
    def suggestions(self, request):
        """People who work a client nobody on their teams works, with the teams that do (read-only)."""
        return Response(suggest_team_moves())

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers.
        # Team writes are admin-only: the HR-native /hr/teams page and its
        # IsHR grant were removed (destroy and the bulk cross-team
        # calendar-group actions were already admin-only). Read stays
        # IsAuthenticated - HR Reports uses list_for_reports.
        if self.action in (
            'create', 'update', 'partial_update', 'destroy',
            'archive', 'unarchive', 'lifecycle', 'orphans', 'suggestions',
            'bulk_update_calendar_group', 'rename_calendar_group',
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
    
    @staticmethod
    def _visible_member_user_ids(user):
        """User ids whose profiles this viewer may list; ``None`` means all.

        Mirrors ``UserViewSet.filter_for_regular_user`` (staff/HR all, HBPR its
        assigned scope, everyone else only themselves) and lets team leaders
        see the people they manage.
        """
        if is_staff_user(user) or has_hr_role(user):
            return None
        visible = {user.id}
        if has_team_leader_role(user):
            visible |= user.profile.get_team_member_ids()
        hbpr_scope = get_hbpr_scope(user)
        if hbpr_scope is not None:
            visible |= set(hbpr_scope.user_ids)
        return visible

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

        members = UserProfile.objects.filter(teams__in=target_team_ids)
        visible_ids = self._visible_member_user_ids(request.user)
        if visible_ids is not None:  # SEC-06: scope the child rows, not just the parent
            members = members.filter(user_id__in=visible_ids)
        members = (
            with_profile_list_loading(members)
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
        root_teams = Team.objects.active().filter(parent_team__isnull=True)
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
        calendar_group = normalize_calendar_group(request.data.get('calendar_group'))

        if not team_ids:
            return Response({'error': 'team_ids required'}, status=400)
        if len(calendar_group) > Team._meta.get_field('calendar_group').max_length:
            return Response({'error': 'calendar_group is too long'}, status=400)

        updated = Team.objects.active().filter(id__in=team_ids).update(calendar_group=calendar_group)

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
        new_name = normalize_calendar_group(request.data.get('new_name'))

        if not old_name or not new_name:
            return Response({'error': 'old_name and new_name required'}, status=400)
        if len(new_name) > Team._meta.get_field('calendar_group').max_length:
            return Response({'error': 'new_name is too long'}, status=400)

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


class HbprAssignmentViewSet(viewsets.ModelViewSet):
    """Admin-managed HBPR ↔ Albanian TL assignments.

    Staff/admin only. No destructive delete: history is closed via the
    ``end`` action so governance evidence keeps a resolvable FK.
    """

    from .models.hbpr import HbprAlbanianTlAssignment as _Model

    queryset = (
        _Model.objects.select_related("hbpr", "albanian_tl")
        .order_by("-effective_from", "-id")
    )
    serializer_class = HbprAlbanianTlAssignmentSerializer
    permission_classes = [IsAdminUser]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = [
        "hbpr__username", "hbpr__first_name", "hbpr__last_name",
        "albanian_tl__username", "albanian_tl__first_name",
        "albanian_tl__last_name",
    ]

    def get_serializer_class(self):
        return HbprAlbanianTlAssignmentSerializer

    def get_queryset(self):
        from django.apps import apps as django_apps
        from django.db.models import Count, Max

        qs = super().get_queryset()
        # The serializer reads ``last_meeting_on``/``evidence_count`` off the
        # row for the cadence columns; they come from the TL-scorecard plugin's
        # evidence table, so annotate only while that app is installed (a
        # removed plugin leaves no reverse accessor at all).
        if django_apps.is_installed("plugins.tl_scorecard"):
            qs = qs.annotate(
                last_meeting_on=Max(
                    "governance_evidence__occurred_on",
                    filter=Q(governance_evidence__kind="cadence_meeting"),
                ),
                evidence_count=Count("governance_evidence", distinct=True),
            )
        current = self.request.query_params.get("current")
        if current is not None:
            if current not in ("true", "false"):
                raise DRFValidationError(
                    {"current": "current must be 'true' or 'false'."}
                )
            from .services.hbpr_assignments import unfinished_q

            qs = qs.filter(unfinished_q() if current == "true" else ~unfinished_q())
        return qs

    def list(self, request, *args, **kwargs):
        # There is no scheduler in this deployment: the staff-only admin list
        # is the lazy sweep point for the archive purge (same heal-on-read
        # pattern as TLEngagementMetricsViewSet._ensure_fresh).
        from .services.hbpr_assignments import purge_ended_assignments

        purge_ended_assignments()
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        from django.db import IntegrityError

        from .services.hbpr_assignments import AssignmentError, create_assignment

        data = serializer.validated_data
        try:
            assignment = create_assignment(
                hbpr=data["hbpr"],
                albanian_tl=data["albanian_tl"],
                cadence=data["cadence"],
                cadence_day_of_week=data.get("cadence_day_of_week"),
                cadence_nth_week=data.get("cadence_nth_week"),
                effective_from=data["effective_from"],
                assigned_by=self.request.user,
            )
        except AssignmentError as exc:
            raise DRFValidationError({"detail": str(exc)})
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.message_dict)
        except IntegrityError:
            # Two concurrent first assignments for one TL both pass the
            # service check (an empty row set locks nothing); the partial
            # unique is the real gate. Translate to the same structured 400.
            raise DRFValidationError(
                {
                    "detail": (
                        "An open assignment already exists for this Albanian "
                        "TL. End or reassign it first."
                    )
                }
            )
        serializer.instance = assignment

    def perform_update(self, serializer):
        # Cadence/effective_from edits are allowed on an open assignment;
        # ending goes through the explicit ``end`` action.
        serializer.save()

    def perform_destroy(self, instance):
        raise DRFValidationError(
            "Assignments cannot be deleted. End the assignment instead so "
            "governance evidence keeps a resolvable reference."
        )

    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        from datetime import date as date_type

        from .services.hbpr_assignments import AssignmentError, end_assignment

        raw = request.data.get("effective_to")
        try:
            effective_to = date_type.fromisoformat(raw)
        except (TypeError, ValueError):
            raise DRFValidationError(
                {"effective_to": "A valid ISO date is required."}
            )
        try:
            assignment = end_assignment(
                assignment=self.get_object(),
                effective_to=effective_to,
                actor=request.user,
            )
        except AssignmentError as exc:
            raise DRFValidationError({"detail": str(exc)})
        serializer = self.get_serializer(assignment)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def reassign(self, request, pk=None):
        """Close this assignment and create its replacement in one transaction."""
        from datetime import date as date_type

        from .services.hbpr_assignments import (
            AssignmentError,
            reassign_assignment,
        )

        raw = request.data.get("effective_from")
        try:
            effective_from = date_type.fromisoformat(raw)
        except (TypeError, ValueError):
            raise DRFValidationError(
                {"effective_from": "A valid ISO date is required."}
            )
        new_hbpr_id = request.data.get("new_hbpr")
        cadence = request.data.get("cadence")
        if not new_hbpr_id:
            raise DRFValidationError({"new_hbpr": "new_hbpr is required."})
        if not cadence:
            raise DRFValidationError({"cadence": "cadence is required."})
        current = self.get_object()
        try:
            new_hbpr_user = User.objects.get(pk=int(new_hbpr_id))
        except (User.DoesNotExist, ValueError, TypeError):
            raise DRFValidationError({"new_hbpr": "User does not exist."})
        try:
            replacement = reassign_assignment(
                albanian_tl=current.albanian_tl,
                new_hbpr=new_hbpr_user,
                cadence=cadence,
                effective_from=effective_from,
                actor=request.user,
            )
        except AssignmentError as exc:
            raise DRFValidationError({"detail": str(exc)})
        serializer = self.get_serializer(replacement)
        return Response(serializer.data)
