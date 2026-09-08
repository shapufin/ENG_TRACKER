from rest_framework import permissions
from core.mixins.permissions import has_hr_role

class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Custom permission to allow only admins (staff) to edit objects.
    HR users get read-only access.
    """
    def has_permission(self, request, view):
        # Allow read-only for authenticated users who are HR or Staff
        if request.method in permissions.SAFE_METHODS:
            return request.user.is_authenticated and (
                request.user.is_staff or has_hr_role(request.user)
            )
        
        # Only staff can perform write operations
        return request.user.is_authenticated and request.user.is_staff
