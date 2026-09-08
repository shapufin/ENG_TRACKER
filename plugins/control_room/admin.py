from django.contrib import admin

from core.mixins.permissions import SuperuserOnlyAdminMixin
from .models import ControlRoomAccess, ControlRoomTeamScope


class ControlRoomTeamScopeInline(SuperuserOnlyAdminMixin, admin.TabularInline):
    model = ControlRoomTeamScope
    extra = 0


@admin.register(ControlRoomAccess)
class ControlRoomAccessAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['user', 'is_active', 'display_name', 'scope_count', 'created_at', 'updated_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['user__username', 'user__email', 'display_name']
    autocomplete_fields = ['user', 'created_by', 'updated_by']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [ControlRoomTeamScopeInline]

    @admin.display(description='Teams')
    def scope_count(self, obj):
        return obj.team_scopes.count()


@admin.register(ControlRoomTeamScope)
class ControlRoomTeamScopeAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['access', 'team', 'include_subteams', 'created_at']
    list_filter = ['include_subteams', 'created_at']
    search_fields = ['access__user__username', 'team__name']
    autocomplete_fields = ['access', 'created_by']
    readonly_fields = ['created_at']
