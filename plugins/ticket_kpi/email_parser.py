"""
Email parsing utilities for KPI evidence.

Supports .eml (Python stdlib) and .msg (extract-msg) files.
Gracefully degrades to an empty preview if parsing fails.
"""

import email
import logging
from email import policy
from pathlib import Path

from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)


def _sanitize_address(addr):
    if addr is None:
        return None
    if hasattr(addr, 'addr_spec') and hasattr(addr, 'display_name'):
        # email.headerregistry.Address
        name = addr.display_name or ''
        spec = addr.addr_spec or ''
        return f"{name} <{spec}>".strip() if name else spec
    return str(addr)


def _extract_part_text(part, subtype):
    if part.get_content_subtype() == subtype:
        payload = part.get_payload(decode=True)
        if payload:
            charset = part.get_content_charset() or 'utf-8'
            try:
                return payload.decode(charset, errors='replace')
            except Exception:
                return payload.decode('utf-8', errors='replace')
    return None


def parse_eml_bytes(data: bytes) -> dict | None:
    """Parse a .eml file and return a structured preview."""
    try:
        msg = email.message_from_bytes(data, policy=policy.default)
    except Exception as e:
        logger.warning(f"Failed to parse .eml: {e}")
        return None

    body_plain = []
    body_html = []
    attachments = []

    if msg.is_multipart():
        for part in msg.walk():
            if part.is_multipart():
                continue
            content_disp = part.get('content-disposition', '')
            if 'attachment' in content_disp.lower() or part.get_filename():
                filename = part.get_filename()
                payload = part.get_payload(decode=True) or b''
                attachments.append({
                    'filename': filename or 'unnamed',
                    'size': len(payload),
                })
                continue
            plain = _extract_part_text(part, 'plain')
            if plain:
                body_plain.append(plain)
            html = _extract_part_text(part, 'html')
            if html:
                body_html.append(html)
    else:
        plain = _extract_part_text(msg, 'plain')
        if plain:
            body_plain.append(plain)
        html = _extract_part_text(msg, 'html')
        if html:
            body_html.append(html)

    date_header = msg.get('date')
    parsed_date = None
    if date_header:
        # email.utils.parsedate_to_datetime returns timezone-aware datetime
        try:
            from email.utils import parsedate_to_datetime
            parsed_date = parsedate_to_datetime(str(date_header))
        except Exception:
            parsed_date = parse_datetime(str(date_header))

    return {
        'subject': msg.get('subject', ''),
        'from': _sanitize_address(msg.get('from')),
        'to': [_sanitize_address(a) for a in msg.get_all('to', []) if a],
        'cc': [_sanitize_address(a) for a in msg.get_all('cc', []) if a],
        'date': parsed_date.isoformat() if parsed_date else None,
        'body_plain': '\n'.join(body_plain).strip(),
        'body_html': '\n'.join(body_html).strip(),
        'attachments': attachments,
    }


def parse_msg_file(path: str) -> dict | None:
    """Parse a .msg file using extract-msg when available."""
    try:
        import extract_msg
    except ImportError:
        logger.warning("extract_msg is not installed; .msg files will not be parsed")
        return None

    try:
        msg = extract_msg.Message(path)
        to = []
        if msg.to:
            to = [r.email for r in msg.to if getattr(r, 'email', None)]
        cc = []
        if msg.cc:
            cc = [r.email for r in msg.cc if getattr(r, 'email', None)]

        parsed_date = None
        if msg.date:
            try:
                parsed_date = msg.date
            except Exception:
                pass

        attachments = []
        for att in msg.attachments:
            try:
                data = att.data if hasattr(att, 'data') else b''
                attachments.append({
                    'filename': getattr(att, 'name', 'unnamed'),
                    'size': len(data),
                })
            except Exception:
                continue

        return {
            'subject': msg.subject or '',
            'from': msg.sender,
            'to': to,
            'cc': cc,
            'date': parsed_date.isoformat() if parsed_date else None,
            'body_plain': msg.body or '',
            'body_html': msg.htmlBody or '',
            'attachments': attachments,
        }
    except Exception as e:
        logger.warning(f"Failed to parse .msg: {e}")
        return None


def parse_email_evidence(evidence) -> dict:
    """Dispatch to the correct parser based on file extension."""
    path = Path(evidence.file.path)
    suffix = path.suffix.lower()

    if suffix == '.eml':
        try:
            with open(path, 'rb') as f:
                return parse_eml_bytes(f.read()) or {}
        except Exception as e:
            logger.warning(f"Failed to read .eml file: {e}")
            return {}

    if suffix == '.msg':
        return parse_msg_file(str(path)) or {}

    return {}
