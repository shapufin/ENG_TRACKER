"""Create a banded-overtime rule set effective from a given month.

The new set is a copy of the source set (brackets, contributions, legacy
overtime categories) with ``overtime_pricing='banded'`` and the company
premiums (overtime 25 %, weekend/holiday 25 %, evening 20 %, night 50 %;
evening from 18:00 (working hours end at 18:00), night 22:00-06:00). It is labelled ``reference`` until
the owner confirms it in writing.

The command only ever CREATES a rule set: the source set and any set a run
references are never modified, and finalized runs are never repriced. Runs
generated for months on or after ``--effective-from`` use the new set; an
existing draft keeps the rule set it was created with (delete the draft and
create it again to move it).
"""
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from plugins.payroll.models import PayrollRuleSet

DEFAULT_SOURCE = 'AL_2026_BOSHTI_REFERENCE'


class Command(BaseCommand):
    help = 'Create a banded overtime rule set (copy of --source-code) effective from a month start.'

    def add_arguments(self, parser):
        parser.add_argument('--effective-from', required=True, help='First day of a month, YYYY-MM-01.')
        parser.add_argument('--source-code', default=DEFAULT_SOURCE)

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            effective_from = date.fromisoformat(options['effective_from'])
        except ValueError as exc:
            raise CommandError('--effective-from must be a date like 2026-12-01.') from exc
        if effective_from.day != 1:
            raise CommandError('--effective-from must be the first day of a month.')

        source = PayrollRuleSet.objects.filter(code=options['source_code']).first()
        if source is None:
            raise CommandError(f'Source rule set "{options["source_code"]}" does not exist.')

        code = f'AL_BANDED_OT_{effective_from:%Y_%m}'
        if PayrollRuleSet.objects.filter(code=code).exists():
            self.stdout.write(f'Rule set {code} already exists; nothing to do.')
            return
        if PayrollRuleSet.has_active_effective_date_conflict(
            source.country, source.tax_profile, effective_from,
        ):
            raise CommandError(
                'Another active rule set already uses this effective date for the same '
                'country and tax profile.'
            )

        target = PayrollRuleSet.objects.create(
            code=code, name=f'{source.name} - banded overtime', version='1.0',
            country=source.country, effective_from=effective_from,
            is_active=True, tax_profile=source.tax_profile,
            source=f'Copy of {source.code}; company overtime schedule',
            notes='Reference: overtime premiums per time band. Not verified as official.',
            validation_status='reference',
            overtime_pricing='banded',
            ot_premium=Decimal('0.25'), weekend_holiday_premium=Decimal('0.25'),
            evening_premium=Decimal('0.20'), night_premium=Decimal('0.50'),
            evening_start_hour=18, night_start_hour=22, night_end_hour=6,
        )
        for children in (source.tax_brackets, source.contribution_rates, source.overtime_categories):
            for child in children.all():
                child.pk = None
                child.rule_set = target
                child.save()
        self.stdout.write(self.style.SUCCESS(f'Created banded rule set {code} effective {effective_from}.'))
