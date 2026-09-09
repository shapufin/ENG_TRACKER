"""
Importer for bulk-importing users from CSV/Excel files.
"""

from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from apps.users.models import Team, Tech
from apps.users.services.user_creation import (
    create_user_with_profile,
    generate_random_password,
    update_user_profile,
)
from .base import (
    UPDATE_EXISTING_OPTION,
    BaseImporter,
    ImportField,
    ImportOption,
    ImportRowResult,
)
from .authority import StaffOnlyAuthority
from .registry import register

PASSWORD_STRATEGY_CHOICES = [
    ("generate", "Generate a random password per user"),
    ("fixed", "Use a fixed default password for all users"),
    ("column", "Use the mapped Password column"),
]


@register
class UserImporter(StaffOnlyAuthority, BaseImporter):
    target_key = "users"
    display_name = "Users"
    description = (
        "Import or update users from CSV/Excel. Supports arbitrary column "
        "names and optional default/generated passwords."
    )
    icon = "Users"
    page_route = "/admin/users"

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="username",
                label="Username",
                required=True,
                field_type="string",
                help_text="Unique username. Used to match existing users.",
            ),
            ImportField(
                key="email",
                label="Email",
                required=True,
                field_type="email",
                help_text="Email address. Used as a fallback match key.",
            ),
            ImportField(
                key="first_name",
                label="First Name",
                required=False,
                field_type="string",
            ),
            ImportField(
                key="last_name",
                label="Last Name",
                required=False,
                field_type="string",
            ),
            ImportField(
                key="password",
                label="Password",
                required=False,
                field_type="password",
                help_text="Password source controlled by the Password Strategy option.",
            ),
            ImportField(
                key="team_code",
                label="Team Code",
                required=False,
                field_type="string",
                help_text="Must match an existing Team.code.",
            ),
            ImportField(
                key="tech_codes",
                label="Tech Codes",
                required=False,
                field_type="string",
                help_text="Comma-separated Tech codes (e.g. 'INFRA,DB'). Must match existing Tech.code values.",
            ),
            ImportField(
                key="is_hr",
                label="Is HR",
                required=False,
                field_type="bool",
            ),
            ImportField(
                key="is_italian_tl",
                label="Is Italian TL",
                required=False,
                field_type="bool",
            ),
            ImportField(
                key="is_albanian_tl",
                label="Is Albanian TL",
                required=False,
                field_type="bool",
            ),
            ImportField(
                key="phone",
                label="Phone",
                required=False,
                field_type="string",
            ),
            ImportField(
                key="hire_date",
                label="Hire Date",
                required=False,
                field_type="date",
            ),
            ImportField(
                key="is_active",
                label="Active",
                required=False,
                field_type="bool",
                help_text="Defaults to true for new users.",
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "username": ["username", "user", "user name", "user_id", "userid", "login", "name"],
            "email": ["email", "email address", "e-mail", "mail"],
            "first_name": ["first name", "firstname", "first_name", "first", "given name"],
            "last_name": ["last name", "lastname", "last_name", "last", "surname", "family name"],
            "password": ["password", "pass", "pwd"],
            "team_code": ["team code", "team_code", "team", "department", "dept"],
            "tech_codes": ["tech codes", "tech_codes", "tech", "technology", "technologies", "specialty", "specialties"],
            "is_hr": ["hr", "is_hr", "hr user", "is_hr_user"],
            "is_italian_tl": ["italian tl", "is_italian_tl", "italian team leader", "is_italian_tl_role"],
            "is_albanian_tl": ["albanian tl", "is_albanian_tl", "albanian team leader", "is_albanian_tl_role"],
            "phone": ["phone", "phone number", "telephone", "mobile"],
            "hire_date": ["hire date", "hire_date", "start date", "started", "date hired"],
            "is_active": ["active", "is_active", "enabled", "status"],
        }

    def get_dedupe_keys(self) -> List[str]:
        return ["username"]

    def get_options(self) -> List[ImportOption]:
        return [
            UPDATE_EXISTING_OPTION,
            ImportOption(
                key="match_by_email",
                label="Match by email if username not found",
                option_type="bool",
                default=False,
                help_text="Useful when the export has different usernames.",
            ),
            ImportOption(
                key="password_strategy",
                label="Password strategy",
                option_type="choice",
                default="generate",
                choices=PASSWORD_STRATEGY_CHOICES,
            ),
            ImportOption(
                key="default_password",
                label="Default password",
                option_type="secret",
                default="",
                help_text="Applied to every new user.",
                depends_on={"password_strategy": "fixed"},
            ),
            ImportOption(
                key="overwrite_existing_password",
                label="Overwrite existing passwords",
                option_type="bool",
                default=False,
                help_text="Change existing users' passwords when updating.",
            ),
        ]

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "username": "mrossi",
                "email": "m.rossi@example.com",
                "first_name": "Marco",
                "last_name": "Rossi",
                "team_code": "ENG",
                "tech_codes": "INFRA,DB",
                "is_hr": False,
                "is_italian_tl": False,
                "is_albanian_tl": False,
                "phone": "+39 02 1234567",
                "hire_date": "2024-01-15",
                "is_active": True,
            },
            {
                "username": "ahoxha",
                "email": "a.hoxha@example.com",
                "first_name": "Arben",
                "last_name": "Hoxha",
                "team_code": "ENG",
                "tech_codes": "INFRA",
                "is_hr": False,
                "is_italian_tl": False,
                "is_albanian_tl": True,
                "phone": "+355 4 1234567",
                "hire_date": "2024-03-01",
                "is_active": True,
            },
        ]

    def _resolve_existing_user(self, mapped_row: Dict[str, Any], options: Dict[str, Any]) -> Optional[User]:
        """Find an existing user by username, or by email if allowed."""
        username = mapped_row.get("username")
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                pass

        if options.get("match_by_email") and mapped_row.get("email"):
            try:
                return User.objects.get(email=mapped_row["email"])
            except User.DoesNotExist:
                pass

        return None

    def _resolve_team(self, mapped_row: Dict[str, Any]) -> Optional[Team]:
        team_code = mapped_row.get("team_code")
        if not team_code:
            return None
        try:
            return Team.objects.get(code=team_code)
        except Team.DoesNotExist:
            raise ValueError(f'Team with code "{team_code}" does not exist.')

    def _resolve_techs(self, mapped_row: Dict[str, Any]) -> Optional[list]:
        """Resolve comma-separated tech codes to Tech IDs.

        Returns None if no tech_codes column is present (so callers can
        distinguish "column absent" from "column empty"). Returns [] for
        an empty value (meaning: clear all tech assignments).
        """
        raw = mapped_row.get("tech_codes")
        if raw is None:
            return None
        raw_str = str(raw).strip()
        if not raw_str:
            return []
        codes = [c.strip().upper() for c in raw_str.split(",") if c.strip()]
        if not codes:
            return []
        techs = list(Tech.objects.filter(code__in=codes))
        found_codes = {t.code for t in techs}
        missing = sorted(set(codes) - found_codes)
        if missing:
            raise ValueError(f'Unknown Tech code(s): {", ".join(missing)}')
        return [t.id for t in techs]

    def _normalize_bool(self, value: Any) -> Optional[bool]:
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return value
        lowered = str(value).lower().strip()
        if lowered in ("true", "1", "yes", "y"):
            return True
        if lowered in ("false", "0", "no", "n"):
            return False
        return None

    def _validate_password_strategy(self, options: Dict[str, Any]) -> Optional[str]:
        strategy = options.get("password_strategy", "generate")
        if strategy == "fixed":
            password = options.get("default_password", "")
            if not password:
                return "Password strategy is 'fixed' but no default password was provided."
            try:
                validate_password(password)
            except ValidationError as e:
                return "; ".join(e.messages)
        return None

    def _get_password_for_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        existing: Optional[User],
    ) -> tuple[str, bool]:
        """
        Return (password, was_generated) for the row. For existing users the
        password is only returned when the strategy explicitly overwrites it.
        """
        strategy = options.get("password_strategy", "generate")

        if existing is not None and not options.get("overwrite_existing_password"):
            return "", False

        if strategy == "column":
            column_password = mapped_row.get("password", "")
            if column_password:
                return str(column_password), False
            if existing is None:
                return generate_random_password(), True
            return "", False

        if strategy == "fixed":
            return options.get("default_password", ""), False

        # generate (default)
        return generate_random_password(), True

    def validate_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> ImportRowResult:
        strategy_error = self._validate_password_strategy(options)
        if strategy_error:
            return ImportRowResult(
                row_index=mapped_row.get("__row_index", 0),
                status="error",
                errors=[strategy_error],
            )
        return super().validate_row(mapped_row, options, existing=existing, context=context)

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
        warnings: List[str] = []
        extra: Dict[str, Any] = {}

        existing_user = existing
        if existing_user is None:
            existing_user = self._resolve_existing_user(mapped_row, options)

        update_existing = bool(options.get("update_existing", False))

        try:
            team = None
            if mapped_row.get("team_code"):
                team = self._resolve_team(mapped_row)

            tech_ids = self._resolve_techs(mapped_row)

            if existing_user is not None:
                if not update_existing:
                    return ImportRowResult(
                        row_index=row_index,
                        status="skipped",
                        warnings=["User already exists."],
                    )

                # Build update kwargs: only pass non-None values.
                update_kwargs: Dict[str, Any] = {}
                for key in ("first_name", "last_name", "phone", "hire_date"):
                    if mapped_row.get(key) is not None:
                        update_kwargs[key] = mapped_row[key]

                for key in ("is_hr", "is_italian_tl", "is_albanian_tl"):
                    val = self._normalize_bool(mapped_row.get(key))
                    if val is not None:
                        update_kwargs[key] = val

                is_active = self._normalize_bool(mapped_row.get("is_active"))
                if is_active is not None:
                    update_kwargs["is_active"] = is_active

                if team is not None:
                    update_kwargs["team"] = team

                if tech_ids is not None:
                    update_kwargs["techs"] = tech_ids

                if not dry_run:
                    update_user_profile(existing_user, **update_kwargs)

                    # Password overwrite is handled separately because it must
                    # set user.password directly, not the profile.
                    password, _ = self._get_password_for_row(mapped_row, options, existing_user)
                    if password:
                        existing_user.set_password(password)
                        existing_user.save(update_fields=["password"])
                        extra["password"] = password
                        warnings.append("Existing user's password was overwritten.")

                return ImportRowResult(
                    row_index=row_index,
                    status="updated" if not dry_run else "valid",
                    warnings=warnings,
                    extra=extra,
                )

            # Create new user
            username = mapped_row.get("username")
            email = mapped_row.get("email")
            if not username or not email:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["Username and email are required for new users."],
                )

            password, was_generated = self._get_password_for_row(mapped_row, options, None)
            if not password:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["No password could be determined for new user."],
                )

            if not dry_run:
                create_kwargs = {
                    "username": username,
                    "email": email,
                    "password": password,
                    "first_name": mapped_row.get("first_name", "") or "",
                    "last_name": mapped_row.get("last_name", "") or "",
                    "phone": mapped_row.get("phone", "") or "",
                    "team": team,
                    "techs": tech_ids if tech_ids is not None else None,
                    "is_hr": self._normalize_bool(mapped_row.get("is_hr")) or False,
                    "is_italian_tl_role": self._normalize_bool(mapped_row.get("is_italian_tl")) or False,
                    "is_albanian_tl_role": self._normalize_bool(mapped_row.get("is_albanian_tl")) or False,
                    "hire_date": mapped_row.get("hire_date"),
                    "is_active": self._normalize_bool(mapped_row.get("is_active")) if mapped_row.get("is_active") is not None else True,
                }
                create_user_with_profile(**create_kwargs)

            extra["password"] = password
            extra["password_generated"] = was_generated
            return ImportRowResult(
                row_index=row_index,
                status="created" if not dry_run else "valid",
                warnings=warnings,
                extra=extra,
            )

        except ValueError as e:
            return ImportRowResult(
                row_index=row_index,
                status="error",
                errors=[str(e)],
            )
        except Exception as e:  # noqa: BLE001
            return ImportRowResult(
                row_index=row_index,
                status="error",
                errors=[f"Unexpected error: {str(e)}"],
            )