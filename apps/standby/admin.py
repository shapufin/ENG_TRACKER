from django.contrib import admin
from django.core.exceptions import ValidationError
from core.mixins.permissions import SuperuserOnlyAdminMixin
from .models import StandbyLog, StandbyPattern


@admin.register(StandbyPattern)
class StandbyPatternAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['user', 'name', 'recurrence_type', 'is_active', 'valid_from', 'valid_until']
    list_filter = ['recurrence_type', 'is_active', 'valid_from']
    search_fields = ['user__username', 'name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(StandbyLog)
class StandbyLogAdmin(SuperuserOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['user', 'date', 'hours', 'status', 'approved_by', 'created_at']
    list_filter = ['status', 'date', 'created_at', 'pattern']
    search_fields = ['user__username', 'description', 'evidence']
    readonly_fields = ['created_at', 'updated_at', 'approved_at']
    date_hierarchy = 'date'

    @staticmethod
    def _in_closed_year(obj) -> bool:
        """The STORED row's year, so an edit can never move a row out of a closed year."""
        from apps.users.services.approval_periods import closed_year_of

        if obj is None or obj.pk is None:
            return False
        stored = StandbyLog.objects.filter(pk=obj.pk).only('date').first()
        return stored is not None and closed_year_of(stored) is not None

    def has_change_permission(self, request, obj=None):
        # A closed year is frozen for everyone, the Django admin included (item 31): view only.
        return super().has_change_permission(request, obj) and not self._in_closed_year(obj)

    def has_delete_permission(self, request, obj=None):
        return super().has_delete_permission(request, obj) and not self._in_closed_year(obj)

    @staticmethod
    def _ensure_not_finalized(obj):
        try:
            from plugins.payroll.models import PayrollRunEntry
        except ImportError:
            return
        if PayrollRunEntry.objects.filter(
            source_kind='standby', source_id=obj.pk, status='finalized',
        ).exists():
            raise ValidationError(
                'This standby entry belongs to finalized payroll and cannot be changed.'
            )

    def save_model(self, request, obj, form, change):
        if change:
            self._ensure_not_finalized(obj)
        # A closed year is frozen for everyone, the Django admin included.
        from apps.users.services.approval_periods import closed_year_error

        closed_message = closed_year_error(getattr(obj, 'date', None))
        if closed_message:
            raise ValidationError(closed_message)
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        self._ensure_not_finalized(obj)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            self._ensure_not_finalized(obj)
        super().delete_queryset(request, queryset)
