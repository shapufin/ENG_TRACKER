"""Symmetric encryption for secrets stored in the database (MFA seeds).

``settings.MFA_ENCRYPTION_KEYS`` is an ordered list of Fernet keys. The first
key encrypts; every key can decrypt. That makes rotation (add a new first key,
re-encrypt, retire the old one) and a server move (copy the keys) explicit.
"""

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings


class SecretDecryptError(Exception):
    """The ciphertext cannot be read with any configured key."""


def _fernet() -> MultiFernet:
    keys = [k for k in settings.MFA_ENCRYPTION_KEYS if k]
    if not keys:
        raise SecretDecryptError('MFA_ENCRYPTION_KEYS is empty.')
    try:
        return MultiFernet([Fernet(k) for k in keys])
    except (ValueError, TypeError) as exc:
        raise SecretDecryptError('MFA_ENCRYPTION_KEYS holds an invalid Fernet key.') from exc


def encrypt_text(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_text(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise SecretDecryptError('Ciphertext does not match any configured key.') from exc


def reencrypt_text(token: str) -> str:
    """Re-encrypt under the first (newest) key. Used when rotating keys."""
    try:
        return _fernet().rotate(token.encode()).decode()
    except InvalidToken as exc:
        raise SecretDecryptError('Ciphertext does not match any configured key.') from exc
