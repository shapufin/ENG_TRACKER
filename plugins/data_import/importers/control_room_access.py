"""
Importer for Control Room access grants.

An empty team scope means NO visibility, not global visibility, so a row that
maps no team codes leaves the grant without scopes and warns about it.
"""

from typing import Any, Dict, List, Optional


from apps.users.models import Team
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from .base import row_error_from_exception, BaseImporter, ImportField, ImportRowResult
from .helpers import resolve_user, parse_bool
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
            user = resolve_user(mapped_row)
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

            is_active = parse_bool(mapped_row.get("is_active"))  # None = blank cell
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
                    if is_active is not None:
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
                    is_active=True if is_active is None else is_active,
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

        except Exception as e:  # noqa: BLE001
            return row_error_from_exception(row_index, e)

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

    def _build_dynamic_sample_rows(self) -> List[Dict[str, Any]]:
        from django.contrib.auth.models import User
        users = list(User.objects.filter(is_active=True).order_by("username")[:2])
        teams = list(Team.objects.all().order_by("code")[:2])
        if not users and not teams:
            return []

        u1 = users[0].username if users else "mrossi"
        e1 = users[0].email if users else "m.rossi@example.com"
        u2 = users[1].username if len(users) > 1 else u1
        e2 = users[1].email if len(users) > 1 else e1

        t1 = teams[0].code if teams else "ENG"
        t2 = f"{t1},{teams[1].code}" if len(teams) > 1 else t1

        return [
            {
                "username": u1,
                "email": e1,
                "team_codes": t1,
                "display_name": users[0].get_full_name() or u1 if users else "Marco Rossi",
                "timezone": "Europe/Rome",
                "is_active": True,
            },
            {
                "username": u2,
                "email": e2,
                "team_codes": t2,
                "display_name": (
                    users[1].get_full_name() or u2
                    if len(users) > 1
                    else (users[0].get_full_name() if users else "Arben Hoxha")
                ),
                "timezone": "Europe/Tirane",
                "is_active": True,
            },
        ]

    def get_field_dropdowns(self) -> Dict[str, List[str]]:
        from django.contrib.auth.models import User
        dropdowns = super().get_field_dropdowns()
        users = list(
            User.objects.filter(is_active=True)
            .values_list("username", flat=True)
            .order_by("username")[:50]
        )
        teams = list(Team.objects.values_list("code", flat=True).order_by("code")[:50])
        if users:
            dropdowns["username"] = users
        if teams:
            dropdowns["team_codes"] = teams
        return dropdowns

    def get_reference_data(self) -> Dict[str, List[Dict[str, Any]]]:
        from django.contrib.auth.models import User
        ref: Dict[str, List[Dict[str, Any]]] = {}
        teams = [
            {"Team Code": t.code, "Team Name": t.name}
            for t in Team.objects.all().order_by("code")
        ]
        if teams:
            ref["Active Teams"] = teams
        users = [
            {"Username": u.username, "Full Name": u.get_full_name() or u.username}
            for u in User.objects.filter(is_active=True).order_by("username")[:50]
        ]
        if users:
            ref["Active Employees"] = users
        return ref
