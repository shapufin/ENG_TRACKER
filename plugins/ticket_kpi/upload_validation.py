"""Shared upload validation for the ticket_kpi plugin.

Centralizes per-purpose limits for file size, extension, MIME signature,
row/column counts, and preview-record caps. Every endpoint that calls
``file_obj.read()`` MUST call :func:`validate_upload` first so that an
oversized or unsupported file is rejected before any pandas/Excel parsing
allocates worker memory.

The validators return a stable ``UploadValidationError`` whose ``detail``
is safe to surface to the client (no filesystem paths or library internals).
Callers should convert it to a DRF ``Response`` with status 400.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import FileExtensionValidator


# --- Purpose-specific policies ------------------------------------------------
#
# Sizes are in bytes. Row/column caps are enforced after parsing where
# applicable (see :func:`enforce_table_dimensions`).

TICKET_IMPORT_POLICY = {
    "allowed_extensions": {"csv", "xlsx", "xls"},
    "max_bytes": 10 * 1024 * 1024,        # 10 MB
    "max_rows": 50_000,
    "max_columns": 200,
    "max_preview_records": 100,
}

EVIDENCE_POLICY = {
    "allowed_extensions": {
        "pdf", "png", "jpg", "jpeg", "gif", "webp",
        "eml", "msg", "txt",
        "doc", "docx", "xls", "xlsx", "csv",
    },
    "max_bytes": 10 * 1024 * 1024,        # 10 MB (overridable via plugin config)
    "max_rows": None,                     # Evidence files are not tabular
    "max_columns": None,
    "max_preview_records": None,
}

MAPPING_TEST_POLICY = {
    "allowed_extensions": {"csv", "xlsx", "xls"},
    "max_bytes": 5 * 1024 * 1024,         # 5 MB — mapping tests are previews
    "max_rows": 1_000,
    "max_columns": 200,
    "max_preview_records": 50,
}

POLICIES = {
    "ticket_import": TICKET_IMPORT_POLICY,
    "evidence": EVIDENCE_POLICY,
    "mapping_test": MAPPING_TEST_POLICY,
}


# --- Lightweight magic-byte signatures ---------------------------------------
# Used as a defense-in-depth check in addition to the declared content type.
# Only a small set is checked; unknown types fall through to extension check.

MAGIC_SIGNATURES = {
    b"%PDF": "pdf",  # PDF magic is case-insensitive in practice; prefix match
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpg",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
    b"PK\x03\x04": "xlsx",  # also docx/xlsx zip containers
}


class UploadValidationError(Exception):
    """Stable validation error. ``detail`` is safe to return to clients."""

    def __init__(self, detail: str, code: str = "invalid_upload"):
        super().__init__(detail)
        self.detail = detail
        self.code = code


@dataclass(frozen=True)
class UploadCheck:
    """Result of :func:`validate_upload`."""

    file_obj: object
    policy_name: str
    declared_extension: str


def _extension_of(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _matches_signature(file_obj, expected_ext: str) -> bool:
    """Peek the first bytes without consuming the stream.

    Returns True if the signature is consistent with ``expected_ext``.
    For types without a robust signature (csv/txt/html/eml/msg/xls) we
    accept by extension only. For types WITH a known signature, a mismatch
    (e.g. PNG bytes with a .csv name) is rejected.
    """
    try:
        pos = file_obj.tell()
        head = file_obj.read(16)
        file_obj.seek(pos)
    except Exception as exc:
        raise UploadValidationError(
            "Unable to inspect the uploaded file signature.",
            code="signature_inspection_failed",
        ) from exc

    # First: if the head matches ANY known magic signature, the declared
    # extension MUST agree with it. This catches renamed executables/images.
    for magic, ext in MAGIC_SIGNATURES.items():
        if head.startswith(magic):
            if ext == expected_ext:
                return True
            # xlsx/docx share the PK zip signature; accept either office ext.
            if ext == "xlsx" and expected_ext in {"xlsx", "docx"}:
                return True
            return False

    # No known signature matched. Accept types that have no robust signature.
    if expected_ext in {"csv", "txt", "eml", "msg", "xls"}:
        return True
    # For types that SHOULD have a signature (pdf/png/jpg/gif/xlsx/docx),
    # absence of any signature is suspicious — reject.
    return False


def _resolve_max_bytes(policy: dict, override_mb: int | None) -> int:
    if override_mb is not None and override_mb > 0:
        return override_mb * 1024 * 1024
    return policy["max_bytes"]


def validate_upload(
    file_obj,
    policy_name: str,
    *,
    max_bytes_override_mb: int | None = None,
) -> UploadCheck:
    """Validate ``file_obj`` against ``policy_name`` before reading.

    Raises :class:`UploadValidationError` on any rejection. Safe to call
    on a Django ``UploadedFile`` (``.size`` and ``.name`` are available
    without consuming the stream).
    """
    if policy_name not in POLICIES:
        raise UploadValidationError(
            f"Unknown upload policy: {policy_name}", code="invalid_policy"
        )
    policy = POLICIES[policy_name]

    if file_obj is None:
        raise UploadValidationError("No file provided.", code="missing_file")

    name = getattr(file_obj, "name", "") or ""
    ext = _extension_of(name)
    if not ext:
        raise UploadValidationError(
            "File name has no extension.", code="missing_extension"
        )
    if ext not in policy["allowed_extensions"]:
        raise UploadValidationError(
            f"Unsupported file extension '.{ext}'. Allowed: "
            f"{sorted(policy['allowed_extensions'])}.",
            code="invalid_extension",
        )

    # Belt-and-suspenders: run Django's extension validator too so model
    # validators and this service agree on the allowed set.
    try:
        FileExtensionValidator(allowed_extensions=sorted(policy["allowed_extensions"]))(file_obj)
    except DjangoValidationError as exc:
        raise UploadValidationError(
            "; ".join(exc.messages) if isinstance(exc.messages, (list, tuple)) else str(exc),
            code="invalid_extension",
        ) from exc

    size = getattr(file_obj, "size", None)
    max_bytes = _resolve_max_bytes(policy, max_bytes_override_mb)
    if size is not None and size > max_bytes:
        raise UploadValidationError(
            f"File is {size} bytes; maximum is {max_bytes} bytes "
            f"({max_bytes // (1024 * 1024)} MB).",
            code="file_too_large",
        )

    if not _matches_signature(file_obj, ext):
        raise UploadValidationError(
            "File signature does not match its declared extension.",
            code="signature_mismatch",
        )

    return UploadCheck(file_obj=file_obj, policy_name=policy_name, declared_extension=ext)


def enforce_table_dimensions(
    df,
    *,
    max_rows: int | None,
    max_columns: int | None,
) -> None:
    """Reject parsed DataFrames that exceed row/column budgets.

    Call this immediately after ``mapper.read_file(...)`` so an attacker
    cannot bypass the byte limit with a highly compressible file that
    expands into a huge table.
    """
    if max_rows is not None and len(df) > max_rows:
        raise UploadValidationError(
            f"File has {len(df)} rows; maximum is {max_rows}.",
            code="too_many_rows",
        )
    cols = len(df.columns)
    if max_columns is not None and cols > max_columns:
        raise UploadValidationError(
            f"File has {cols} columns; maximum is {max_columns}.",
            code="too_many_columns",
        )


def policy_for(name: str) -> dict:
    if name not in POLICIES:
        raise KeyError(name)
    return POLICIES[name]


def allowed_extensions_for(name: str) -> Iterable[str]:
    return sorted(POLICIES[name]["allowed_extensions"])
