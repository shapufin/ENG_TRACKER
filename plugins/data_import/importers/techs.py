"""
Importer for the Tech classification catalog.
"""

import logging
from typing import Any, Dict, List, Optional

from django.db.models import Max

from apps.users.models import Tech, TechLevel
from .base import ImportField
from .catalog import CodeKeyedImporter
from .authority import StaffOnlyAuthority
from .registry import register

logger = logging.getLogger(__name__)


@register
class TechImporter(StaffOnlyAuthority, CodeKeyedImporter):
    target_key = "techs"
    display_name = "Techs"
    description = "Import or update the technology classifications assigned to users."
    icon = "Cpu"
    page_route = "/admin/techs"

    model = Tech
    # ``Tech.save`` upper-cases the code, so match on the upper-cased value.
    uppercase_code = True
    scalar_fields = ("name", "description")
    bool_fields = ("is_active",)

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="code",
                label="Code",
                required=True,
                field_type="string",
                help_text="Unique tech code. Stored upper-cased.",
            ),
            ImportField(key="name", label="Name", required=True, field_type="string"),
            ImportField(
                key="description", label="Description", required=False, field_type="string"
            ),
            ImportField(
                key="is_active",
                label="Active",
                required=False,
                field_type="bool",
                help_text="Defaults to true.",
            ),
            ImportField(
                key="levels",
                label="Levels",
                required=False,
                field_type="string",
                help_text="Semicolon-separated grade codes, least senior first "
                          "(e.g. 'L1;L2;L3'). Blank leaves existing levels alone.",
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "code": ["code", "tech code", "tech_code", "short code", "abbreviation"],
            "name": ["name", "tech", "technology", "tech name", "tech_name"],
            "description": ["description", "notes", "details"],
            "is_active": ["active", "is_active", "enabled", "status"],
            "levels": ["levels", "grades", "tiers", "seniority", "level codes"],
        }

    def commit_row(self, mapped_row, options, *, existing=None, dry_run=False,
                   context=None):
        """Create/update the Tech, then add any levels the row lists.

        Levels are handled after the base importer's own write because they live
        in a separate table. Additive only: a listed level that is missing gets
        created, existing ones keep their rank, and levels absent from the cell
        are never deleted — a spreadsheet typo must not wipe the grades people
        are already assigned to.
        """
        result = super().commit_row(
            mapped_row, options, existing=existing, dry_run=dry_run, context=context,
        )
        if dry_run or result.status not in ("created", "updated"):
            return result

        codes = self._parse_levels(mapped_row.get("levels"))
        if not codes:
            return result

        code = str(mapped_row.get("code") or "").strip().upper()
        tech = Tech.objects.filter(code=code).first()
        if tech is None:
            # Unreachable unless the row's code changed under us mid-commit.
            # Warn rather than return quietly: the Tech saved but its levels
            # silently did not, and a silent partial import is the worst
            # outcome for an importer.
            logger.warning(
                "Tech %r vanished between save and level sync; "
                "levels %s were not created.", code, codes,
            )
            return result

        existing_codes = set(tech.levels.values_list("code", flat=True))
        next_rank = (tech.levels.aggregate(top=Max("rank"))["top"] or 0) + 1
        for level_code in codes:
            if level_code in existing_codes:
                continue
            TechLevel.objects.create(
                tech=tech, name=level_code, code=level_code, rank=next_rank
            )
            next_rank += 1
        return result

    @staticmethod
    def _parse_levels(raw: Any) -> List[str]:
        """Split the levels cell, preserving order and dropping duplicates."""
        if raw is None:
            return []
        codes = []
        for chunk in str(raw).split(";"):
            chunk = chunk.strip().upper()
            if chunk and chunk not in codes:
                codes.append(chunk)
        return codes

    def validate_new(self, values: Dict[str, Any]) -> Optional[str]:
        """``Tech.name`` is unique too — report a clash readably."""
        name = values.get("name")
        if name and Tech.objects.filter(name=name).exists():
            return f'A different tech already uses the name "{name}".'
        return None

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "code": "INFRA",
                "name": "Infrastructure",
                "description": "Servers, networking and virtualization",
                "is_active": True,
                "levels": "L1;L2;L3",
            },
            {
                "code": "DB",
                "name": "Databases",
                "description": "Relational and NoSQL database administration",
                "is_active": True,
                "levels": "Junior;Senior",
            },
        ]
