"""
Importer for per-user skill proficiency ratings.

Ratings are written through the ordinary ``UserSkill`` save path so the skills
plugin's ``post_save`` signal records a ``SkillRatingHistory`` row. The
importing admin is passed as ``last_updated_by`` so the audit trail attributes
the change correctly; never write ``SkillRatingHistory`` directly.
"""

from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User

from plugins.skills.models import Skill, UserSkill
from .base import BaseImporter, ImportField, ImportRowResult
from .authority import SkillsPluginAuthority
from .registry import register

MIN_LEVEL = 1
MAX_LEVEL = 5


@register
class UserSkillImporter(SkillsPluginAuthority, BaseImporter):
    target_key = "user_skills"
    display_name = "User Skills"
    description = (
        "Import or update per-user skill ratings (1-5). Users and skills must "
        "already exist; this importer creates neither."
    )
    icon = "Star"
    page_route = "/skills/team"

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="username",
                label="Username",
                required=True,
                field_type="string",
                help_text="Username of an existing user.",
            ),
            ImportField(
                key="email",
                label="Email",
                required=False,
                field_type="email",
                help_text="Fallback to match the user when the username is missing.",
            ),
            ImportField(
                key="skill_code",
                label="Skill Code",
                required=True,
                field_type="string",
                help_text="Must match an existing Skill.code.",
            ),
            ImportField(
                key="level",
                label="Level",
                required=True,
                field_type="integer",
                help_text="Proficiency from 1 (Foundational) to 5 (Mastery).",
            ),
            ImportField(key="notes", label="Notes", required=False, field_type="string"),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "username": ["username", "user", "user name", "employee", "employee id"],
            "email": ["email", "email address", "e-mail", "mail"],
            "skill_code": ["skill code", "skill_code", "skill", "competency", "code"],
            "level": ["level", "rating", "proficiency", "score", "value"],
            "notes": ["notes", "note", "comment", "comments"],
        }

    def get_dedupe_keys(self) -> List[str]:
        return ["username", "skill_code"]

    def _resolve_user(self, mapped_row: Dict[str, Any]) -> Optional[User]:
        username = mapped_row.get("username")
        if username:
            user = User.objects.filter(username=username).first()
            if user is not None:
                return user
        email = mapped_row.get("email")
        if email:
            return User.objects.filter(email=email).first()
        return None

    def _parse_level(self, value: Any) -> int:
        if value is None or value == "":
            raise ValueError("level is required.")
        try:
            level = int(float(value))
        except (ValueError, TypeError) as e:
            raise ValueError("level must be a whole number between 1 and 5.") from e
        if level < MIN_LEVEL or level > MAX_LEVEL:
            raise ValueError(f"level must be between {MIN_LEVEL} and {MAX_LEVEL}.")
        return level

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
        actor = (context or {}).get("actor")

        try:
            user = self._resolve_user(mapped_row)
            if user is None:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["No existing user matches the provided username or email."],
                )

            skill_code = str(mapped_row.get("skill_code") or "").strip()
            if not skill_code:
                return ImportRowResult(
                    row_index=row_index, status="error", errors=["skill_code is required."]
                )
            skill = Skill.objects.filter(code=skill_code).first()
            if skill is None:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=[f'Skill with code "{skill_code}" does not exist.'],
                )

            level = self._parse_level(mapped_row.get("level"))
            notes = mapped_row.get("notes")

            user_skill = existing
            if user_skill is None:
                user_skill = UserSkill.objects.filter(user=user, skill=skill).first()

            if user_skill is not None:
                if not options.get("update_existing"):
                    return ImportRowResult(
                        row_index=row_index,
                        status="skipped",
                        warnings=["This user already has a rating for this skill."],
                    )
                if not dry_run:
                    user_skill.level = level
                    if notes is not None:
                        user_skill.notes = notes
                    user_skill.last_updated_by = actor
                    user_skill.save()
                return ImportRowResult(
                    row_index=row_index,
                    status="updated" if not dry_run else "valid",
                )

            if not dry_run:
                UserSkill.objects.create(
                    user=user,
                    skill=skill,
                    level=level,
                    notes=notes or "",
                    last_updated_by=actor,
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
                "username": "mrossi",
                "email": "m.rossi@example.com",
                "skill_code": "AWS",
                "level": 4,
                "notes": "Runs the production landing zone",
            },
            {
                "username": "ahoxha",
                "email": "a.hoxha@example.com",
                "skill_code": "PYTHON",
                "level": 3,
                "notes": "",
            },
        ]
