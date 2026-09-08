"""
Dashboard app serializers.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import DashboardWidget, UserDashboardPreference
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


class UserDashboardPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserDashboardPreference
        fields = ['id', 'dashboard_type', 'layout']


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
