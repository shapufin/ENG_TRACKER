"""
Base importer interface for the Universal Data Import plugin.
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
class ImportRowResult:
    """Result of validating or committing one import row."""
    row_index: int
    status: str = "error"  # created | updated | skipped | error
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)


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

    @abstractmethod
    def get_fields(self) -> List[ImportField]:
        """Return the list of fields this importer accepts."""

    @abstractmethod
    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        """Return field-key -> list of lowercase column-name aliases for auto-detect."""

    @abstractmethod
    def get_dedupe_keys(self) -> List[str]:
        """Return field keys used to find an existing record to update."""

    def validate_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None
    ) -> ImportRowResult:
        """
        Pure validation — no DB writes. By default, simply delegates to commit_row
        in dry-run mode. Importers may override this to provide richer
        pre-flight validation if needed.
        """
        return self.commit_row(mapped_row, options, existing=existing, dry_run=True)

    @abstractmethod
    def commit_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None,
        dry_run: bool = False
    ) -> ImportRowResult:
        """
        Perform the actual create/update (or simulate it when dry_run=True).

        Args:
            mapped_row: Dict of {our_field_key: parsed_value} for this row.
            options: Import options (update_existing, password_strategy, etc.).
            existing: The existing database instance matched by dedupe keys, if any.
            dry_run: If True, do not write to the database; only validate and
                report what would happen.

        Returns:
            ImportRowResult describing the outcome.
        """

    def to_dict(self) -> Dict[str, Any]:
        """Serialize importer metadata for the /targets/ API."""
        return {
            "target_key": self.target_key,
            "display_name": self.display_name,
            "description": self.description,
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
            "dedupe_keys": self.get_dedupe_keys(),
        }