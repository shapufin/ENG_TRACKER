from django_filters import rest_framework as filters
from .models import LeaveRequest


class LeaveRequestFilter(filters.FilterSet):
    """FilterSet for LeaveRequest with support for nested profile lookups."""
    is_italian_tl_role = filters.BooleanFilter(field_name='user__profile__is_italian_tl_role', method='filter_italian_tl_role')
    is_albanian_tl_role = filters.BooleanFilter(field_name='user__profile__is_albanian_tl_role', method='filter_albanian_tl_role')
    user = filters.NumberFilter(field_name='user')
    status = filters.CharFilter(field_name='status')
    request_type = filters.CharFilter(field_name='request_type')
    start_date = filters.DateFilter(field_name='start_date')

    class Meta:
        model = LeaveRequest
        fields = ['user', 'status', 'request_type', 'start_date', 'is_italian_tl_role', 'is_albanian_tl_role']

    def filter_italian_tl_role(self, queryset, name, value):
        """Filter by Italian TL role with null-safety."""
        if value is None or value == '':
            return queryset
        return queryset.filter(user__profile__is_italian_tl_role=bool(value))

    def filter_albanian_tl_role(self, queryset, name, value):
        """Filter by Albanian TL role with null-safety."""
        if value is None or value == '':
            return queryset
        return queryset.filter(user__profile__is_albanian_tl_role=bool(value))
