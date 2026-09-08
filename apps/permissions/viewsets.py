"""Permissions app viewsets."""

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import filters, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from core.mixins.permissions import IsSuperuser, SuperuserPermissionMixin
from core.pagination import StandardResultsPagination

from .models import Group, Permission, Role, RolePermission, UserGroup, UserRole
from .serializers import (
    GroupSerializer,
    PermissionSerializer,
    RolePermissionSerializer,
    RoleSerializer,
    UserGroupSerializer,
    UserRoleSerializer,
)


class GroupViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    """Manage resource-access groups (calendar/plugin membership only).

    Read access is available to staff admins; create/update/delete is
    superuser-only. Group membership drives plugin access grants, so
    restricting mutation to superusers prevents staff admins from
    escalating their own plugin permissions.

    The directory list annotates ``member_count`` via a single aggregate
    query so the UI can show group sizes without N+1 membership lookups.
    The ``member_candidates`` action powers the Add Member dialog with a
    server-side, paginated user search that excludes existing members and
    inactive users by default.
    """
    serializer_class = GroupSerializer
    pagination_class = StandardResultsPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']

    def get_queryset(self):
        return (
            Group.objects.all()
            .annotate(member_count=Count('members', distinct=True))
            .prefetch_related('plugin_permissions')
            .order_by('name', 'id')
        )

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'member_candidates'):
            return [permissions.IsAdminUser()]
        return [IsSuperuser()]

    @action(detail=False, methods=['post'], url_path='bulk_delete')
    def bulk_delete(self, request):
        """Delete groups and their memberships/access grants atomically.

        Only superusers reach this action through ``get_permissions``. The
        response includes the access summary that was removed so the UI can
        confirm exactly which plugin actions were affected.
        """
        group_ids = request.data.get('ids')
        if (
            not isinstance(group_ids, list)
            or not group_ids
            or any(not isinstance(group_id, int) or isinstance(group_id, bool) for group_id in group_ids)
            or len(group_ids) != len(set(group_ids))
        ):
            return Response(
                {'detail': 'ids must be a non-empty list of unique integer group IDs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            groups = list(
                Group.objects.select_for_update()
                .prefetch_related('plugin_permissions')
                .filter(pk__in=group_ids)
            )
            if len(groups) != len(group_ids):
                return Response(
                    {'detail': 'One or more groups do not exist.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            access_summary = [
                {
                    'group_id': group.id,
                    'group_name': group.name,
                    'plugin_access': GroupSerializer(group).data['plugin_access'],
                }
                for group in groups
            ]
            Group.objects.filter(pk__in=group_ids).delete()

        return Response({
            'deleted_count': len(group_ids),
            'deleted_ids': group_ids,
            'access_summary': access_summary,
        })

    @action(detail=True, methods=['get'], url_path='member_candidates')
    def member_candidates(self, request, pk=None):
        """Paginated user search for the Add Member dialog.

        Excludes users already in this group and inactive users by default.
        Search matches username, email, first name, or last name.

        Bypasses ``self.get_object()`` because the viewset's
        ``SearchFilter`` would apply the ``?search=`` query parameter to
        the group queryset and filter out the target group.
        """
        group = get_object_or_404(Group, pk=pk)
        search = request.query_params.get('search', '').strip()
        queryset = User.objects.filter(is_active=True).exclude(
            user_groups__group=group
        ).order_by('username', 'id')
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        paginator = PageNumberPagination()
        paginator.page_size_query_param = 'page_size'
        paginator.max_page_size = 100
        page = paginator.paginate_queryset(queryset, request, view=self)
        data = [
            {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'full_name': user.get_full_name(),
            }
            for user in page
        ]
        return paginator.get_paginated_response(data)


class RoleViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    queryset = Role.objects.all().order_by('name')
    serializer_class = RoleSerializer
    pagination_class = StandardResultsPagination
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']


class PermissionViewSet(SuperuserPermissionMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all().order_by('module', 'action')
    serializer_class = PermissionSerializer
    pagination_class = StandardResultsPagination
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['module', 'action']


class UserRoleViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    queryset = UserRole.objects.all().select_related('user', 'role', 'team').order_by('-id')
    serializer_class = UserRoleSerializer
    pagination_class = StandardResultsPagination
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['user', 'role', 'team', 'is_active']


class UserGroupViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    """Manage user-group memberships.

    Read access is available to staff admins; create/update/delete is
    superuser-only. Membership controls plugin access, so restricting
    mutation to superusers prevents privilege escalation.

    The list supports ``group`` filtering (DjangoFilterBackend) and a
    server-side ``search`` parameter that matches the member's username,
    email, first name, or last name. Results are always paginated and
    deterministically ordered by member username then membership id so
    pagination stays stable when memberships change between requests.
    """
    serializer_class = UserGroupSerializer
    pagination_class = StandardResultsPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['user', 'group']
    search_fields = ['user__username', 'user__email', 'user__first_name', 'user__last_name']

    def get_queryset(self):
        return (
            UserGroup.objects.all()
            .select_related('user', 'group')
            .order_by('user__username', 'id')
        )

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAdminUser()]
        return [IsSuperuser()]


class RolePermissionViewSet(SuperuserPermissionMixin, viewsets.ModelViewSet):
    """Manage capability assignments to database roles."""
    queryset = RolePermission.objects.all().select_related('role', 'permission').order_by('-id')
    serializer_class = RolePermissionSerializer
    pagination_class = StandardResultsPagination
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['role', 'permission']
