"""
Importer for the Skills plugin catalog.

Ordering is automatic (A-Z by name) — there is no display_order field.
"""

from typing import Any, Dict, List, Optional

from plugins.skills.models import Skill, SkillCategory
from .base import ImportField
from .catalog import CodeKeyedImporter
from .authority import SkillsPluginAuthority
from .registry import register


@register
class SkillImporter(SkillsPluginAuthority, CodeKeyedImporter):
    target_key = "skills"
    display_name = "Skills"
    description = "Import or update the skill catalog. Categories must already exist."
    icon = "Sparkles"
    page_route = "/skills/catalog"

    model = Skill
    scalar_fields = ("name", "description")
    bool_fields = ("is_active",)

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="code",
                label="Code",
                required=True,
                field_type="string",
                help_text="Unique skill code. Used to match existing skills.",
            ),
            ImportField(key="name", label="Name", required=True, field_type="string"),
            ImportField(
                key="category_code",
                label="Category Code",
                required=True,
                field_type="string",
                help_text="Must match an existing SkillCategory.code.",
            ),
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
            "code": ["code", "skill code", "skill_code", "short code"],
            "name": ["name", "skill", "skill name", "skill_name"],
            "category_code": [
                "category code", "category_code", "category", "group", "area",
            ],
            "description": ["description", "notes", "details"],
            "is_active": ["active", "is_active", "enabled", "status"],
        }

    def resolve_relations(self, mapped_row, context) -> Dict[str, Any]:
        category_code = str(mapped_row.get("category_code") or "").strip()
        if not category_code:
            raise ValueError("category_code is required.")
        category = SkillCategory.objects.filter(code=category_code).first()
        if category is None:
            raise ValueError(f'Skill category with code "{category_code}" does not exist.')
        return {"category": category}

    def validate_new(self, values: Dict[str, Any]) -> Optional[str]:
        """``(category, name)`` is unique — report a clash readably."""
        name = values.get("name")
        category = values.get("category")
        if name and category and Skill.objects.filter(category=category, name=name).exists():
            return f'"{name}" already exists in category "{category.name}".'
        return None

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "code": "AWS",
                "name": "Amazon Web Services",
                "category_code": "CLOUD",
                "description": "EC2, S3, IAM and VPC administration",
                "is_active": True,
            },
            {
                "code": "PYTHON",
                "name": "Python",
                "category_code": "LANG",
                "description": "Application and automation development",
                "is_active": True,
            },
        ]
