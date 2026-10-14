"""Upload type policy for the data importer (SEC-17).

Same shape as ``plugins/ticket_kpi/upload_validation.py`` (a policy dict plus
one ``validate_upload``), kept local because a plugin must not import another
plugin's modules. The size limit stays in ``DataImportViewSet._read_file`` and
runs *before* this check; this runs before any bytes reach pandas.

``UploadValidationError`` subclasses ``ValueError`` so the viewset's existing
``except ValueError`` turns it into a 400 with a client-safe message.
"""

DATA_IMPORT_POLICY = {
    "allowed_extensions": {"csv", "xlsx", "xls"},
}

_ZIP_MAGIC = b"PK\x03\x04"                      # .xlsx container
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .xls
# Signatures of common non-tabular files; a ".csv" starting with one is not CSV.
_FOREIGN_MAGIC = (_ZIP_MAGIC, _OLE_MAGIC, b"%PDF", b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"MZ")
_SNIFF_BYTES = 4096


class UploadValidationError(ValueError):
    """Client-safe rejection of an uploaded file."""


def _extension_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if filename and "." in filename else ""


def validate_upload(file_obj, policy: dict = DATA_IMPORT_POLICY) -> str:
    """Check extension and magic bytes; return the extension. Stream is rewound."""
    ext = _extension_of(getattr(file_obj, "name", "") or "")
    # A name without an extension (older API clients, tests) is judged by its
    # content alone; a *wrong* extension is always rejected.
    if ext and ext not in policy["allowed_extensions"]:
        raise UploadValidationError(
            f"Unsupported file type '.{ext}'. Allowed: "
            f"{', '.join('.' + e for e in sorted(policy['allowed_extensions']))}."
        )

    position = file_obj.tell()
    head = file_obj.read(_SNIFF_BYTES)
    file_obj.seek(position)

    if ext == "xlsx":
        ok = head.startswith(_ZIP_MAGIC)
    elif ext == "xls":
        ok = head.startswith(_OLE_MAGIC) or head.startswith(_ZIP_MAGIC)
    elif not ext:
        ok = (
            head.startswith((_ZIP_MAGIC, _OLE_MAGIC))
            or (b"\x00" not in head and not head.startswith(_FOREIGN_MAGIC))
        )
    else:  # csv: plain text only
        ok = b"\x00" not in head and not head.startswith(_FOREIGN_MAGIC)
    if not ok:
        raise UploadValidationError("File content does not match its extension.")
    return ext
