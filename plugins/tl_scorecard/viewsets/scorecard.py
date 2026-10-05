"""Live TL scorecard endpoints (no snapshot model)."""
from datetime import date

from django.contrib.auth.models import User
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.users.services.hbpr_scope import get_hbpr_scope, is_hbpr
from core.mixins.permissions import PluginPermissionMixin

from ..excel_export import build_workbook_bytes

from ..models import (
    HbprGovernanceEvidence,
)
from ..serializers import (
    EscalationCandidateSerializer,
    ScorecardSerializer,
)
from ..services import build_scorecard, escalation_candidates, governance_records, scorecard_trend
from core.mixins.permissions import is_staff_user


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
        self._mask_one_on_one(request, leader, data)
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
        self._mask_one_on_one(request, leader, *points)
        return Response(ScorecardSerializer(points, many=True).data)

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
        self._mask_one_on_one(request, leader, scorecard)
        team_member_ids = leader.profile.get_team_member_ids()
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

        workbook_bytes = build_workbook_bytes(
            scorecard, governance, period_label,
            hbpr_evidence=evidence_rows,
        )

        filename = f'tl_scorecard_{leader.username}_{scorecard["month"][:7]}.xlsx'
        response = HttpResponse(
            workbook_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
