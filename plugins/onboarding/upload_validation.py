"""Upload validation for the onboarding plugin's document uploads.

Same policy-dict shape as ``plugins/ticket_kpi/upload_validation.py`` — kept
as a plugin-local copy (not a shared cross-plugin module) per the plugin
isolation invariant. Every endpoint that calls ``file_obj.read()`` must call
``validate_upload`` first.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import FileExtensionValidator

DOCUMENT_POLICY = {
    "allowed_extensions": {
        "pdf", "png", "jpg", "jpeg", "gif", "webp",
        "doc", "docx", "xls", "xlsx", "csv", "txt", "zip",
    },
    "max_bytes": 25 * 1024 * 1024,  # 25 MB
}

MAGIC_SIGNATURES = {
    b"%PDF": "pdf",
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpg",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
    b"PK\x03\x04": "xlsx",  # also docx/xlsx/zip containers
}


class UploadValidationError(Exception):
    def __init__(self, detail: str, code: str = "invalid_upload"):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def _extension_of(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _matches_signature(file_obj, expected_ext: str) -> bool:
    try:
        pos = file_obj.tell()
        head = file_obj.read(16)
        file_obj.seek(pos)
    except Exception as exc:
        raise UploadValidationError(
            "Unable to inspect the uploaded file signature.",
            code="signature_inspection_failed",
        ) from exc

    for magic, ext in MAGIC_SIGNATURES.items():
        if head.startswith(magic):
            if ext == expected_ext:
                return True
            if ext == "jpg" and expected_ext == "jpeg":
                return True
            if ext == "xlsx" and expected_ext in {"xlsx", "docx", "zip"}:
                return True
            return False

    if expected_ext in {"csv", "txt", "doc", "xls"}:
        return True
    return False


def validate_upload(file_obj) -> None:
    """Validate ``file_obj`` against ``DOCUMENT_POLICY`` before reading."""
    if file_obj is None:
        raise UploadValidationError("No file provided.", code="missing_file")

    name = getattr(file_obj, "name", "") or ""
    ext = _extension_of(name)
    if not ext:
        raise UploadValidationError("File name has no extension.", code="missing_extension")
    if ext not in DOCUMENT_POLICY["allowed_extensions"]:
        raise UploadValidationError(
            f"Unsupported file extension '.{ext}'. Allowed: "
            f"{sorted(DOCUMENT_POLICY['allowed_extensions'])}.",
            code="invalid_extension",
        )

    try:
        FileExtensionValidator(
            allowed_extensions=sorted(DOCUMENT_POLICY["allowed_extensions"])
        )(file_obj)
    except DjangoValidationError as exc:
        raise UploadValidationError(
            "; ".join(exc.messages) if isinstance(exc.messages, (list, tuple)) else str(exc),
            code="invalid_extension",
        ) from exc

    size = getattr(file_obj, "size", None)
    if size is not None and size > DOCUMENT_POLICY["max_bytes"]:
        raise UploadValidationError(
            f"File is {size} bytes; maximum is {DOCUMENT_POLICY['max_bytes']} bytes "
            f"({DOCUMENT_POLICY['max_bytes'] // (1024 * 1024)} MB).",
            code="file_too_large",
        )

    if not _matches_signature(file_obj, ext):
        raise UploadValidationError(
            "File signature does not match its declared extension.",
            code="signature_mismatch",
        )
