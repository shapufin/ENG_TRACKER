"""Signed download links and nginx-served files for exports and year snapshots.

A multi-GB file must not stream through gunicorn (3 sync workers, 120 s timeout),
and a browser navigation cannot carry the JWT. So the SPA asks the API for a
short-lived signed link, then navigates to it; the view validates the token and
answers ``X-Accel-Redirect`` so nginx serves the file from a read-only volume.

The nonce is single use, but it lives on the file's own row (Redis may be off):
the owning view compares and clears it, this module only signs and reads it.
"""
import secrets
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404, HttpResponse
from django.utils.http import content_disposition_header

TOKEN_SALT = 'core.protected-download'
TOKEN_MAX_AGE = 120  # seconds


class DownloadTokenError(Exception):
    """The link is forged, expired or not a download link."""


def new_nonce() -> str:
    return secrets.token_urlsafe(16)


def make_download_token(*, user_id, kind, object_id, nonce) -> str:
    return signing.dumps(
        {'user_id': user_id, 'kind': kind, 'object_id': object_id, 'nonce': nonce},
        salt=TOKEN_SALT,
    )


def read_download_token(token, max_age=TOKEN_MAX_AGE) -> dict:
    try:
        payload = signing.loads(token, salt=TOKEN_SALT, max_age=max_age)
    except signing.BadSignature as exc:  # includes SignatureExpired
        raise DownloadTokenError(str(exc)) from exc
    if not isinstance(payload, dict) or set(payload) != {'user_id', 'kind', 'object_id', 'nonce'}:
        raise DownloadTokenError('Unexpected download token payload.')
    return payload


def _resolve_inside(root, relative_path) -> Path:
    """The file under ``root``, or 404. Rejects absolute paths and any ``..`` escape."""
    root = Path(root).resolve()
    candidate = (root / str(relative_path)).resolve()
    if root != candidate and root not in candidate.parents:
        raise Http404('File not found.')
    if not candidate.is_file():
        raise Http404('File not found.')
    return candidate


def protected_file_response(root, relative_path, *, filename, accel_prefix,
                            content_type='application/octet-stream'):
    """Serve ``root/relative_path`` as an attachment.

    With ``USE_X_ACCEL_REDIRECT`` (production) the body is empty and nginx serves
    the file from the internal ``accel_prefix`` location; otherwise Django streams it.
    """
    path = _resolve_inside(root, relative_path)
    disposition = content_disposition_header(True, filename)
    if getattr(settings, 'USE_X_ACCEL_REDIRECT', False):
        relative = path.relative_to(Path(root).resolve()).as_posix()
        response = HttpResponse(content_type=content_type)
        response['X-Accel-Redirect'] = f'{accel_prefix.rstrip("/")}/{quote(relative)}'
        response['Content-Disposition'] = disposition
        return response
    response = FileResponse(open(path, 'rb'), content_type=content_type)
    response['Content-Disposition'] = disposition
    return response
