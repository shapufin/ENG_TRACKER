"""
Importer for the Team hierarchy.

Teams reference each other through ``parent_team``, so a file may list a child
before its parent. This importer runs two passes: rows create or update teams
and defer any parent link that is not resolvable yet, then ``finalize_batch``
applies the deferred links once every row has been written.
"""

from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User

from apps.users.models import Team
from .base import ImportField
from .catalog import CodeKeyedImporter
from .authority import StaffOnlyAuthority
from .registry import register


@register
class TeamImporter(StaffOnlyAuthority, CodeKeyedImporter):
    target_key = "teams"
    display_name = "Teams"
    description = (
        "Import or update teams, including the parent-team hierarchy and the "
        "assigned team leader."
    )
    icon = "UsersRound"
    page_route = "/admin/teams"

    model = Team
    scalar_fields = ("name", "calendar_group", "description")

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="code",
                label="Code",
                required=True,
                field_type="string",
                help_text="Unique team code. Used to match existing teams.",
            ),
            ImportField(key="name", label="Name", required=True, field_type="string"),
            ImportField(
                key="parent_team_code",
                label="Parent Team Code",
                required=False,
                field_type="string",
                help_text="Code of the parent team. May appear later in the same file.",
            ),
            ImportField(
                key="team_leader_username",
                label="Team Leader Username",
                required=False,
                field_type="string",
                help_text="Username of an existing user. The user is not created.",
            ),
            ImportField(
                key="calendar_group",
                label="Calendar Group",
                required=False,
                field_type="string",
                help_text="Teams sharing a calendar group share calendar visibility.",
            ),
            ImportField(
                key="description", label="Description", required=False, field_type="string"
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "code": ["code", "team code", "team_code", "short code"],
            "name": ["name", "team", "team name", "team_name", "department"],
            "parent_team_code": [
                "parent team code", "parent_team_code", "parent", "parent team", "parent_code",
            ],
            "team_leader_username": [
                "team leader", "team_leader", "team leader username",
                "team_leader_username", "leader", "manager",
            ],
            "calendar_group": ["calendar group", "calendar_group", "calendar"],
            "description": ["description", "notes", "details"],
        }

    def validate_new(self, values: Dict[str, Any]) -> Optional[str]:
        """``Team.name`` is unique too — report a clash readably."""
        name = values.get("name")
        if name and Team.objects.filter(name=name).exists():
            return f'A different team already uses the name "{name}".'
        return None

    def prepare_batch(self, rows, options, *, dry_run=False) -> Dict[str, Any]:
        """Record every code in the file so a forward parent reference resolves."""
        return {
            "file_codes": {
                str(row.get("code")).strip()
                for row in rows
                if row.get("code") not in (None, "")
            },
            "deferred_parents": [],
        }

    def resolve_relations(self, mapped_row, context) -> Dict[str, Any]:
        values: Dict[str, Any] = {}
        context = context or {}

        parent_code = str(mapped_row.get("parent_team_code") or "").strip()
        own_code = str(mapped_row.get("code") or "").strip()
        if parent_code:
            if parent_code == own_code:
                raise ValueError("A team cannot be its own parent team.")
            parent = Team.objects.filter(code=parent_code).first()
            if parent is not None:
                values["parent_team"] = parent
            elif parent_code in context.get("file_codes", set()):
                # Parent appears later in this file; linked by finalize_batch.
                context.setdefault("deferred_parents", []).append((own_code, parent_code))
            else:
                raise ValueError(f'Parent team with code "{parent_code}" does not exist.')

        leader_username = str(mapped_row.get("team_leader_username") or "").strip()
        if leader_username:
            leader = User.objects.filter(username=leader_username).first()
            if leader is None:
                raise ValueError(f'User "{leader_username}" does not exist.')
            values["team_leader"] = leader

        return values

    def finalize_batch(self, context, options, *, dry_run=False) -> None:
        """Apply parent links whose parent row came later in the file."""
        if dry_run:
            return None
        for own_code, parent_code in context.get("deferred_parents", []):
            team = Team.objects.filter(code=own_code).first()
            parent = Team.objects.filter(code=parent_code).first()
            if team is not None and parent is not None and team.pk != parent.pk:
                team.parent_team = parent
                team.save(update_fields=["parent_team"])
        return None

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "code": "ENG",
                "name": "Engineering",
                "parent_team_code": "",
                "team_leader_username": "mrossi",
                "calendar_group": "engineering",
                "description": "Parent engineering team",
            },
            {
                "code": "ENG-DB",
                "name": "Engineering — Databases",
                "parent_team_code": "ENG",
                "team_leader_username": "ahoxha",
                "calendar_group": "engineering",
                "description": "Database sub-team",
            },
        ]
