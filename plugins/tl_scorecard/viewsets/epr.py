"""Employee performance review cycles and goals."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.mixins.permissions import PluginPermissionMixin


from ..scope import scoreable_member_ids
from ..models import (
    EPRCycle,
    EPRGoal,
    EPRStageRecord,
)
from ..epr_goal_import import (
    GoalImportError,
    MIN_CONFIRMED_GOALS,
    extract_goal_titles_from_pdf,
    normalize_goal_titles,
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
    throttle_scope = None  # set per action (parse_goal_pdf)
    serializer_class = EPRCycleSerializer

    hbpr_leader_field = None  # EPRCycle has no owning-TL field: scoped by subject
    hbpr_member_field = 'user'

    STAGE_FIELD = {
        'goal_setting': 'goal_setting_completed_at',
        'mid_year': 'mid_year_completed_at',
        'final_review': 'final_review_completed_at',
    }

    # An EPR cycle is a fixed sequence. Without this guard a TL can complete
    # Final Review first on a cycle with <5 goals, which permanently strands
    # Goal Setting: it needs 5 confirmed goals, and goal rows can no longer be
    # written once a later stage is complete.
    STAGE_ORDER = ('goal_setting', 'mid_year', 'final_review')
    STAGE_LABEL = {
        'goal_setting': 'Goal Setting',
        'mid_year': 'Mid-year',
        'final_review': 'Final Review',
    }

    def base_queryset(self):
        return EPRCycle.objects.select_related('user').prefetch_related(
            'goals', 'stage_records__recorded_by')

    def own_q(self, user):
        return Q(user_id__in=scoreable_member_ids(user))

    def perform_create(self, serializer):
        target_user = serializer.validated_data['user']
        if not is_staff_user(self.request.user):
            if target_user.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'user': 'You can only open an EPR cycle for your own team members.'})
        try:
            serializer.save()
        except IntegrityError:
            raise ValidationError({'year': 'An EPR cycle for this user and year already exists.'})

    def perform_update(self, serializer):
        target_user = serializer.validated_data.get('user')
        if target_user and not is_staff_user(self.request.user):
            if target_user.id not in scoreable_member_ids(self.request.user):
                raise ValidationError({'user': 'You can only manage an EPR cycle for your own team members.'})
        serializer.save()

    def _ensure_stage_order(self, cycle, stage):
        """Reject a stage while an earlier one is still open — see STAGE_ORDER."""
        for earlier in self.STAGE_ORDER[:self.STAGE_ORDER.index(stage)]:
            if getattr(cycle, self.STAGE_FIELD[earlier]) is None:
                raise ValidationError({
                    'stage': f'{self.STAGE_LABEL[earlier]} must be completed first.',
                })

    def _goal_titles_for_stage(self, request, stage, cycle):
        """Validate lifecycle-specific goal payloads inside the row lock."""
        if 'goal_titles' not in request.data:
            if stage in ('goal_setting', 'mid_year') and cycle.goals.count() < MIN_CONFIRMED_GOALS:
                raise ValidationError({
                    'goals': 'At least 5 confirmed Workday goals are required for this stage.',
                })
            return None
        if stage == 'final_review':
            raise ValidationError({
                'goal_titles': 'Goals cannot be changed during Final Review.',
            })
        if stage == 'goal_setting' and (
                cycle.mid_year_completed_at is not None
                or cycle.final_review_completed_at is not None):
            raise ValidationError({
                'goal_titles': 'Goal Setting cannot change goals after later stages are complete.',
            })
        if stage == 'mid_year' and cycle.final_review_completed_at is not None:
            raise ValidationError({
                'goal_titles': 'Goals cannot be changed after Final Review is complete.',
            })
        try:
            return normalize_goal_titles(
                request.data.get('goal_titles'), minimum=MIN_CONFIRMED_GOALS)
        except GoalImportError as exc:
            raise ValidationError({exc.field: [str(exc)]})

    @action(
        detail=True, methods=['post'], throttle_scope='upload',
        parser_classes=[MultiPartParser, FormParser],
    )
    def parse_goal_pdf(self, request, pk=None):
        """Preview Workday goal titles; the upload is never persisted."""
        cycle = self.get_object()
        stage = request.data.get('stage')
        if stage not in ('goal_setting', 'mid_year'):
            raise ValidationError({'stage': 'PDF goal import is available only for Goal Setting or Mid-year.'})
        if getattr(cycle, self.STAGE_FIELD[stage]) is not None:
            raise ValidationError({'stage': 'This stage is already completed.'})
        if stage == 'goal_setting' and (
                cycle.mid_year_completed_at is not None
                or cycle.final_review_completed_at is not None):
            raise ValidationError({'stage': 'Goal Setting is locked by a later completed stage.'})
        if stage == 'mid_year' and cycle.final_review_completed_at is not None:
            raise ValidationError({'stage': 'Mid-year is locked by Final Review.'})

        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': 'Upload a Workday goal-setting PDF.'})
        try:
            titles = extract_goal_titles_from_pdf(upload)
        except GoalImportError as exc:
            raise ValidationError({exc.field: [str(exc)]})
        return Response({'goal_titles': titles})

    @action(detail=True, methods=['post'])
    def complete_stage(self, request, pk=None):
        """The ONLY writer of `*_completed_at` and confirmed goal rows.

        Goal replacement, evidence creation, and the stage timestamp share one
        transaction so a failed save can never leave a partial goal set.
        """
        cycle = self.get_object()
        stage = request.data.get('stage')
        field = self.STAGE_FIELD.get(stage)
        if field is None:
            raise ValidationError({'stage': 'Unknown stage.'})
        summary = (request.data.get('summary') or '').strip()
        if not summary:
            raise ValidationError({'summary': 'A stage summary is required.'})
        reference_url = (request.data.get('reference_url') or '').strip()
        if len(reference_url) > 200:
            raise ValidationError({'reference_url': 'Enter a valid URL.'})
        if reference_url:
            try:
                URLValidator()(reference_url)
            except DjangoValidationError:
                raise ValidationError({'reference_url': 'Enter a valid URL.'})
        try:
            with transaction.atomic():
                locked = EPRCycle.objects.select_for_update().get(pk=cycle.pk)
                if getattr(locked, field) is not None:
                    return Response(
                        {'error': 'This stage is already completed.'},
                        status=status.HTTP_409_CONFLICT,
                    )
                self._ensure_stage_order(locked, stage)
                goal_titles = self._goal_titles_for_stage(request, stage, locked)
                if goal_titles is not None:
                    locked.goals.all().delete()
                    EPRGoal.objects.bulk_create([
                        EPRGoal(cycle=locked, description=title)
                        for title in goal_titles
                    ])
                EPRStageRecord.objects.create(
                    cycle=locked,
                    stage=stage,
                    summary=summary,
                    reference_url=reference_url,
                    shared_with_employee=bool(request.data.get('shared_with_employee')),
                    recorded_by=request.user,
                )
                setattr(locked, field, timezone.now())
                locked.save(update_fields=[field, 'updated_at'])
        except IntegrityError:
            # Lost a race: another request completed this stage between this
            # request's read and write — the unique constraint is the arbiter.
            return Response(
                {'error': 'This stage is already completed.'},
                status=status.HTTP_409_CONFLICT,
            )
        # The prefetch cache from get_object predates the new goals/record —
        # re-fetch so the response carries what the transaction committed.
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
        return Q(cycle__user_id__in=scoreable_member_ids(user))

    def _check_writer(self):
        user = self.request.user
        instance = self.get_object()
        if not is_staff_user(user) \
                and instance.cycle.user_id not in scoreable_member_ids(user):
            raise PermissionDenied('You can only manage EPR stage records for your own team members.')
        return instance

    def perform_update(self, serializer):
        self._check_writer()
        serializer.save()

    def perform_destroy(self, instance):
        self._check_writer()
        instance.delete()


class EPRGoalViewSet(HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    """Confirmed Workday goals are read-only; complete_stage is the only writer."""
    plugin_name = 'tl_scorecard'
    serializer_class = EPRGoalSerializer
    http_method_names = ['get', 'head', 'options']

    hbpr_leader_field = None
    hbpr_member_field = 'cycle__user'

    def base_queryset(self):
        return EPRGoal.objects.select_related('cycle', 'cycle__user')

    def own_q(self, user):
        return Q(cycle__user_id__in=scoreable_member_ids(user))
