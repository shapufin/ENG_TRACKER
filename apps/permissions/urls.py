"""
Permissions app URL configuration.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .viewsets import (
    GroupViewSet, RoleViewSet, PermissionViewSet,
    UserRoleViewSet, UserGroupViewSet,
    RolePermissionViewSet
)

router = DefaultRouter()
router.register(r'groups', GroupViewSet, basename='group')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'user-roles', UserRoleViewSet, basename='userrole')
router.register(r'user-groups', UserGroupViewSet, basename='usergroup')
router.register(r'role-permissions', RolePermissionViewSet, basename='rolepermission')

urlpatterns = [
    path('', include(router.urls)),
]
