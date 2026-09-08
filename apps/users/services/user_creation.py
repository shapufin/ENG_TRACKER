"""
Shared helper for creating a Django user and their UserProfile in one transaction.
Used by the admin "Create User" endpoint and the bulk user importer.
"""

import random
import string
from typing import Optional

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from apps.users.models import Team, TeamMembership, UserProfile


def _username_is_valid(username: str) -> Optional[str]:
    """Return an error message if the username is invalid, otherwise None."""
    if len(username) < 3:
        return "Username must be at least 3 characters."
    if not username.replace('_', '').replace('-', '').replace('.', '').isalnum():
        return "Username can only contain letters, numbers, underscores, hyphens, and periods."
    return None


def _email_is_valid(email: str) -> Optional[str]:
    """Return an error message if the email is invalid, otherwise None."""
    try:
        validate_email(email)
    except ValidationError:
        return "Invalid email address."
    return None


def _user_exists_error(username: str, email: str) -> Optional[str]:
    """Return an error message if the username or email already exists."""
    if User.objects.filter(username=username).exists():
        return f'Username "{username}" already exists.'
    if User.objects.filter(email=email).exists():
        return f'Email "{email}" already exists.'
    return None


def generate_random_password(length: int = 12) -> str:
    """Generate a random alphanumeric password."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(random.SystemRandom().choice(alphabet) for _ in range(length))  # noqa: S311


def create_user_with_profile(
    username: str,
    email: str,
    password: str,
    first_name: str = '',
    last_name: str = '',
    phone: str = '',
    team: Optional[Team] = None,
    teams: Optional[list] = None,
    techs: Optional[list] = None,
    albanian_tl_id: Optional[int] = None,
    italian_tl_id: Optional[int] = None,
    is_hr: bool = False,
    is_italian_tl_role: bool = False,
    is_albanian_tl_role: bool = False,
    hire_date: Optional[str] = None,
    is_active: bool = True,
    is_cr_admin: bool = False,
    roles: Optional[list[str]] = None,
) -> User:
    """
    Create a User and their UserProfile, and assign team memberships.

    When ``is_cr_admin`` is True, an active ``UserRole`` linking the new
    user to the seeded ``cr_admin`` role is created (idempotent).

    Raises:
        ValueError: if username/email/password validation fails.
    """
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")

    err = _username_is_valid(username) or _email_is_valid(email) or _user_exists_error(username, email)
    if err:
        raise ValueError(err)

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=first_name or '',
        last_name=last_name or '',
        is_active=bool(is_active),
    )

    profile = user.profile
    profile.phone = phone or ''
    if hire_date:
        profile.hire_date = hire_date
    if albanian_tl_id:
        profile.albanian_tl_id = albanian_tl_id
    if italian_tl_id:
        profile.italian_tl_id = italian_tl_id
    profile.is_hr_user = bool(is_hr)
    profile.is_italian_tl_role = bool(is_italian_tl_role)
    profile.is_albanian_tl_role = bool(is_albanian_tl_role)
    profile.save()

    if teams:
        profile.teams.set(teams)
    if techs:
        profile.techs.set(techs)
    if team:
        _assign_team_to_profile(profile, team)

    if roles is not None:
        _sync_roles(user, roles)
    else:
        _sync_legacy_roles(
            user,
            is_hr=bool(is_hr),
            is_italian_tl_role=bool(is_italian_tl_role),
            is_albanian_tl_role=bool(is_albanian_tl_role),
        )
    if roles is not None and 'cr_admin' in roles:
        _set_cr_admin_role(user, active=True)
    elif is_cr_admin:
        _set_cr_admin_role(user, active=True)

    return user


def update_user_profile(
    user: User,
    *,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    phone: Optional[str] = None,
    team: Optional[Team] = None,
    teams: Optional[list] = None,
    techs: Optional[list] = None,
    albanian_tl_id: Optional[int] = None,
    italian_tl_id: Optional[int] = None,
    is_hr: Optional[bool] = None,
    is_italian_tl_role: Optional[bool] = None,
    is_albanian_tl_role: Optional[bool] = None,
    hire_date: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_cr_admin: Optional[bool] = None,
    roles: Optional[list[str]] = None,
) -> User:
    """
    Update a User and their UserProfile from an import row. Only supplied fields
    are changed; None values are left untouched.

    When ``is_cr_admin`` is True, an active ``UserRole`` for the seeded
    ``cr_admin`` role is created (idempotent). When False, any existing
        active ``cr_admin`` ``UserRole`` rows are deactivated.
    """
    if first_name is not None:
        user.first_name = first_name
    if last_name is not None:
        user.last_name = last_name
    if is_active is not None:
        user.is_active = bool(is_active)
    user.save()

    profile = user.profile
    if phone is not None:
        profile.phone = phone
    if hire_date is not None:
        profile.hire_date = hire_date
    if albanian_tl_id is not None:
        profile.albanian_tl_id = albanian_tl_id
    if italian_tl_id is not None:
        profile.italian_tl_id = italian_tl_id
    if is_hr is not None:
        profile.is_hr_user = bool(is_hr)
    if is_italian_tl_role is not None:
        profile.is_italian_tl_role = bool(is_italian_tl_role)
    if is_albanian_tl_role is not None:
        profile.is_albanian_tl_role = bool(is_albanian_tl_role)
    profile.save()

    if roles is not None:
        _sync_roles(user, roles)
    else:
        _sync_legacy_roles(
            user,
            is_hr=is_hr,
            is_italian_tl_role=is_italian_tl_role,
            is_albanian_tl_role=is_albanian_tl_role,
        )

    if teams is not None:
        profile.teams.set(teams)
    if techs is not None:
        profile.techs.set(techs)
    if team is not None:
        _assign_team_to_profile(profile, team)

    if is_cr_admin is not None:
        _set_cr_admin_role(user, active=bool(is_cr_admin))

    return user


def _assign_team_to_profile(profile: UserProfile, team: Team) -> None:
    """Assign a team to a profile, marking it primary if no primary exists."""
    has_primary = profile.team_memberships.filter(is_primary_team=True).exists()
    membership, _ = TeamMembership.objects.get_or_create(
        user_profile=profile,
        team=team,
        defaults={'is_primary_team': not has_primary}
    )
    if not has_primary and not membership.is_primary_team:
        membership.is_primary_team = True
        membership.save(update_fields=['is_primary_team'])


MANAGED_ROLE_CODES = frozenset({'employee', 'italian_tl', 'albanian_tl', 'hr', 'cr_admin'})


def _sync_roles(user: User, roles: list[str]) -> None:
    """Synchronize database roles and legacy flags during migration."""
    from apps.permissions.models import Role
    from apps.permissions.services.role_service import assign_role, revoke_role

    requested = set(roles)
    unknown = requested - MANAGED_ROLE_CODES
    if unknown:
        raise ValueError(f'Unknown role code(s): {", ".join(sorted(unknown))}')

    profile = user.profile
    profile.is_hr_user = 'hr' in requested
    profile.is_italian_tl_role = 'italian_tl' in requested
    profile.is_albanian_tl_role = 'albanian_tl' in requested
    profile.save(update_fields=['is_hr_user', 'is_italian_tl_role', 'is_albanian_tl_role'])

    for role_code in MANAGED_ROLE_CODES:
        if not Role.objects.filter(code=role_code).exists():
            continue
        if role_code in requested:
            assign_role(user, role_code)
        else:
            revoke_role(user, role_code)


def _sync_legacy_roles(
    user: User,
    *,
    is_hr: bool | None,
    is_italian_tl_role: bool | None,
    is_albanian_tl_role: bool | None,
) -> None:
    """Dual-write legacy flags and database role assignments during migration.

    Silently skips role codes that are not seeded in the Role table (mirrors
    the guard in ``_sync_roles``). ``assign_role``/``revoke_role`` call
    ``Role.objects.get(code=...)`` which raises ``DoesNotExist`` if the role
    is absent — e.g. when a test run orders modules so that role-seeding
    migrations are not applied before user creation runs. Skipping is safe:
    the legacy profile flags (``is_hr_user`` etc.) are already set on the
    profile above, so the user's effective role is still correct; only the
    redundant ``UserRole`` row is omitted.
    """
    from apps.permissions.models import Role
    from apps.permissions.services.role_service import assign_role, revoke_role

    role_values = {
        'hr': is_hr,
        'italian_tl': is_italian_tl_role,
        'albanian_tl': is_albanian_tl_role,
    }
    for role_code, enabled in role_values.items():
        if enabled is None:
            continue
        if not Role.objects.filter(code=role_code).exists():
            continue
        if enabled:
            assign_role(user, role_code)
        else:
            revoke_role(user, role_code)


def _set_cr_admin_role(user: User, *, active: bool) -> None:
    """Grant or revoke the seeded ``cr_admin`` role on a user.

    Granting is idempotent: if an active ``UserRole`` already exists, this is
    a no-op. Revoking deactivates any existing active ``cr_admin`` rows for
    the user (preserves audit history — rows are not hard-deleted).

    Silently no-ops if the ``cr_admin`` role is not seeded (e.g. migration
    ``0003_seed_cr_admin_role`` not applied); callers treat absence the same
    as "not a CR admin".
    """
    from apps.permissions.models import Role, UserRole
    try:
        role = Role.objects.get(code='cr_admin')
    except Role.DoesNotExist:
        return
    if active:
        UserRole.objects.get_or_create(
            user=user, role=role, team=None,
            defaults={'is_active': True},
        )
        # Ensure any pre-existing row (e.g. previously deactivated) is active.
        UserRole.objects.filter(user=user, role=role).update(is_active=True)
    else:
        UserRole.objects.filter(user=user, role=role, is_active=True).update(is_active=False)
    # .update() bypasses post_save/post_delete signals, so refresh the
    # denormalized role_codes cache manually.
    from apps.permissions.services.role_service import _refresh_role_cache
    _refresh_role_cache(user)