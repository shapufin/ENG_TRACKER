"""Employee performance review cycles and goals."""

from django.db import IntegrityError
from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError

from core.mixins.permissions import PluginPermissionMixin


from ..models import (
    EPRCycle,
    EPRGoal,
)
from ..serializers import (
    EPRCycleSerializer,
    EPRGoalSerializer,
)
from core.mixins.permissions import is_staff_user
from core.mixins.viewer_scope import HbprScopedQuerysetMixin


class EPRCycleViewSet(HbprScopedQuerysetMixin, PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'tl_scorecard'
    serializer_class = EPRCycleSerializer

    hbpr_leader_field = None  # EPRCycle has no owning-TL field: scoped by subject
    hbpr_member_field = 'user'

    def base_queryset(self):
        return EPRCycle.objects.select_related('user').prefetch_related('goals')

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
        # ≥5 goals required before Goal Setting can be marked complete —
        # enforced here, not in the model, so it stays a pure data holder.
        instance = serializer.instance
        new_goal_setting = serializer.validated_data.get('goal_setting_completed_at')
        if new_goal_setting and not instance.goal_setting_completed_at and len(instance.goals.all()) < 5:
            raise ValidationError({
                'goal_setting_completed_at': 'At least 5 goals are required before this stage can be marked complete.',
            })
        target_user = serializer.validated_data.get('user')
        if target_user and not is_staff_user(self.request.user):
            if target_user.id not in self.request.user.profile.get_team_member_ids():
                raise ValidationError({'user': 'You can only manage an EPR cycle for your own team members.'})
        serializer.save()


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
