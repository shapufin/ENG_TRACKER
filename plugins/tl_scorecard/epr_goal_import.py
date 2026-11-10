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
    r'organization|employee|period|target|actual|'
    r'evaluated\s+by|entered\s+by|rating|date|comment)\s*:',
    re.IGNORECASE,
)
_METADATA_LABELS = frozenset({
    'due date',
    'status',
    'completion date',
    'category',
    'organization alignment',
    'weight',
    'manager',
    'location',
    'organization',
    'employee',
    'period',
    'target',
    'actual',
    'evaluated by',
    'entered by',
    'rating',
    'date',
    'comment',
})
_SECTION_HEADINGS = {
    'goals',
    'overall',
    'acknowledgement',
    'section summary',
    'workday grading matrix:',
    'workday rating matrix:',
    'target:',
}
_EVALUATION_BOILERPLATE_RE = re.compile(
    r'^(?:'
    r'(?:manager(?:\s+overall)?|employee|additional\s+manager)\s+evaluation'
    r'(?:\s+employee\s+evaluation)?'
    r'|section\s+summary'
    r'|comment(?:\s*:\s*comment\s*:?)?'
    r'|behaviou?rs'
    r'|overall'
    r'|acknowledgement'
    r')$',
    re.IGNORECASE,
)
_GOALS_END_RE = re.compile(r'^(?:section\s+summary|behaviou?rs)$', re.IGNORECASE)
_COLOR_CHROMA_MIN = 0.08
_TITLE_FONT_SIZE_MIN = 10.5


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
        if (
            _METADATA_RE.match(line)
            or line.casefold() in _SECTION_HEADINGS
            or _EVALUATION_BOILERPLATE_RE.match(line)
        ):
            title = finish()
            if title:
                return title
            continue
        if not fragments and len(line) <= TITLE_MAX_CHARS:
            fragments.append(line)
            if not _looks_like_title_fragment(line):
                return finish()
            continue
        if _looks_like_title_fragment(line) and _fits_title(fragments, line):
            fragments.append(line)
            continue
        title = finish()
        if title:
            return title
    return finish()


def _finalize_titles(titles: list[str]) -> list[str]:
    """Deduplicate extracted goal titles case-insensitively and cap count."""
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
        cleaned = _clean_line(raw)
        if _GOALS_END_RE.match(cleaned):
            break
        if not re.match(r'^\s*weight\s*:', raw, re.IGNORECASE):
            continue
        weight_blocks += 1
        title = _title_from_block(lines[block_start:index])
        if title:
            titles.append(title)
        block_start = index + 1

    if weight_blocks == 0:
        raise GoalImportError('The Workday Goals section has no goal weight blocks.')

    return _finalize_titles(titles)


def _cmyk_to_rgb(c: float, m: float, y: float, k: float) -> tuple[float, float, float]:
    return (
        max(0.0, (1.0 - c) * (1.0 - k)),
        max(0.0, (1.0 - m) * (1.0 - k)),
        max(0.0, (1.0 - y) * (1.0 - k)),
    )


def _is_colored_goal_heading(
    rgb: tuple[float, float, float],
    text: str,
    font_size: float,
) -> bool:
    """Whether a PDF span uses Workday's colored heading styling for a goal title."""
    if max(rgb) - min(rgb) <= _COLOR_CHROMA_MIN:
        return False
    if font_size and font_size < _TITLE_FONT_SIZE_MIN:
        return False
    if not any(ch.isalnum() for ch in text):
        return False
    if text.lower().startswith(('http://', 'https://')):
        return False
    if _METADATA_RE.match(text) or text.casefold() in _METADATA_LABELS:
        return False
    if _EVALUATION_BOILERPLATE_RE.match(text):
        return False
    return len(text) <= GOAL_TITLE_MAX_LENGTH


def _extract_colored_goal_titles(reader: PdfReader) -> list[str] | None:
    """Extract goal titles using Workday's non-grayscale heading styling.

    Returns ``None`` when the PDF uses monochrome/uniform styling so the
    caller falls back to plain-text parsing.
    """
    in_goals = False
    goals_ended = False
    weight_blocks = 0
    titles: list[str] = []
    fragments: list[str] = []

    def flush_fragments() -> None:
        if fragments:
            combined = _clean_line(' '.join(fragments))
            fragments.clear()
            if combined and len(combined) <= GOAL_TITLE_MAX_LENGTH:
                titles.append(combined)

    for page in reader.pages:
        if goals_ended:
            break
        state_stack: list[tuple[float, float, float]] = [(0.0, 0.0, 0.0)]

        def on_operand_before(op: bytes, args: list, _cm: object, _tm: object) -> None:
            if op == b'q':
                state_stack.append(state_stack[-1])
            elif op == b'Q' and len(state_stack) > 1:
                state_stack.pop()
            elif op == b'rg' and len(args) == 3:
                try:
                    state_stack[-1] = (float(args[0]), float(args[1]), float(args[2]))
                except (TypeError, ValueError):
                    pass
            elif op == b'g' and len(args) == 1:
                try:
                    gray = float(args[0])
                    state_stack[-1] = (gray, gray, gray)
                except (TypeError, ValueError):
                    pass
            elif op == b'k' and len(args) == 4:
                try:
                    state_stack[-1] = _cmyk_to_rgb(*(float(v) for v in args))
                except (TypeError, ValueError):
                    pass
            elif op in (b'sc', b'scn'):
                nums: list[float] = []
                for arg in args:
                    try:
                        nums.append(float(arg))
                    except (TypeError, ValueError):
                        pass
                if len(nums) == 1:
                    state_stack[-1] = (nums[0], nums[0], nums[0])
                elif len(nums) == 3:
                    state_stack[-1] = (nums[0], nums[1], nums[2])
                elif len(nums) == 4:
                    state_stack[-1] = _cmyk_to_rgb(*nums)

        def on_text(
            text: str,
            _cm: object,
            _tm: object,
            _font_dict: object,
            font_size: float,
        ) -> None:
            nonlocal in_goals, goals_ended, weight_blocks
            if goals_ended:
                return
            clean = _clean_line(text)
            if not clean:
                return
            if not in_goals:
                if clean.casefold() == 'goals':
                    in_goals = True
                return
            if _GOALS_END_RE.match(clean):
                flush_fragments()
                goals_ended = True
                return
            if clean.casefold() == 'weight' or re.match(r'^weight\s*:', clean, re.IGNORECASE):
                flush_fragments()
                weight_blocks += 1
                return
            if _is_colored_goal_heading(state_stack[-1], clean, float(font_size or 0)):
                candidate = _clean_line(' '.join([*fragments, clean]))
                if len(candidate) <= GOAL_TITLE_MAX_LENGTH:
                    fragments.append(clean)
                    return
                flush_fragments()
                fragments.append(clean)
                return
            flush_fragments()

        page.extract_text(
            visitor_operand_before=on_operand_before,
            visitor_text=on_text,
        )

    flush_fragments()
    if weight_blocks > 0 and titles:
        return _finalize_titles(titles)
    return None


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
        if not text.strip():
            raise GoalImportError('The PDF has no readable text; OCR is not supported.')
        colored = _extract_colored_goal_titles(reader)
        if colored is not None:
            return colored
    except GoalImportError:
        raise
    except Exception as exc:
        raise GoalImportError('The PDF could not be read.') from exc

    return extract_goal_titles(text)
