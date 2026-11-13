"""
At-rest encryption for site backup archives.

A finished backup zip is streamed through AES-256-GCM in 1 MiB chunks, so a
multi-GB media backup never has to fit in memory. File layout::

    MAGIC (8) | base_nonce (8) | [ length (4, big endian) | ciphertext+tag ]*

Each chunk uses nonce ``base_nonce || counter (4)`` and the AAD byte ``\\x01``
for the last chunk, ``\\x00`` otherwise, so reordering, dropping or truncating
chunks fails authentication.

Keys come from ``settings.BACKUP_ENCRYPTION_KEYS`` (the first encrypts, every
one can decrypt, which allows rotation). They are urlsafe-base64 32-byte keys,
the same format ``Fernet.generate_key()`` prints. A wrong or missing key fails
closed with ``ArchiveError``; the key must never be stored next to the backups.
"""
import base64
import os
import struct
import tempfile

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

from .archive import ArchiveError

MAGIC = b'ETBKENC1'
CHUNK_SIZE = 1024 * 1024
_NONCE_PREFIX_LEN = 8
_TAG_LEN = 16
_MAX_CHUNK_BYTES = CHUNK_SIZE + _TAG_LEN


def _keys() -> list[bytes]:
    raw_keys = getattr(settings, 'BACKUP_ENCRYPTION_KEYS', None) or []
    keys = []
    for raw in raw_keys:
        try:
            key = base64.urlsafe_b64decode(raw.encode())
        except (ValueError, TypeError) as exc:
            raise ArchiveError('BACKUP_ENCRYPTION_KEYS holds an invalid key.') from exc
        if len(key) != 32:
            raise ArchiveError('Each BACKUP_ENCRYPTION_KEYS entry must decode to 32 bytes.')
        keys.append(key)
    if not keys:
        raise ArchiveError('BACKUP_ENCRYPTION_KEYS is not configured; backups cannot be encrypted.')
    return keys


def is_encrypted(file_obj) -> bool:
    """Whether the stream starts with the encrypted-backup magic. Restores position."""
    position = file_obj.tell()
    head = file_obj.read(len(MAGIC))
    file_obj.seek(position)
    return head == MAGIC


def _nonce(prefix: bytes, counter: int) -> bytes:
    return prefix + struct.pack('>I', counter)


def encrypt_file(src_path: str, dst_path: str) -> None:
    """Encrypt ``src_path`` into ``dst_path`` with the primary key."""
    aead = AESGCM(_keys()[0])
    prefix = os.urandom(_NONCE_PREFIX_LEN)
    size = os.path.getsize(src_path)
    with open(src_path, 'rb') as src, open(dst_path, 'wb') as dst:
        dst.write(MAGIC + prefix)
        counter = 0
        consumed = 0
        while True:
            chunk = src.read(CHUNK_SIZE)
            consumed += len(chunk)
            last = consumed >= size
            sealed = aead.encrypt(_nonce(prefix, counter), chunk, b'\x01' if last else b'\x00')
            dst.write(struct.pack('>I', len(sealed)) + sealed)
            counter += 1
            if last:
                break


def decrypt_to_tempfile(file_obj):
    """Decrypt a stream into an anonymous temp file and return it, rewound.

    Raises ``ArchiveError`` for a wrong key, a damaged file or a truncated one.
    """
    head = file_obj.read(len(MAGIC) + _NONCE_PREFIX_LEN)
    if len(head) != len(MAGIC) + _NONCE_PREFIX_LEN or head[: len(MAGIC)] != MAGIC:
        raise ArchiveError('Not an encrypted backup archive.')
    prefix = head[len(MAGIC):]
    keys = _keys()
    out = tempfile.TemporaryFile()
    try:
        counter = 0
        aead = None
        while True:
            header = file_obj.read(4)
            if len(header) != 4:
                raise ArchiveError('Encrypted backup is truncated.')
            (length,) = struct.unpack('>I', header)
            if length < _TAG_LEN or length > _MAX_CHUNK_BYTES:
                raise ArchiveError('Encrypted backup is damaged.')
            sealed = file_obj.read(length)
            if len(sealed) != length:
                raise ArchiveError('Encrypted backup is truncated.')
            nonce = _nonce(prefix, counter)
            plain = None
            last = False
            candidates = [aead] if aead else [AESGCM(k) for k in keys]
            for candidate in candidates:
                for flag, is_last in ((b'\x00', False), (b'\x01', True)):
                    try:
                        plain = candidate.decrypt(nonce, sealed, flag)
                    except InvalidTag:
                        continue
                    aead, last = candidate, is_last
                    break
                if plain is not None:
                    break
            if plain is None:
                raise ArchiveError(
                    'Could not decrypt the backup: wrong BACKUP_ENCRYPTION_KEYS or a damaged file.'
                )
            out.write(plain)
            counter += 1
            if last:
                if file_obj.read(1):
                    raise ArchiveError('Encrypted backup has unexpected trailing data.')
                break
        out.seek(0)
        return out
    except Exception:
        out.close()
        raise
