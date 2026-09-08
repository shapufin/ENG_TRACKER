"""Management command to seed default Albanian payroll rules (Boshti reference).

Creates a reference rule set with tax brackets, contribution rates, and
overtime categories derived from the Boshti calculator examples. These
rules are labeled as 'reference' and must be verified against official
Albanian tax/social-security sources before production use.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from plugins.payroll.models import (
    PayrollConfiguration,
    PayrollContributionRate,
    PayrollOvertimeCategory,
    PayrollRuleSet,
    PayrollTaxBracket,
)


class Command(BaseCommand):
    help = 'Seed default Albanian payroll rules (Boshti reference 2026).'

    @transaction.atomic
    def handle(self, *args, **options):
        # Ensure configuration singleton exists
        config = PayrollConfiguration.get_singleton()
        config.rules_source_label = 'Boshti reference 2026'
        config.rules_validation_status = 'reference'
        config.save()

        # Create or update the reference rule set
        rule_set, created = PayrollRuleSet.objects.update_or_create(
            code='AL_2026_BOSHTI_REFERENCE',
            defaults={
                'name': 'Albania 2026 (Boshti Reference)',
                'version': '1.0',
                'country': 'AL',
                'effective_from': '2026-01-01',
                'effective_to': None,
                'is_active': True,
                'tax_profile': 'standard',
                'source': 'https://boshti.com/calc/index.html (reference, not official)',
                'notes': 'Derived from Boshti calculator examples. '
                         'Must be verified against official Albanian tax/social-security sources.',
                'validation_status': 'reference',
            },
        )

        # --- Tax brackets ---
        # Albanian 2026 income tax (reference):
        # 0–30,000: 0%
        # 30,001–200,000: 13% on the amount above 30,000
        # 200,001+: 23% on the amount above 200,000 + tax from previous bracket
        #
        # Boshti reference: income tax is progressive on gross taxable earnings,
        # without subtracting employee contributions before applying brackets.
        PayrollTaxBracket.objects.filter(rule_set=rule_set).delete()
        brackets = [
            PayrollTaxBracket(
                rule_set=rule_set, lower_bound=Decimal('0'),
                upper_bound=Decimal('30000'), rate=Decimal('0'), fixed_amount=Decimal('0'),
                order=0,
            ),
            PayrollTaxBracket(
                rule_set=rule_set, lower_bound=Decimal('30000'),
                upper_bound=Decimal('200000'), rate=Decimal('0.13'), fixed_amount=Decimal('0'),
                order=1,
            ),
            PayrollTaxBracket(
                rule_set=rule_set, lower_bound=Decimal('200000'),
                upper_bound=None, rate=Decimal('0.23'), fixed_amount=Decimal('0'),
                order=2,
            ),
        ]
        PayrollTaxBracket.objects.bulk_create(brackets)

        # --- Contribution rates ---
        # Based on official Albanian tax authority (tatime.gov.al) and PwC:
        # Employee social: 9.5% (capped at 186,416)
        # Employee health: 1.7% (uncapped — on full gross)
        # Employer social: 15% (capped at 186,416)
        # Employer health: 1.7% (uncapped — on full gross)
        # Total employer: 16.7%. Social cap: 186,416 Lek/month in 2026.
        # Health insurance has a floor of 50,000 but no cap (per tatime.gov.al).
        PayrollContributionRate.objects.filter(rule_set=rule_set).delete()
        contributions = [
            PayrollContributionRate(
                rule_set=rule_set, contribution_type='social', side='employee',
                rate=Decimal('0.095'),
                cap=Decimal('186416'), floor=None,
            ),
            PayrollContributionRate(
                rule_set=rule_set, contribution_type='health', side='employee',
                rate=Decimal('0.017'),
                cap=None, floor=None,
            ),
            PayrollContributionRate(
                rule_set=rule_set, contribution_type='social', side='employer',
                rate=Decimal('0.15'),
                cap=Decimal('186416'), floor=None,
            ),
            PayrollContributionRate(
                rule_set=rule_set, contribution_type='health', side='employer',
                rate=Decimal('0.017'),
                cap=None, floor=None,
            ),
        ]
        PayrollContributionRate.objects.bulk_create(contributions)

        # --- Overtime categories ---
        # Albanian labour code overtime multipliers (reference):
        # Weekday daytime: 1.25x (125%); Saturday follows this category.
        # Weekday night: 1.30x (130%); Saturday follows this category.
        # Sunday daytime: 1.25x (125%)
        # Sunday night: 1.30x (130%)
        # Public holiday: 1.50x (150%)
        # Night window: 22:00–06:00
        PayrollOvertimeCategory.objects.filter(rule_set=rule_set).delete()
        categories = [
            PayrollOvertimeCategory(
                rule_set=rule_set, code='weekday_day',
                multiplier=Decimal('1.25'),
                night_start_hour=None, night_end_hour=None,
                applies_weekend=False, applies_holiday=False,
                order=0,
            ),
            PayrollOvertimeCategory(
                rule_set=rule_set, code='weekday_night',
                multiplier=Decimal('1.30'),
                night_start_hour=22, night_end_hour=6,
                applies_weekend=False, applies_holiday=False,
                order=1,
            ),
            PayrollOvertimeCategory(
                rule_set=rule_set, code='weekend_day',
                multiplier=Decimal('1.25'),
                night_start_hour=None, night_end_hour=None,
                applies_weekend=True, applies_holiday=False,
                order=2,
            ),
            PayrollOvertimeCategory(
                rule_set=rule_set, code='weekend_night',
                multiplier=Decimal('1.30'),
                night_start_hour=22, night_end_hour=6,
                applies_weekend=True, applies_holiday=False,
                order=3,
            ),
            PayrollOvertimeCategory(
                rule_set=rule_set, code='holiday',
                multiplier=Decimal('1.50'),
                night_start_hour=None, night_end_hour=None,
                applies_weekend=False, applies_holiday=True,
                order=4,
            ),
        ]
        PayrollOvertimeCategory.objects.bulk_create(categories)

        action = 'Created' if created else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(
                f'{action} reference rule set "{rule_set.code}" with '
                f'{len(brackets)} tax brackets, {len(contributions)} contribution rates, '
                f'{len(categories)} overtime categories.'
            )
        )
