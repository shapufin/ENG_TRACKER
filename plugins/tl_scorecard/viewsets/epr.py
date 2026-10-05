"""Employee performance review cycles and goals."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin


from ..models import (
    EPRCycle,
    EPRGoal,
    EPRStageRecord,
)
from ..serializers import (
    EPRCycleSerializer,
    EPRGoalSerializer,
    EPRStageRecordSerializer,
)
from core.mixins.permissions import is_staff_user
from core.mixins.viewer_scope import HbprScopedQuerysetMixin


class EPRCycleViewSet(HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = EPRCycleSerializer

    hbpr_leader_field = None  # EPRCycle has no owning-TL field: scoped by subject
    hbpr_member_field = 'user'

    STAGE_FIELD = {
        'goal_setting': 'goal_setting_completed_at',
        'mid_year': 'mid_year_completed_at',
        'final_review': 'final_review_completed_at',
    }

    def base_queryset(self):
        return EPRCycle.objects.select_related('user').prefetch_related(
            'goals', 'stage_records__recorded_by')

    def own_q(self, user):
        return Q(user_id__in=user.profile.get_team_member_ids())

    def perform_create(self, serializer):
        target_user = serializer.validated_data['user']
        if not is_staff_user(self.request.user):
            if target_user.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'user': 'You can only open an EPR cycle for your own team members.'})
        try:
            serializer.save()
        except IntegrityError:
            raise ValidationError({'year': 'An EPR cycle for this user and year already exists.'})

    def perform_update(self, serializer):
        target_user = serializer.validated_data.get('user')
        if target_user and not is_staff_user(self.request.user):
            if target_user.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'user': 'You can only manage an EPR cycle for your own team members.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def complete_stage(self, request, pk=None):
        """The ONLY writer of `*_completed_at` (read-only on PATCH, same rule
        as `Absence.addressed_on`): atomically stamps the stage and creates
        its `EPRStageRecord` evidence — a bare click is not evidence."""
        cycle = self.get_object()
        stage = request.data.get('stage')
        field = self.STAGE_FIELD.get(stage)
        if field is None:
            raise ValidationError({'stage': 'Unknown stage.'})
        if getattr(cycle, field) is not None:
            return Response(
                {'error': 'This stage is already completed.'},
                status=status.HTTP_409_CONFLICT,
            )
        if stage == 'goal_setting' and cycle.goals.count() < 5:
            raise ValidationError({
                'stage': 'At least 5 goals are required before Goal Setting can be marked complete.',
            })
        summary = (request.data.get('summary') or '').strip()
        if not summary:
            raise ValidationError({'summary': 'A stage summary is required.'})
        reference_url = (request.data.get('reference_url') or '').strip()
        if len(reference_url) > 200:
            # objects.create skips full_clean — without these guards a
            # URLField overflow or malformed URL would surface as a DB
            # error, not a 400.
            raise ValidationError({'reference_url': 'Enter a valid URL.'})
        if reference_url:
            try:
                URLValidator()(reference_url)
            except DjangoValidationError:
                raise ValidationError({'reference_url': 'Enter a valid URL.'})
        try:
            with transaction.atomic():
                EPRStageRecord.objects.create(
                    cycle=cycle,
                    stage=stage,
                    summary=summary,
                    reference_url=reference_url,
                    shared_with_employee=bool(request.data.get('shared_with_employee')),
                    recorded_by=request.user,
                )
                setattr(cycle, field, timezone.now())
                cycle.save(update_fields=[field, 'updated_at'])
        except IntegrityError:
            # Lost a race: another request completed this stage between this
            # request's read and write — the unique constraint is the arbiter.
            return Response(
                {'error': 'This stage is already completed.'},
                status=status.HTTP_409_CONFLICT,
            )
        # The prefetch cache from get_object predates the new record —
        # re-fetch so the response carries the evidence row it created.
        cycle = self.base_queryset().get(pk=cycle.pk)
        return Response(
            EPRCycleSerializer(cycle, context=self.get_serializer_context()).data)


class EPRStageRecordViewSet(HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Corrections to stage evidence (summary/reference/shared flag); rows
    are created only by ``EPRCycleViewSet.complete_stage`` — POST is 405.

    ``hbpr_no_access``: the standalone endpoint serves the FULL serializer,
    so the HBPR's only read path is the redacted embed on
    ``EPRCycleSerializer.stage_records`` — never this endpoint."""
    plugin_name = 'tl_scorecard'
    serializer_class = EPRStageRecordSerializer

    hbpr_no_access = True

    http_method_names = ['get', 'patch', 'put', 'delete', 'head', 'options']

    def base_queryset(self):
        return EPRStageRecord.objects.select_related('cycle', 'cycle__user', 'recorded_by')

    def own_q(self, user):
        return Q(cycle__user_id__in=user.profile.get_team_member_ids())

    def _check_writer(self):
        user = self.request.user
        instance = self.get_object()
        if not is_staff_user(user) \
                and instance.cycle.user_id not in user.profile.get_team_member_ids():
            raise PermissionDenied('You can only manage EPR stage records for your own team members.')
        return instance

    def perform_update(self, serializer):
        self._check_writer()
        serializer.save()

    def perform_destroy(self, instance):
        self._check_writer()
        instance.delete()


class EPRGoalViewSet(HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = EPRGoalSerializer

    hbpr_leader_field = None
    hbpr_member_field = 'cycle__user'

    def base_queryset(self):
        return EPRGoal.objects.select_related('cycle', 'cycle__user')

    def own_q(self, user):
        return Q(cycle__user_id__in=user.profile.get_team_member_ids())

    def perform_create(self, serializer):
        cycle = serializer.validated_data['cycle']
        if not is_staff_user(self.request.user):
            if cycle.user_id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'cycle': 'You can only add goals for your own team members.'})
        serializer.save()

    def perform_update(self, serializer):
        cycle = serializer.validated_data.get('cycle')
        if cycle and not is_staff_user(self.request.user):
            if cycle.user_id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'cycle': 'You can only add goals for your own team members.'})
        serializer.save()
