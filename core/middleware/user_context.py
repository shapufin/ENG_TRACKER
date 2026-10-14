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
    explicit = getattr(_thread_locals, 'user', None)
    if explicit is not None:
        return explicit
    # Resolve lazily: at middleware time a JWT user is not known yet. DRF's
    # ``Request.user`` setter writes the authenticated user back onto the
    # underlying HttpRequest (rest_framework/request.py, ``user.setter``), so
    # reading it when a signal fires sees the real actor.
    request = getattr(_thread_locals, 'request', None)
    user = getattr(request, 'user', None) if request is not None else None
    return user if user is not None and user.is_authenticated else None


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
        """Remember the request; the user is resolved lazily (see get_current_user).

        Evaluating ``request.user`` here would cost a session lookup on every
        request and would see an anonymous user for JWT-authenticated API calls.
        """
        _thread_locals.request = request
        return None

    def process_response(self, request, response):
        """Clean up thread-local context after request is processed."""
        for name in ('user', 'request'):
            if hasattr(_thread_locals, name):
                delattr(_thread_locals, name)
        return response
