from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from apps.users.models import UserProfile
from apps.leave_management.models import LeaveBalance, GlobalSettings


class Command(BaseCommand):
    help = "Backfill hire_date values and ensure current-year vacation balances exist for every user."

    def add_arguments(self, parser):
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Target year for ensuring balances. Defaults to current year.",
        )

    def handle(self, *args, **options):
        current_date = timezone.now().date()
        target_year = options.get("year") or current_date.year
        settings_obj, _ = GlobalSettings.objects.get_or_create(pk=1)

        profiles = UserProfile.objects.select_related("user")
        updated_profiles = 0
        created_balances = 0

        with transaction.atomic():
            for profile in profiles:
                hire_date = profile.hire_date
                if not hire_date:
                    hire_date = (profile.user.date_joined.date() if profile.user.date_joined else current_date)
                    profile.hire_date = hire_date
                    profile.save(update_fields=["hire_date"])
                    updated_profiles += 1

                balance, created = LeaveBalance.objects.get_or_create(
                    user=profile.user,
                    leave_type="vacation",
                    year=target_year,
                    is_carry_over=False,
                    defaults={
                        "total_days": settings_obj.default_yearly_leave_days,
                        "accrual_start_date": hire_date,
                    },
                )
                if created:
                    created_balances += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Completed: hire_date updates {updated_profiles}, new balances {created_balances}, target year {target_year}."
            )
        )
