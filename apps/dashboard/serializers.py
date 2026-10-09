"""
Dashboard app serializers.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import DashboardWidget, UserDashboardPreference, SiteBranding
from .models.calendar import CalendarWorkspace, UserCalendarPreference, PublicHoliday

User = get_user_model()


class WorkspaceUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    team = serializers.SerializerMethodField()
    teams = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name',
                  'is_staff', 'is_superuser', 'team', 'teams']

    def get_full_name(self, obj):
        if obj.first_name or obj.last_name:
            return f"{obj.first_name or ''} {obj.last_name or ''}".strip()
        return obj.username

    def get_team(self, obj):
        workspace = self.context.get('workspace')
        if workspace and workspace.team:
            return {'id': workspace.team.id, 'name': workspace.team.name, 'code': workspace.team.code}
        return None

    def get_teams(self, obj):
        workspace = self.context.get('workspace')
        if workspace and workspace.team:
            return [{'id': workspace.team.id, 'name': workspace.team.name, 'code': workspace.team.code}]
        return []


class DashboardWidgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = DashboardWidget
        fields = ['id', 'name', 'widget_type', 'description', 'data_source', 'configuration']


# Limits for the saved layout JSON. Generous for any real dashboard (the admin grid has a
# dozen widgets on a 12-column grid), tight enough that a row cannot be used to park a payload.
LAYOUT_MAX_WIDGETS = 100
LAYOUT_MAX_BREAKPOINTS = 8
LAYOUT_WIDGET_ID_MAX = 64
LAYOUT_CELL_MAX = 200
LAYOUT_COLUMNS_RANGE = (1, 24)


def _is_int(value):
    # bool is an int subclass in Python, but true/false is never a coordinate.
    return isinstance(value, int) and not isinstance(value, bool)


def _check_cell(path, cell, keys):
    if not isinstance(cell, dict):
        raise serializers.ValidationError(f'{path} must be an object.')
    for key in keys:
        value = cell.get(key)
        if not _is_int(value) or not 0 <= value <= LAYOUT_CELL_MAX:
            raise serializers.ValidationError(
                f'{path}.{key} must be a whole number from 0 to {LAYOUT_CELL_MAX}.'
            )


def _check_placements(path, placements):
    if not isinstance(placements, list):
        raise serializers.ValidationError(f'{path} must be a list.')
    if len(placements) > LAYOUT_MAX_WIDGETS:
        raise serializers.ValidationError(f'{path} can hold at most {LAYOUT_MAX_WIDGETS} widgets.')
    for index, placement in enumerate(placements):
        here = f'{path}[{index}]'
        if not isinstance(placement, dict):
            raise serializers.ValidationError(f'{here} must be an object.')
        widget_id = placement.get('id')
        if not isinstance(widget_id, str) or not 1 <= len(widget_id) <= LAYOUT_WIDGET_ID_MAX:
            raise serializers.ValidationError(
                f'{here}.id must be a text of 1 to {LAYOUT_WIDGET_ID_MAX} characters.'
            )
        _check_cell(f'{here}.position', placement.get('position'), ('x', 'y'))
        _check_cell(f'{here}.size', placement.get('size'), ('w', 'h'))


class UserDashboardPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserDashboardPreference
        fields = ['id', 'dashboard_type', 'layout']

    def validate_layout(self, value):
        """
        Shape check for the stored layout: `{version?, columns?, widgets?, layouts?}`.
        Every key is optional (a fresh row holds `{}`) and unknown keys are left alone, so the
        legacy 4-column admin layout and the layouts of the other dashboard types stay valid.
        Out-of-range numbers are rejected, never clamped silently.
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError('Layout must be an object.')
        if 'version' in value and not _is_int(value['version']):
            raise serializers.ValidationError('version must be a whole number.')
        if 'columns' in value:
            low, high = LAYOUT_COLUMNS_RANGE
            columns = value['columns']
            if not _is_int(columns) or not low <= columns <= high:
                raise serializers.ValidationError(
                    f'columns must be a whole number from {low} to {high}.'
                )
        if 'widgets' in value:
            _check_placements('widgets', value['widgets'])
        if 'layouts' in value:
            layouts = value['layouts']
            if not isinstance(layouts, dict):
                raise serializers.ValidationError('layouts must be an object.')
            if len(layouts) > LAYOUT_MAX_BREAKPOINTS:
                raise serializers.ValidationError(
                    f'layouts can hold at most {LAYOUT_MAX_BREAKPOINTS} breakpoints.'
                )
            for breakpoint_name, placements in layouts.items():
                _check_placements(f'layouts.{breakpoint_name}', placements)
        return value


class CalendarWorkspaceSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source='team.name', read_only=True)
    team_code = serializers.CharField(source='team.code', read_only=True)
    team_calendar_group = serializers.CharField(source='team.calendar_group', read_only=True)

    class Meta:
        model = CalendarWorkspace
        fields = ['id', 'name', 'code', 'description', 'color', 'icon', 'is_public', 'team',
                  'team_name', 'team_code', 'team_calendar_group',
                  'default_view', 'show_overtime', 'show_standby', 'show_vacation', 'show_holidays']


class UserCalendarPreferenceSerializer(serializers.ModelSerializer):
    calendar_name = serializers.CharField(source='calendar.name', read_only=True)
    calendar_color = serializers.CharField(source='calendar.color', read_only=True)

    class Meta:
        model = UserCalendarPreference
        fields = ['id', 'calendar', 'calendar_name', 'calendar_color', 'is_active', 'is_default',
                  'display_color', 'sort_order', 'show_only_my_entries', 'show_only_my_team']


class PublicHolidaySerializer(serializers.ModelSerializer):
    calendar_name = serializers.CharField(source='calendar.name', read_only=True)

    class Meta:
        model = PublicHoliday
        fields = ['id', 'name', 'date', 'country_code', 'is_global', 'description', 'calendar', 'calendar_name']


class SiteBrandingSerializer(serializers.ModelSerializer):
    """Serializer for SiteBranding singleton."""
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = SiteBranding
        fields = ['id', 'site_name', 'logo', 'logo_url']

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None
