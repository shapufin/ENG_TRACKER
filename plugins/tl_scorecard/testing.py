"""Shared test helpers for the tl_scorecard plugin (imported only by tests)."""
from django.contrib.auth.models import User

from apps.users.models.core import UserProfile


def make_user(username, **kwargs):
    """A user with a profile, as every scorecard fixture needs."""
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user
