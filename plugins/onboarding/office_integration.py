"""OnlyOffice Document Server integration for the onboarding plugin.

Isolated from viewsets.py on purpose — this is a distinct concern (signed
tokens, JWT, third-party config shape) from the CRUD/permission logic there.

Feature is off by default: every helper here that talks to the document
server is only reachable when ``settings.ONLYOFFICE_DOCUMENT_SERVER_URL`` is
set, so dev/test environments without the container running are unaffected.
"""
from __future__ import annotations

import jwt
from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

OFFICE_FILE_TOKEN_SALT = "onboarding-office-file"
# Only needs to live long enough for the document server to fetch the file
# once, right after the browser opens the editor.
OFFICE_FILE_TOKEN_MAX_AGE = 300

EDITABLE_OFFICE_EXTENSIONS = {"doc", "docx", "xls", "xlsx", "ppt", "pptx"}

OFFICE_DOCUMENT_TYPES = {
    "doc": "word", "docx": "word",
    "xls": "cell", "xlsx": "cell",
    "ppt": "slide", "pptx": "slide",
}


def extension_of(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def is_editable_office(name: str) -> bool:
    return extension_of(name) in EDITABLE_OFFICE_EXTENSIONS


def office_editor_enabled() -> bool:
    return bool(settings.ONLYOFFICE_DOCUMENT_SERVER_URL)


def make_office_file_token(document_id: int) -> str:
    return TimestampSigner(salt=OFFICE_FILE_TOKEN_SALT).sign(str(document_id))


def verify_office_file_token(token: str, document_id: int) -> bool:
    """True if ``token`` was minted for ``document_id`` and hasn't expired."""
    if not token:
        return False
    signer = TimestampSigner(salt=OFFICE_FILE_TOKEN_SALT)
    try:
        value = signer.unsign(token, max_age=OFFICE_FILE_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return False
    return value == str(document_id)


def build_editor_config(document, user, request, can_edit: bool) -> dict:
    """OnlyOffice ``config`` object for ``DocsAPI.DocEditor``. JWT-signed
    under the ``token`` key when ``ONLYOFFICE_JWT_SECRET`` is configured —
    required by the document server whenever JWT is enabled on its side."""
    # Built directly rather than via Django's reverse(): plugin URLs are only
    # spliced into the root urlconf for plugins the DB marks enabled at the
    # moment that urlconf module is first imported (apps/plugins/urls.py) —
    # the same timing fragility already diagnosed this session for the
    # sidebar-nav injection bug. A hardcoded path matches how the frontend
    # already calls every other onboarding endpoint (raw string paths).
    ext = extension_of(document.name)
    file_token = make_office_file_token(document.id)
    base = f"/api/plugins/onboarding/documents/{document.id}"
    file_url = request.build_absolute_uri(f"{base}/office-file/?token={file_token}")
    callback_url = request.build_absolute_uri(f"{base}/office-callback/")

    config = {
        "document": {
            "fileType": ext,
            "key": f"{document.id}-{document.updated_at.timestamp()}",
            "title": document.name,
            "url": file_url,
        },
        "documentType": OFFICE_DOCUMENT_TYPES.get(ext, "word"),
        "editorConfig": {
            "mode": "edit" if can_edit else "view",
            "callbackUrl": callback_url if can_edit else "",
            "user": {
                "id": str(user.id),
                "name": user.get_full_name() or user.username,
            },
        },
    }
    if settings.ONLYOFFICE_JWT_SECRET:
        config["token"] = jwt.encode(config, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
    return config


def decode_callback_jwt(auth_header: str | None) -> dict:
    """Verify+decode the ``Authorization: Bearer <jwt>`` header the document
    server sends on its save callback. Raises ``jwt.InvalidTokenError`` (or a
    subclass) on any failure — missing header, bad signature, wrong secret."""
    if not settings.ONLYOFFICE_JWT_SECRET:
        raise jwt.InvalidTokenError("JWT verification is not configured.")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise jwt.InvalidTokenError("Missing bearer token.")
    token = auth_header[len("Bearer "):]
    return jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
