"""
Importer for bulk-importing leave balances.
"""

from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from django.contrib.auth.models import User

from apps.leave_management.models import LeaveBalance
from .base import BaseImporter, ImportField, ImportRowResult
from .registry import register


@register
class LeaveBalanceImporter(BaseImporter):
    target_key = "leave_balances"
    display_name = "Leave Balances"
    description = (
        "Import or update leave balances per user per year. Existing users must "
        "already exist; this importer does not create users."
    )

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="username",
                label="Username",
                required=True,
                field_type="string",
                help_text="Username of an existing user. Used to match the user.",
            ),
            ImportField(
                key="email",
                label="Email",
                required=False,
                field_type="email",
                help_text="Fallback to match an existing user when username is missing.",
            ),
            ImportField(
                key="leave_type",
                label="Leave Type",
                required=True,
                field_type="choice",
                choices=LeaveBalance.LEAVE_TYPE_CHOICES,
                help_text="Type of leave balance.",
            ),
            ImportField(
                key="year",
                label="Year",
                required=True,
                field_type="integer",
            ),
            ImportField(
                key="total_days",
                label="Total Days",
                required=True,
                field_type="decimal",
            ),
            ImportField(
                key="used_days",
                label="Used Days",
                required=False,
                field_type="decimal",
                help_text="Defaults to 0.",
            ),
            ImportField(
                key="pending_days",
                label="Pending Days",
                required=False,
                field_type="decimal",
                help_text="Defaults to 0.",
            ),
            ImportField(
                key="is_carry_over",
                label="Carry Over",
                required=False,
                field_type="bool",
                help_text="Defaults to false.",
            ),
            ImportField(
                key="expires_at",
                label="Carry-Over Expiry",
                required=False,
                field_type="date",
                help_text="Only meaningful if Carry Over is true.",
            ),
            ImportField(
                key="accrual_start_date",
                label="Accrual Start Date",
                required=False,
                field_type="date",
                help_text="Defaults to the matched user's hire_date if left empty.",
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "username": ["username", "user", "user name", "employee", "employee id"],
            "email": ["email", "email address", "e-mail"],
            "leave_type": ["leave type", "leave_type", "type", "vacation type"],
            "year": ["year"],
            "total_days": ["total days", "total_days", "days", "balance", "allowance"],
            "used_days": ["used days", "used_days", "used"],
            "pending_days": ["pending days", "pending_days", "pending"],
            "is_carry_over": ["carry over", "carry_over", "carryover", "carried over"],
            "expires_at": ["expires", "expiry date", "expires_at", "expiration"],
            "accrual_start_date": ["accrual start", "accrual_start_date", "start date", "hire date"],
        }

    def get_dedupe_keys(self) -> List[str]:
        # The real model constraint is (user, leave_type, year, is_carry_over).
        return ["user", "leave_type", "year", "is_carry_over"]

    def _resolve_user(self, mapped_row: Dict[str, Any]) -> Optional[User]:
        username = mapped_row.get("username")
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                pass
        email = mapped_row.get("email")
        if email:
            try:
                return User.objects.get(email=email)
            except User.DoesNotExist:
                pass
        return None

    def _parse_bool(self, value: Any) -> bool:
        if value is None or value == "":
            return False
        if isinstance(value, bool):
            return value
        lowered = str(value).lower().strip()
        return lowered in ("true", "1", "yes", "y")

    def _parse_decimal(self, value: Any, field_name: str) -> Decimal:
        if value is None or value == "":
            raise ValueError(f"{field_name} is required.")
        try:
            # pandas can return float NaN for empty cells; treat as error for required fields
            if isinstance(value, float):
                import math
                if math.isnan(value):
                    raise ValueError(f"{field_name} is empty.")
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError) as e:
            raise ValueError(f"{field_name} must be a valid number.") from e

    def _parse_int(self, value: Any, field_name: str) -> int:
        if value is None or value == "":
            raise ValueError(f"{field_name} is required.")
        try:
            return int(float(value))
        except (ValueError, TypeError) as e:
            raise ValueError(f"{field_name} must be a valid integer.") from e

    def _coerce_leave_type(self, value: Any) -> str:
        if value is None or value == "":
            raise ValueError("leave_type is required.")
        normalized = str(value).lower().strip()
        valid = {code for code, _ in LeaveBalance.LEAVE_TYPE_CHOICES}
        if normalized in valid:
            return normalized
        # Accept display labels too
        for code, label in LeaveBalance.LEAVE_TYPE_CHOICES:
            if normalized == label.lower().strip():
                return code
        raise ValueError(f"leave_type '{value}' is not valid. Allowed: {', '.join(sorted(valid))}.")

    def _validate_decimal_positive(self, value: Decimal, field_name: str) -> Optional[str]:
        if value < 0:
            return f"{field_name} cannot be negative."
        return None

    def commit_row(
        self,
        mapped_row: Dict[str, Any],
        options: Dict[str, Any],
        *,
        existing: Optional[Any] = None,
        dry_run: bool = False
    ) -> ImportRowResult:
        row_index = mapped_row.get("__row_index", 0)
        warnings: List[str] = []

        try:
            user = self._resolve_user(mapped_row)
            if not user:
                return ImportRowResult(
                    row_index=row_index,
                    status="error",
                    errors=["No existing user matches the provided username or email. Import users first."],
                )

            leave_type = self._coerce_leave_type(mapped_row.get("leave_type"))
            year = self._parse_int(mapped_row.get("year"), "year")
            total_days = self._parse_decimal(mapped_row.get("total_days"), "total_days")
            used_days = self._parse_decimal(mapped_row.get("used_days", "0") or "0", "used_days")
            pending_days = self._parse_decimal(mapped_row.get("pending_days", "0") or "0", "pending_days")
            is_carry_over = self._parse_bool(mapped_row.get("is_carry_over"))
            expires_at = mapped_row.get("expires_at") or None
            accrual_start_date = mapped_row.get("accrual_start_date") or None

            err = self._validate_decimal_positive(total_days, "total_days")
            if err:
                return ImportRowResult(row_index=row_index, status="error", errors=[err])
            err = self._validate_decimal_positive(used_days, "used_days")
            if err:
                return ImportRowResult(row_index=row_index, status="error", errors=[err])
            err = self._validate_decimal_positive(pending_days, "pending_days")
            if err:
                return ImportRowResult(row_index=row_index, status="error", errors=[err])

            if used_days + pending_days > total_days:
                warnings.append(
                    f"used_days + pending_days ({used_days + pending_days}) exceeds total_days ({total_days})."
                )

            if not accrual_start_date and user.profile and user.profile.hire_date:
                accrual_start_date = user.profile.hire_date
                warnings.append("Accrual start date defaulted to user's hire_date.")

            existing_balance = LeaveBalance.objects.filter(
                user=user,
                leave_type=leave_type,
                year=year,
                is_carry_over=is_carry_over,
            ).first()

            update_existing = bool(options.get("update_existing", False))

            if existing_balance:
                if not update_existing:
                    return ImportRowResult(
                        row_index=row_index,
                        status="skipped",
                        warnings=["Leave balance already exists for this user/type/year/carry-over."],
                    )

                if not dry_run:
                    existing_balance.total_days = total_days
                    existing_balance.used_days = used_days
                    existing_balance.pending_days = pending_days
                    if expires_at is not None:
                        existing_balance.expires_at = expires_at
                    if accrual_start_date is not None:
                        existing_balance.accrual_start_date = accrual_start_date
                    existing_balance.save()

                return ImportRowResult(
                    row_index=row_index,
                    status="updated" if not dry_run else "valid",
                    warnings=warnings,
                )

            if not dry_run:
                LeaveBalance.objects.create(
                    user=user,
                    leave_type=leave_type,
                    year=year,
                    total_days=total_days,
                    used_days=used_days,
                    pending_days=pending_days,
                    is_carry_over=is_carry_over,
                    expires_at=expires_at,
                    accrual_start_date=accrual_start_date,
                )

            return ImportRowResult(
                row_index=row_index,
                status="created" if not dry_run else "valid",
                warnings=warnings,
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