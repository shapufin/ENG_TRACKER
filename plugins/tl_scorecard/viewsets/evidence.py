"""HBPR <-> Albanian TL governance evidence."""

from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.users.services.hbpr_scope import is_hbpr
from core.mixins.permissions import PluginPermissionMixin


from ..models import (
    HbprGovernanceEvidence,
)
from ..serializers import (
    HbprGovernanceEvidenceSerializer,
)
from core.mixins.permissions import is_staff_user


class HbprGovernanceEvidenceViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Evidence of the HBPR ↔ Albanian TL governance relationship.

    Authored by the **assigned AL TL only**; read and exported by the assigned
    HBPR and staff. There is no destroy — the evidence is the AL TL's record to
    hand to their manager, so corrections go through audited updates.
    """

    plugin_name = 'tl_scorecard'
    serializer_class = HbprGovernanceEvidenceSerializer

    def get_queryset(self):
        from django.db.models import Q, OuterRef, Subquery

        qs = HbprGovernanceEvidence.objects.select_related(
            'assignment__hbpr', 'assignment__albanian_tl', 'recorded_by', 'updated_by',
        )
        # One subquery for the owning assignment's latest cadence meeting, so a
        # list response does not run two queries per row for the cadence fields.
        qs = qs.annotate(
            last_cadence_on=Subquery(
                HbprGovernanceEvidence.objects.filter(
                    assignment=OuterRef('assignment_id'), kind='cadence_meeting',
                ).order_by('-occurred_on').values('occurred_on')[:1]
            )
        )
        user = self.request.user
        if not is_staff_user(user):
            from apps.users.services.hbpr_assignments import today

            if is_hbpr(user):
                # An HBPR reads evidence for the assignments they own, current
                # and historical (an ended assignment's evidence is still theirs)
                # — but a FUTURE-dated assignment grants nothing yet, mirroring
                # hbpr_scope's `effective_from <= today` rule, and a deactivated
                # AL TL's assignment is out of scope too.
                qs = qs.filter(
                    assignment__hbpr=user,
                    assignment__effective_from__lte=today(),
                    assignment__albanian_tl__is_active=True,
                )
            else:
                # An Albanian TL reads the evidence recorded on their own
                # assignments.
                qs = qs.filter(assignment__albanian_tl=user)

        params = self.request.query_params
        kind = params.get('kind')
        if kind:
            qs = qs.filter(kind=kind)
        year = params.get('year')
        if year:
            try:
                year_value = int(year)
            except ValueError:
                raise ValidationError({'year': 'year must be an integer.'})
            qs = qs.filter(reporting_year=year_value)
        period_year = params.get('period_year')
        if period_year:
            # The reporting year of a record: EPR evidence by `reporting_year`,
            # cadence meetings (no reporting year) by the year they occurred.
            try:
                py = int(period_year)
            except ValueError:
                raise ValidationError({'period_year': 'period_year must be an integer.'})
            qs = qs.filter(
                Q(reporting_year=py) | Q(reporting_year__isnull=True, occurred_on__year=py)
            )
        leader = params.get('leader')
        if leader:
            try:
                qs = qs.filter(assignment__albanian_tl_id=int(leader))
            except ValueError:
                raise ValidationError({'leader': 'leader must be an integer.'})
        assignment = params.get('assignment')
        if assignment:
            try:
                qs = qs.filter(assignment_id=int(assignment))
            except ValueError:
                raise ValidationError({'assignment': 'assignment must be an integer.'})
        return qs

    def perform_create(self, serializer):
        assignment = serializer.validated_data['assignment']
        # Staff audit this evidence; only the assigned AL TL authors it.
        if assignment.albanian_tl_id != self.request.user.id:
            raise PermissionDenied(
                'Only the assigned Albanian TL can record this evidence.'
            )
        serializer.save(recorded_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.assignment.albanian_tl_id != self.request.user.id:
            raise PermissionDenied(
                'Only the assigned Albanian TL can edit this evidence.'
            )
        serializer.save(updated_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied(
            'Governance evidence cannot be deleted; update it instead.'
        )
