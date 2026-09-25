"""
Phase 1 TL Scorecard endpoints (live computation, no snapshot model) plus
Phase 2 event-logging endpoints (Meeting, IdleFlag, ReviewDelivery,
EngagementSurveyResponse — see models.py for what each closes).
"""
from datetime import date

from django.contrib.auth.models import User
from django.db import IntegrityError
from django.db.models import Avg, Count
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin

from .excel_export import build_workbook_bytes

from .models import (
    Absence,
    EngagementSurveyResponse,
    EPRCycle,
    EPRGoal,
    IdleFlag,
    IdleStatusUpdate,
    Meeting,
    MeetingAttendee,
    PIPRecord,
    PromotionFlag,
    ReviewDelivery,
)
from .serializers import (
    AbsenceSerializer,
    EngagementSurveyResponseSerializer,
    EPRCycleSerializer,
    EPRGoalSerializer,
    EscalationCandidateSerializer,
    IdleFlagSerializer,
    IdleStatusUpdateSerializer,
    KpiCoverageEntrySerializer,
    MeetingAttendeeSerializer,
    MeetingSerializer,
    PIPRecordSerializer,
    PromotionFlagSerializer,
    ReviewDeliverySerializer,
    ScorecardSerializer,
)
from .services import KPI_COVERAGE, build_scorecard, escalation_candidates, governance_records, scorecard_trend


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

    @action(detail=False, methods=['get'])
    def trend(self, request):
        """Last N months of scorecard metrics, oldest first. ?months=6 (default), ?leader_id= like `scorecard`."""
        months_raw = request.query_params.get('months', '6')
        try:
            months = int(months_raw)
        except ValueError:
            return Response({'error': 'months must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
        if not (1 <= months <= 24):
            return Response({'error': 'months must be between 1 and 24'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        leader = self._resolve_leader(request)
        if not hasattr(leader, 'profile'):
            return Response({'error': 'This user has no profile to resolve a team from.'},
                             status=status.HTTP_400_BAD_REQUEST)

        points = scorecard_trend(leader, months, month or date.today())
        return Response(ScorecardSerializer(points, many=True).data)

    @action(detail=False, methods=['get'], url_path='kpi-coverage', url_name='kpi-coverage')
    def kpi_coverage(self, request):
        return Response(KpiCoverageEntrySerializer(KPI_COVERAGE, many=True).data)

    @action(detail=False, methods=['get'])
    def escalations(self, request):
        """Computed candidates, not a log — see services.escalation_candidates."""
        return Response(EscalationCandidateSerializer(escalation_candidates(request.user), many=True).data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Download the evidence workbook. ?month=YYYY-MM-DD."""
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        leader = self._resolve_leader(request)
        if not hasattr(leader, 'profile'):
            return Response({'error': 'This user has no profile to resolve a team from.'},
                             status=status.HTTP_400_BAD_REQUEST)

        month = month or date.today()
        scorecard = build_scorecard(leader, month)
        team_member_ids = leader.profile.get_team_member_ids()
        governance = governance_records(leader, team_member_ids, month.year)
        period_label = date.fromisoformat(scorecard['month']).strftime('%B %Y')

        workbook_bytes = build_workbook_bytes(scorecard, KPI_COVERAGE, governance, period_label)

        filename = f'tl_scorecard_{leader.username}_{scorecard["month"][:7]}.xlsx'
        response = HttpResponse(
            workbook_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


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

    def perform_update(self, serializer):
        meeting = serializer.validated_data.get('meeting')
        if meeting and not (self.request.user.is_staff or self.request.user.is_superuser) and meeting.organizer_id != self.request.user.id:
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
        employee = serializer.validated_data['employee']
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            team_member_ids = self.request.user.profile.get_team_member_ids()
            if employee.id not in team_member_ids:
                raise ValidationError({'employee': 'You can only flag your own team members as idle.'})
        serializer.save(flagged_by=self.request.user, recorded_by=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.validated_data.get('employee')
        if employee and not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only flag your own team members as idle.'})
        serializer.save()


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

    def perform_update(self, serializer):
        flag = serializer.validated_data.get('flag')
        if flag and not (self.request.user.is_staff or self.request.user.is_superuser) and flag.flagged_by_id != self.request.user.id:
            raise PermissionDenied("You can only log status updates on idle flags you raised.")
        try:
            serializer.save()
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


class AbsenceViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = AbsenceSerializer

    def get_queryset(self):
        qs = Absence.objects.select_related('employee', 'flagged_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(flagged_by=self.request.user)

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only flag your own team members.'})
        serializer.save(flagged_by=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.validated_data.get('employee')
        if employee and not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only flag your own team members.'})
        serializer.save()


class PIPRecordViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Approval is deliberately staff-only (`approve` action) — this
    plugin's role manifest has no HR bucket, and "prior HR approval" is
    the one KPI requirement that must not be self-granted by the TL who
    created the record."""
    plugin_name = 'tl_scorecard'
    serializer_class = PIPRecordSerializer
    permission_action_map = {'approve': 'manage'}

    def get_queryset(self):
        qs = PIPRecord.objects.select_related('employee', 'tl', 'approved_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(tl=self.request.user)

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only open a PIP for your own team members.'})
        serializer.save(tl=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.validated_data.get('employee')
        if employee and not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only open a PIP for your own team members.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied('Only staff/HR can approve a PIP.')
        pip = self.get_object()
        pip.approved_by = request.user
        pip.approved_at = timezone.now()
        pip.save(update_fields=['approved_by', 'approved_at'])
        return Response(PIPRecordSerializer(pip).data)


class PromotionFlagViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = PromotionFlagSerializer
    permission_action_map = {'decide': 'manage'}

    def get_queryset(self):
        qs = PromotionFlag.objects.select_related('employee', 'nominated_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        return qs.filter(nominated_by=self.request.user)

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only nominate your own team members.'})
        serializer.save(nominated_by=self.request.user)

    def perform_update(self, serializer):
        employee = serializer.validated_data.get('employee')
        if employee and not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only nominate your own team members.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        flag = self.get_object()
        if flag.status != 'nominated':
            raise ValidationError({'status': 'This flag has already been decided.'})
        decided_status = request.data.get('status')
        if decided_status not in ('promoted', 'declined'):
            raise ValidationError({'status': 'Must be "promoted" or "declined".'})
        flag.status = decided_status
        flag.decided_on = date.today()
        flag.save(update_fields=['status', 'decided_on'])
        return Response(PromotionFlagSerializer(flag).data)


class EPRCycleViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = EPRCycleSerializer

    def get_queryset(self):
        qs = EPRCycle.objects.select_related('user').prefetch_related('goals')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        team_member_ids = self.request.user.profile.get_team_member_ids()
        return qs.filter(user_id__in=team_member_ids)

    def perform_create(self, serializer):
        target_user = serializer.validated_data['user']
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if target_user.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'user': 'You can only open an EPR cycle for your own team members.'})
        try:
            serializer.save()
        except IntegrityError:
            raise ValidationError({'year': 'An EPR cycle for this user and year already exists.'})

    def perform_update(self, serializer):
        # ≥5 goals required before Goal Setting can be marked complete —
        # enforced here, not in the model, so it stays a pure data holder.
        instance = serializer.instance
        new_goal_setting = serializer.validated_data.get('goal_setting_completed_at')
        if new_goal_setting and not instance.goal_setting_completed_at and instance.goals.count() < 5:
            raise ValidationError({
                'goal_setting_completed_at': 'At least 5 goals are required before this stage can be marked complete.',
            })
        target_user = serializer.validated_data.get('user')
        if target_user and not (self.request.user.is_staff or self.request.user.is_superuser):
            if target_user.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'user': 'You can only manage an EPR cycle for your own team members.'})
        serializer.save()


class EPRGoalViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = EPRGoalSerializer

    def get_queryset(self):
        qs = EPRGoal.objects.select_related('cycle', 'cycle__user')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        team_member_ids = self.request.user.profile.get_team_member_ids()
        return qs.filter(cycle__user_id__in=team_member_ids)

    def perform_create(self, serializer):
        cycle = serializer.validated_data['cycle']
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if cycle.user_id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'cycle': 'You can only add goals for your own team members.'})
        serializer.save()

    def perform_update(self, serializer):
        cycle = serializer.validated_data.get('cycle')
        if cycle and not (self.request.user.is_staff or self.request.user.is_superuser):
            if cycle.user_id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'cycle': 'You can only add goals for your own team members.'})
        serializer.save()
