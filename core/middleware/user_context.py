"""
Middleware to store current user in thread-safe context for audit logging.
"""

from threading import local
from django.utils.deprecation import MiddlewareMixin


_thread_locals = local()


def get_current_user():
    """
    Get the current user from thread-local context.
    
    Returns:
        User: The current user or None if not authenticated
    """
    return getattr(_thread_locals, 'user', None)


def set_current_user(user):
    """
    Set the current user in thread-local context.
    
    Args:
        user: The user to store
    """
    _thread_locals.user = user


class UserContextMiddleware(MiddlewareMixin):
    """
    Middleware to store request.user in thread-local context for audit logging.
    This provides a more robust alternative to thread-local hacks in signal handlers.
    """
    
    def process_request(self, request):
        """Store the current user from the request."""
        if hasattr(request, 'user') and request.user.is_authenticated:
            set_current_user(request.user)
        return None
    
    def process_response(self, request, response):
        """Clean up thread-local context after request is processed."""
        if hasattr(_thread_locals, 'user'):
            delattr(_thread_locals, 'user')
        return response
