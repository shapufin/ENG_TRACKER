"""Filter utilities for reports module."""

from django_filters import rest_framework as filters
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from apps.leave_management.models import LeaveRequest
from apps.dashboard.models.calendar import CalendarWorkspace
from core.mixins.permissions import has_hr_role, has_team_leader_role

REPORT_TYPE_CHOICES = (
    ('overtime', 'overtime'),
    ('standby', 'standby'),
    ('leave', 'leave'),
    ('combined', 'combined'),
)


def apply_visibility_constraints(queryset, user):
    """Scope a queryset by the caller's role-based visibility.

    Staff/superuser/HR: all records.
    Team leaders: own + team member records (via get_team_member_ids).
    Everyone else: own records only.

    This is the single source of truth for report/export row-level scoping.
    Both UnifiedReportFilter and the standalone export views (ExportOTStandbyView,
    ExportLeaveView) must use this to prevent data leakage to non-admin callers.
    """
    if not user or not user.is_authenticated:
        return queryset.none()

    profile = getattr(user, 'profile', None)
    if user.is_staff or user.is_superuser or has_hr_role(user):
        return queryset

    if has_team_leader_role(user):
        visible_ids = profile.get_team_member_ids() if profile else set()
        visible_ids.add(user.id)
    else:
        visible_ids = {user.id}
    return queryset.filter(user_id__in=visible_ids)


class UnifiedReportFilter(filters.FilterSet):
    """Single entry point for validating and applying report query filters.

    NOTE: This filter is instantiated directly (not via DRF filter backend),
    so it uses self.data (raw params) instead of self.cleaned_data.
    Form-level validation is not applied — validation happens in viewsets.
    Meta.fields = [] because filters are cross-model (overtime, standby, leave),
    not bound to a single model's fields.
    """

    start_date = filters.DateFilter(required=False)
    end_date = filters.DateFilter(required=False)
    report_type = filters.ChoiceFilter(choices=REPORT_TYPE_CHOICES, required=False)
    italian_tl_id = filters.NumberFilter(required=False)
    albanian_tl_id = filters.NumberFilter(required=False)
    workspace_ids = filters.CharFilter(required=False)
    team_ids = filters.CharFilter(required=False)

    class Meta:
        model = OvertimeLog
        fields = []

    def __init__(self, data=None, queryset=None, *, user=None, request=None, **kwargs):
        self.user = user
        super().__init__(data=data, queryset=queryset or OvertimeLog.objects.none(), request=request, **kwargs)

    # Public API -----------------------------------------------------------------
    def get_filtered_querysets(self):
        overtime_qs = OvertimeLog.objects.all()
        standby_qs = StandbyLog.objects.all()
        leave_qs = LeaveRequest.objects.all()

        overtime_qs = self._apply_temporal_filters(overtime_qs, 'date')
        standby_qs = self._apply_temporal_filters(standby_qs, 'date')
        leave_qs = self._apply_leave_temporal_filters(leave_qs)

        italian_tl_id = self.data.get('italian_tl_id')
        if italian_tl_id:
            overtime_qs = overtime_qs.filter(user__profile__italian_tl_id=italian_tl_id)
            standby_qs = standby_qs.filter(user__profile__italian_tl_id=italian_tl_id)
            leave_qs = leave_qs.filter(user__profile__italian_tl_id=italian_tl_id)

        albanian_tl_id = self.data.get('albanian_tl_id')
        if albanian_tl_id:
            overtime_qs = overtime_qs.filter(user__profile__albanian_tl_id=albanian_tl_id)
            standby_qs = standby_qs.filter(user__profile__albanian_tl_id=albanian_tl_id)
            leave_qs = leave_qs.filter(user__profile__albanian_tl_id=albanian_tl_id)

        team_ids = self._parse_int_list(self.data.get('team_ids'))
        if team_ids:
            filter_kwargs = {'user__profile__teams__id__in': team_ids}
            overtime_qs = overtime_qs.filter(**filter_kwargs).distinct()
            standby_qs = standby_qs.filter(**filter_kwargs).distinct()
            leave_qs = leave_qs.filter(**filter_kwargs).distinct()

        overtime_qs = self._apply_visibility_constraints(overtime_qs)
        standby_qs = self._apply_visibility_constraints(standby_qs)
        leave_qs = self._apply_visibility_constraints(leave_qs)

        workspace_user_ids = self._get_workspace_user_ids()
        if workspace_user_ids is not None:
            overtime_qs = self._apply_workspace_scope(overtime_qs, workspace_user_ids)
            standby_qs = self._apply_workspace_scope(standby_qs, workspace_user_ids)
            leave_qs = self._apply_workspace_scope(leave_qs, workspace_user_ids)

        return {
            'overtime': overtime_qs,
            'standby': standby_qs,
            'leave': leave_qs,
        }

    def get_report_type(self):
        return self.data.get('report_type') or 'combined'

    # Internal helpers -----------------------------------------------------------
    def _apply_temporal_filters(self, queryset, field_name):
        start = self.data.get('start_date')
        end = self.data.get('end_date')
        if start:
            queryset = queryset.filter(**{f'{field_name}__gte': start})
        if end:
            queryset = queryset.filter(**{f'{field_name}__lte': end})
        return queryset

    def _apply_leave_temporal_filters(self, queryset):
        start = self.data.get('start_date')
        end = self.data.get('end_date')
        if start:
            queryset = queryset.filter(start_date__gte=start)
        if end:
            queryset = queryset.filter(end_date__lte=end)
        return queryset

    def _apply_visibility_constraints(self, queryset):
        return apply_visibility_constraints(queryset, self.user)

    def _apply_workspace_scope(self, queryset, workspace_user_ids):
        if not workspace_user_ids:
            return queryset.none()
        return queryset.filter(user_id__in=workspace_user_ids)

    def _parse_int_list(self, value):
        if not value:
            return []
        result = []
        # Support both comma and colon separators for backwards compatibility
        for token in value.replace(',', ' ').replace(':', ' ').split():
            token = token.strip()
            if not token:
                continue
            try:
                result.append(int(token))
            except ValueError:
                continue
        return result

    def _get_workspace_user_ids(self):
        raw = self.data.get('workspace_ids')
        if raw is None:
            return None
        ids = self._parse_int_list(raw)
        if not ids:
            return set()
        user_ids = set()
        workspaces = CalendarWorkspace.objects.filter(id__in=ids)
        for workspace in workspaces:
            user_ids.update(workspace.get_users_for_workspace().values_list('id', flat=True))
        return user_ids
