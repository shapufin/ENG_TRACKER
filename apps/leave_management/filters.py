from django_filters import rest_framework as filters
from apps.permissions.services.role_service import users_with_role_q
from .models import LeaveRequest


class LeaveRequestFilter(filters.FilterSet):
    """FilterSet for LeaveRequest with support for nested profile lookups."""
    is_italian_tl_role = filters.BooleanFilter(field_name='user', method='filter_italian_tl_role')
    is_albanian_tl_role = filters.BooleanFilter(field_name='user', method='filter_albanian_tl_role')
    user = filters.NumberFilter(field_name='user')
    status = filters.CharFilter(field_name='status')
    request_type = filters.CharFilter(field_name='request_type')
    start_date = filters.DateFilter(field_name='start_date')

    class Meta:
        model = LeaveRequest
        fields = ['user', 'status', 'request_type', 'start_date', 'is_italian_tl_role', 'is_albanian_tl_role']

    def filter_italian_tl_role(self, queryset, name, value):
        """Filter by Manager role with null-safety."""
        if value is None or value == '':
            return queryset
        q = users_with_role_q('italian_tl', prefix='user__')
        return queryset.filter(q) if value else queryset.exclude(q)

    def filter_albanian_tl_role(self, queryset, name, value):
        """Filter by Line Manager role with null-safety."""
        if value is None or value == '':
            return queryset
        q = users_with_role_q('albanian_tl', prefix='user__')
        return queryset.filter(q) if value else queryset.exclude(q)
