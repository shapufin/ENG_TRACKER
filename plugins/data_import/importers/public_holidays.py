"""
Importer for public holidays.

A row with no workspace is a global holiday, constrained unique on
(date, country_code); a workspace-scoped row is unique on
(date, calendar, country_code).
"""

from typing import Any, Dict, List, Optional

from apps.dashboard.models.calendar import CalendarWorkspace, PublicHoliday
from .base import BaseImporter, ImportField, ImportRowResult
from .authority import StaffOnlyAuthority
from .registry import register


@register
class PublicHolidayImporter(StaffOnlyAuthority, BaseImporter):
    target_key = "public_holidays"
    display_name = "Public Holidays"
    description = (
        "Import or update public holidays, either global or scoped to one "
        "calendar workspace."
    )
    icon = "CalendarCheck"
    page_route = "/admin/calendar-management"

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(key="name", label="Name", required=True, field_type="string"),
            ImportField(key="date", label="Date", required=True, field_type="date"),
            ImportField(
                key="country_code",
                label="Country Code",
                required=False,
                field_type="string",
                help_text="Two-letter ISO country code. Part of the uniqueness key.",
            ),
            ImportField(
                key="workspace_name",
                label="Workspace Name",
                required=False,
                field_type="string",
                help_text="Leave empty for a global holiday. Must match an existing workspace.",
            ),
            ImportField(
                key="is_global",
                label="Global",
                required=False,
                field_type="bool",
                help_text="Defaults to true when no workspace is given.",
            ),
            ImportField(
                key="description", label="Description", required=False, field_type="string"
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "name": ["name", "holiday", "holiday name", "title", "description"],
            "date": ["date", "holiday date", "day", "when"],
            "country_code": ["country code", "country_code", "country", "iso", "iso code"],
            "workspace_name": ["workspace", "workspace name", "workspace_name", "calendar"],
            "is_global": ["global", "is_global", "nationwide"],
            "description": ["description", "notes", "details"],
        }

    def get_dedupe_keys(self) -> List[str]:
        return ["date", "workspace_name", "country_code"]

    def _resolve_workspace(self, mapped_row: Dict[str, Any]) -> Optional[CalendarWorkspace]:
        name = str(mapped_row.get("workspace_name") or "").strip()
        if not name:
            return None
        workspace = CalendarWorkspace.objects.filter(name=name).first()
        if workspace is None:
            raise ValueError(f'Calendar workspace "{name}" does not exist.')
        return workspace

    def _parse_bool(self, value: Any, default: bool) -> bool:
        if value is None or value == "":
            return default
        if isinstance(value, bool):
            return value
        return str(value).lower().strip() in ("true", "1", "yes", "y")

    def _normalize_country(self, value: Any) -> str:
        code = str(value or "").strip().upper()
        if code and len(code) != 2:
            raise ValueError(f'country_code "{code}" must be a two-letter ISO code.')
        return code

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
            name = str(mapped_row.get("name") or "").strip()
            if not name:
                return ImportRowResult(
                    row_index=row_index, status="error", errors=["name is required."]
                )

            holiday_date = mapped_row.get("date")
            if not holiday_date:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["date is required and must be a valid date."],
                )

            workspace = self._resolve_workspace(mapped_row)
            country_code = self._normalize_country(mapped_row.get("country_code"))
            is_global = self._parse_bool(mapped_row.get("is_global"), workspace is None)
            description = mapped_row.get("description")

            holiday = existing
            if holiday is None:
                holiday = PublicHoliday.objects.filter(
                    date=holiday_date,
                    calendar=workspace,
                    country_code=country_code,
                ).first()

            if holiday is not None:
                if not options.get("update_existing"):
                    return ImportRowResult(
                        row_index=row_index,
                        status="skipped",
                        warnings=["A holiday already exists for this date and scope."],
                    )
                if not dry_run:
                    holiday.name = name
                    holiday.is_global = is_global
                    if description is not None:
                        holiday.description = description
                    holiday.save()
                return ImportRowResult(
                    row_index=row_index,
                    status="updated" if not dry_run else "valid",
                )

            if not dry_run:
                PublicHoliday.objects.create(
                    name=name,
                    date=holiday_date,
                    calendar=workspace,
                    country_code=country_code,
                    is_global=is_global,
                    description=description or "",
                )

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

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "New Year's Day",
                "date": "2026-01-01",
                "country_code": "IT",
                "workspace_name": "",
                "is_global": True,
                "description": "National holiday",
            },
            {
                "name": "Republic Day",
                "date": "2026-06-02",
                "country_code": "IT",
                "workspace_name": "",
                "is_global": True,
                "description": "National holiday",
            },
        ]
