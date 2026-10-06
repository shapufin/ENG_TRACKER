"""Event-logging endpoints: meetings, idle flags, review deliveries, absences, survey."""
from datetime import date

from django.db import IntegrityError
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin


from ..csv_export import CsvExportMixin
from ..scope import scoreable_member_ids
from ..models import (
    Absence,
    EngagementSurveyResponse,
    IdleFlag,
    IdleStatusUpdate,
    Meeting,
    MeetingAttendee,
    ReviewDelivery,
)
from ..serializers import (
    AbsenceSerializer,
    EngagementSurveyResponseSerializer,
    IdleFlagSerializer,
    IdleStatusUpdateSerializer,
    MeetingAttendeeSerializer,
    MeetingSerializer,
    ReviewDeliverySerializer,
)
from core.mixins.permissions import is_staff_user
from core.mixins.viewer_scope import HbprScopedQuerysetMixin


class MeetingViewSet(CsvExportMixin, HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """1-on-1s, TL-Italy syncs, and team meetings — a TL only ever manages
    their own (organizer=request.user); staff see everything."""
    plugin_name = 'tl_scorecard'
    serializer_class = MeetingSerializer
    csv_filename = 'meetings'

    hbpr_leader_field = 'organizer'
    hbpr_member_field = 'counterparty'
    hbpr_member_nullable = True
    # Employee one-on-ones are never part of the HBPR slice. The exclusion applies
    # to the HBPR branch only, so a TL who is also an HBPR still reads their own
    # one-on-ones via `own_q`.
    hbpr_exclude = ~Q(meeting_type='one_on_one')

    search_fields = (
        'counterparty__first_name', 'counterparty__last_name', 'shared_summary',
    )
    private_search_fields = ('notes',)

    def base_queryset(self):
        return Meeting.objects.select_related(
            'organizer', 'counterparty', 'recorded_by',
        ).prefetch_related('attendees__user')

    def own_q(self, user):
        return Q(organizer=user)

    def perform_create(self, serializer):
        meeting_type = serializer.validated_data.get('meeting_type')
        counterparty = serializer.validated_data.get('counterparty')
        team = serializer.validated_data.get('team')
        if meeting_type in ('one_on_one', 'tl_sync') and counterparty is None:
            raise ValidationError({'counterparty': 'Required for one-on-one and TL-sync meetings.'})
        if meeting_type == 'team_meeting' and team is None:
            raise ValidationError({'team': 'Required for team meetings.'})
        if (meeting_type == 'one_on_one' and not is_staff_user(self.request.user)
                and counterparty.id not in scoreable_member_ids(self.request.user)):
            raise ValidationError({'counterparty': 'You can only hold one-on-ones with your own team members.'})
        serializer.save(organizer=self.request.user, recorded_by=self.request.user)

    @action(detail=True, methods=['post'])
    def share(self, request, pk=None):
        """Publish a summary the counterparty may read. `notes` stays private."""
        meeting = self.get_object()
        summary = (request.data.get('summary') or '').strip()
        if not summary:
            raise ValidationError({'summary': 'A summary is required.'})
        meeting.shared_summary = summary
        meeting.shared_at = timezone.now()
        meeting.save(update_fields=['shared_summary', 'shared_at'])
        return Response(MeetingSerializer(meeting, context=self.get_serializer_context()).data)


class MeetingAttendeeViewSet(HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Attendee roles (member/hrbp/observer) for a Meeting — write access is
    scoped through the meeting's own organizer, same as MeetingViewSet."""
    plugin_name = 'tl_scorecard'
    serializer_class = MeetingAttendeeSerializer

    hbpr_leader_field = 'meeting__organizer'
    hbpr_member_field = 'meeting__counterparty'
    hbpr_member_nullable = True
    # An attendee row of a one-on-one is a side door to the meeting itself.
    hbpr_exclude = ~Q(meeting__meeting_type='one_on_one')

    def base_queryset(self):
        return MeetingAttendee.objects.select_related('meeting', 'user')

    def own_q(self, user):
        return Q(meeting__organizer=user)

    def perform_create(self, serializer):
        meeting = serializer.validated_data['meeting']
        if not is_staff_user(self.request.user) and meeting.organizer_id != self.request.user.id:
            raise PermissionDenied("You can only manage attendees on meetings you organize.")
        serializer.save()

    def perform_update(self, serializer):
        meeting = serializer.validated_data.get('meeting')
        if meeting and not is_staff_user(self.request.user) and meeting.organizer_id != self.request.user.id:
            raise PermissionDenied("You can only manage attendees on meetings you organize.")
        serializer.save()

    @action(detail=True, methods=['post'])
    def notes(self, request, pk=None):
        """The attendee's own private notes on a meeting they attended."""
        attendee = self.get_object()
        if attendee.user_id != request.user.id:
            raise PermissionDenied('You can only write your own attendance notes.')
        attendee.notes = (request.data.get('notes') or '').strip()
        attendee.save(update_fields=['notes'])
        return Response(self.get_serializer(attendee).data)


class IdleFlagViewSet(CsvExportMixin, HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = IdleFlagSerializer
    csv_filename = 'idle-flags'

    hbpr_leader_field = 'flagged_by'
    hbpr_member_field = 'employee'

    search_fields = (
        'productivity_task', 'employee__first_name', 'employee__last_name',
    )
    private_search_fields = ('notes',)

    def base_queryset(self):
        return IdleFlag.objects.select_related('employee', 'flagged_by').prefetch_related(
            'status_updates__recorded_by')

    def own_q(self, user):
        return Q(flagged_by=user)

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not is_staff_user(self.request.user):
            team_member_ids = scoreable_member_ids(self.request.user)
            if employee.id not in team_member_ids:
                raise ValidationError({'employee': 'You can only flag your own team members as idle.'})
        serializer.save(flagged_by=self.request.user, recorded_by=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.validated_data.get('employee')
        if employee and not is_staff_user(self.request.user):
            if employee.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'employee': 'You can only flag your own team members as idle.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        flag = self.get_object()
        if flag.status != 'open':
            return Response({'error': 'This idle flag is already resolved.'}, status=status.HTTP_409_CONFLICT)
        flag.status = 'resolved'
        flag.resolved_on = date.today()
        flag.save(update_fields=['status', 'resolved_on'])
        return Response(IdleFlagSerializer(flag, context=self.get_serializer_context()).data)


class IdleStatusUpdateViewSet(HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Weekly status log entries for an IdleFlag — write access scoped
    through the flag's own flagged_by, same pattern as MeetingAttendee."""
    plugin_name = 'tl_scorecard'
    serializer_class = IdleStatusUpdateSerializer

    hbpr_leader_field = 'flag__flagged_by'
    hbpr_member_field = 'flag__employee'

    def base_queryset(self):
        return IdleStatusUpdate.objects.select_related('flag', 'recorded_by')

    def own_q(self, user):
        return Q(flag__flagged_by=user)

    def perform_create(self, serializer):
        flag = serializer.validated_data['flag']
        if not is_staff_user(self.request.user) and flag.flagged_by_id != self.request.user.id:
            raise PermissionDenied("You can only log status updates on idle flags you raised.")
        # `validators = []` on the serializer disables the UniqueTogetherValidator
        # for (flag, week_of) too — same reason as EngagementSurveyResponseViewSet.
        try:
            serializer.save(recorded_by=self.request.user)
        except IntegrityError:
            raise ValidationError({'week_of': 'A status update already exists for this flag and week.'})

    def perform_update(self, serializer):
        flag = serializer.validated_data.get('flag')
        if flag and not is_staff_user(self.request.user) and flag.flagged_by_id != self.request.user.id:
            raise PermissionDenied("You can only log status updates on idle flags you raised.")
        try:
            serializer.save()
        except IntegrityError:
            raise ValidationError({'week_of': 'A status update already exists for this flag and week.'})


class ReviewDeliveryViewSet(CsvExportMixin, HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = ReviewDeliverySerializer
    csv_filename = 'review-deliveries'

    hbpr_leader_field = 'leader'
    hbpr_member_field = None  # a review has no employee subject

    search_fields = ('recipient', 'period')
    private_search_fields = ('notes',)

    def base_queryset(self):
        return ReviewDelivery.objects.select_related('leader', 'recorded_by')

    def own_q(self, user):
        return Q(leader=user)

    def perform_create(self, serializer):
        serializer.save(leader=self.request.user, recorded_by=self.request.user)


class EngagementSurveyResponseViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Sentiment/pulse survey responses. Deliberately public to every
    authenticated employee (not TL-only like the rest of this plugin) via
    the 'configure' permission bucket — see plugin.py's manifest comment.
    A respondent only ever sees/creates their OWN rows; a TL never sees
    individual scores, only the team_average aggregate below, so responses
    stay meaningfully anonymous to the person being rated."""
    plugin_name = 'tl_scorecard'
    serializer_class = EngagementSurveyResponseSerializer
    permission_action_map = {
        'list': 'configure', 'create': 'configure', 'retrieve': 'configure',
        'update': 'configure', 'partial_update': 'configure', 'destroy': 'configure',
        'team_average': 'view',
    }

    def get_queryset(self):
        qs = EngagementSurveyResponse.objects.select_related('respondent', 'team')
        if is_staff_user(self.request.user):
            return qs
        return qs.filter(respondent=self.request.user)

    def perform_create(self, serializer):
        # `validators = []` on the serializer (see its Meta — same reason
        # as onboarding's FolderSerializer) means the UniqueConstraint on
        # (respondent, period) is only enforced at the DB level now; turn
        # that IntegrityError into a clean 400 instead of a 500.
        try:
            serializer.save(respondent=self.request.user)
        except IntegrityError:
            raise ValidationError({'period': 'You already submitted a response for this period.'})

    @action(detail=False, methods=['get'], url_path='team-average', url_name='team-average')
    def team_average(self, request):
        """TL-only aggregate — average score for the caller's own team,
        never individual responses (see class docstring)."""
        period = request.query_params.get('period') or date.today().strftime('%Y-%m')

        if not hasattr(request.user, 'profile'):
            return Response({'period': period, 'average_score': None, 'response_count': 0})
        team_member_ids = scoreable_member_ids(request.user)
        agg = EngagementSurveyResponse.objects.filter(
            respondent_id__in=team_member_ids, period=period,
        ).aggregate(average_score=Avg('score'), response_count=Count('id'))
        return Response({
            'period': period,
            'average_score': round(agg['average_score'], 1) if agg['average_score'] is not None else None,
            'response_count': agg['response_count'],
        })


class AbsenceViewSet(CsvExportMixin, HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = AbsenceSerializer
    csv_filename = 'absences'

    hbpr_leader_field = 'flagged_by'
    hbpr_member_field = 'employee'

    search_fields = ('reason', 'employee__first_name', 'employee__last_name')
    private_search_fields = ('notes',)

    def base_queryset(self):
        return Absence.objects.select_related('employee', 'flagged_by')

    def own_q(self, user):
        return Q(flagged_by=user)

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not is_staff_user(self.request.user):
            if employee.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'employee': 'You can only flag your own team members.'})
        serializer.save(flagged_by=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.validated_data.get('employee')
        if employee and not is_staff_user(self.request.user):
            if employee.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'employee': 'You can only flag your own team members.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def address(self, request, pk=None):
        absence = self.get_object()
        if absence.addressed_on is not None:
            return Response({'error': 'This absence is already addressed.'}, status=status.HTTP_409_CONFLICT)
        absence.addressed_on = date.today()
        absence.save(update_fields=['addressed_on'])
        return Response(AbsenceSerializer(absence, context=self.get_serializer_context()).data)
