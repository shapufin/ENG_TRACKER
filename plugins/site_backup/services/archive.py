"""
Shared zip/manifest/fixture parsing for both restore preview and commit.
"""
import gzip
import json
import zipfile

from django.core import serializers


class ArchiveError(Exception):
    """Raised for a malformed or incompatible backup archive."""


def open_archive(file_obj) -> zipfile.ZipFile:
    try:
        return zipfile.ZipFile(file_obj)
    except zipfile.BadZipFile as exc:
        raise ArchiveError('Uploaded file is not a valid zip archive.') from exc


def read_manifest(archive: zipfile.ZipFile) -> dict:
    try:
        with archive.open('manifest.json') as fh:
            return json.loads(fh.read().decode('utf-8'))
    except KeyError as exc:
        raise ArchiveError('Archive is missing manifest.json.') from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ArchiveError('Archive manifest.json is not valid JSON.') from exc


def read_db_objects(archive: zipfile.ZipFile) -> list:
    """Return the full list of Django ``DeserializedObject`` instances from db.json.gz.

    Deserializing loads model instances into memory but issues no writes —
    ``ignorenonexistent`` skips fields/models the current codebase no longer
    has, so an older backup doesn't hard-fail on schema drift.
    """
    try:
        raw = archive.open('db.json.gz')
    except KeyError as exc:
        raise ArchiveError('Archive is missing db.json.gz.') from exc
    with gzip.GzipFile(fileobj=raw) as gz:
        try:
            text = gz.read().decode('utf-8')
        except UnicodeDecodeError as exc:
            raise ArchiveError('Backup file contains invalid encoding in db.json.gz.') from exc
    try:
        return list(serializers.deserialize('json', text, ignorenonexistent=True))
    except serializers.base.DeserializationError as exc:
        raise ArchiveError(f'Could not parse db.json.gz: {exc}') from exc
