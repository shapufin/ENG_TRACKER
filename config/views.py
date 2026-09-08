"""Production-safe views for serving static and media files.

These views exist because Django's built-in ``django.views.static.serve``
is not production-hardened: it does not force download headers for risky
file types, and its path-traversal protection is minimal. The
``protected_media`` view below is the single source of truth for serving
user-uploaded media in self-hosted production deployments (P0-6).

For CDN/S3 deployments, set ``SERVE_MEDIA_IN_PROD=False`` and configure
``django-storages`` instead — this view is not used.
"""
from __future__ import annotations

import os
import mimetypes

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseForbidden
from django.views.decorators.http import require_GET


@require_GET
def protected_media(request, path: str):
    """Serve a media file with download-forcing + nosniff headers (P0-6).

    Security properties:
    - **Path traversal blocked**: resolves the full path and confirms it
      is inside ``MEDIA_ROOT`` via ``os.path.commonpath``. Any escape
      attempt (``../``, absolute paths) raises ``Http404``.
    - **Never rendered inline**: always returns
      ``Content-Disposition: attachment`` so browsers download the file
      instead of executing it (defense against stored XSS via uploaded
      ``.html``/``.htm`` — though those extensions are now blocked at
      upload by P0-3, legacy files on disk are still served safely).
    - **nosniff**: ``X-Content-Type-Options: nosniff`` prevents MIME
      sniffing into an executable type.
    - **GET only**: ``@require_GET`` rejects POST/PUT/DELETE.

    Args:
        request: The HTTP request (must be GET).
        path: The path relative to ``MEDIA_ROOT`` (from the URL conf).

    Returns:
        A ``FileResponse`` streaming the file with download headers.

    Raises:
        Http404: If the path escapes ``MEDIA_ROOT`` or the file does not
            exist.
    """
    media_root = str(settings.MEDIA_ROOT)
    full = os.path.normpath(os.path.join(media_root, path))

    # Path-traversal guard: the normalized full path must still be inside
    # MEDIA_ROOT. os.path.commonpath raises ValueError if the paths are on
    # different drives (Windows), which we treat as a traversal attempt.
    try:
        if os.path.commonpath([full, media_root]) != media_root:
            raise Http404("Invalid media path.")
    except ValueError:
        raise Http404("Invalid media path.")

    if not os.path.isfile(full):
        raise Http404("File not found.")

    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return HttpResponseForbidden("Authentication required.")

    # Guess a content type for the download; fall back to octet-stream so
    # the browser never renders it inline based on extension.
    guessed, _ = mimetypes.guess_type(full)
    content_type = guessed or "application/octet-stream"

    resp = FileResponse(open(full, "rb"), content_type=content_type)
    # Force download — never render inline (P0-3 step 4 mitigation).
    resp["Content-Disposition"] = "attachment"
    # Prevent MIME sniffing into an executable type.
    resp["X-Content-Type-Options"] = "nosniff"
    return resp
