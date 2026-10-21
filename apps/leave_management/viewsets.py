"""
Leave management app viewsets.
"""

from decimal import Decimal

from rest_framework import viewsets, filters, status, permissions
from core.mixins.cache import CacheInvalidationMixin
from core.utils.cache import (
    build_query_fingerprint,
    get_cached_response_data,
    set_cached_response_data,
)
from apps.core.cache_constants import CacheKey, CacheTTL
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db import transaction
from django.db.models import Prefetch, Count
from django.db.models.functions import TruncMonth
from core.pagination import LargeResultsPagination
from core.mixins.permissions import (
    HbprBlockedMixin,
    SuperuserPermissionMixin,
    PersonalOnlyFilterMixin,
    TeamLeaderFilterMixin,
    BulkActionMixin,
    HRReadOnlyMixin,
    has_team_leader_role,
    resolve_target_user,
)
from .models import LeaveBalance, LeaveRequest, GlobalSettings, count_leave_days
from .services.carry_over import (
    carry_over_expiry_for,
    ensure_year_end_rollover,
    find_carry_balance,
    is_closed_year,
    move_request_days,
    plan_vacation_split,
)
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
from core.utils.timezone_local import business_today


def ensure_current_year_balance(user, year):
    """Ensure a current-year vacation balance exists and hire_date is set.

    Shared by LeaveBalanceViewSet (summary) and LeaveRequestViewSet (create).
    Previously only existed as a method on LeaveRequestViewSet while
    LeaveBalanceViewSet.user_balance_summary called ``self._ensure…`` → 500.
    """
    ensure_year_end_rollover()
    profile = getattr(user, 'profile', None)
    today = business_today()
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


class LeaveBalanceViewSet(HbprBlockedMixin, CacheInvalidationMixin, SuperuserPermissionMixin, HRReadOnlyMixin, PersonalOnlyFilterMixin, viewsets.ModelViewSet):
    """ViewSet for LeaveBalance model. Admin/HR can update; regular users read-only."""
    allow_staff_global_view = False
    staff_global_view_actions = {'team_balances'}
    # The admin balances page loads the whole roster in one request.
    pagination_class = LargeResultsPagination
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
        ensure_year_end_rollover()
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


class GlobalSettingsViewSet(HbprBlockedMixin, CacheInvalidationMixin, SuperuserPermissionMixin, viewsets.ModelViewSet):
    """ViewSet for GlobalSettings singleton. Admin write, all authenticated read."""
    queryset = GlobalSettings.objects.all().order_by('id')
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

    def list(self, request, *args, **kwargs):
        # Read on nearly every business-day/leave validation path (per
        # CLAUDE.md invariant) — cache it, invalidated below on every write.
        # Checked before the get_or_create query below so a cache hit costs
        # zero DB queries, not one.
        cache_key = CacheKey.dashboard_reference(
            'global_settings', build_query_fingerprint(request)
        )
        cached = get_cached_response_data(cache_key)
        if cached is not None:
            return Response(cached)
        # The frontend only ever calls list(), never retrieve() — ensure the
        # singleton exists here too, or a DB with no leave requests yet
        # (nothing else creates pk=1) returns an empty page forever.
        GlobalSettings.objects.get_or_create(pk=1)
        response = super().list(request, *args, **kwargs)
        set_cached_response_data(cache_key, response.data, CacheTTL.LONG)
        return response

    def perform_update(self, serializer):
        with transaction.atomic():
            settings_obj = serializer.save()
            # The rule governs the current carry cycle. If rollover already ran,
            # target applied - 1; otherwise target the active year's carry rows (localdate().year - 1).
            # Older carry rows keep the expiry they were granted with, so an expired balance is never revived.
            applied = settings_obj.carry_over_applied_year
            target_year = (applied - 1) if applied is not None else (business_today().year - 1)
            cycle = LeaveBalance.objects.filter(
                is_carry_over=True, year=target_year,
            )
            for row in cycle.select_for_update():
                row.expires_at = carry_over_expiry_for(
                    row.year, settings_obj.carry_over_expiry_month, settings_obj.carry_over_expiry_day,
                )
                row.save(update_fields=['expires_at'])
        self.invalidate_related_cache()

    def perform_create(self, serializer):
        serializer.save()
        self.invalidate_related_cache()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        self.invalidate_related_cache()


class LeaveRequestViewSet(HbprBlockedMixin, SuperuserPermissionMixin, HRReadOnlyMixin, TeamLeaderFilterMixin, BulkActionMixin, viewsets.ModelViewSet):
    """ViewSet for LeaveRequest model."""
    allow_staff_global_view = False
    staff_global_view_actions = {'approve', 'reject', 'bulk_approve', 'bulk_reject', 'bulk_delete', 'team_logs', 'team_pending'}
    # Honors ?page_size= (up to 10000) so calendar workspace queries can fetch
    # the full dataset instead of being capped at the global 50-row page.
    pagination_class = LargeResultsPagination
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
        self._ensure_year_open(instance.start_date, start_date)

        with transaction.atomic():
            # Release the old reservation before validating the new dates, so the
            # check sees the balance the edit really has. If validation fails, the
            # release is rolled back with the rest of this transaction.
            if instance.request_type == 'vacation':
                self._release_balance(instance)

            if request_type == 'vacation':
                self._validate_vacation_request(target_user, start_date, end_date)

            update_kwargs = {}
            if instance.status == 'approved':
                update_kwargs = {'status': 'pending', 'approved_by': None, 'approved_at': None}

            updated_obj = serializer.save(**update_kwargs)

            if updated_obj.request_type == 'vacation':
                self._deduct_balance(updated_obj)
            elif updated_obj.balance_id or updated_obj.carry_balance_id:
                self._clear_balance_links(updated_obj)

    def _ensure_year_open(self, *dates):
        """Closed years are frozen: no request may be created or moved into one."""
        settings_obj = GlobalSettings.objects.get_or_create(pk=1)[0]
        for day in dates:
            if day and is_closed_year(day.year, settings_obj):
                raise ValidationError(
                    f'Year {day.year} is closed. Its leave cannot be created or moved; contact HR.'
                )

    def _clear_balance_links(self, request_obj):
        request_obj.balance = None
        request_obj.carry_balance = None
        request_obj.carry_days = Decimal('0')
        request_obj.save(update_fields=['balance', 'carry_balance', 'carry_days'])

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
            user = self.request.user
            if self.request.query_params.get('workspace_ids'):
                # If workspace_ids provided (e.g. from calendar), use mixin logic to show others.
                queryset = super().get_queryset()
            elif user.is_superuser or user.is_staff or (
                hasattr(user, 'profile') and user.profile.is_hr
            ):
                queryset = super().get_queryset()
            else:
                # Personal dashboard's default list must be self-only, even
                # for TLs — team-wide views go through the dedicated
                # team_logs/team_pending actions, which already scope
                # explicitly. Without this, TeamLeaderFilterMixin's default
                # get_queryset() (via super()) returns every managed team
                # member's rows too, leaking them into what's supposed to be
                # a personal-only view (matches overtime/standby's
                # PersonalOnlyFilterMixin behavior for their main list).
                queryset = self.queryset.filter(user=user)

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

    @action(detail=False, methods=['post'])
    def preview_split(self, request):
        """Counted days and the carry-over / current-year split for a prospective request.

        Uses the same rule as validation and deduction, so the preview cannot disagree.
        """
        try:
            start = parse_date(str(request.data.get('start_date', '')))
            end = parse_date(str(request.data.get('end_date', '')))
        except ValueError:  # well-formed but impossible date, e.g. 2026-02-30
            start = end = None
        if not start or not end or end < start:
            raise ValidationError({'end_date': 'Provide a start_date and an end_date on or after it.'})
        plan = plan_vacation_split(request.user.id, start, end)
        return Response({
            'days_counted': plan['counted'],
            'carry_days': float(plan['carry_days']),
            'current_days': float(plan['current_days']),
            'carry_expires_at': plan['carry_expires_at'],
        })

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
            self._ensure_year_open(start_date)
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

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def admin_requests(self, request):
        """One server-filtered page of every leave request for the admin page.

        Staff admins and HR only (same guard as the overtime/standby admin
        lists). Filters: status, user, request_type, date_from (start on or
        after), date_to (end on or before) and a whitespace-split search over
        the employee's username, name and the reason. ``status_counts`` covers
        the same filters except ``status`` so the chips stay meaningful.
        """
        from django.db.models import Q
        from core.mixins.permissions import has_hr_role

        user = request.user
        if not (user.is_superuser or user.is_staff or has_hr_role(user)):
            return Response(
                {'error': 'Only staff admins or HR can access this endpoint.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        params = request.query_params
        queryset = LeaveRequest.objects.all().select_related('user', 'approved_by').prefetch_related(
            'user__profile__team_memberships__team'
        )
        if params.get('user'):
            queryset = queryset.filter(user_id=params['user'])
        if params.get('request_type'):
            queryset = queryset.filter(request_type=params['request_type'])
        if params.get('date_from'):
            queryset = queryset.filter(start_date__gte=params['date_from'])
        if params.get('date_to'):
            queryset = queryset.filter(end_date__lte=params['date_to'])
        for term in (params.get('search') or '').split():
            queryset = queryset.filter(
                Q(user__username__icontains=term)
                | Q(user__first_name__icontains=term)
                | Q(user__last_name__icontains=term)
                | Q(reason__icontains=term)
            )
        queryset = queryset.order_by('-created_at', '-id')

        counts = queryset.aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='pending')),
            approved=Count('id', filter=Q(status='approved')),
            rejected=Count('id', filter=Q(status='rejected')),
            vacation=Count('id', filter=Q(request_type='vacation')),
            sick=Count('id', filter=Q(request_type='sick')),
        )
        if params.get('status'):
            queryset = queryset.filter(status=params['status'])

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data['status_counts'] = counts
        return response

    def perform_destroy(self, instance):
        with transaction.atomic():
            if instance.request_type == 'vacation' and instance.balance:
                self._release_balance(instance, detach=False)
            super().perform_destroy(instance)
        self.invalidate_related_cache()

    def _deduct_balance(self, request_obj):
        """Reserve a vacation request's days: carry-over first, then the current year.

        The split is by date (see plan_vacation_split): carry covers weekdays up to
        its expiry, the rest comes from the current year. Both parts are reserved as
        pending and recorded on the request, so later moves stay exact.
        """
        with transaction.atomic():
            # Lock the carry row before planning, so the availability the plan reads is
            # the committed value after any concurrent request has finished with it.
            carry_lock = find_carry_balance(request_obj.user_id, request_obj.start_date)
            if carry_lock is not None:
                LeaveBalance.objects.select_for_update().filter(pk=carry_lock.pk).first()
            plan = plan_vacation_split(request_obj.user_id, request_obj.start_date, request_obj.end_date)
            carry_days = plan['carry_days']
            carry_row = None
            if carry_days > 0:
                carry_row = LeaveBalance.objects.select_for_update().get(pk=plan['carry_balance'].pk)
                carry_row.pending_days += carry_days
                carry_row.save(update_fields=['pending_days'])

            current = LeaveBalance.objects.filter(
                user_id=request_obj.user_id, leave_type='vacation', is_carry_over=False,
                year=request_obj.start_date.year,
            ).select_for_update().first()
            if current and plan['current_days'] > 0:
                current.pending_days += plan['current_days']
                current.save(update_fields=['pending_days'])

            request_obj.carry_balance = carry_row
            request_obj.carry_days = carry_days
            request_obj.balance = current
            request_obj.save(update_fields=['carry_balance', 'carry_days', 'balance'])

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
            locked = LeaveRequest.objects.select_for_update().get(pk=obj.pk)
            old_status = locked.status
            if old_status == 'rejected' and locked.request_type == 'vacation' and is_closed_year(locked.start_date.year):
                raise ValidationError(
                    f'Year {locked.start_date.year} is closed: a rejected request cannot be re-approved.'
                )
            locked.status = 'approved'
            locked.approved_by = user
            locked.approved_at = timezone.now()
            locked.rejection_reason = ''
            locked.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason'])
            move_request_days(locked, old_status, 'approved')

        obj.refresh_from_db()
        self.invalidate_related_cache()

    def perform_reject(self, obj, user, reason):
        """Hook to perform the actual rejection. Override for custom balance logic."""
        with transaction.atomic():
            locked = LeaveRequest.objects.select_for_update().get(pk=obj.pk)
            old_status = locked.status
            locked.status = 'rejected'
            locked.approved_by = user
            locked.approved_at = timezone.now()
            locked.rejection_reason = reason
            locked.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason'])
            move_request_days(locked, old_status, 'rejected')

        obj.refresh_from_db()
        self.invalidate_related_cache()

    def _validate_vacation_request(self, user, start_date, end_date):
        if not start_date or not end_date:
            raise ValidationError('Vacation requests require start and end dates.')
        if end_date < start_date:
            raise ValidationError('End date must be after start date.')

        # Must match LeaveRequest.days_requested (holiday-aware business days).
        days_requested = count_leave_days(start_date, end_date)
        if days_requested <= 0:
            raise ValidationError('Vacation requests must include at least one weekday.')

        year = start_date.year
        ensure_current_year_balance(user, year)

        # Same split rule as deduction: carry covers weekdays up to its expiry.
        plan = plan_vacation_split(user.id, start_date, end_date)
        current = LeaveBalance.objects.filter(
            user=user, leave_type='vacation', is_carry_over=False, year=year,
        ).first()
        current_available = current.get_effective_available_days() if current else Decimal('0')
        if plan['current_days'] > current_available:
            carry_part = ''
            if plan['carry_days'] > 0:
                carry_part = (
                    f"{float(plan['carry_days'])}d from carry-over "
                    f"(valid to {plan['carry_expires_at']}), "
                )
            raise ValidationError(
                f"Insufficient leave balance. Requested {days_requested}d: {carry_part}"
                f"{float(plan['current_days'])}d from the {year} balance, "
                f"which has {float(current_available)}d available."
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

    def _ensure_current_year_balance(self, user, year):
        """Compat wrapper — prefer module-level ensure_current_year_balance."""
        return ensure_current_year_balance(user, year)

    def _release_balance(self, request_obj, detach=True):
        """Undo a request's reservation (pending) or usage (approved) on both balances.

        Rows are locked inside move_request_days, so concurrent edits can't lose updates.
        """
        move_request_days(request_obj, request_obj.status, 'cancelled')
        if detach:
            request_obj.balance = None
            request_obj.carry_balance = None
            request_obj.carry_days = Decimal('0')
            request_obj.save(update_fields=['balance', 'carry_balance', 'carry_days'])
