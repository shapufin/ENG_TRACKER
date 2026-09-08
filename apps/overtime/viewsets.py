"""
Overtime app viewsets.
"""

from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count
from django.db.models.functions import TruncMonth
from core.pagination import LargeResultsPagination
from core.mixins.permissions import (
    SuperuserPermissionMixin,
    PersonalOnlyFilterMixin,
    BulkActionMixin,
    HRReadOnlyMixin,
    MonthlyLockMixin,
    has_team_leader_role,
    resolve_target_user,
)
from .models import Client, OvertimeLog
try:
    from plugins.notifications.idempotency import IdempotentCreateMixin
except ImportError:
    class IdempotentCreateMixin:
        """No-op fallback when the notifications plugin is not installed."""
        pass
from .serializers import (
    ClientSerializer,
    OvertimeLogSerializer,
    OvertimeLogCreateSerializer,
    OvertimeApprovalSerializer,
    OvertimeSummarySerializer,
)


class ClientViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    """
    ViewSet for Client model.

    Non-admin users only see clients assigned to their profile
    (``user.profile.clients``). Staff/superusers see all clients for
    administrative management. Users with no clients assigned see an empty
    list rather than the full catalog — this prevents data leakage when the
    client catalog grows large.
    """
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'code']
    filterset_fields = ['is_active']
    lookup_field = 'pk'

    def get_queryset(self):
        """Scope to the user's assigned clients unless they are staff/superuser."""
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Client.objects.all()
        profile = getattr(user, 'profile', None)
        if profile is None:
            return Client.objects.none()
        return profile.clients.all()

    def get_permissions(self):
        # Already handled by SuperuserPermissionMixin for superusers
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAdminUser()]
        return super().get_permissions()

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

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def available(self, request):
        """Return all active clients for the self-assignment picker.

        Unlike the default ``get_queryset`` (which scopes to the user's
        assigned clients for non-staff), this action exposes the full active
        catalog so a user can pick which clients they work for in Settings.
        Inactive clients are excluded.
        """
        qs = Client.objects.filter(is_active=True).order_by('name')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class OvertimeLogViewSet(IdempotentCreateMixin, SuperuserPermissionMixin, HRReadOnlyMixin, PersonalOnlyFilterMixin, MonthlyLockMixin, BulkActionMixin, viewsets.ModelViewSet):
    """
    ViewSet for OvertimeLog model.

    Provides CRUD operations and approval workflow for overtime entries.
    """
    idempotency_endpoint = 'overtime'
    allow_staff_global_view = False
    staff_global_view_actions = {'approve', 'reject', 'bulk_approve', 'bulk_reject', 'bulk_delete', 'export'}
    queryset = OvertimeLog.objects.all().select_related('user', 'client', 'approved_by').prefetch_related('user__profile__team_memberships__team')
    serializer_class = OvertimeLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'client__name', 'description', 'reference_code']
    filterset_fields = ['status', 'client', 'date', 'user']
    pagination_class = LargeResultsPagination

    def get_queryset(self):
        """Personal page: only current user's logs unless workspace_ids provided.
        Team endpoints handle their own scoping.
        """
        if self.action in {'team_logs', 'team_pending', 'approve', 'reject', 'bulk_approve', 'bulk_reject', 'bulk_delete'}:
            return self.queryset

        return super().get_queryset()

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'create':
            return OvertimeLogCreateSerializer
        return OvertimeLogSerializer

    def perform_create(self, serializer):
        """Set the user automatically on creation. Staff may target active users."""
        from rest_framework.exceptions import ValidationError
        from core.utils.time_overlap import find_overlapping_entry
        from plugins.audit_log.signals import log_action

        target_user, impersonated = resolve_target_user(
            self.request.user, self.request.data.get('user')
        )
        date = serializer.validated_data.get('date')
        start_time = serializer.validated_data.get('start_time')
        end_time = serializer.validated_data.get('end_time')
        if date and start_time and end_time:
            overlap = find_overlapping_entry(
                OvertimeLog.objects.all(),
                target_user.id, date, start_time, end_time,
            )
            if overlap:
                raise ValidationError(
                    f'Time range overlaps an existing overtime entry on {date} '
                    f'({overlap.start_time}–{overlap.end_time}).'
                )
        instance = serializer.save(user=target_user)
        if impersonated:
            log_action(
                self.request.user,
                'create_for_user',
                description=f'Created overtime entry for user_id={target_user.pk}',
                obj=instance,
            )
        self.invalidate_related_cache()

    @staticmethod
    def _ensure_not_in_finalized_payroll(instance):
        try:
            from plugins.payroll.models import PayrollRunEntry
        except ImportError:
            return
        if PayrollRunEntry.objects.filter(
            source_kind='overtime', source_id=instance.pk, status='finalized',
        ).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'This overtime entry belongs to finalized payroll and cannot be changed.'
            )

    def perform_update(self, serializer):
        """Reset status to pending if record was approved and is being modified."""
        from rest_framework.exceptions import ValidationError
        from core.utils.time_overlap import find_overlapping_entry

        obj = self.get_object()
        self._ensure_not_in_finalized_payroll(obj)
        date = serializer.validated_data.get('date', obj.date)
        start_time = serializer.validated_data.get('start_time', obj.start_time)
        end_time = serializer.validated_data.get('end_time', obj.end_time)
        if date and start_time and end_time:
            overlap = find_overlapping_entry(
                OvertimeLog.objects.all(),
                obj.user_id, date, start_time, end_time,
                exclude_pk=obj.pk,
            )
            if overlap:
                raise ValidationError(
                    f'Time range overlaps an existing overtime entry on {date} '
                    f'({overlap.start_time}–{overlap.end_time}).'
                )
        if obj.status == 'approved':
            serializer.save(status='pending', approved_by=None, approved_at=None)
        else:
            serializer.save()
        self.invalidate_related_cache()

    def perform_destroy(self, instance):
        """Block deletion if referenced by a PayrollRunEntry.

        Pending records are generally safe to delete because payroll defaults
        to only_approved_entries=True. However, if an admin sets
        only_approved_entries=False, pending records can be included in draft
        payroll runs. Deleting such a record would crash finalization
        (DoesNotExist) or corrupt finalized history (dangling source_id).

        The payroll import is guarded so core OT/standby deletion still works
        if the payroll plugin is ever uninstalled.

        Superuser deletes of non-pending records in a locked (past month or
        TL-closed approval period) are audit-logged for accountability.
        """
        self._ensure_not_in_finalized_payroll(instance)
        try:
            from plugins.payroll.models import PayrollRunEntry
        except ImportError:
            PayrollRunEntry = None
        if PayrollRunEntry is not None and PayrollRunEntry.objects.filter(
            source_kind='overtime', source_id=instance.pk
        ).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'Cannot delete this overtime entry — it is referenced by a '
                'payroll run. Remove it from the payroll run first.'
            )
        user = self.request.user
        pk = instance.pk
        record_date = getattr(instance, 'date', None)
        was_locked_period = (
            not self._is_pending(instance)
            and (self._is_approval_period_locked(instance) or self._is_month_locked(instance))
        )
        instance.delete()
        self.invalidate_related_cache()
        if was_locked_period and user.is_superuser:
            try:
                from plugins.audit_log.signals import log_action
                log_action(
                    user,
                    'superuser_override_delete',
                    description=(
                        f'Superuser deleted OvertimeLog id={pk} from a locked '
                        f'period (date={record_date}).'
                    ),
                )
            except ImportError:
                pass

    @action(detail=False, methods=['post'])
    def bulk_delete(self, request):
        try:
            from plugins.payroll.models import PayrollRunEntry
        except ImportError:
            return super().bulk_delete(request)
        ids = request.data.get('ids', [])
        if PayrollRunEntry.objects.filter(
            source_kind='overtime', source_id__in=ids, status='finalized',
        ).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                'One or more overtime entries belong to finalized payroll and cannot be deleted.'
            )
        return super().bulk_delete(request)

    def perform_approve(self, obj, user):
        """Approve once while serializing concurrent transitions."""
        from django.db import transaction

        with transaction.atomic():
            locked = type(obj).objects.select_for_update().get(pk=obj.pk)
            self._ensure_not_in_finalized_payroll(locked)
            if locked.status == 'pending':
                locked._skip_notifications = getattr(obj, '_skip_notifications', False)
                super().perform_approve(locked, user)
        obj.refresh_from_db()
        self.invalidate_related_cache()

    def perform_reject(self, obj, user, reason):
        """Reject once while serializing concurrent transitions."""
        from django.db import transaction

        with transaction.atomic():
            locked = type(obj).objects.select_for_update().get(pk=obj.pk)
            self._ensure_not_in_finalized_payroll(locked)
            if locked.status == 'pending':
                locked._skip_notifications = getattr(obj, '_skip_notifications', False)
                super().perform_reject(locked, user, reason)
        obj.refresh_from_db()
        self.invalidate_related_cache()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve an overtime entry.
        """
        log = self.get_object()

        # Check if user can approve
        if not self._can_approve(request.user, log):
            return Response(
                {'error': 'You do not have permission to approve this entry.'},
                status=status.HTTP_403_FORBIDDEN
            )

        self.perform_approve(log, request.user)

        serializer = self.get_serializer(log)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Reject an overtime entry.
        """
        log = self.get_object()

        # Check if user can reject
        if not self._can_approve(request.user, log):
            return Response(
                {'error': 'You do not have permission to reject this entry.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = OvertimeApprovalSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        rejection_reason = serializer.validated_data.get('rejection_reason', '')
        self.perform_reject(log, request.user, rejection_reason)

        serializer = self.get_serializer(log)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Get overtime summary for the current user or team.
        """
        from django.db.models import Sum

        queryset = self.get_queryset()

        summary = {
            'total_hours': queryset.aggregate(total=Sum('hours'))['total'] or 0,
            'total_entries': queryset.count(),
            'approved_hours': queryset.filter(status='approved').aggregate(total=Sum('hours'))['total'] or 0,
            'pending_hours': queryset.filter(status='pending').aggregate(total=Sum('hours'))['total'] or 0,
            'rejected_hours': queryset.filter(status='rejected').aggregate(total=Sum('hours'))['total'] or 0,
        }

        serializer = OvertimeSummarySerializer(data=summary)
        serializer.is_valid()

        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Stream the full filtered overtime log queryset as CSV.

        Bypasses pagination entirely — the entire filtered set is streamed
        via ``StreamingHttpResponse`` + ``queryset.iterator()``. Filter
        parity with the list endpoint is preserved via
        ``self.filter_queryset(self.get_queryset())`` so all row-level
        scoping (PersonalOnlyFilterMixin, search, filterset) applies.

        CSV column shape is frozen and must match the frontend
        ``OvertimePage`` rowMapper exactly:
        User, Date, Client, Hours, Status, Evidence Type, Evidence, Description.

        Hours are serialized as ``int(obj.hours)`` to match
        ``OvertimeLogSerializer.get_hours`` (which rounds for display).
        """
        import csv
        import io
        from django.http import StreamingHttpResponse

        queryset = self.filter_queryset(self.get_queryset()).select_related('user', 'client')

        def csv_generator():
            # UTF-8 BOM for Excel compatibility (non-ASCII usernames).
            yield '\ufeff'
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow([
                'User', 'Date', 'Client', 'Hours',
                'Status', 'Evidence Type', 'Evidence', 'Reference Code', 'Description',
            ])
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate()
            for ot in queryset.iterator(chunk_size=1000):
                if ot.evidence_type == 'ticket' and ot.ticket_references:
                    refs = ', '.join(ot.ticket_references)
                    evidence_col = ot.evidence or refs
                    ref_code_col = ot.reference_code or refs
                else:
                    evidence_col = ot.evidence or ''
                    ref_code_col = ot.reference_code or ''
                writer.writerow([
                    ot.user.username if ot.user else '',
                    ot.date.strftime('%d/%m/%Y') if ot.date else '',
                    ot.client.name if ot.client else '',
                    str(int(ot.hours)) if ot.hours else '0',
                    ot.status,
                    ot.evidence_type or '',
                    evidence_col,
                    ref_code_col,
                    ot.description or '',
                ])
                yield buffer.getvalue()
                buffer.seek(0)
                buffer.truncate()

        response = StreamingHttpResponse(csv_generator(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="overtime_logs.csv"'
        return response

    @action(detail=False, methods=['get'])
    def team_logs(self, request):
        """
        Get overtime entries for the requester's team.
        Team members gain read-only visibility; staff/HR/TLs retain broader scopes.
        """
        user = request.user

        if not (user.is_staff or user.is_superuser or (has_team_leader_role(user))):
            return Response(
                {'error': 'Only team leaders can access this endpoint.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # workspace_ids is optional for team_logs; when omitted, all team members' entries are returned
        queryset = OvertimeLog.objects.all().select_related('user', 'client', 'approved_by').prefetch_related('user__profile__team_memberships__team')

        queryset = self._filter_team_leader_queryset(queryset, user)

        # Apply filters from query params (using DjangoFilterBackend logic manually for actions)
        status_filter = request.query_params.get('status')
        client_filter = request.query_params.get('client')
        date_filter = request.query_params.get('date')

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if client_filter:
            queryset = queryset.filter(client_id=client_filter)
        if date_filter:
            queryset = queryset.filter(date=date_filter)

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
        Get pending overtime entries for TL's team members.
        Only accessible by team leaders and above.
        """
        user = request.user

        # Check if user is TL or above
        if not (user.is_staff or user.is_superuser or (has_team_leader_role(user))):
            return Response(
                {'error': 'Only team leaders can access this endpoint.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # workspace_ids is optional for team_pending; when omitted, all team members' pending entries are returned
        # Get base queryset
        queryset = OvertimeLog.objects.all().select_related('user', 'client', 'approved_by').prefetch_related('user__profile__team_memberships__team').filter(status='pending')

        try:
            queryset = self._filter_team_leader_queryset(queryset, user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

        # Apply additional filters from query params
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def team_pending_months(self, request):
        """
        Return months that contain pending overtime entries for the TL's team.
        Used by the approval dashboard to jump to months with pending items.
        Returns: [{ "month": "2026-01-01", "count": 5 }, ...] sorted ascending.
        """
        user = request.user
        if not (user.is_staff or user.is_superuser or (has_team_leader_role(user))):
            return Response(
                {'error': 'Only team leaders can access this endpoint.'},
                status=status.HTTP_403_FORBIDDEN
            )

        queryset = OvertimeLog.objects.filter(status='pending')
        try:
            queryset = self._filter_team_leader_queryset(queryset, user)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

        months = (
            queryset
            .annotate(month=TruncMonth('date'))
            .values('month')
            .annotate(count=Count('id'))
            .order_by('month')
        )
        return Response([
            {'month': m['month'].isoformat(), 'count': m['count']}
            for m in months
        ])

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def admin_logs(self, request):
        """
        Get all overtime logs in the system.
        Accessible by staff/superusers and HR (read-only GET, matching the
        /admin/overtime-logs page guard: SuperuserRoute admits staff admins
        and HR). Bypasses personal privacy filters enforced on the standard
        list endpoint.
        """
        from core.mixins.permissions import has_hr_role

        user = request.user
        if not (user.is_superuser or user.is_staff or has_hr_role(user)):
            return Response(
                {'error': 'Only staff admins or HR can access this endpoint.'},
                status=status.HTTP_403_FORBIDDEN
            )

        queryset = OvertimeLog.objects.all().select_related('user', 'client', 'approved_by').prefetch_related('user__profile__team_memberships__team')

        # Apply filters from query params (same as team_logs)
        status_filter = request.query_params.get('status')
        client_filter = request.query_params.get('client')
        date_filter = request.query_params.get('date')

        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if client_filter:
            queryset = queryset.filter(client_id=client_filter)
        if date_filter:
            queryset = queryset.filter(date=date_filter)

        # Handle pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
