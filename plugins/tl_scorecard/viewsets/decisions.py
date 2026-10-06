"""PIP and promotion records (approve/decide are staff/HR-only)."""
from datetime import date

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin


from ..csv_export import CsvExportMixin
from ..scope import scoreable_member_ids
from ..models import (
    PIPRecord,
    PromotionFlag,
)
from ..serializers import (
    PIPRecordSerializer,
    PromotionFlagSerializer,
)
from core.mixins.permissions import is_staff_user
from core.mixins.viewer_scope import HbprScopedQuerysetMixin


class PIPRecordViewSet(CsvExportMixin, HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Approval is deliberately staff/HR-only (`approve` action) — this
    plugin's role manifest has no HR bucket, and "prior HR approval" is
    the one KPI requirement that must not be self-granted by the TL who
    created the record. HBPR is read-only: it never approves or returns."""
    plugin_name = 'tl_scorecard'
    serializer_class = PIPRecordSerializer
    csv_filename = 'pip-records'
    # `approve` needs only plugin `view`: the real gate is in the action body
    # (staff/HR) so an approver need not hold `manage`, which would also open
    # PATCH/DELETE.
    permission_action_map = {'approve': 'view', 'reject': 'view'}

    hbpr_leader_field = 'tl'
    hbpr_member_field = 'employee'

    search_fields = (
        'status_note', 'shared_notes',
        'employee__first_name', 'employee__last_name',
    )
    private_search_fields = ('notes',)

    def base_queryset(self):
        return PIPRecord.objects.select_related('employee', 'tl', 'approved_by')

    def own_q(self, user):
        return Q(tl=user)

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not is_staff_user(self.request.user):
            if employee.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'employee': 'You can only open a PIP for your own team members.'})
        serializer.save(tl=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.approved_at is not None:
            # What HR approved must not be rewritten afterwards.
            for field in ('employee', 'start_date'):
                if field in serializer.validated_data and \
                        serializer.validated_data[field] != getattr(instance, field):
                    raise ValidationError({field: 'This cannot change after the PIP is approved.'})
        employee = serializer.validated_data.get('employee')
        if employee and not is_staff_user(self.request.user):
            if employee.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'employee': 'You can only open a PIP for your own team members.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        # HBPR is read-only: participation in PIP decisions was removed, so
        # only staff/HR may approve. (HBPR would otherwise reach this through
        # the tl_scorecard `view` grant.)
        if not is_staff_user(request.user):
            raise PermissionDenied('Only staff/HR can approve a PIP.')
        pip = self.get_object()
        if request.user.id in (pip.employee_id, pip.tl_id):
            raise PermissionDenied('You cannot approve a PIP you are part of.')
        with transaction.atomic():
            # Re-read under a row lock: two concurrent approvers must not both pass.
            pip = PIPRecord.objects.select_for_update().get(pk=pip.pk)
            if not pip.awaiting_approval:
                return Response(
                    {'error': 'Only a PIP awaiting approval can be approved.'},
                    status=status.HTTP_409_CONFLICT,
                )
            pip.approved_by = request.user
            pip.approved_at = timezone.now()
            pip.status = 'active'
            pip.save(update_fields=['approved_by', 'approved_at', 'status'])
        return Response(PIPRecordSerializer(pip, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Return a draft PIP to the TL (staff/HR only). Needs a reason."""
        if not is_staff_user(request.user):
            raise PermissionDenied('Only staff/HR can return a PIP.')
        pip = self.get_object()
        if request.user.id in (pip.employee_id, pip.tl_id):
            raise PermissionDenied('You cannot return a PIP you are part of.')
        note = (request.data.get('status_note') or '').strip()
        if not note:
            raise ValidationError({'status_note': 'A reason is required.'})
        with transaction.atomic():
            pip = PIPRecord.objects.select_for_update().get(pk=pip.pk)
            if not pip.awaiting_approval:
                return Response({'error': 'Only a PIP awaiting approval can be returned.'}, status=status.HTTP_409_CONFLICT)
            pip.status = 'cancelled'
            pip.status_note = note
            pip.closed_on = date.today()
            pip.save(update_fields=['status', 'status_note', 'closed_on'])
        return Response(PIPRecordSerializer(pip, context=self.get_serializer_context()).data)

    def _close(self, request, outcome, require_note):
        pip = self.get_object()
        if pip.status != 'active':
            return Response({'error': 'Only an active PIP can be closed.'}, status=status.HTTP_409_CONFLICT)
        note = (request.data.get('status_note') or '').strip()
        if require_note and not note:
            raise ValidationError({'status_note': 'A reason is required.'})
        pip.status = outcome
        pip.status_note = note
        pip.closed_on = date.today()
        pip.save(update_fields=['status', 'status_note', 'closed_on'])
        return Response(PIPRecordSerializer(pip, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        return self._close(request, 'completed', require_note=False)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        return self._close(request, 'cancelled', require_note=True)


class PromotionFlagViewSet(CsvExportMixin, HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Promotion nominations are decided by staff/HR only — HBPR is read-only
    and never decides a nomination (participation was removed)."""
    plugin_name = 'tl_scorecard'
    serializer_class = PromotionFlagSerializer
    csv_filename = 'promotion-flags'
    permission_action_map = {'decide': 'view'}

    hbpr_leader_field = 'nominated_by'
    hbpr_member_field = 'employee'

    search_fields = (
        'decision_note', 'employee__first_name', 'employee__last_name',
    )
    private_search_fields = ('notes',)

    def base_queryset(self):
        return PromotionFlag.objects.select_related('employee', 'nominated_by')

    def own_q(self, user):
        return Q(nominated_by=user)

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not is_staff_user(self.request.user):
            if employee.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'employee': 'You can only nominate your own team members.'})
        serializer.save(nominated_by=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.validated_data.get('employee')
        if employee and not is_staff_user(self.request.user):
            if employee.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'employee': 'You can only nominate your own team members.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        # HBPR is read-only: it never decides a promotion nomination.
        if not is_staff_user(request.user):
            raise PermissionDenied('Only staff/HR can approve a promotion.')
        flag = self.get_object()
        if request.user.id in (flag.employee_id, flag.nominated_by_id):
            raise PermissionDenied('You cannot decide a nomination you are part of.')
        if flag.status != 'nominated':
            raise ValidationError({'status': 'This flag has already been decided.'})
        decided_status = request.data.get('status')
        if decided_status not in ('promoted', 'declined'):
            raise ValidationError({'status': 'Must be "promoted" or "declined".'})
        flag.status = decided_status
        flag.decided_on = date.today()
        flag.decided_by = request.user
        flag.decision_note = (request.data.get('decision_note') or '').strip()
        flag.save(update_fields=['status', 'decided_on', 'decided_by', 'decision_note'])
        return Response(PromotionFlagSerializer(flag, context=self.get_serializer_context()).data)
