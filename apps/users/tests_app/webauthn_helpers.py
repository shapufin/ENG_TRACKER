"""A software passkey for tests: builds the JSON a browser would send, using real keys.

Test-only. Produces ``attestation: none`` registrations and ES256 assertions that
py_webauthn verifies for real, so the service tests exercise the actual checks.
"""
import hashlib
import json
import os
import struct

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

_UP, _UV, _AT = 0x01, 0x04, 0x40


def b64url(data: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


class FakeAuthenticator:
    def __init__(self, rp_id: str, origin: str):
        self.rp_id = rp_id
        self.origin = origin
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(32)
        self.sign_count = 0

    def _flags(self, uv: bool, attested: bool = False) -> int:
        return _UP | (_UV if uv else 0) | (_AT if attested else 0)

    def _client_data(self, kind: str, options: dict, origin: str | None) -> bytes:
        return json.dumps({
            'type': kind, 'challenge': options['challenge'],
            'origin': origin or self.origin, 'crossOrigin': False,
        }).encode()

    def _cose_public_key(self) -> bytes:
        numbers = self.key.public_key().public_numbers()
        return cbor2.dumps({
            1: 2, 3: -7, -1: 1,
            -2: numbers.x.to_bytes(32, 'big'), -3: numbers.y.to_bytes(32, 'big'),
        })

    def create(self, options: dict, *, uv: bool = True, origin: str | None = None,
               rp_id: str | None = None, transports: list | None = None) -> dict:
        """Registration response for ``options`` (the JSON from registration_options)."""
        rp_hash = hashlib.sha256((rp_id or self.rp_id).encode()).digest()
        attested = (
            b'\x00' * 16 + struct.pack('>H', len(self.credential_id))
            + self.credential_id + self._cose_public_key()
        )
        auth_data = rp_hash + bytes([self._flags(uv, True)]) + struct.pack('>I', 0) + attested
        attestation = cbor2.dumps({'fmt': 'none', 'attStmt': {}, 'authData': auth_data})
        response = {
            'clientDataJSON': b64url(self._client_data('webauthn.create', options, origin)),
            'attestationObject': b64url(attestation),
        }
        if transports is not None:
            response['transports'] = transports
        return {
            'id': b64url(self.credential_id), 'rawId': b64url(self.credential_id),
            'type': 'public-key', 'response': response, 'clientExtensionResults': {},
        }

    def get(self, options: dict, *, uv: bool = True, sign_count: int | None = None,
            origin: str | None = None, rp_id: str | None = None) -> dict:
        """Assertion for ``options``. The counter auto-increments unless overridden."""
        self.sign_count = self.sign_count + 1 if sign_count is None else sign_count
        rp_hash = hashlib.sha256((rp_id or self.rp_id).encode()).digest()
        auth_data = rp_hash + bytes([self._flags(uv)]) + struct.pack('>I', self.sign_count)
        client_data = self._client_data('webauthn.get', options, origin)
        signature = self.key.sign(
            auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()),
        )
        return {
            'id': b64url(self.credential_id), 'rawId': b64url(self.credential_id),
            'type': 'public-key', 'clientExtensionResults': {},
            'response': {
                'clientDataJSON': b64url(client_data),
                'authenticatorData': b64url(auth_data),
                'signature': b64url(signature),
            },
        }
