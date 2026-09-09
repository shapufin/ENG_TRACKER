"""
Importer for the Skills plugin category catalog.
"""

from typing import Any, Dict, List, Optional

from plugins.skills.models import SkillCategory
from .base import ImportField
from .catalog import CodeKeyedImporter
from .authority import SkillsPluginAuthority
from .registry import register


@register
class SkillCategoryImporter(SkillsPluginAuthority, CodeKeyedImporter):
    target_key = "skill_categories"
    display_name = "Skill Categories"
    description = "Import or update the categories that group the skill catalog."
    icon = "FolderTree"
    page_route = "/skills/catalog"

    model = SkillCategory
    scalar_fields = ("name", "description")
    bool_fields = ("is_active",)

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="code",
                label="Code",
                required=True,
                field_type="string",
                help_text="Unique category code. Used to match existing categories.",
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
            "code": ["code", "category code", "category_code", "short code"],
            "name": ["name", "category", "category name", "category_name", "group"],
            "description": ["description", "notes", "details"],
            "is_active": ["active", "is_active", "enabled", "status"],
        }

    def validate_new(self, values: Dict[str, Any]) -> Optional[str]:
        name = values.get("name")
        if name and SkillCategory.objects.filter(name=name).exists():
            return f'A different skill category already uses the name "{name}".'
        return None

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "code": "CLOUD",
                "name": "Cloud Platforms",
                "description": "Public and private cloud platforms",
                "is_active": True,
            },
            {
                "code": "LANG",
                "name": "Programming Languages",
                "description": "Programming and scripting languages",
                "is_active": True,
            },
        ]
