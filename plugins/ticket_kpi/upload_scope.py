"""Who an import is for, and what the importer may do about an existing month.

Kept out of ``viewsets.py`` on purpose: the rules for importing on a member's
behalf live here once, so ``preview`` and ``import_batch`` cannot drift apart.

Plan 2026-11-18 (D2-D6): the batch stays owned by the member, the importer is
recorded in ``uploaded_by``, the target must be on the leader's roster, and
clients are checked against the MEMBER, never the importer.
"""
from dataclasses import dataclass
from typing import Optional

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.response import Response


@dataclass(frozen=True)
class ImportTarget:
    owner: User            # whose batch it is (the member)
    importer: User         # who is performing the import
    on_behalf: bool        # True when owner is not the importer


def _refuse(message: str, code: int = status.HTTP_403_FORBIDDEN) -> Response:
    return Response({'error': message}, status=code)


def is_admin(user) -> bool:
    return bool(user.is_staff or user.is_superuser)


def resolve_import_target(request_user, raw_target_id) -> tuple[Optional[ImportTarget], Optional[Response]]:
    """Return ``(target, None)`` or ``(None, error_response)``.

    No target, or the importer's own id, is a normal self import. Any other id
    is allowed for an admin (never onto a superuser) or for a leader whose
    roster holds the member. Unknown and out-of-scope ids get the same answer
    so the endpoint never confirms that a user exists.
    """
    if raw_target_id in (None, ''):
        return ImportTarget(request_user, request_user, False), None
    try:
        target_id = int(raw_target_id)
    except (TypeError, ValueError):
        return None, _refuse('target_user_id must be a valid integer.', status.HTTP_400_BAD_REQUEST)
    if target_id == request_user.id:
        return ImportTarget(request_user, request_user, False), None

    # Lazy import: viewsets imports this module.
    from .viewsets import _get_tl_team_members

    denied = _refuse('You cannot import tickets for this user.')
    owner = User.objects.filter(pk=target_id).first()
    if owner is None:
        return None, denied
    if is_admin(request_user):
        if owner.is_superuser:
            return None, denied
    elif not _get_tl_team_members(request_user).filter(pk=owner.pk).exists():
        return None, denied
    return ImportTarget(owner, request_user, True), None


def client_access_error(target: ImportTarget, client_ids) -> Optional[Response]:
    """Non-admin imports need a client, and every selected client must be the owner's.

    For an import on a member's behalf the OWNER's clients decide, not the
    leader's. An admin is exempt, as before.
    """
    if is_admin(target.importer):
        return None
    owner_clients = set(target.owner.profile.clients.values_list('id', flat=True)) \
        if hasattr(target.owner, 'profile') else set()
    if not owner_clients:
        who = 'the member' if target.on_behalf else 'you'
        return Response(
            {
                'error': 'No client assigned',
                'detail': f'A client must be assigned to {who} before tickets can be imported. '
                          'Assign one in Settings, Client Assignment.',
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    invalid = set(client_ids) - owner_clients
    if invalid:
        return Response(
            {
                'error': 'Client access denied',
                'detail': f'Not assigned to clients: {sorted(invalid)}.',
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def may_replace_existing(target: ImportTarget, existing) -> bool:
    """May this importer replace ``existing`` (an active batch of the same month)?

    Admins always. A leader importing on a member's behalf only while the batch
    is unreviewed (same rule as deleting it). A member never replaces their own.
    """
    if is_admin(target.importer):
        return True
    return target.on_behalf and existing.reviewed_by_id is None
