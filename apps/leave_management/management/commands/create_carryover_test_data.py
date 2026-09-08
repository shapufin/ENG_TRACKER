from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from apps.leave_management.models import LeaveBalance, GlobalSettings
from decimal import Decimal


class Command(BaseCommand):
    help = 'Create test data for carry-over balance scenarios'

    def handle(self, *args, **options):
        # Ensure GlobalSettings exists
        settings, _ = GlobalSettings.objects.get_or_create(pk=1)

        current_year = timezone.now().year
        prev_year = current_year - 1

        # Test scenarios:
        # 1. User with carry-over in January (before March 31)
        # 2. User with carry-over in April (after March 31)
        # 3. User with expired carry-over
        # 4. User without carry-over (current year only)

        scenarios = [
            {
                'username': 'test_user_jan_carryover',
                'first_name': 'Test',
                'last_name': 'User Jan',
                'year': current_year,
                'carry_over_days': 5.0,
                'current_year_days': 22.0,
                'description': 'User with carry-over in January'
            },
            {
                'username': 'test_user_april_carryover',
                'first_name': 'Test',
                'last_name': 'User April',
                'year': current_year,
                'carry_over_days': 3.0,
                'current_year_days': 22.0,
                'description': 'User with carry-over in April (expired)'
            },
            {
                'username': 'test_user_no_carryover',
                'first_name': 'Test',
                'last_name': 'User No Carry',
                'year': current_year,
                'carry_over_days': 0,
                'current_year_days': 22.0,
                'description': 'User without carry-over'
            },
        ]

        for scenario in scenarios:
            user, created = User.objects.get_or_create(
                username=scenario['username'],
                defaults={
                    'first_name': scenario['first_name'],
                    'last_name': scenario['last_name'],
                    'email': f'{scenario["username"]}@test.com'
                }
            )

            # Create or update carry-over balance
            if scenario['carry_over_days'] > 0:
                carry_over_expiry = timezone.datetime(
                    current_year, settings.carry_over_expiry_month, settings.carry_over_expiry_day
                ).date()

                LeaveBalance.objects.update_or_create(
                    user=user,
                    leave_type='vacation',
                    year=prev_year,
                    is_carry_over=True,
                    defaults={
                        'total_days': Decimal(scenario['carry_over_days']),
                        'expires_at': carry_over_expiry
                    }
                )

            # Create or update current year balance
            LeaveBalance.objects.update_or_create(
                user=user,
                leave_type='vacation',
                year=scenario['year'],
                is_carry_over=False,
                defaults={
                    'total_days': Decimal(scenario['current_year_days']),
                    'accrual_start_date': timezone.now().date()
                }
            )

            self.stdout.write(f'Created/updated: {scenario["description"]}')

        self.stdout.write(self.style.SUCCESS('Test data created successfully'))
