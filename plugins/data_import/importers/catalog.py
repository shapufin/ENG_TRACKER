"""
Shared base for code-keyed catalog importers.

Clients, Techs, Teams, Skill Categories and Skills are all "look the record up
by its unique ``code``, then create or update scalar fields" targets. This base
holds that one implementation so each concrete importer only declares its
model, its fields, and how to resolve its foreign keys.
"""

from typing import Any, Dict, List, Optional

from .base import BaseImporter, ImportRowResult


class CodeKeyedImporter(BaseImporter):
    """Create/update a model matched on a unique code column."""

    #: Django model class this importer writes to.
    model: Any = None

    #: Field key (and model field) carrying the unique code.
    code_key: str = "code"

    #: Store and match codes upper-cased (mirrors ``Tech.save``).
    uppercase_code: bool = False

    #: Field keys assigned straight onto the model.
    scalar_fields: tuple = ()

    #: Field keys parsed as booleans before assignment.
    bool_fields: tuple = ()

    def resolve_relations(
        self,
        mapped_row: Dict[str, Any],
        context: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Return extra model kwargs resolved from foreign-key columns.

        Raise ``ValueError`` with a readable message when a reference cannot be
        resolved; the caller turns it into a row-level error.
        """
        return {}

    def normalize_code(self, value: Any) -> str:
        code = str(value or "").strip()
        return code.upper() if self.uppercase_code else code

    def _parse_bool(self, value: Any) -> Optional[bool]:
        """Return the boolean, or None when the cell carries no value."""
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return value
        return str(value).lower().strip() in ("true", "1", "yes", "y")

    def _build_field_values(self, mapped_row: Dict[str, Any]) -> Dict[str, Any]:
        """Map row values onto model kwargs, skipping cells that are empty.

        An empty cell means "leave this alone", for booleans exactly as for
        scalars — a blank Active column must never silently reactivate a
        record that was deliberately disabled.
        """
        values: Dict[str, Any] = {}
        for key in self.scalar_fields:
            if mapped_row.get(key) is not None:
                values[key] = mapped_row[key]
        for key in self.bool_fields:
            parsed = self._parse_bool(mapped_row.get(key))
            if parsed is not None:
                values[key] = parsed
        return values

    def get_dedupe_keys(self) -> List[str]:
        return [self.code_key]

    def commit_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None,
        dry_run: bool = False,
        context: Optional[Dict[str, Any]] = None,
    ) -> ImportRowResult:
        row_index = mapped_row.get("__row_index", 0)

        try:
            code = self.normalize_code(mapped_row.get(self.code_key))
            if not code:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=[f"{self.code_key} is required."],
                )

            values = self._build_field_values(mapped_row)
            values[self.code_key] = code
            values.update(self.resolve_relations(mapped_row, context))

            instance = existing
            if instance is None:
                instance = self.model.objects.filter(**{self.code_key: code}).first()

            if instance is not None:
                if not options.get("update_existing"):
                    return ImportRowResult(
                        row_index=row_index,
                        status="skipped",
                        warnings=[f"{self.display_name} with this code already exists."],
                    )
                if not dry_run:
                    for field_name, value in values.items():
                        setattr(instance, field_name, value)
                    instance.save()
                return ImportRowResult(
                    row_index=row_index,
                    status="updated" if not dry_run else "valid",
                )

            error = self.validate_new(values)
            if error:
                return ImportRowResult(row_index=row_index, status="error", errors=[error])

            if not dry_run:
                self.model.objects.create(**values)

            return ImportRowResult(
                row_index=row_index,
                status="created" if not dry_run else "valid",
            )

        except ValueError as e:
            return ImportRowResult(row_index=row_index, status="error", errors=[str(e)])
        except Exception as e:  # noqa: BLE001
            return ImportRowResult(
                row_index=row_index,
                status="error",
                errors=[f"Unexpected error: {str(e)}"],
            )

    def validate_new(self, values: Dict[str, Any]) -> Optional[str]:
        """Return an error message when a new record cannot be created.

        Checks unique constraints other than the code so a clash surfaces as a
        readable row error instead of an IntegrityError.
        """
        return None
