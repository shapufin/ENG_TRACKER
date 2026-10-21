"""
Helpers shared by every importer.

One definition each, so two targets cannot disagree on how a user is found or
how a boolean cell is read.
"""

from typing import Any, Dict, Optional

from django.contrib.auth.models import User

_TRUTHY = ("true", "1", "yes", "y")


def is_blank(value: Any) -> bool:
    """True for ``None``, ``""`` and whitespace-only strings."""
    return value is None or (isinstance(value, str) and not value.strip())


def parse_bool(value: Any, default: Optional[bool] = None) -> Optional[bool]:
    """Read a boolean cell; a blank cell returns ``default``.

    The default of ``None`` means "leave this alone" on an update path.
    """
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower().strip() in _TRUTHY


def resolve_user(mapped_row: Dict[str, Any]) -> Optional[User]:
    """Find the user a row refers to: by username, then email, then employee code.

    Django does not enforce a unique email, so an ambiguous email match is
    treated as no match rather than guessing which person was meant. The
    employee code is unique (case-insensitively), so it never is ambiguous.
    """
    username = mapped_row.get("username")
    if username:
        user = User.objects.filter(username=username).first()
        if user is not None:
            return user
    email = mapped_row.get("email")
    if email:
        matches = list(User.objects.filter(email=email)[:2])
        if len(matches) == 1:
            return matches[0]
    code = str(mapped_row.get("code") or "").strip()
    if code:
        return User.objects.filter(profile__code__iexact=code).first()
    return None
