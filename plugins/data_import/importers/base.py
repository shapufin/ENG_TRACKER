"""
Base importer interface for the Universal Data Import plugin.

An importer is the single source of truth for one import target: the fields it
accepts, the options the UI renders, the sample rows offered as a downloadable
template, and the plugin permission action that guards it. The frontend renders
purely from this metadata, so adding a target must never require a frontend
change.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ImportField:
    """Schema describing a single importable field."""
    key: str
    label: str
    required: bool
    field_type: str
    choices: Optional[List[tuple]] = None
    help_text: str = ""


@dataclass
class ImportOption:
    """Schema describing one import option the UI should render.

    ``option_type`` is one of ``bool``, ``string``, ``secret`` or ``choice``.
    ``depends_on`` maps another option key to the value that must be selected
    for this option to be shown, e.g. ``{"password_strategy": "fixed"}``.
    """
    key: str
    label: str
    option_type: str
    default: Any = None
    choices: Optional[List[tuple]] = None
    help_text: str = ""
    depends_on: Optional[Dict[str, Any]] = None


@dataclass
class ImportRowResult:
    """Result of validating or committing one import row.

    ``status`` is one of ``valid`` (dry run only), ``created``, ``updated``,
    ``skipped`` or ``error``.
    """
    row_index: int
    status: str = "error"
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)


UPDATE_EXISTING_OPTION = ImportOption(
    key="update_existing",
    label="Update existing records",
    option_type="bool",
    default=False,
    help_text="Update matched records instead of skipping them.",
)


class BaseImporter(ABC):
    """
    Abstract base class for all data import targets.
    Concrete importers must define target_key, display_name, description and
    implement get_fields, get_alias_suggestions, get_dedupe_keys, validate_row,
    and commit_row.
    """
    target_key: str = ""
    display_name: str = ""
    description: str = ""

    #: Plugin permission action guarding this target. Must be one of the four
    #: actions the platform supports (``view``/``manage``/``configure``/
    #: ``export``); the plugin gate is checked before ``check_authority``.
    permission_scope: str = "manage"

    #: lucide-react icon name rendered by the target picker.
    icon: str = "Upload"

    #: Admin route that owns this data, so the UI can link back to it.
    page_route: str = ""

    def check_authority(self, user) -> Optional[str]:
        """Return a denial reason when ``user`` may not import this target.

        Holding the plugin's ``manage`` grant must not by itself allow every
        target: each importer re-applies the authority its own admin surface
        requires. Return ``None`` to allow.
        """
        return None

    @abstractmethod
    def get_fields(self) -> List[ImportField]:
        """Return the list of fields this importer accepts."""

    @abstractmethod
    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        """Return field-key -> list of lowercase column-name aliases for auto-detect."""

    @abstractmethod
    def get_dedupe_keys(self) -> List[str]:
        """Return field keys used to find an existing record to update."""

    def get_options(self) -> List[ImportOption]:
        """Return the import options this target supports.

        Every target supports ``update_existing``; override to add more.
        """
        return [UPDATE_EXISTING_OPTION]

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        """Return example rows for the downloadable template.

        Keys are field keys. Every required field must carry a value, and
        ``choice`` values must be valid codes, so the sample imports cleanly.
        """
        return []

    def prepare_batch(
        self,
        rows: List[Dict[str, Any]],
        options: Dict[str, Any],
        *,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """Run once before the rows are processed; return a per-run context.

        Targets whose rows can reference each other (a team whose parent team
        appears further down the same file) use this for a first pass. The
        returned dict is handed to every ``validate_row``/``commit_row`` call of
        that run. It must not write to the database when ``dry_run`` is True.
        """
        return {}

    def finalize_batch(
        self,
        context: Dict[str, Any],
        options: Dict[str, Any],
        *,
        dry_run: bool = False
    ) -> None:
        """Run once after every row of a run, inside the same transaction.

        The second half of a two-pass import: apply links that could only be
        resolved once all rows existed. Must not write when ``dry_run`` is True.
        """
        return None

    def validate_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> ImportRowResult:
        """
        Pure validation — no DB writes. By default, simply delegates to commit_row
        in dry-run mode. Importers may override this to provide richer
        pre-flight validation if needed.
        """
        return self.commit_row(
            mapped_row, options, existing=existing, dry_run=True, context=context
        )

    @abstractmethod
    def commit_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None,
        dry_run: bool = False,
        context: Optional[Dict[str, Any]] = None,
    ) -> ImportRowResult:
        """
        Perform the actual create/update (or simulate it when dry_run=True).

        Args:
            mapped_row: Dict of {our_field_key: parsed_value} for this row.
            options: Import options (update_existing, password_strategy, etc.).
            existing: The existing database instance matched by dedupe keys, if any.
            dry_run: If True, do not write to the database; only validate and
                report what would happen.
            context: The dict returned by ``prepare_batch`` for this run.

        Returns:
            ImportRowResult describing the outcome.
        """

    def get_default_options(self) -> Dict[str, Any]:
        """Return {option_key: default} for every declared option."""
        return {o.key: o.default for o in self.get_options()}

    def to_dict(self) -> Dict[str, Any]:
        """Serialize importer metadata for the /targets/ API."""
        return {
            "target_key": self.target_key,
            "display_name": self.display_name,
            "description": self.description,
            "permission_scope": self.permission_scope,
            "icon": self.icon,
            "page_route": self.page_route,
            "fields": [
                {
                    "key": f.key,
                    "label": f.label,
                    "required": f.required,
                    "field_type": f.field_type,
                    "choices": f.choices,
                    "help_text": f.help_text,
                }
                for f in self.get_fields()
            ],
            "options": [
                {
                    "key": o.key,
                    "label": o.label,
                    "option_type": o.option_type,
                    "default": o.default,
                    "choices": o.choices,
                    "help_text": o.help_text,
                    "depends_on": o.depends_on,
                }
                for o in self.get_options()
            ],
            "sample_rows": self.get_sample_rows(),
            "dedupe_keys": self.get_dedupe_keys(),
        }
