"""
Phase 1 TL Scorecard endpoints (live computation, no snapshot model) plus
Phase 2 event-logging endpoints (Meeting, IdleFlag, ReviewDelivery,
EngagementSurveyResponse — see models.py for what each closes).
"""
from datetime import date

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.users.services.hbpr_scope import get_hbpr_scope, is_hbpr
from core.mixins.permissions import PluginPermissionMixin
from core.mixins.viewer_scope import HbprReadScopeMixin

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
        user = request.user
        is_staff = user.is_staff or user.is_superuser
        leader_id = request.query_params.get('leader_id')
        if not leader_id:
            profile = getattr(user, 'profile', None)
            if is_hbpr(user) and not is_staff and not (profile and profile.is_team_leader):
                # An HBPR has no team of their own: they must name an in-scope TL.
                raise ValidationError({'leader_id': 'leader_id is required.'})
            return user
        try:
            leader_pk = int(leader_id)
        except (TypeError, ValueError):
            raise ValidationError({'leader_id': 'leader_id must be an integer.'})
        if not is_staff and leader_pk != user.id:
            # Same error whether the id exists or not, so it can't be probed.
            scope = get_hbpr_scope(user)
            if scope is None or not scope.has_tl(leader_pk):
                raise PermissionDenied('You cannot view this team leader\'s scorecard.')
        try:
            leader = User.objects.select_related('profile').get(pk=leader_pk)
        except User.DoesNotExist:
            raise NotFound('leader_id does not match an existing user.')
        profile = getattr(leader, 'profile', None)
        if profile is None or not profile.is_team_leader:
            raise ValidationError({'leader_id': 'leader_id must belong to a team leader.'})
        return leader

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
        leader = self._resolve_leader(request)
        return Response(EscalationCandidateSerializer(escalation_candidates(leader), many=True).data)

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
        subject_ids = None
        if not (request.user.is_staff or request.user.is_superuser) and leader.id != request.user.id:
            scope = get_hbpr_scope(request.user)
            if scope is not None:
                subject_ids = set(team_member_ids) & scope.user_ids
        governance = governance_records(leader, team_member_ids, month.year, subject_ids)
        period_label = date.fromisoformat(scorecard['month']).strftime('%B %Y')

        workbook_bytes = build_workbook_bytes(scorecard, KPI_COVERAGE, governance, period_label)

        filename = f'tl_scorecard_{leader.username}_{scorecard["month"][:7]}.xlsx'
        response = HttpResponse(
            workbook_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class MeetingViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """1-on-1s, TL-Italy syncs, and team meetings — a TL only ever manages
    their own (organizer=request.user); staff see everything."""
    plugin_name = 'tl_scorecard'
    serializer_class = MeetingSerializer

    def get_queryset(self):
        qs = Meeting.objects.select_related('organizer', 'counterparty', 'recorded_by').prefetch_related('attendees')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(
            qs, Q(organizer=user), leader_field='organizer', member_field='counterparty',
            member_nullable=True)

    def perform_create(self, serializer):
        meeting_type = serializer.validated_data.get('meeting_type')
        counterparty = serializer.validated_data.get('counterparty')
        team = serializer.validated_data.get('team')
        if meeting_type in ('one_on_one', 'tl_sync') and counterparty is None:
            raise ValidationError({'counterparty': 'Required for one-on-one and TL-sync meetings.'})
        if meeting_type == 'team_meeting' and team is None:
            raise ValidationError({'team': 'Required for team meetings.'})
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


class MeetingAttendeeViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Attendee roles (member/hrbp/observer) for a Meeting — write access is
    scoped through the meeting's own organizer, same as MeetingViewSet."""
    plugin_name = 'tl_scorecard'
    serializer_class = MeetingAttendeeSerializer
    # An HBPR holds plugin `view` only; writing her own attendance notes is a
    # participation action, checked below against the attendee row.
    permission_action_map = {'notes': 'view'}
    hbpr_participation_actions = frozenset({'notes'})

    def get_queryset(self):
        qs = MeetingAttendee.objects.select_related('meeting', 'user')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(
            qs, Q(meeting__organizer=user),
            leader_field='meeting__organizer', member_field='meeting__counterparty',
            member_nullable=True)

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

    @action(detail=True, methods=['post'])
    def notes(self, request, pk=None):
        """The attendee's own private notes on a meeting they attended."""
        attendee = self.get_object()
        if attendee.user_id != request.user.id:
            raise PermissionDenied('You can only write your own attendance notes.')
        attendee.notes = (request.data.get('notes') or '').strip()
        attendee.save(update_fields=['notes'])
        return Response(self.get_serializer(attendee).data)


class IdleFlagViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = IdleFlagSerializer

    def get_queryset(self):
        qs = IdleFlag.objects.select_related('employee', 'flagged_by').prefetch_related('status_updates')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(
            qs, Q(flagged_by=user), leader_field='flagged_by', member_field='employee')

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

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        flag = self.get_object()
        if flag.status != 'open':
            return Response({'error': 'This idle flag is already resolved.'}, status=status.HTTP_409_CONFLICT)
        flag.status = 'resolved'
        flag.resolved_on = date.today()
        flag.save(update_fields=['status', 'resolved_on'])
        return Response(IdleFlagSerializer(flag, context=self.get_serializer_context()).data)


class IdleStatusUpdateViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Weekly status log entries for an IdleFlag — write access scoped
    through the flag's own flagged_by, same pattern as MeetingAttendee."""
    plugin_name = 'tl_scorecard'
    serializer_class = IdleStatusUpdateSerializer

    def get_queryset(self):
        qs = IdleStatusUpdate.objects.select_related('flag', 'recorded_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(
            qs, Q(flag__flagged_by=user),
            leader_field='flag__flagged_by', member_field='flag__employee')

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


class ReviewDeliveryViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = ReviewDeliverySerializer

    def get_queryset(self):
        qs = ReviewDelivery.objects.select_related('leader', 'recorded_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(qs, Q(leader=user), leader_field='leader')

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


class AbsenceViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = AbsenceSerializer

    def get_queryset(self):
        qs = Absence.objects.select_related('employee', 'flagged_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(
            qs, Q(flagged_by=user), leader_field='flagged_by', member_field='employee')

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

    @action(detail=True, methods=['post'])
    def address(self, request, pk=None):
        absence = self.get_object()
        if absence.addressed_on is not None:
            return Response({'error': 'This absence is already addressed.'}, status=status.HTTP_409_CONFLICT)
        absence.addressed_on = date.today()
        absence.save(update_fields=['addressed_on'])
        return Response(AbsenceSerializer(absence, context=self.get_serializer_context()).data)


class PIPRecordViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Approval is deliberately staff-only (`approve` action) — this
    plugin's role manifest has no HR bucket, and "prior HR approval" is
    the one KPI requirement that must not be self-granted by the TL who
    created the record."""
    plugin_name = 'tl_scorecard'
    serializer_class = PIPRecordSerializer
    # `approve` needs only plugin `view`: the real gate is in the action body
    # (staff, or an in-scope HBPR) so an HBPR need not hold `manage`, which
    # would also open PATCH/DELETE.
    permission_action_map = {'approve': 'view', 'reject': 'view'}
    hbpr_participation_actions = frozenset({'approve', 'reject'})

    def get_queryset(self):
        qs = PIPRecord.objects.select_related('employee', 'tl', 'approved_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(qs, Q(tl=user), leader_field='tl', member_field='employee')

    def perform_create(self, serializer):
        employee = serializer.validated_data['employee']
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only open a PIP for your own team members.'})
        serializer.save(tl=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.approved_at is not None:
            # What HR/HBPR approved must not be rewritten afterwards.
            for field in ('employee', 'start_date'):
                if field in serializer.validated_data and \
                        serializer.validated_data[field] != getattr(instance, field):
                    raise ValidationError({field: 'This cannot change after the PIP is approved.'})
        employee = serializer.validated_data.get('employee')
        if employee and not (self.request.user.is_staff or self.request.user.is_superuser):
            if employee.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'employee': 'You can only open a PIP for your own team members.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if not (request.user.is_staff or request.user.is_superuser or is_hbpr(request.user)):
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
        """Return a draft PIP to the TL (staff or in-scope HBPR). Needs a reason."""
        if not (request.user.is_staff or request.user.is_superuser or is_hbpr(request.user)):
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


class PromotionFlagViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = PromotionFlagSerializer
    permission_action_map = {'decide': 'view'}
    hbpr_participation_actions = frozenset({'decide'})

    def get_queryset(self):
        qs = PromotionFlag.objects.select_related('employee', 'nominated_by')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        user = self.request.user
        return self.limit_to_viewer(
            qs, Q(nominated_by=user), leader_field='nominated_by', member_field='employee')

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
        if not (request.user.is_staff or request.user.is_superuser or is_hbpr(request.user)):
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


class EPRCycleViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = EPRCycleSerializer

    def get_queryset(self):
        qs = EPRCycle.objects.select_related('user').prefetch_related('goals')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        team_member_ids = self.request.user.profile.get_team_member_ids()
        return self.limit_to_viewer(qs, Q(user_id__in=team_member_ids), member_field='user')

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
        if new_goal_setting and not instance.goal_setting_completed_at and len(instance.goals.all()) < 5:
            raise ValidationError({
                'goal_setting_completed_at': 'At least 5 goals are required before this stage can be marked complete.',
            })
        target_user = serializer.validated_data.get('user')
        if target_user and not (self.request.user.is_staff or self.request.user.is_superuser):
            if target_user.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'user': 'You can only manage an EPR cycle for your own team members.'})
        serializer.save()


class EPRGoalViewSet(HbprReadScopeMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = EPRGoalSerializer

    def get_queryset(self):
        qs = EPRGoal.objects.select_related('cycle', 'cycle__user')
        if self.request.user.is_staff or self.request.user.is_superuser:
            return qs
        team_member_ids = self.request.user.profile.get_team_member_ids()
        return self.limit_to_viewer(
            qs, Q(cycle__user_id__in=team_member_ids), member_field='cycle__user')

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
