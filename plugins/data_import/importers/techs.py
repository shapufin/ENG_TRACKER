"""
Importer for the Tech classification catalog.
"""

from typing import Any, Dict, List, Optional

from apps.users.models import Tech
from .base import ImportField
from .catalog import CodeKeyedImporter
from .authority import StaffOnlyAuthority
from .registry import register


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
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "code": ["code", "tech code", "tech_code", "short code", "abbreviation"],
            "name": ["name", "tech", "technology", "tech name", "tech_name"],
            "description": ["description", "notes", "details"],
            "is_active": ["active", "is_active", "enabled", "status"],
        }

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
            },
            {
                "code": "DB",
                "name": "Databases",
                "description": "Relational and NoSQL database administration",
                "is_active": True,
            },
        ]
