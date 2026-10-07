"""Preview-only extraction of Workday EPR goal titles.

The uploaded PDF is read for the duration of the request only and is never
persisted. Workday's goal-setting template places each goal block before a
``Weight:`` row; within that block, the first blank-separated line group is
the title. Everything after the title (description, targets, dates, ratings,
and metadata) is ignored.
"""
from __future__ import annotations

from io import BytesIO
import re
from typing import Iterable

from pypdf import PdfReader

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 25
MAX_EXTRACTED_CHARS = 250_000
MAX_GOAL_TITLES = 50
MIN_CONFIRMED_GOALS = 5
GOAL_TITLE_MAX_LENGTH = 255
# Cumulative bound on one title group. A Workday description that lacks
# terminal punctuation cannot be told apart from a wrapped title, so the merge
# is bounded rather than trusted: beyond this the group is a description.
TITLE_MAX_CHARS = 120

_WHITESPACE_RE = re.compile(r'\s+')
_METADATA_RE = re.compile(
    r'^(?:due\s+date|status|completion\s+date|category|'
    r'organization\s+alignment|weight|manager|location|'
    r'organization|employee|period|target)\s*:',
    re.IGNORECASE,
)
_SECTION_HEADINGS = {
    'goals',
    'workday grading matrix:',
    'workday rating matrix:',
    'target:',
}


class GoalImportError(ValueError):
    """A client-correctable Workday PDF or confirmed goal-list problem."""

    def __init__(self, message: str, *, field: str = 'file'):
        super().__init__(message)
        self.field = field


def _clean_line(line: str) -> str:
    return _WHITESPACE_RE.sub(' ', line).strip()


def normalize_goal_titles(
    raw_titles: object,
    *,
    minimum: int = MIN_CONFIRMED_GOALS,
) -> list[str]:
    """Normalize and validate a user-confirmed goal title list."""
    if not isinstance(raw_titles, list):
        raise GoalImportError('Expected a list of goal titles.', field='goal_titles')

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_titles:
        if not isinstance(item, str):
            raise GoalImportError('Each goal title must be text.', field='goal_titles')
        title = _clean_line(item)
        if not title:
            raise GoalImportError('Goal titles cannot be blank.', field='goal_titles')
        if len(title) > GOAL_TITLE_MAX_LENGTH:
            raise GoalImportError(
                f'Goal titles must be {GOAL_TITLE_MAX_LENGTH} characters or fewer.',
                field='goal_titles',
            )
        key = title.casefold()
        if key in seen:
            raise GoalImportError('Goal titles must be unique.', field='goal_titles')
        seen.add(key)
        normalized.append(title)

    if len(normalized) > MAX_GOAL_TITLES:
        raise GoalImportError(
            f'At most {MAX_GOAL_TITLES} goal titles are allowed.',
            field='goal_titles',
        )
    if len(normalized) < minimum:
        raise GoalImportError(
            f'At least {minimum} goal titles are required.',
            field='goal_titles',
        )
    return normalized


def _looks_like_title_fragment(line: str) -> bool:
    """Whether a contiguous line can belong to a Workday goal title."""
    return len(line) <= TITLE_MAX_CHARS and not line.endswith(('.', '?', '!', ';'))


def _fits_title(fragments: list[str], line: str) -> bool:
    """Whether the line still fits the bounded title group."""
    return len(' '.join([*fragments, line])) <= TITLE_MAX_CHARS


def _title_from_block(lines: Iterable[str]) -> str | None:
    """Return the first blank-separated title group in a goal block."""
    fragments: list[str] = []

    def finish() -> str | None:
        title = _clean_line(' '.join(fragments))
        fragments.clear()
        return title or None

    for raw in lines:
        line = _clean_line(raw)
        if not line:
            title = finish()
            if title:
                return title
            continue
        if _METADATA_RE.match(line) or line.casefold() in _SECTION_HEADINGS:
            title = finish()
            if title:
                return title
            continue
        if _looks_like_title_fragment(line) and _fits_title(fragments, line):
            fragments.append(line)
            continue
        title = finish()
        if title:
            return title
    return finish()


def extract_goal_titles(text: str) -> list[str]:
    """Extract goal titles from Workday layout text.

    Every ``Weight:`` row closes a goal block. The title is the first
    blank-separated non-metadata group in the text since the previous block's
    ``Weight:`` row, which supports form-feed page breaks and wrapped titles.
    """
    lines = text.replace('\f', '\n').splitlines()
    start = next(
        (index for index, line in enumerate(lines)
         if _clean_line(line).casefold() == 'goals'),
        None,
    )
    if start is None:
        raise GoalImportError('The PDF does not contain a Workday Goals section.')

    titles: list[str] = []
    block_start = start + 1
    weight_blocks = 0
    for index, raw in enumerate(lines[block_start:], start=block_start):
        if not re.match(r'^\s*weight\s*:', raw, re.IGNORECASE):
            continue
        weight_blocks += 1
        title = _title_from_block(lines[block_start:index])
        if title:
            titles.append(title)
        block_start = index + 1

    if weight_blocks == 0:
        raise GoalImportError('The Workday Goals section has no goal weight blocks.')

    deduped: list[str] = []
    seen: set[str] = set()
    for title in titles:
        key = title.casefold()
        if key not in seen:
            seen.add(key)
            deduped.append(title)
        if len(deduped) > MAX_GOAL_TITLES:
            raise GoalImportError('The PDF contains more goal rows than supported.')

    if not deduped:
        raise GoalImportError('No goal titles could be extracted from the PDF.')
    return deduped


def read_uploaded_pdf(upload) -> bytes:
    """Read an upload with an independent byte bound; never store it."""
    name = getattr(upload, 'name', '') or ''
    if not name.lower().endswith('.pdf'):
        raise GoalImportError('Upload a Workday goal-setting PDF.')

    size = getattr(upload, 'size', None)
    if size is not None and size > MAX_UPLOAD_BYTES:
        raise GoalImportError('The PDF exceeds the 10 MB upload limit.')

    reader = getattr(upload, 'read', None)
    if reader is None:
        raise GoalImportError('Upload a Workday goal-setting PDF.')
    data = reader(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise GoalImportError('The PDF exceeds the 10 MB upload limit.')
    if not data.startswith(b'%PDF-'):
        raise GoalImportError('The uploaded file is not a valid PDF.')
    return data


def extract_goal_titles_from_pdf(upload) -> list[str]:
    """Extract titles from request-scoped PDF bytes, without persistence."""
    data = read_uploaded_pdf(upload)
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise GoalImportError('Password-protected PDFs cannot be parsed.')
        if len(reader.pages) > MAX_PDF_PAGES:
            raise GoalImportError('The PDF has too many pages to be a goal-setting export.')
        chunks: list[str] = []
        total = 0
        for page in reader.pages:
            chunk = page.extract_text(extraction_mode='layout') or ''
            total += len(chunk)
            if total > MAX_EXTRACTED_CHARS:
                raise GoalImportError('The PDF contains too much text to be a goal-setting export.')
            chunks.append(chunk)
        text = '\n'.join(chunks)
    except GoalImportError:
        raise
    except Exception as exc:
        raise GoalImportError('The PDF could not be read.') from exc

    if not text.strip():
        raise GoalImportError('The PDF has no readable text; OCR is not supported.')
    return extract_goal_titles(text)
