"""
Leave management app viewsets.
"""

from decimal import Decimal

from rest_framework import viewsets, filters, status, permissions
from core.mixins.cache import CacheInvalidationMixin
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db import transaction
from django.db.models import Prefetch, Count
from django.db.models.functions import TruncMonth
from core.mixins.permissions import (
    SuperuserPermissionMixin,
    PersonalOnlyFilterMixin,
    TeamLeaderFilterMixin,
    BulkActionMixin,
    HRReadOnlyMixin,
    has_team_leader_role,
    resolve_target_user,
)
from .models import LeaveBalance, LeaveRequest, GlobalSettings, count_business_days
from .filters import LeaveRequestFilter
try:
    from plugins.notifications.idempotency import idempotency_scope, IdempotencyReplay
except ImportError:
    from contextlib import nullcontext

    class IdempotencyReplay(Exception):
        """No-op fallback when the notifications plugin is not installed."""
        def __init__(self, response):
            self.response = response

    def idempotency_scope(request, endpoint):
        """No-op fallback: yields None (no idempotency tracking)."""
        return nullcontext(None)

from .serializers import (
    GlobalSettingsSerializer,
    LeaveBalanceSerializer,
    LeaveBalanceSummarySerializer,
    LeaveRequestSerializer,
    LeaveRequestCreateSerializer,
)


def ensure_current_year_balance(user, year):
    """Ensure a current-year vacation balance exists and hire_date is set.

    Shared by LeaveBalanceViewSet (summary) and LeaveRequestViewSet (create).
    Previously only existed as a method on LeaveRequestViewSet while
    LeaveBalanceViewSet.user_balance_summary called ``self._ensure…`` → 500.
    """
    profile = getattr(user, 'profile', None)
    today = timezone.now().date()
    hire_date = None

    if profile:
        hire_date = getattr(profile, 'hire_date', None)

    if not hire_date:
        hire_date = user.date_joined.date() if getattr(user, 'date_joined', None) else today
        if profile:
            profile.hire_date = hire_date
            profile.save(update_fields=['hire_date'])

    settings_obj, _ = GlobalSettings.objects.get_or_create(pk=1)

    balance, created = LeaveBalance.objects.get_or_create(
        user=user,
        leave_type='vacation',
        is_carry_over=False,
        year=year,
        defaults={
            'total_days': settings_obj.default_yearly_leave_days,
            'accrual_start_date': hire_date,
        },
    )

    if not created and not balance.accrual_start_date:
        balance.accrual_start_date = hire_date
        balance.save(update_fields=['accrual_start_date'])
    return balance


class LeaveBalanceViewSet(CacheInvalidationMixin, SuperuserPermissionMixin, HRReadOnlyMixin, PersonalOnlyFilterMixin, viewsets.ModelViewSet):
    """ViewSet for LeaveBalance model. Admin/HR can update; regular users read-only."""
    allow_staff_global_view = False
    staff_global_view_actions = {'team_balances'}
    queryset = LeaveBalance.objects.all().select_related('user')
    serializer_class = LeaveBalanceSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'user__first_name', 'user__last_name']
    filterset_fields = ['user', 'leave_type', 'year']

    def get_queryset(self):
        user_id = self.request.query_params.get('user')
        if user_id:
            try:
                user_id = int(user_id)
            except (ValueError, TypeError) as exc:
                raise ValidationError({'user': 'A valid user ID is required.'}) from exc

            user = self.request.user
            allowed_ids = {user.id}
            profile = getattr(user, 'profile', None)
            if user.is_staff or user.is_superuser or (profile and profile.is_hr):
                return self.queryset.filter(user_id=user_id)
            if profile and profile.is_team_leader:
                allowed_ids.update(profile.get_team_member_ids())
            if user_id not in allowed_ids:
                raise PermissionDenied('You cannot view this user\'s leave balance.')
            return self.queryset.filter(user_id=user_id)
        return super().get_queryset()

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        """Override to add cache invalidation."""
        serializer.save()
        self.invalidate_related_cache()

    def perform_update(self, serializer):
        """Override to add cache invalidation."""
        serializer.save()
        self.invalidate_related_cache()

    def perform_destroy(self, instance):
        """Override to add cache invalidation."""
        instance.delete()
        self.invalidate_related_cache()

    @action(detail=False, methods=['get'])
    def team_balances(self, request):
        """
        Get leave balances for TL's team members.
        Only accessible by team leaders and above.
        workspace_ids is optional; when omitted, all team members' balances are returned.
        """
        user = request.user

        queryset = LeaveBalance.objects.all().select_related('user')

        try:
            queryset = self._filter_team_leader_queryset(queryset, user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

        # Apply filters
        year = request.query_params.get('year')
        leave_type = request.query_params.get('leave_type')
        if year:
            queryset = queryset.filter(year=year)
        if leave_type:
            queryset = queryset.filter(leave_type=leave_type)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def user_balance_summary(self, request):
        """
        Get comprehensive balance summary for the current user.
        Returns carry-over, current year, used days, pending days, and accrual progress.
        """
        user = request.user
        current_year = timezone.now().year

        # Ensure balance records exist (shared helper — not a method on this class)
        ensure_current_year_balance(user, current_year)

        # Get all balances for the user
        balances = LeaveBalance.objects.filter(user=user).select_related('user')

        summary = {
            'user_id': user.id,
            'username': user.username,
            'full_name': f"{user.first_name} {user.last_name}".strip() or user.username,
            'year': current_year,
            'vacation': self._get_leave_type_summary(balances, 'vacation', current_year),
        }
        serializer = LeaveBalanceSummarySerializer(summary)
        return Response(serializer.data)

    def _get_leave_type_summary(self, balances, leave_type, current_year):
        """Get summary for a specific leave type."""
        type_balances = balances.filter(leave_type=leave_type)

        # Carry-over rows are stored under the *previous* calendar year
        # (see _deduct_balance / _fetch_vacation_balances). Filtering
        # year=current_year always returned None — silent empty UI summary.
        carry_over = type_balances.filter(
            is_carry_over=True, year=current_year - 1
        ).first()
        current = type_balances.filter(is_carry_over=False, year=current_year).first()

        summary = {
            'carry_over': None,
            'current_year': None,
            'total_available': 0,
            'total_used': 0,
            'total_pending': 0,
        }

        if carry_over:
            summary['carry_over'] = {
                'id': carry_over.id,
                'total_days': float(carry_over.total_days),
                'used_days': float(carry_over.used_days),
                'pending_days': float(carry_over.pending_days),
                'available_days': float(carry_over.available_days),
                'effective_available_days': float(carry_over.get_effective_available_days()),
                'expires_at': carry_over.expires_at,
                'is_expired': carry_over.is_expired,
            }
            summary['total_available'] += summary['carry_over']['effective_available_days']

        if current:
            summary['current_year'] = {
                'id': current.id,
                'total_days': float(current.total_days),
                'used_days': float(current.used_days),
                'pending_days': float(current.pending_days),
                'available_days': float(current.available_days),
                'effective_available_days': float(current.get_effective_available_days()),
                'accrual_start_date': current.accrual_start_date,
                'monthly_accrued_days': float(current.get_monthly_accrued_days()),
            }
            summary['total_available'] += summary['current_year']['effective_available_days']
            summary['total_used'] += float(current.used_days)
            summary['total_pending'] += float(current.pending_days)

        return summary


class GlobalSettingsViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    """ViewSet for GlobalSettings singleton. Admin write, all authenticated read."""
    queryset = GlobalSettings.objects.all()
    serializer_class = GlobalSettingsSerializer

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]

    def get_object(self):
        # Return singleton - create if not exists
        obj, _ = GlobalSettings.objects.get_or_create(pk=1)
        return obj


class LeaveRequestViewSet(SuperuserPermissionMixin, HRReadOnlyMixin, TeamLeaderFilterMixin, BulkActionMixin, viewsets.ModelViewSet):
    """ViewSet for LeaveRequest model."""
    allow_staff_global_view = False
    staff_global_view_actions = {'approve', 'reject', 'bulk_approve', 'bulk_reject', 'bulk_delete', 'team_logs', 'team_pending'}
    queryset = LeaveRequest.objects.all().select_related('user', 'approved_by').prefetch_related('user__profile__team_memberships__team')
    serializer_class = LeaveRequestSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'reason']
    filterset_class = LeaveRequestFilter

    def get_serializer_class(self):
        if self.action == 'create':
            return LeaveRequestCreateSerializer
        return LeaveRequestSerializer

    def create(self, request, *args, **kwargs):
        """Create then return the full read serializer (includes days_requested)."""
        try:
            with idempotency_scope(request, 'leave') as scope:
                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                self.perform_create(serializer)
                instance = LeaveRequest.objects.select_related(
                    'user', 'approved_by', 'balance'
                ).get(pk=serializer.instance.pk)
                output = LeaveRequestSerializer(instance, context=self.get_serializer_context())
                headers = self.get_success_headers(output.data)
                response = Response(output.data, status=status.HTTP_201_CREATED, headers=headers)
                if scope is not None:
                    scope.complete(response)
                return response
        except IdempotencyReplay as replay:
            return replay.response

    def perform_update(self, serializer):
        """Revalidate balances when leave requests change."""
        instance = self.get_object()
        incoming = serializer.validated_data
        target_user = incoming.get('user', instance.user)
        request_type = incoming.get('request_type', instance.request_type)
        start_date = incoming.get('start_date', instance.start_date)
        end_date = incoming.get('end_date', instance.end_date)

        self._ensure_no_overlap(target_user, start_date, end_date, exclude_request_id=instance.id)

        if request_type == 'vacation':
            self._validate_vacation_request(target_user, start_date, end_date)

        with transaction.atomic():
            if instance.request_type == 'vacation' and instance.balance:
                self._release_balance(instance)

            update_kwargs = {}
            if instance.status == 'approved':
                update_kwargs = {'status': 'pending', 'approved_by': None, 'approved_at': None}

            updated_obj = serializer.save(**update_kwargs)

            if updated_obj.request_type == 'vacation':
                self._deduct_balance(updated_obj)
            elif updated_obj.balance_id:
                updated_obj.balance = None
                updated_obj.save(update_fields=['balance'])

        # Invalidate cache for the affected user
        self.invalidate_related_cache()

    def get_queryset(self):
        # Detail actions (approve, reject) need full queryset access for permission checks
        # TLs are assigned to users via italian_tl/albanian_tl FKs, not workspace membership
        # Permission check ensures authority, so workspace filter should not block access
        if self.action in {'approve', 'reject'}:
            queryset = self.queryset
        # Bulk actions need to access team members' records for TLs
        elif self.action in {'bulk_approve', 'bulk_reject', 'bulk_delete'}:
            queryset = self.queryset
        else:
            # If workspace_ids provided (e.g. from calendar), use mixin logic to show others.
            if self.request.query_params.get('workspace_ids'):
                queryset = super().get_queryset()
            else:
                queryset = super().get_queryset()

        current_year = timezone.now().year
        balances_prefetch = Prefetch(
            'user__leave_balances',
            queryset=LeaveBalance.objects.filter(
                year=current_year,
                leave_type='vacation'
            ).only(
                'id', 'user_id', 'year', 'leave_type', 'is_carry_over',
                'total_days', 'used_days', 'pending_days', 'expires_at',
                'accrual_start_date'
            ),
            to_attr='prefetched_leave_balances'
        )
        return queryset.prefetch_related(balances_prefetch)

    @action(detail=False, methods=['get'])
    def team_logs(self, request):
        """Get team leave requests for TL/HR/staff viewers only."""
        user = request.user

        if not (user.is_staff or user.is_superuser or (has_team_leader_role(user))):
            return Response({'error': 'Only team leaders can access this endpoint.'}, status=status.HTTP_403_FORBIDDEN)

        # workspace_ids is optional for team_logs; when omitted, all team members' entries are returned
        # Get base queryset
        queryset = LeaveRequest.objects.all().select_related('user', 'approved_by').prefetch_related('user__profile__team_memberships__team')

        queryset = self._filter_team_leader_queryset(queryset, user)

        # Apply filters
        status_filter = request.query_params.get('status')
        request_type = request.query_params.get('request_type')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if request_type:
            queryset = queryset.filter(request_type=request_type)

        # Handle pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def team_pending(self, request):
        """
        Get pending leave requests for TL's team members.
        Only accessible by team leaders and above.
        """
        user = request.user

        # workspace_ids is optional for team_pending; when omitted, all team members' pending requests are returned
        # Get base queryset
        queryset = LeaveRequest.objects.all().select_related('user', 'approved_by').filter(status='pending')

        try:
            queryset = self._filter_team_leader_queryset(queryset, user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

        # Apply additional filters from query params
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        request_type = request.query_params.get('request_type')
        if date_from:
            queryset = queryset.filter(start_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(end_date__lte=date_to)
        if request_type:
            queryset = queryset.filter(request_type=request_type)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def team_pending_months(self, request):
        """
        Return months that contain pending leave requests for the TL's team.
        Used by the approval dashboard to jump to months with pending items.
        Groups by the leave start_date month.
        Returns: [{ "month": "2026-01-01", "count": 5 }, ...] sorted ascending.
        """
        user = request.user
        if not (user.is_staff or user.is_superuser or (has_team_leader_role(user))):
            return Response(
                {'error': 'Only team leaders can access this endpoint.'},
                status=status.HTTP_403_FORBIDDEN
            )

        queryset = LeaveRequest.objects.filter(status='pending')
        try:
            queryset = self._filter_team_leader_queryset(queryset, user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

        months = (
            queryset
            .annotate(month=TruncMonth('start_date'))
            .values('month')
            .annotate(count=Count('id'))
            .order_by('month')
        )
        return Response([
            {'month': m['month'].isoformat(), 'count': m['count']}
            for m in months
        ])

    def perform_create(self, serializer):
        from plugins.audit_log.signals import log_action

        target_user, impersonated = resolve_target_user(
            self.request.user, self.request.data.get('user')
        )
        request_type = serializer.validated_data.get('request_type', 'vacation')
        start_date = serializer.validated_data.get('start_date')
        end_date = serializer.validated_data.get('end_date')

        self._ensure_no_overlap(target_user, start_date, end_date)
        if request_type == 'vacation':
            self._validate_vacation_request(target_user, start_date, end_date)

        with transaction.atomic():
            obj = serializer.save(user=target_user)
            if request_type == 'vacation':
                self._deduct_balance(obj)

        if impersonated:
            log_action(
                self.request.user,
                'create_for_user',
                description=f'Created leave request for user_id={target_user.pk}',
                obj=obj,
            )
        self.invalidate_related_cache()

    def perform_destroy(self, instance):
        with transaction.atomic():
            if instance.request_type == 'vacation' and instance.balance:
                self._release_balance(instance, detach=False)
            super().perform_destroy(instance)
        self.invalidate_related_cache()

    def _deduct_balance(self, request_obj):
        """Deduct leave days from balance with carry-over priority.

        Non-expired carry-over balances are prioritized. After expiry, only current
        year balance is used. This ensures proper balance rotation while respecting
        each balance's own expiry date.
        """
        year = request_obj.start_date.year
        days = Decimal(request_obj.days_requested)
        user = request_obj.user
        today = timezone.localdate()

        with transaction.atomic():
            # Prioritize non-expired carry-over for the previous year
            carry_over = LeaveBalance.objects.filter(
                user=user, leave_type='vacation', is_carry_over=True,
                year=year - 1, expires_at__gte=today
            ).select_for_update().first()

            if carry_over and carry_over.get_effective_available_days() >= days:
                carry_over.pending_days += days
                carry_over.save(update_fields=['pending_days'])
                request_obj.balance = carry_over
                request_obj.save(update_fields=['balance'])
                return

            # After expiry or insufficient carry-over, use current year
            current = LeaveBalance.objects.filter(
                user=user, leave_type='vacation', is_carry_over=False, year=year
            ).select_for_update().first()
            if current:
                current.pending_days += days
                current.save(update_fields=['pending_days'])
                request_obj.balance = current
                request_obj.save(update_fields=['balance'])

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        request_obj = self.get_object()
        if not self._can_approve(request.user, request_obj):
            return Response({'error': 'No permission'}, status=status.HTTP_403_FORBIDDEN)

        self.perform_approve(request_obj, request.user)

        return Response(self.get_serializer(request_obj).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        request_obj = self.get_object()
        if not self._can_approve(request.user, request_obj):
            return Response({'error': 'No permission'}, status=status.HTTP_403_FORBIDDEN)

        rejection_reason = request.data.get('rejection_reason', '')
        self.perform_reject(request_obj, request.user, rejection_reason)

        return Response(self.get_serializer(request_obj).data)

    def perform_approve(self, obj, user):
        """Hook to perform the actual approval. Override for custom balance logic."""
        with transaction.atomic():
            locked = LeaveRequest.objects.select_for_update().select_related('balance').get(pk=obj.pk)
            old_status = locked.status
            locked.status = 'approved'
            locked.approved_by = user
            locked.approved_at = timezone.now()
            locked.rejection_reason = ''
            locked.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason'])

            if old_status == 'pending' and locked.balance_id:
                from decimal import Decimal
                balance = LeaveBalance.objects.select_for_update().get(pk=locked.balance_id)
                days = Decimal(locked.days_requested)
                balance.pending_days -= days
                balance.used_days += days
                balance.save(update_fields=['pending_days', 'used_days'])

        obj.refresh_from_db()
        self.invalidate_related_cache()

    def perform_reject(self, obj, user, reason):
        """Hook to perform the actual rejection. Override for custom balance logic."""
        with transaction.atomic():
            locked = LeaveRequest.objects.select_for_update().select_related('balance').get(pk=obj.pk)
            old_status = locked.status
            locked.status = 'rejected'
            locked.approved_by = user
            locked.approved_at = timezone.now()
            locked.rejection_reason = reason
            locked.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason'])

            if old_status == 'pending' and locked.balance_id:
                from decimal import Decimal
                balance = LeaveBalance.objects.select_for_update().get(pk=locked.balance_id)
                days = Decimal(locked.days_requested)
                balance.pending_days -= days
                balance.save(update_fields=['pending_days'])

        obj.refresh_from_db()
        self.invalidate_related_cache()

    def _validate_vacation_request(self, user, start_date, end_date):
        if not start_date or not end_date:
            raise ValidationError('Vacation requests require start and end dates.')
        if end_date < start_date:
            raise ValidationError('End date must be after start date.')

        # Must match LeaveRequest.days_requested (business days, not calendar span).
        days_requested = count_business_days(start_date, end_date)
        if days_requested <= 0:
            raise ValidationError('Vacation requests must include at least one weekday.')

        year = start_date.year
        ensure_current_year_balance(user, year)

        carry_over, current = self._fetch_vacation_balances(user, year)
        carry_available = carry_over.get_effective_available_days() if carry_over else Decimal('0')
        current_available = current.get_effective_available_days() if current else Decimal('0')

        # Validate based on carry-over priority logic
        if carry_over and not carry_over.is_expired and carry_available >= days_requested:
            # Non-expired carry-over: prioritize it
            usable = carry_available
            source = 'carry-over'
        else:
            # Expired or insufficient carry-over: use current year
            usable = current_available
            source = 'current year'

        if usable < days_requested:
            raise ValidationError(
                f"Insufficient leave balance. Requested {days_requested}d, "
                f"available: carry-over {float(carry_available)}d, "
                f"current year {float(current_available)}d "
                f"(using {source} balance; combined requests must fit a single balance)."
            )

    def _ensure_no_overlap(self, user, start_date, end_date, exclude_request_id=None):
        if not user or not start_date or not end_date:
            return

        conflicts = LeaveRequest.objects.filter(
            user=user,
            status__in=['pending', 'approved'],
            start_date__lte=end_date,
            end_date__gte=start_date,
        )
        if exclude_request_id:
            conflicts = conflicts.exclude(id=exclude_request_id)

        if conflicts.exists():
            raise ValidationError('Overlapping leave request already exists for the selected dates.')

    def _fetch_vacation_balances(self, user, year):
        today = timezone.localdate()
        carry_over = LeaveBalance.objects.filter(
            user=user,
            leave_type='vacation',
            is_carry_over=True,
            year=year - 1,
            expires_at__gte=today
        ).first()
        current = LeaveBalance.objects.filter(
            user=user,
            leave_type='vacation',
            is_carry_over=False,
            year=year
        ).first()
        return carry_over, current

    def _ensure_current_year_balance(self, user, year):
        """Compat wrapper — prefer module-level ensure_current_year_balance."""
        return ensure_current_year_balance(user, year)

    def _release_balance(self, request_obj, detach=True):
        balance = request_obj.balance
        if not balance:
            return

        # Lock the balance row to prevent concurrent modifications from
        # perform_destroy/perform_update losing updates. perform_approve
        # and perform_reject already lock via select_for_update; this
        # closes the gap for the release path.
        balance = LeaveBalance.objects.select_for_update().get(pk=balance.pk)

        days = Decimal(request_obj.days_requested)
        zero = Decimal('0')
        fields = []

        if request_obj.status in ('pending', 'cancelled'):
            new_pending = balance.pending_days - days
            if new_pending < zero:
                new_pending = zero
            if new_pending != balance.pending_days:
                balance.pending_days = new_pending
                fields.append('pending_days')

        if request_obj.status == 'approved':
            new_used = balance.used_days - days
            if new_used < zero:
                new_used = zero
            if new_used != balance.used_days:
                balance.used_days = new_used
                fields.append('used_days')

        if fields:
            balance.save(update_fields=fields)

        if detach:
            request_obj.balance = None
            request_obj.save(update_fields=['balance'])
