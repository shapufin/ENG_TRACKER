"""
Importer for Control Room access grants.

An empty team scope means NO visibility, not global visibility, so a row that
maps no team codes leaves the grant without scopes and warns about it.
"""

from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User

from apps.users.models import Team
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from .base import BaseImporter, ImportField, ImportRowResult
from .authority import ControlRoomAuthority
from .registry import register


@register
class ControlRoomAccessImporter(ControlRoomAuthority, BaseImporter):
    target_key = "control_room_access"
    display_name = "Control Room Access"
    description = (
        "Grant existing users access to the Control Room dashboard and scope "
        "which teams they may observe. Users are not created."
    )
    icon = "MonitorCog"
    page_route = "/admin/control-room-access"

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
                key="team_codes",
                label="Team Codes",
                required=False,
                field_type="string",
                help_text=(
                    "Comma-separated Team codes the user may observe. "
                    "Empty means no visibility."
                ),
            ),
            ImportField(
                key="display_name",
                label="Display Name",
                required=False,
                field_type="string",
                help_text="Optional dashboard label; defaults to the user's full name.",
            ),
            ImportField(
                key="timezone",
                label="Display Timezone",
                required=False,
                field_type="string",
            ),
            ImportField(
                key="is_active",
                label="Active",
                required=False,
                field_type="bool",
                help_text="Defaults to true. Inactive denies access even with scopes.",
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "username": ["username", "user", "user name", "login", "employee"],
            "email": ["email", "email address", "e-mail", "mail"],
            "team_codes": ["team codes", "team_codes", "teams", "team", "scope", "scopes"],
            "display_name": ["display name", "display_name", "label", "full name"],
            "timezone": ["timezone", "time zone", "tz"],
            "is_active": ["active", "is_active", "enabled", "status"],
        }

    def get_dedupe_keys(self) -> List[str]:
        return ["username"]

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

    def _resolve_teams(self, mapped_row: Dict[str, Any]) -> Optional[List[Team]]:
        """Return the scoped teams, or None when no team column is mapped."""
        raw = mapped_row.get("team_codes")
        if raw is None:
            return None
        codes = [c.strip() for c in str(raw).split(",") if c.strip()]
        if not codes:
            return []
        teams = list(Team.objects.filter(code__in=codes))
        missing = sorted(set(codes) - {t.code for t in teams})
        if missing:
            raise ValueError(f'Unknown Team code(s): {", ".join(missing)}')
        return teams

    def _parse_bool(self, value: Any, default: bool) -> bool:
        if value is None or value == "":
            return default
        if isinstance(value, bool):
            return value
        return str(value).lower().strip() in ("true", "1", "yes", "y")

    def _sync_scopes(self, access: ControlRoomAccess, teams: List[Team], actor) -> None:
        wanted = {t.id for t in teams}
        current = set(access.team_scopes.values_list("team_id", flat=True))
        access.team_scopes.filter(team_id__in=current - wanted).delete()
        for team in teams:
            if team.id not in current:
                ControlRoomTeamScope.objects.create(
                    access=access, team=team, created_by=actor
                )

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
        warnings: List[str] = []

        try:
            user = self._resolve_user(mapped_row)
            if user is None:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["No existing user matches the provided username or email."],
                )

            teams = self._resolve_teams(mapped_row)
            if teams == []:
                warnings.append(
                    "No team codes given — this grant has no visibility into any team."
                )

            is_active = self._parse_bool(mapped_row.get("is_active"), True)
            display_name = mapped_row.get("display_name")
            timezone_value = mapped_row.get("timezone")

            access = existing
            if access is None:
                access = ControlRoomAccess.objects.filter(user=user).first()

            if access is not None:
                if not options.get("update_existing"):
                    return ImportRowResult(
                        row_index=row_index,
                        status="skipped",
                        warnings=["This user already has a Control Room access record."],
                    )
                if not dry_run:
                    access.is_active = is_active
                    if display_name is not None:
                        access.display_name = display_name
                    if timezone_value is not None:
                        access.timezone = timezone_value
                    access.updated_by = actor
                    access.save()
                    if teams is not None:
                        self._sync_scopes(access, teams, actor)
                return ImportRowResult(
                    row_index=row_index,
                    status="updated" if not dry_run else "valid",
                    warnings=warnings,
                )

            if not dry_run:
                access = ControlRoomAccess.objects.create(
                    user=user,
                    is_active=is_active,
                    display_name=display_name or "",
                    timezone=timezone_value or "",
                    created_by=actor,
                    updated_by=actor,
                )
                if teams:
                    self._sync_scopes(access, teams, actor)

            return ImportRowResult(
                row_index=row_index,
                status="created" if not dry_run else "valid",
                warnings=warnings,
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
                "team_codes": "ENG,ENG-DB",
                "display_name": "Marco Rossi",
                "timezone": "Europe/Rome",
                "is_active": True,
            },
            {
                "username": "ahoxha",
                "email": "a.hoxha@example.com",
                "team_codes": "ENG",
                "display_name": "Arben Hoxha",
                "timezone": "Europe/Tirane",
                "is_active": True,
            },
        ]
