"""Live TL scorecard endpoints (no snapshot model)."""
from datetime import date

from django.contrib.auth.models import User
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.users.services.hbpr_scope import get_hbpr_scope, is_hbpr
from core.mixins.permissions import PluginPermissionMixin, is_hbpr_only

from ..excel_export import build_workbook_bytes
from ..pdf_export import build_scorecard_pdf

from ..scope import scoreable_member_ids
from ..models import (
    HbprGovernanceEvidence,
)
from ..serializers import (
    EprProgressSerializer,
    EscalationCandidateSerializer,
    ScorecardSerializer,
    TeamMemberSummarySerializer,
)
from ..team_members import team_member_summaries
from ..services import (
    build_scorecard,
    epr_metrics,
    escalation_candidates,
    governance_records,
    scorecard_trend,
)
from core.mixins.permissions import is_staff_user
from core.utils.timezone_local import tirana_today


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
    throttle_scope = None  # set per action (export)

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

    @staticmethod
    def _mask_one_on_one(request, leader, *payloads):
        """An HBPR reads a TL's governance, never their employee one-on-ones —
        and the compliance % is derived from exactly those meetings."""
        user = request.user
        if user.is_staff or user.is_superuser or leader.id == user.id:
            return
        for payload in payloads:
            payload['meetings']['one_on_one_compliance_pct'] = None

    @staticmethod
    def _hbpr_subject_ids(request, leader):
        """The employees a non-owner HBPR viewer may see about `leader`'s team,
        or None when the viewer is staff/the leader (no limit)."""
        user = request.user
        if is_staff_user(user) or leader.id == user.id:
            return None
        scope = get_hbpr_scope(user)
        if scope is None:
            return None
        return set(scoreable_member_ids(leader)) & scope.user_ids

    def _mask_hbpr_only(self, request, leader, *payloads):
        """Leave and overtime are denied to HBPR-only viewers (CLAUDE.md), so
        their scorecard omits those blocks and counts no leave escalations."""
        if not is_hbpr_only(request.user):
            return
        escalations = len(escalation_candidates(
            leader, self._hbpr_subject_ids(request, leader), include_leave=False))
        for payload in payloads:
            payload.pop('leave', None)
            payload.pop('overtime', None)
            payload['escalation_count'] = escalations

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

        data = build_scorecard(leader, month or tirana_today())
        self._mask_one_on_one(request, leader, data)
        self._mask_hbpr_only(request, leader, data)
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

        points = scorecard_trend(leader, months, month or tirana_today())
        self._mask_one_on_one(request, leader, *points)
        self._mask_hbpr_only(request, leader, *points)
        return Response(ScorecardSerializer(points, many=True).data)

    @action(detail=False, methods=['get'], url_path='team-members')
    def team_members(self, request):
        """Per-member summary (wage, leave, EPR, governance) for the leader's team.

        Carries pay and leave, so an HBPR is refused outright (even for an
        in-scope Albanian TL), and anyone else may read only their own team
        unless they are staff. One-on-one dates are the leader's or staff's only.
        """
        user = request.user
        if is_hbpr_only(user):
            raise PermissionDenied('The team view is not available to HBPR accounts.')
        leader = self._resolve_leader(request)
        if not is_staff_user(user) and leader.id != user.id:
            raise PermissionDenied("You cannot view this team leader's team.")
        if not hasattr(leader, 'profile'):
            return Response({'error': 'This user has no profile to resolve a team from.'},
                             status=status.HTTP_400_BAD_REQUEST)
        rows = team_member_summaries(
            leader, tirana_today(), include_meetings=is_staff_user(user) or leader.id == user.id,
        )
        return Response(TeamMemberSummarySerializer(rows, many=True).data)

    @action(detail=False, methods=['get'], url_path='epr-progress')
    def epr_progress(self, request):
        """On-time EPR stage completion for the leader's team in `?year=`."""
        try:
            year = int(request.query_params.get('year', tirana_today().year))
        except (TypeError, ValueError):
            raise ValidationError({'year': 'year must be an integer.'})
        if not (2000 <= year <= 2100):
            raise ValidationError({'year': 'year must be between 2000 and 2100.'})

        leader = self._resolve_leader(request)
        return Response(EprProgressSerializer(epr_metrics(scoreable_member_ids(leader), year)).data)

    @action(detail=False, methods=['get'])
    def partnership(self, request):
        """The resolved leader's own HBPR partnership (assignment + cadence/EPR).

        An Albanian TL authors the governance evidence but cannot read the
        staff-only `/api/users/hbpr-assignments/`, so this is where they see who
        their HBPR is and what the cadence state is. Same leader resolution as
        `scorecard`/`export`.
        """
        from .. import services_hbpr

        try:
            year = services_hbpr.parse_reporting_year(request.query_params.get('year'))
        except ValueError as exc:
            raise ValidationError({'year': str(exc)})
        leader = self._resolve_leader(request)
        return Response(services_hbpr.partnership(leader, reporting_year=year))

    @action(detail=False, methods=['get'])
    def escalations(self, request):
        """Computed candidates, not a log — see services.escalation_candidates."""
        leader = self._resolve_leader(request)
        candidates = escalation_candidates(
            leader, self._hbpr_subject_ids(request, leader),
            include_leave=not is_hbpr_only(request.user),
        )
        return Response(EscalationCandidateSerializer(candidates, many=True).data)

    @action(detail=False, methods=['get'], throttle_scope='export')
    def export(self, request):
        """Download the summary: ?file_format=xlsx (default) or pdf. ?month=YYYY-MM-DD."""
        file_format = request.query_params.get('file_format', 'xlsx')
        if file_format not in ('xlsx', 'pdf'):
            return Response({'error': 'file_format must be xlsx or pdf'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            month = _parse_month(request.query_params.get('month'))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        leader = self._resolve_leader(request)
        if not hasattr(leader, 'profile'):
            return Response({'error': 'This user has no profile to resolve a team from.'},
                             status=status.HTTP_400_BAD_REQUEST)

        month = month or tirana_today()
        scorecard = build_scorecard(leader, month)
        trend = scorecard_trend(leader, 6, month)
        self._mask_one_on_one(request, leader, scorecard, *trend)
        team_member_ids = scoreable_member_ids(leader)
        subject_ids = None
        if not is_staff_user(request.user) and leader.id != request.user.id:
            scope = get_hbpr_scope(request.user)
            if scope is not None:
                subject_ids = set(team_member_ids) & scope.user_ids
        governance = governance_records(leader, team_member_ids, month.year, subject_ids)
        period_label = date.fromisoformat(scorecard['month']).strftime('%B %Y')

        # HBPR ↔ AL-TL governance evidence for this leader (the AL TL authors
        # it; employee one-on-ones are never part of this data set).
        evidence_qs = HbprGovernanceEvidence.objects.filter(assignment__albanian_tl=leader)
        if not is_staff_user(request.user) and leader.id != request.user.id:
            # An HBPR exports the evidence of the assignments they own, not what
            # a predecessor built up with the same AL TL.
            evidence_qs = evidence_qs.filter(assignment__hbpr=request.user)
        evidence_rows = [
            {
                'kind_display': row.get_kind_display(),
                'occurred_on': row.occurred_on.isoformat(),
                'reporting_year': row.reporting_year,
                'shared_summary': row.shared_summary,
                'action_items': row.action_items,
                'reference_url': row.reference_url,
            }
            for row in evidence_qs.order_by('-occurred_on', '-id')
        ]

        # Leave and overtime are denied to HBPR-only viewers (CLAUDE.md), so their
        # export omits those KPI rows.
        include_leave_overtime = not is_hbpr_only(request.user)
        if file_format == 'pdf':
            body = build_scorecard_pdf(
                scorecard, trend, governance, epr_metrics(team_member_ids, month.year), period_label,
                leader_name=leader.get_full_name() or leader.username,
                generated_by=request.user.get_full_name() or request.user.username,
                hbpr_evidence=evidence_rows,
                include_leave_overtime=include_leave_overtime,
            )
            content_type = 'application/pdf'
            extension = 'pdf'
        else:
            body = build_workbook_bytes(
                scorecard, governance, period_label,
                hbpr_evidence=evidence_rows, trend=trend,
                include_leave_overtime=include_leave_overtime,
            )
            content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            extension = 'xlsx'

        filename = f'tl_scorecard_{leader.username}_{scorecard["month"][:7]}.{extension}'
        response = HttpResponse(body, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
