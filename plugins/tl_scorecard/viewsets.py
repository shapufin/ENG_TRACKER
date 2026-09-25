"""
Phase 1 TL Scorecard endpoints (live computation, no snapshot model) plus
Phase 2 event-logging endpoints (Meeting, IdleFlag, ReviewDelivery,
EngagementSurveyResponse — see models.py for what each closes).
"""
from datetime import date

from django.contrib.auth.models import User
from django.db import IntegrityError
from django.db.models import Avg, Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin

from .models import EngagementSurveyResponse, IdleFlag, IdleStatusUpdate, Meeting, MeetingAttendee, ReviewDelivery
from .serializers import (
    EngagementSurveyResponseSerializer,
    IdleFlagSerializer,
    IdleStatusUpdateSerializer,
    KpiCoverageEntrySerializer,
    MeetingAttendeeSerializer,
    MeetingSerializer,
    ReviewDeliverySerializer,
    ScorecardSerializer,
)
from .services import KPI_COVERAGE, build_scorecard


def _parse_month(raw):
    if not raw:
        return None
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        raise ValueError('month must be an ISO date (YYYY-MM-DD)')
    return parsed.replace(day=1)


class TLScorecardViewSet(PluginPermissionMixin, viewsets.ViewSet):
    plugin_name = 'tl_scorecard'
    permission_action_map = {'kpi_coverage': 'view'}

    def _resolve_leader(self, request):
        """A TL always sees their own scorecard. Staff/superuser may pass
        `?leader_id=` to view any TL's — same shape as this app's reports
        endpoints, which let staff pick a target rather than aggregating
        across everyone by default."""
        leader_id = request.query_params.get('leader_id')
        if not leader_id:
            return request.user
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied('Only staff can view another TL\'s scorecard.')
        try:
            return User.objects.get(pk=leader_id)
        except User.DoesNotExist:
            raise NotFound('leader_id does not match an existing user.')

    @action(detail=False, methods=['get'])
    def scorecard(self, request):
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        leader = self._resolve_leader(request)
        if not hasattr(leader, 'profile'):
            return Response({'error': 'This user has no profile to resolve a team from.'},
                             status=status.HTTP_400_BAD_REQUEST)

        data = build_scorecard(leader, month or date.today())
        return Response(ScorecardSerializer(data).data)

    @action(detail=False, methods=['get'], url_path='kpi-coverage', url_name='kpi-coverage')
    def kpi_coverage(self, request):
        return Response(KpiCoverageEntrySerializer(KPI_COVERAGE, many=True).data)


class MeetingViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """1-on-1s, TL-Italy syncs, and team meetings — a TL only ever manages
    their own (organizer=request.user); staff see everything."""
    plugin_name = 'tl_scorecard'
    serializer_class = MeetingSerializer

    def get_queryset(self):
        qs = Meeting.objects.select_related('organizer', 'counterparty', 'recorded_by').prefetch_related('attendees')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(organizer=self.request.user)

    def perform_create(self, serializer):
        meeting_type = serializer.validated_data.get('meeting_type')
        counterparty = serializer.validated_data.get('counterparty')
        team = serializer.validated_data.get('team')
        if meeting_type in ('one_on_one', 'tl_sync') and counterparty is None:
            raise ValidationError({'counterparty': 'Required for one-on-one and TL-sync meetings.'})
        if meeting_type == 'team_meeting' and team is None:
            raise ValidationError({'team': 'Required for team meetings.'})
        serializer.save(organizer=self.request.user, recorded_by=self.request.user)


class MeetingAttendeeViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Attendee roles (member/hrbp/observer) for a Meeting — write access is
    scoped through the meeting's own organizer, same as MeetingViewSet."""
    plugin_name = 'tl_scorecard'
    serializer_class = MeetingAttendeeSerializer

    def get_queryset(self):
        qs = MeetingAttendee.objects.select_related('meeting', 'user')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(meeting__organizer=self.request.user)

    def perform_create(self, serializer):
        meeting = serializer.validated_data['meeting']
        if not (self.request.user.is_staff or self.request.user.is_superuser) and meeting.organizer_id != self.request.user.id:
            raise PermissionDenied("You can only manage attendees on meetings you organize.")
        serializer.save()


class IdleFlagViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = IdleFlagSerializer

    def get_queryset(self):
        qs = IdleFlag.objects.select_related('employee', 'flagged_by').prefetch_related('status_updates')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(flagged_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(flagged_by=self.request.user, recorded_by=self.request.user)


class IdleStatusUpdateViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Weekly status log entries for an IdleFlag — write access scoped
    through the flag's own flagged_by, same pattern as MeetingAttendee."""
    plugin_name = 'tl_scorecard'
    serializer_class = IdleStatusUpdateSerializer

    def get_queryset(self):
        qs = IdleStatusUpdate.objects.select_related('flag', 'recorded_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(flag__flagged_by=self.request.user)

    def perform_create(self, serializer):
        flag = serializer.validated_data['flag']
        if not (self.request.user.is_staff or self.request.user.is_superuser) and flag.flagged_by_id != self.request.user.id:
            raise PermissionDenied("You can only log status updates on idle flags you raised.")
        # `validators = []` on the serializer disables the UniqueTogetherValidator
        # for (flag, week_of) too — same reason as EngagementSurveyResponseViewSet.
        try:
            serializer.save(recorded_by=self.request.user)
        except IntegrityError:
            raise ValidationError({'week_of': 'A status update already exists for this flag and week.'})


class ReviewDeliveryViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = ReviewDeliverySerializer

    def get_queryset(self):
        qs = ReviewDelivery.objects.select_related('leader', 'recorded_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(leader=self.request.user)

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
        if self.request.user.is_staff or self.request.user.is_superuser:
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
        team_member_ids = request.user.profile.get_team_member_ids()
        agg = EngagementSurveyResponse.objects.filter(
            respondent_id__in=team_member_ids, period=period,
        ).aggregate(average_score=Avg('score'), response_count=Count('id'))
        return Response({
            'period': period,
            'average_score': round(agg['average_score'], 1) if agg['average_score'] is not None else None,
            'response_count': agg['response_count'],
        })
