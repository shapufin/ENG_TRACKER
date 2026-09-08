"""
Permission mixins for DRF viewsets.
"""

from django.db import IntegrityError
from django.utils import timezone
from rest_framework import permissions, status, decorators
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from apps.permissions.services import permission_service
from apps.permissions.services.role_service import has_role
from core.mixins.cache import CacheInvalidationMixin
import logging

logger = logging.getLogger(__name__)


class SuperuserOnlyAdminMixin:
    """Restrict Django admin model and inline access to superusers."""

    def _is_superuser(self, request):
        return bool(request and request.user and request.user.is_superuser)

    def has_module_permission(self, request):
        return self._is_superuser(request)

    def has_view_permission(self, request, obj=None):
        return self._is_superuser(request)

    def has_add_permission(self, request):
        return self._is_superuser(request)

    def has_change_permission(self, request, obj=None):
        return self._is_superuser(request)

    def has_delete_permission(self, request, obj=None):
        return self._is_superuser(request)


def resolve_target_user(actor, raw_target_id=None):
    """Resolve an optional admin target user for server-side create paths."""
    from django.contrib.auth import get_user_model

    if raw_target_id in (None, ''):
        return actor, False
    if not (actor.is_staff or actor.is_superuser):
        raise PermissionDenied('Only staff users can create records for another user.')
    try:
        target_id = int(raw_target_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({'user': 'A valid target user is required.'}) from exc
    target = get_user_model().objects.filter(pk=target_id, is_active=True).first()
    if target is None:
        raise ValidationError({'user': 'The target user does not exist or is inactive.'})
    return target, target.pk != actor.pk


def is_cr_admin(user) -> bool:
    """True if user has the active ``cr_admin`` role.

    A CR admin is a scoped admin that can only manage Control Room access
    and view CR users. Full staff/superusers always pass this check too
    (they are above CR admins in the hierarchy), but callers that need
    "CR admin and NOT full staff" should combine with ``not user.is_staff``.

    N+1 avoidance: if the caller prefetched ``user_roles__role`` on the
    user instance (e.g. ``UserSerializer`` with ``many=True``), the
    prefetched cache is inspected in Python and no extra query is issued.
    Otherwise a single ``EXISTS`` query runs.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    # Prefer prefetched user_roles to avoid N+1 in list serializers.
    prefetched = getattr(user, '_prefetched_objects_cache', {}).get('user_roles')
    if prefetched is not None:
        return any(
            getattr(ur, 'is_active', False)
            and getattr(getattr(ur, 'role', None), 'code', None) == 'cr_admin'
            for ur in prefetched
        )
    from apps.permissions.models import UserRole
    return UserRole.objects.filter(
        user=user, role__code='cr_admin', is_active=True
    ).exists()


class IsCRAdminOrStaff(permissions.BasePermission):
    """Allow staff/superuser OR users with the active ``cr_admin`` role."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return is_cr_admin(request.user)


def is_hr_only(user) -> bool:
    """True only if user is pure HR (not TL, staff, or superuser).

    Multi-role users (TL+HR, Admin+HR) are common and must keep the
    elevated role's write/delete privileges. View-only applies to pure HR.
    """
    profile = getattr(user, 'profile', None)
    is_hr = has_role(user, 'hr') or bool(getattr(profile, 'is_hr_user', False))
    if not is_hr or user.is_staff or user.is_superuser:
        return False
    is_tl = has_role(user, 'italian_tl') or has_role(user, 'albanian_tl')
    if is_tl or (profile is not None and profile.is_team_leader):
        return False
    return True


def has_hr_role(user) -> bool:
    """Return whether the user has the HR role during migration."""
    return has_role(user, 'hr') or bool(
        getattr(getattr(user, 'profile', None), 'is_hr_user', False)
    )


def has_team_leader_role(user) -> bool:
    """Return whether the user has TL capability during migration."""
    profile = getattr(user, 'profile', None)
    return (
        has_role(user, 'italian_tl')
        or has_role(user, 'albanian_tl')
        or bool(getattr(profile, 'is_team_leader', False))
    )


class IsSuperuser(permissions.BasePermission):
    """Allow only superusers."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class SuperuserPermissionMixin:
    """Mixin to grant full access to superusers in get_permissions."""
    def get_permissions(self):
        if self.request.user.is_superuser:
            return [permissions.IsAuthenticated()]
        return super().get_permissions()


class StaffFilterMixin:
    """Mixin to handle common staff/superuser queryset filtering."""
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return queryset
        return self.filter_for_regular_user(queryset, user)

    def filter_for_regular_user(self, queryset, user):
        """Override this to provide specific filtering for regular users."""
        if hasattr(queryset.model, 'user'):
            return queryset.filter(user=user)
        return queryset


class ApprovalPermissionMixin:
    """Mixin to provide centralized approval permission checking."""
    def _can_approve(self, user, obj):
        """
        Check if user can approve/reject the object using centralized permission service.
        """
        return permission_service.can_approve(user, obj)


class DeletePermissionMixin:
    """Mixin to provide centralized delete permission checking."""
    def _can_delete(self, user, obj):
        """
        Check if user can delete the object.
        """
        # Admin/staff/superuser can delete anything
        if user.is_staff or user.is_superuser:
            return True

        # Pure HR cannot delete (view-only). Multi-role HR+TL/Admin retain rights.
        if is_hr_only(user):
            return False

        # Regular users can delete their own entries
        obj_user = getattr(obj, 'user', None)
        if obj_user == user:
            return True

        # Team leaders can delete team members' entries
        if hasattr(user, 'profile') and user.profile.is_team_leader:
            try:
                if not obj_user:
                    return False

                target_user_ids = user.profile.get_team_member_ids()
                return obj_user.id in target_user_ids
            except Exception:
                logger.exception(
                    "Failed team-member lookup during delete check for user_id=%s",
                    getattr(user, 'id', None),
                )
                return False

        return False


class MonthlyLockMixin:
    """Lock owner edit/delete of records whose ``date`` month has ended.

    - Gates ``update``, ``partial_update``, ``destroy`` via
      ``check_object_permissions`` and ``bulk_delete`` via ``_can_delete``.
    - For **updates** (``update``/``partial_update``): ``is_staff`` and
      ``is_superuser`` bypass. Non-staff are locked in past/closed months.
    - For **deletes** (``destroy``/``bulk_delete``): only ``is_superuser``
      bypasses past/closed-month locks on **non-pending** records.
      ``is_staff`` (non-superuser) is blocked from deleting approved/rejected
      records in past or TL-closed months — the correction window in a
      finalized approval period is a superuser-only override.
      Pending records bypass the lock for **all** users (owner, staff,
      superuser) so un-approved carryover entries can always be cleaned up.
    - ``approve``/``reject``/``bulk_approve``/``bulk_reject`` are exempt.
    - Models must have a ``date`` field (OvertimeLog, StandbyLog).
    """

    _MONTH_LOCK_ACTIONS = {'update', 'partial_update', 'destroy'}

    def _is_month_locked(self, obj) -> bool:
        """True if the record's date is in a strictly past month."""
        record_date = getattr(obj, 'date', None)
        if record_date is None:
            return False
        today = timezone.now().date()
        return (record_date.year, record_date.month) < (today.year, today.month)

    def _is_approval_period_locked(self, obj) -> bool:
        """True when a TL has closed the record's work-date period."""
        record_date = getattr(obj, 'date', None)
        record_user = getattr(obj, 'user', None)
        if record_date is None or record_user is None:
            return False
        from apps.users.services.approval_periods import period_is_closed_for_user
        return period_is_closed_for_user(record_user, record_date)

    def _is_pending(self, obj) -> bool:
        """True if the record has status='pending' (not yet approved/rejected)."""
        return getattr(obj, 'status', None) == 'pending'

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if self.action in self._MONTH_LOCK_ACTIONS:
            user = request.user
            # Pending records can be deleted even from a past/closed month —
            # the user retains leverage to remove un-approved entries (e.g.
            # carried-over records after a period close). Updates are still
            # locked for past months.
            if self.action == 'destroy' and self._is_pending(obj):
                return
            # For updates: is_staff and is_superuser bypass (unchanged).
            # For deletes: only is_superuser bypasses — is_staff is blocked
            # from deleting non-pending records in past/closed months.
            if self.action == 'destroy':
                if user.is_superuser:
                    return
            else:
                if user.is_staff or user.is_superuser:
                    return
            if self._is_approval_period_locked(obj):
                raise PermissionDenied(
                    "This approval period is finalized. "
                    + ("Only a superuser can delete records in a closed period."
                       if self.action == 'destroy'
                       else "Contact an administrator to make changes.")
                )
            if self._is_month_locked(obj):
                raise PermissionDenied(
                    "Records from a past month are locked. "
                    + ("Only a superuser can delete records from a past month."
                       if self.action == 'destroy'
                       else "Contact an admin to make changes.")
                )

    def _can_delete(self, user, obj):
        if not super()._can_delete(user, obj):
            return False
        # Pending records can be deleted even from a past/closed month
        if self._is_pending(obj):
            return True
        # Only superuser bypasses month/approval-period lock for non-pending
        # deletes. is_staff (non-superuser) is blocked in locked periods.
        if user.is_superuser:
            return True
        return not self._is_month_locked(obj) and not self._is_approval_period_locked(obj)


class BulkActionMixin(CacheInvalidationMixin, ApprovalPermissionMixin, DeletePermissionMixin):
    """Mixin to provide common bulk actions: approve, reject, delete."""

    @decorators.action(detail=False, methods=['post'])
    def bulk_approve(self, request):
        """Approve multiple entries at once."""
        from django.db import transaction

        ids = request.data.get('ids', [])
        if not ids:
            return Response({'error': 'No IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)

        approved_count = 0
        failed_ids = []

        with transaction.atomic():
            queryset = self.get_queryset().filter(id__in=ids, status='pending').select_for_update()

            for obj in queryset:
                if self._can_approve(request.user, obj):
                    obj._skip_notifications = True
                    self.perform_approve(obj, request.user)
                    approved_count += 1
                else:
                    failed_ids.append(obj.id)

        self.invalidate_related_cache()

        return Response({
            'approved_count': approved_count,
            'failed_ids': failed_ids,
            'total_requested': len(ids)
        })

    @decorators.action(detail=False, methods=['post'])
    def bulk_reject(self, request):
        """Reject multiple entries at once."""
        from django.db import transaction

        ids = request.data.get('ids', [])
        rejection_reason = request.data.get('rejection_reason', '')
        if not ids:
            return Response({'error': 'No IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)

        rejected_count = 0
        failed_ids = []

        with transaction.atomic():
            queryset = self.get_queryset().filter(id__in=ids, status='pending').select_for_update()

            for obj in queryset:
                if self._can_approve(request.user, obj):
                    obj._skip_notifications = True
                    self.perform_reject(obj, request.user, rejection_reason)
                    rejected_count += 1
                else:
                    failed_ids.append(obj.id)

        self.invalidate_related_cache()

        return Response({
            'rejected_count': rejected_count,
            'failed_ids': failed_ids,
            'total_requested': len(ids)
        })

    @decorators.action(detail=False, methods=['post'])
    def bulk_delete(self, request):
        """Delete multiple entries at once.

        Calls ``self.perform_destroy(obj)`` instead of ``obj.delete()`` so
        that each viewset's domain guards (payroll-run references, leave
        balance release, audit logging) run per-record. A
        ``ValidationError`` from a guard (e.g. draft payroll run reference)
        adds the record to ``failed_ids`` instead of aborting the entire
        bulk operation.
        """
        from django.db import transaction

        ids = request.data.get('ids', [])
        if not ids:
            return Response({'error': 'No IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)

        deleted_count = 0
        failed_ids = []

        with transaction.atomic():
            queryset = self.get_queryset().filter(id__in=ids).select_for_update()

            for obj in queryset:
                if self._can_delete(request.user, obj):
                    try:
                        self.perform_destroy(obj)
                        deleted_count += 1
                    except (ValidationError, IntegrityError):
                        failed_ids.append(obj.id)
                else:
                    failed_ids.append(obj.id)

        self.invalidate_related_cache()

        return Response({
            'deleted_count': deleted_count,
            'failed_ids': failed_ids,
            'total_requested': len(ids)
        })

    def perform_approve(self, obj, user):
        """Hook to perform the actual approval. Override if custom logic needed (e.g. balance update)."""
        obj.status = 'approved'
        obj.approved_by = user
        obj.approved_at = timezone.now()
        obj.save()

    def perform_reject(self, obj, user, reason):
        """Hook to perform the actual rejection. Override if custom logic needed."""
        obj.status = 'rejected'
        obj.approved_by = user
        obj.approved_at = timezone.now()
        obj.rejection_reason = reason
        obj.save()


class HasPermission(permissions.BasePermission):
    """
    Permission class that checks for specific module/action permission.
    """
    
    def __init__(self, module, action):
        self.module = module
        self.action = action
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return permission_service.has_permission(
            request.user, self.module, self.action
        )


class IsTeamLeader(permissions.BasePermission):
    """
    Permission class that checks if user is a team leader.
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        profile = getattr(request.user, 'profile', None)
        if profile and profile.is_team_leader:
            return True
        
        return request.user.is_staff or request.user.is_superuser


class IsHR(permissions.BasePermission):
    """
    Permission class that checks if user is HR.
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        profile = getattr(request.user, 'profile', None)
        if profile and profile.is_hr:
            return True
        
        return request.user.is_staff or request.user.is_superuser


class IsOwnerOrTeamLeader(permissions.BasePermission):
    """
    Permission class that checks if user owns the object or is team leader/HR.
    """
    
    def has_object_permission(self, request, view, obj):
        # Allow if user owns the object
        if hasattr(obj, 'user') and obj.user == request.user:
            return True
        
        # Allow if user is team leader of the object's user
        profile = getattr(request.user, 'profile', None)
        if profile and profile.is_team_leader and hasattr(obj, 'user'):
            try:
                target_user_ids = profile.get_team_member_ids()
                return obj.user.id in target_user_ids
            except Exception:
                return False
        
        # Allow if user is HR
        if profile and profile.is_hr:
            return True
        
        return request.user.is_staff or request.user.is_superuser


class HRReadOnlyMixin:
    """
    Mixin to enforce HR view-only access.
    
    HR users can view all data but cannot create, update, or delete entries.
    They can still approve/reject requests.
    Multi-role users (TL+HR, Admin+HR) are exempt.
    """
    _HR_WRITE_ACTIONS = {'create', 'update', 'partial_update', 'destroy'}

    def _is_hr_only(self, user):
        """Return True if user is HR but lacks any elevated role (TL, staff, superuser)."""
        return is_hr_only(user)

    def check_permissions(self, request):
        """
        Block HR write operations before any action is dispatched.
        check_object_permissions is not called for 'create', so this is the
        correct choke-point for all write actions.
        """
        super().check_permissions(request)
        if self._is_hr_only(request.user) and self.action in self._HR_WRITE_ACTIONS:
            raise PermissionDenied("HR users have view-only access and cannot modify data.")

    def check_object_permissions(self, request, obj):
        """Keep object-level check as belt-and-suspenders for update/destroy."""
        super().check_object_permissions(request, obj)
        if self._is_hr_only(request.user) and self.action in self._HR_WRITE_ACTIONS:
            raise PermissionDenied("HR users have view-only access and cannot modify data.")


class WorkspaceFilterMixin:
    """Reusable workspace_id filtering logic shared across mixins."""

    def _apply_workspace_filter(self, queryset):
        """Apply workspace_ids filter if present. Returns filtered queryset."""
        user_ids = self._get_workspace_user_ids()
        if user_ids is None:
            return queryset
        if self.request.query_params.get('calendar', '').lower() in {'1', 'true', 'yes'}:
            try:
                from plugins.control_room.services.scope_service import get_calendar_excluded_user_ids
                user_ids.difference_update(get_calendar_excluded_user_ids())
            except ImportError:
                pass
        if not user_ids:
            return queryset.none()
        return queryset.filter(user_id__in=user_ids)

    def _get_workspace_user_ids(self):
        """Return set of user IDs allowed by workspace filter or None if unset.

        Uses a bounded number of DB queries regardless of the number of
        workspaces selected:
          1. Fetch accessible workspaces and their directly allowed users.
          2. Batch-fetch members for all involved team IDs.
        Previous implementation issued N×3+ queries (one call to
        get_users_for_workspace() per workspace).
        """
        workspace_ids = self.request.query_params.get('workspace_ids')
        if not workspace_ids:
            return None
        try:
            ids = [int(x) for x in workspace_ids.split(',') if x]
        except (ValueError, TypeError):
            return None
        if not ids:
            return set()

        from apps.dashboard.models.calendar import CalendarWorkspace
        from apps.users.models import UserProfile
        user = self.request.user

        # Fetch only workspaces user has access to, filtered by requested IDs
        workspaces = list(
            CalendarWorkspace.get_accessible_for_user(user)
            .filter(id__in=ids)
            .only('id', 'is_public', 'team_id')
            .prefetch_related('allowed_users')
        )

        user_ids, team_ids = set(), set()
        for ws in workspaces:
            if ws.team_id:
                team_ids.add(ws.team_id)
            for u in ws.allowed_users.all():
                user_ids.add(u.id)
        if team_ids:
            user_ids.update(
                UserProfile.objects.filter(teams__id__in=team_ids)
                .values_list('user_id', flat=True)
            )
        return user_ids

    def _require_workspace_scope(self):
        """Ensure workspace_ids query param is provided for scope-sensitive endpoints."""
        workspace_ids = self.request.query_params.get('workspace_ids')
        if not workspace_ids:
            raise ValidationError({'workspace_ids': ['This parameter is required for this endpoint.']})
        return workspace_ids

    def _validate_team_leader_access(self, user):
        """Return role context for TL-only endpoints or raise PermissionDenied."""
        if user.is_staff or user.is_superuser:
            return 'staff'
        profile = getattr(user, 'profile', None)
        if profile and profile.is_team_leader:
            return 'team_leader'
        raise PermissionDenied('Only team leaders can access this endpoint.')

    def _filter_team_leader_queryset(self, queryset, user, apply_workspace_filter=False):
        """Apply appropriate TL/staff filtering for team_logs / team_pending.

        Uses the same membership sources as ``get_team_member_ids`` (FK
        assignments, shared team M2M, and ``Team.team_leader`` / led_teams)
        plus the TL themselves. Previously only italian_tl/albanian_tl FKs
        were applied, so TLs whose authority comes from ``led_teams`` saw
        empty team queues despite ``is_team_leader`` being True.

        Args:
            queryset: The queryset to filter
            user: The current user
            apply_workspace_filter: If True, apply workspace filtering
        """
        role = self._validate_team_leader_access(user)
        if role == 'staff':
            if apply_workspace_filter:
                return self._apply_workspace_filter(queryset)
            return queryset

        profile = getattr(user, 'profile', None)
        if not profile:
            return queryset.none()

        target_user_ids = set(profile.get_team_member_ids())
        target_user_ids.add(user.id)
        if apply_workspace_filter:
            workspace_user_ids = self._get_workspace_user_ids()
            if workspace_user_ids is not None:
                target_user_ids = target_user_ids.intersection(workspace_user_ids)
                target_user_ids.add(user.id)
        if not target_user_ids:
            return queryset.none()
        return queryset.filter(user_id__in=target_user_ids)

    def filter_for_team_leader(self, queryset, user):
        """Filter TL-visible queryset, intersecting with workspace scope when set.

        Always includes the TL's own ID so team dashboards/lists show their
        personal entries alongside managed members (multi-role TL+HR included).
        """
        profile = getattr(user, 'profile', None)
        if profile:
            target_user_ids = set(profile.get_team_member_ids())
            target_user_ids.add(user.id)
            workspace_user_ids = self._get_workspace_user_ids()
            if workspace_user_ids is not None:
                target_user_ids = target_user_ids.intersection(workspace_user_ids)
                # Keep the TL themselves even when the selected workspace
                # membership list is empty/narrow — personal rows stay visible.
                target_user_ids.add(user.id)
            if target_user_ids:
                return queryset.filter(user_id__in=target_user_ids)
        return queryset.none()

    def filter_for_regular_user(self, queryset, user):
        """Filter queryset for regular users.
        Shows only their own data unless workspace_ids is provided,
        in which case it shows all users in those workspaces.
        """
        # If workspace_ids is provided, we allow seeing others in those workspaces
        # (provided the user has access to the workspaces, which _apply_workspace_filter handles)
        if self.request.query_params.get('workspace_ids'):
            return self._apply_workspace_filter(queryset)

        if hasattr(queryset.model, 'user'):
            queryset = queryset.filter(user=user)
        return self._apply_workspace_filter(queryset)



class TeamLeaderFilterMixin(WorkspaceFilterMixin):
    """
    Mixin to handle team leader-specific queryset filtering.
    TLs can only see their team members' data.
    Supports workspace_ids filter to intersect TL-managed users with workspace users.
    """
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        # Detail actions (approve, reject) need full queryset access for permission checks
        # TLs are assigned to users via italian_tl/albanian_tl FKs, not workspace membership
        # Permission check ensures authority, so workspace filter should not block access
        if self.action in {'approve', 'reject'}:
            return queryset

        # Bulk actions need workspace filtering to limit scope
        if self.action in {'bulk_approve', 'bulk_reject', 'bulk_delete'}:
            return self._apply_workspace_filter(queryset)
        
        # Superusers and staff see all data
        if user.is_superuser or user.is_staff:
            return self._apply_workspace_filter(queryset)
        
        # HR sees all data
        if hasattr(user, 'profile') and user.profile.is_hr:
            return self._apply_workspace_filter(queryset)
        
        # Check if user is a TL
        is_tl = hasattr(user, 'profile') and user.profile.is_team_leader
        
        if is_tl:
            return self.filter_for_team_leader(queryset, user)
        
        # Regular users see only their own data
        return self.filter_for_regular_user(queryset, user)
    

class PersonalOnlyFilterMixin(WorkspaceFilterMixin):
    """
    Mixin for standard pages where ALL users (including TLs) see only their own data.
    Use this on overtime/standby main pages - TLs see their own logs here.
    Team management pages use TeamLeaderFilterMixin instead.
    Supports workspace_ids filter to scope data to selected workspace(s).
    """
    allow_staff_global_view = True
    staff_global_view_actions: set[str] = set()

    def _staff_can_view_all(self, user):
        """Return True if staff/HR are allowed to see all records for this viewset."""
        if user.is_superuser:
            return True

        allow = getattr(self, 'allow_staff_global_view', True)
        if not allow:
            allowed_actions = getattr(self, 'staff_global_view_actions', set())
            action = getattr(self, 'action', None)
            if action in allowed_actions:
                allow = True

        if not allow:
            return False

        if user.is_staff:
            return True
        profile = getattr(user, 'profile', None)
        return bool(profile and profile.is_hr)

    def _apply_personal_workspace_filter(self, queryset, user):
        """Apply workspace scope without hiding the requester's own records."""
        if not hasattr(queryset.model, 'user'):
            return queryset

        user_ids = self._get_workspace_user_ids()
        if user_ids is None:
            return queryset

        user_ids = set(user_ids)
        if self.request.query_params.get('calendar', '').lower() in {'1', 'true', 'yes'}:
            try:
                from plugins.control_room.services.scope_service import get_calendar_excluded_user_ids
                user_ids.difference_update(get_calendar_excluded_user_ids())
            except ImportError:
                pass
        else:
            user_ids.add(user.id)
        return queryset.filter(user_id__in=user_ids)

    def _apply_date_filter(self, queryset):
        """Apply date filtering based on query params or default to current month.
        
        Handles models with 'date' field (OvertimeLog, StandbyLog) and models
        with 'start_date' field (LeaveRequest).
        """
        ignore_date_filter = self.request.query_params.get('ignore_date_filter')
        if ignore_date_filter == 'true':
            return queryset

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        # Determine which date field to use
        model_fields = [f.name for f in queryset.model._meta.get_fields()]
        if 'date' in model_fields:
            date_field = 'date'
        elif 'start_date' in model_fields:
            date_field = 'start_date'
        else:
            return queryset
        
        # If no date filters provided, default to current month
        if not date_from and not date_to:
            today = timezone.now()
            queryset = queryset.filter(
                **{f'{date_field}__year': today.year, f'{date_field}__month': today.month}
            )
        else:
            if date_from:
                queryset = queryset.filter(**{f'{date_field}__gte': date_from})
            if date_to:
                queryset = queryset.filter(**{f'{date_field}__lte': date_to})
        
        return queryset

    def get_queryset(self):
        base_queryset = super().get_queryset()
        user = self.request.user

        # Detail actions (approve, reject) need full queryset access for permission checks
        # Skip filtering to allow permission checks to work correctly
        if self.action in {'approve', 'reject'}:
            return base_queryset

        if self._staff_can_view_all(user):
            staff_queryset = self._apply_workspace_filter(base_queryset)
            return self._apply_date_filter(staff_queryset)

        # If workspace_ids is provided, we allow seeing others in those workspaces
        # (provided the user has access to the workspaces, which _apply_workspace_filter handles)
        # Use _apply_personal_workspace_filter to ensure requester's own records are always visible
        if self.request.query_params.get('workspace_ids'):
            queryset = self._apply_personal_workspace_filter(base_queryset, user)
            return self._apply_date_filter(queryset)

        personal_queryset = base_queryset
        if hasattr(base_queryset.model, 'user'):
            personal_queryset = base_queryset.filter(user=user)

        # Apply date filtering (current month by default)
        personal_queryset = self._apply_date_filter(personal_queryset)

        return self._apply_personal_workspace_filter(personal_queryset, user)


class PluginPermissionMixin:
    """
    Mixin to check plugin-level permissions.
    
    Provides methods to verify if a user has access to a specific plugin action.
    Integrates with the PluginPermission model for flexible access control.
    """
    
    def _get_plugin_name(self):
        """
        Get plugin name from the request context or infer from module path.
        Override this method if plugin name is not in kwargs.
        """
        # Try explicit attribute first
        if hasattr(self, 'plugin_name') and self.plugin_name:
            return self.plugin_name
        
        # Try kwargs
        if 'plugin_name' in self.kwargs:
            return self.kwargs['plugin_name']
        
        # Infer from module path
        module_path = self.__class__.__module__
        if module_path.startswith('plugins.'):
            # Extract plugin name from path like 'plugins.analytics.viewsets'
            parts = module_path.split('.')
            if len(parts) >= 2:
                return parts[1]  # Returns 'analytics' from 'plugins.analytics.viewsets'
        
        return None
    
    def _has_plugin_permission(self, user, plugin_name, action='view'):
        """
        Check if user has permission to perform action on plugin.
        
        Args:
            user: Django User object
            plugin_name: Name of the plugin (e.g., 'analytics', 'budget')
            action: Action type (view, manage, configure, export)
        
        Returns:
            bool: True if user has permission, False otherwise
        """
        # Superuser/staff always have access
        if user.is_superuser or user.is_staff:
            return True
        
        try:
            from apps.plugins.models import PluginPermission
            
            plugin_perm = PluginPermission.objects.get(
                plugin_name=plugin_name,
                action=action
            )
            return plugin_perm.has_access(user)
        except PluginPermission.DoesNotExist:
            logger.warning(f"PluginPermission not found for {plugin_name}:{action}")
            # If permission doesn't exist, deny access (fail secure)
            return False
        except Exception as e:
            logger.error(f"Error checking plugin permission: {e}")
            return False
    
    def check_plugin_permission(self, plugin_name, action='view'):
        """
        Check plugin permission and raise PermissionDenied if user lacks access.
        
        Args:
            plugin_name: Name of the plugin
            action: Action type (view, manage, configure, export)
        
        Raises:
            PermissionDenied: If user doesn't have permission
        """
        # Superuser/staff always have access - bypass check
        if self.request.user.is_superuser or self.request.user.is_staff:
            return
        
        if not self._has_plugin_permission(self.request.user, plugin_name, action):
            raise PermissionDenied(
                detail=f"You don't have permission to {action} the {plugin_name} plugin."
            )
    
    def _resolve_permission_action(self, request):
        """
        Resolve which PluginPermission action (view/manage/configure/export)
        applies to the current request.

        Custom @action methods can be mapped explicitly via the viewset's
        ``permission_action_map`` attribute, e.g.::

            permission_action_map = {'download_report': 'export', 'configure': 'configure'}

        Falls back to HTTP-method semantics: safe methods -> 'view',
        unsafe methods -> 'manage'.
        """
        action_map = getattr(self, 'permission_action_map', {}) or {}
        current_action = getattr(self, 'action', None)
        if current_action and current_action in action_map:
            return action_map[current_action]
        return 'view' if request.method in permissions.SAFE_METHODS else 'manage'

    def check_permissions(self, request):
        """
        Override to add plugin permission checks.
        This is called by DRF before any action is dispatched.
        """
        # Call parent check_permissions first
        super().check_permissions(request)
        
        # Superuser/staff always have access - bypass plugin check
        if request.user.is_superuser or request.user.is_staff:
            return
        
        # Check plugin permission
        plugin_name = self._get_plugin_name()
        if plugin_name:
            # Check permission for the current action (honors permission_action_map)
            action = self._resolve_permission_action(request)
            self.check_plugin_permission(plugin_name, action)
