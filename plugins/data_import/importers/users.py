"""
Importer for bulk-importing users from CSV/Excel files.
"""

from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models.functions import Lower

from apps.users.models import Team, Tech, TechLevel
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
                help_text="Comma-separated Tech codes, optionally with a level "
                          "(e.g. 'INFRA:L3,DB'). Must match existing Tech.code "
                          "and that Tech's TechLevel.code values.",
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
                key="italian_tl_username",
                label="Italian TL Username",
                required=False,
                field_type="string",
                help_text="Username of an existing user who leads this person. "
                          "The leader is not created. Blank leaves any existing "
                          "link alone.",
            ),
            ImportField(
                key="albanian_tl_username",
                label="Albanian TL Username",
                required=False,
                field_type="string",
                help_text="Username of an existing user who leads this person. "
                          "The leader is not created. Blank leaves any existing "
                          "link alone.",
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
            "italian_tl_username": ["italian tl username", "italian_tl_username", "italian_tl", "italian tl user", "reports to italian tl"],
            "albanian_tl_username": ["albanian tl username", "albanian_tl_username", "albanian_tl", "albanian tl user", "reports to albanian tl"],
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
                "tech_codes": "INFRA:L3,DB",
                "is_hr": False,
                "is_italian_tl": False,
                "is_albanian_tl": False,
                "italian_tl_username": "gverdi",
                "albanian_tl_username": "ahoxha",
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
                "italian_tl_username": "gverdi",
                "albanian_tl_username": "",
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
        """Resolve comma-separated tech codes to Tech assignment entries.

        Each entry may carry a level: ``INFRA:L3,DB`` assigns Infrastructure at
        level L3 and Database ungraded. A bare code keeps its existing grade,
        matching the plain-id semantics elsewhere.

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

        pairs = []
        for chunk in raw_str.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            tech_code, _, level_code = chunk.partition(":")
            pairs.append((tech_code.strip().upper(), level_code.strip().upper()))
        if not pairs:
            return []

        techs = {t.code: t for t in Tech.objects.filter(code__in=[c for c, _ in pairs])}
        missing = sorted({code for code, _ in pairs} - set(techs))
        if missing:
            raise ValueError(f'Unknown Tech code(s): {", ".join(missing)}')

        wanted_levels = {(code, level) for code, level in pairs if level}
        levels = {}
        if wanted_levels:
            found = TechLevel.objects.filter(
                tech__code__in=[code for code, _ in wanted_levels],
                code__in=[level for _, level in wanted_levels],
            ).select_related('tech')
            levels = {(lvl.tech.code, lvl.code): lvl.id for lvl in found}
            unknown = sorted(
                f'{code}:{level}' for code, level in wanted_levels
                if (code, level) not in levels
            )
            if unknown:
                raise ValueError(f'Unknown Tech level(s): {", ".join(unknown)}')

        return [
            {'tech': techs[code].id, 'level': levels[(code, level)]}
            if level
            else techs[code].id
            for code, level in pairs
        ]

    def prepare_batch(
        self,
        rows: List[Dict[str, Any]],
        options: Dict[str, Any],
        *,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """Record every username in the file so a forward TL reference resolves.

        The TL chain is mutually referential in real data — every Italian TL
        reports to the one Albanian TL, who in turn reports to an Italian TL — so
        no row order satisfies it. A leader named in the same file is deferred to
        ``finalize_batch``, the same way the teams importer defers
        ``parent_team_code``.

        Also resolves every TL username referenced anywhere in the file to a
        User id in one query, cached in ``leader_ids`` — without this,
        ``_resolve_tl_id`` issued its own ``User.objects.filter(...).first()``
        per TL column per row (up to 2 extra queries per row).
        """
        file_usernames = {
            str(row.get("username")).strip().lower()
            for row in rows
            if row.get("username") not in (None, "")
        }
        referenced_leaders = {
            str(row.get(key)).strip().lower()
            for row in rows
            for key in ("italian_tl_username", "albanian_tl_username")
            if row.get(key) not in (None, "")
        }
        leader_ids = dict(
            User.objects.annotate(username_lower=Lower("username"))
            .filter(username_lower__in=referenced_leaders)
            .values_list("username_lower", "id")
        ) if referenced_leaders else {}
        return {
            "file_usernames": file_usernames,
            "leader_ids": leader_ids,
            "deferred_tls": [],
        }

    def finalize_batch(
        self,
        context: Optional[Dict[str, Any]],
        options: Dict[str, Any],
        *,
        dry_run: bool = False,
    ) -> None:
        """Apply TL links whose leader row came later in the file."""
        if dry_run:
            return None
        for username, field, leader_username in (context or {}).get("deferred_tls", []):
            user = User.objects.filter(username__iexact=username).first()
            leader = User.objects.filter(username__iexact=leader_username).first()
            if user is None or leader is None or user.pk == leader.pk:
                continue
            profile = user.profile
            setattr(profile, field, leader.id)
            profile.save(update_fields=[field])
        return None

    def _resolve_tl_id(
        self,
        mapped_row: Dict[str, Any],
        key: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Optional[int]:
        """Resolve a TL column to a User id, or None when nothing to apply now.

        Blank means "leave this alone", the importer-wide rule, so an existing
        link is never cleared by an empty cell. A leader that exists is linked
        straight away; one that appears elsewhere in the same file is deferred to
        ``finalize_batch``; one that is neither is a row error — this importer
        does not create leaders, and inventing a user to satisfy a reference
        would be worse than failing the row.

        Raises ``ValueError`` so ``commit_row``'s existing handler turns it into
        a clean row error.
        """
        raw = mapped_row.get(key)
        username = str(raw).strip() if raw is not None else ''
        if not username:
            return None
        own_username = str(mapped_row.get('username') or '').strip()
        if username.lower() == own_username.lower():
            raise ValueError(f"A user cannot lead themselves ('{username}').")
        # Resolved once for the whole file in prepare_batch and cached in
        # leader_ids — a dict lookup instead of a DB round trip for the
        # common case. Falls back to a direct query when there is no cache
        # (e.g. commit_row called standalone, without prepare_batch first)
        # or the leader isn't in it for some other reason, so this stays
        # correct even off the real batch-import path.
        leader_ids = (context or {}).get("leader_ids")
        if leader_ids is not None:
            leader_id = leader_ids.get(username.lower())
        else:
            leader = User.objects.filter(username__iexact=username).first()
            leader_id = leader.id if leader else None
        if leader_id is not None:
            return leader_id
        if username.lower() in (context or {}).get("file_usernames", set()):
            field = 'italian_tl_id' if key.startswith('italian') else 'albanian_tl_id'
            (context or {}).setdefault("deferred_tls", []).append(
                (own_username, field, username)
            )
            return None
        raise ValueError(
            f"No user with username '{username}' for {key.replace('_', ' ')}. "
            f"Import or create the leader first."
        )

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
            italian_tl_id = self._resolve_tl_id(
                mapped_row, "italian_tl_username", context
            )
            albanian_tl_id = self._resolve_tl_id(
                mapped_row, "albanian_tl_username", context
            )

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

                # The column keys and ``update_user_profile``'s parameter names
                # differ for the two role flags (``_role`` suffix). Passing the
                # column key straight through raised a TypeError that surfaced as
                # a generic "Unexpected error" row error.
                for key, param in (
                    ("is_hr", "is_hr"),
                    ("is_italian_tl", "is_italian_tl_role"),
                    ("is_albanian_tl", "is_albanian_tl_role"),
                ):
                    val = self._normalize_bool(mapped_row.get(key))
                    if val is not None:
                        update_kwargs[param] = val

                if italian_tl_id is not None:
                    update_kwargs["italian_tl_id"] = italian_tl_id
                if albanian_tl_id is not None:
                    update_kwargs["albanian_tl_id"] = albanian_tl_id

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
                    "italian_tl_id": italian_tl_id,
                    "albanian_tl_id": albanian_tl_id,
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