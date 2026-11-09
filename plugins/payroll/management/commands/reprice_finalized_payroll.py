"""Reprice FINALIZED payroll runs with a banded-overtime rule set.

DESTRUCTIVE. Finalized payroll is immutable evidence everywhere else in the
app; this command is the one deliberate, audited exception, requested by the
product owner. It rewrites only the overtime-driven numbers of finalized
lines (overtime amount, totals, tax, contributions, net, employer cost,
breakdown, trace) and the matching ledger amounts, then points the run at the
new rule set. Wages, hours, standby, configuration and source entries are
never changed.

Safety rails:
* Dry run by default: prints old -> new per run and user, writes nothing.
* ``--apply`` additionally needs ``--confirm REPRICE-FINALIZED``.
* A JSON backup of every value it will overwrite is written first;
  ``--restore FILE`` (with the same two flags) puts the old values back.
* Each run is repriced all-or-nothing in one transaction and re-read to
  verify. A run is SKIPPED (never guessed) when: its year is closed
  (``reopen_year`` first), its tax/contribution brackets differ from the
  target rule set's, it already uses the target, or ANY of its lines cannot
  first be reproduced exactly from the frozen inputs with its old rule set.

Usage:
    py -3.14 manage.py reprice_finalized_payroll --rule-set AL_BANDED_OT_2026_01
    py -3.14 manage.py reprice_finalized_payroll --rule-set AL_BANDED_OT_2026_01 \\
        --from 2026-01 --to 2026-10 --apply --confirm REPRICE-FINALIZED
"""
import json
from dataclasses import replace
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.overtime.models import OvertimeLog
from apps.users.services.approval_periods import is_year_closed
from plugins.payroll.models import (
    PayrollConfiguration, PayrollLine, PayrollRuleSet, PayrollRun, PayrollRunEntry,
)
from plugins.payroll.services.calculator import (
    OvertimeEntryInput, PayrollCalculationInput, StandbyEntryInput, calculate_payroll,
)
from plugins.payroll.services.payroll_service import (
    _build_contribution_rate_inputs, _build_overtime_band_rules,
    _build_overtime_category_inputs, _build_tax_bracket_inputs,
    _get_source_holidays, aggregate_line_totals,
)

CONFIRM_PHRASE = 'REPRICE-FINALIZED'

# Numeric line columns: compared for reproducibility, backed up, rewritten.
DECIMAL_FIELDS = [
    'overtime_hours', 'overtime_amount', 'standby_hours', 'standby_amount',
    'total_gross', 'taxable_base', 'contribution_base', 'employee_social',
    'employee_health', 'income_tax', 'total_employee_deductions', 'net_pay',
    'employer_social', 'employer_health', 'total_employer_cost',
]
JSON_FIELDS = ['overtime_breakdown', 'carryover_breakdown', 'calculation_trace', 'warnings']
LINE_FIELDS = DECIMAL_FIELDS + JSON_FIELDS + ['rule_set_version']


def _json_safe(value):
    return str(value) if isinstance(value, Decimal) else value


def _line_values(result) -> dict:
    values = {name: getattr(result, name) for name in DECIMAL_FIELDS}
    values['overtime_breakdown'] = {'categories': [
        {'code': b.code, 'hours': str(b.hours), 'multiplier': str(b.multiplier),
         'amount': str(b.amount)}
        for b in result.overtime_breakdown
    ]}
    values['carryover_breakdown'] = result.carryover_breakdown
    values['calculation_trace'] = result.calculation_trace
    values['warnings'] = result.warnings
    values['rule_set_version'] = result.rule_set_version
    return values


def _bracket_signature(rule_set) -> tuple:
    return (
        sorted((b.lower_bound, b.upper_bound, b.rate, b.fixed_amount)
               for b in rule_set.tax_brackets.all()),
        sorted((c.contribution_type, c.side, c.rate, c.cap, c.floor)
               for c in rule_set.contribution_rates.all()),
    )


class Command(BaseCommand):
    help = 'Reprice finalized payroll runs with a banded-overtime rule set (dry run by default).'

    def add_arguments(self, parser):
        parser.add_argument('--rule-set', help='Code of the target banded rule set.')
        parser.add_argument('--from', dest='start', help='First month, YYYY-MM (inclusive).')
        parser.add_argument('--to', dest='end', help='Last month, YYYY-MM (inclusive).')
        parser.add_argument('--run-id', type=int, action='append', default=[],
                            help='Only this run id (repeatable).')
        parser.add_argument('--apply', action='store_true', help='Write the changes.')
        parser.add_argument('--confirm', default='', help=f'Must be {CONFIRM_PHRASE} with --apply.')
        parser.add_argument('--backup-dir', default='payroll_reprice_backups')
        parser.add_argument('--restore', help='Backup JSON file to restore (needs --apply/--confirm).')

    # ------------------------------------------------------------------ entry
    def handle(self, *args, **options):
        if options['apply'] and options['confirm'] != CONFIRM_PHRASE:
            raise CommandError(f'--apply requires --confirm {CONFIRM_PHRASE}.')
        if options['restore']:
            return self._restore(options)
        if not options['rule_set']:
            raise CommandError('--rule-set is required.')
        target = PayrollRuleSet.objects.filter(code=options['rule_set']).first()
        if target is None:
            raise CommandError(f'Rule set "{options["rule_set"]}" does not exist.')
        if target.overtime_pricing != 'banded':
            raise CommandError('The target rule set must use banded overtime pricing.')

        runs = self._select_runs(options)
        if not runs:
            self.stdout.write('No finalized runs match.')
            return
        config = PayrollConfiguration.get_singleton()
        plans, skipped = [], []
        for run in runs:
            plan, reason = self._plan_run(run, target, config)
            if reason:
                skipped.append((run, reason))
            else:
                plans.append(plan)

        self._report(plans, skipped, target)
        if not options['apply']:
            self.stdout.write(self.style.WARNING(
                'DRY RUN - nothing written. Add --apply --confirm '
                f'{CONFIRM_PHRASE} to apply.'
            ))
            return
        if not plans:
            return
        backup = self._write_backup(plans, options['backup_dir'])
        self.stdout.write(f'Backup written: {backup}')
        for plan in plans:
            self._apply_run(plan, target)
        self.stdout.write(self.style.SUCCESS(
            f'Repriced {len(plans)} run(s). To undo: --restore {backup} --apply --confirm {CONFIRM_PHRASE}'
        ))

    # --------------------------------------------------------------- selection
    def _select_runs(self, options):
        queryset = PayrollRun.objects.filter(status='finalized').select_related('rule_set')
        if options['run_id']:
            queryset = queryset.filter(pk__in=options['run_id'])
        runs = list(queryset)
        for key, op in (('start', 'gte'), ('end', 'lte')):
            if options[key]:
                try:
                    year, month = (int(part) for part in options[key].split('-'))
                except ValueError as exc:
                    raise CommandError('--from/--to must look like 2026-03.') from exc
                runs = [r for r in runs if self._cmp(r, year * 12 + month, op)]
        return sorted(runs, key=lambda r: (r.year, r.month))

    @staticmethod
    def _cmp(run, bound, op):
        index = run.year * 12 + run.month
        return index >= bound if op == 'gte' else index <= bound

    # ---------------------------------------------------------------- planning
    def _plan_run(self, run, target, config):
        label = run.period_label
        if is_year_closed(run.year):
            return None, f'{label}: year {run.year} is closed (reopen_year first)'
        if run.rule_set_id == target.pk:
            return None, f'{label}: already uses {target.code}'
        if _bracket_signature(run.rule_set) != _bracket_signature(target):
            return None, f'{label}: tax/contribution brackets differ from {target.code}'

        snapshot = run.configuration_snapshot or {}
        lines = list(run.lines.select_related('user').order_by('user__username'))
        entries = list(run.source_entries.filter(status='finalized'))
        ot_ids = [e.source_id for e in entries if e.source_kind == 'overtime']
        times = {
            pk: (start, end) for pk, start, end in
            OvertimeLog._base_manager.filter(pk__in=ot_ids).values_list('id', 'start_time', 'end_time')
        }
        plan = {'run': run, 'lines': []}
        for line in lines:
            line_entries = [e for e in entries if e.line_id == line.pk]
            ot = [OvertimeEntryInput(
                date=e.work_date, hours=e.hours, start_time=times.get(e.source_id, (None, None))[0],
                end_time=times.get(e.source_id, (None, None))[1], source_id=e.source_id,
                requested_period=e.requested_period, source_status=e.source_status,
            ) for e in line_entries if e.source_kind == 'overtime']
            sb = [StandbyEntryInput(
                date=e.work_date, hours=e.hours, source_id=e.source_id,
                requested_period=e.requested_period, source_status=e.source_status,
            ) for e in line_entries if e.source_kind == 'standby']
            inp = self._frozen_input(run, line, snapshot, config, ot, sb)
            old = calculate_payroll(inp)
            for name in DECIMAL_FIELDS:
                if getattr(old, name) != getattr(line, name):
                    return None, (f'{label}: {line.user.username} cannot be reproduced exactly '
                                  f'({name}: stored {getattr(line, name)}, recomputed {getattr(old, name)})')
            new = calculate_payroll(replace(inp, overtime_band_rules=_build_overtime_band_rules(target),
                                            rule_set_code=target.code, rule_set_version=target.version))
            if new.standby_amount != old.standby_amount or new.overtime_hours != old.overtime_hours:
                return None, f'{label}: {line.user.username} standby/hours changed unexpectedly'
            plan['lines'].append({'line': line, 'new': new, 'entries': line_entries})
        return plan, None

    def _frozen_input(self, run, line, snapshot, config, ot, sb):
        rule_set = run.rule_set
        inp = PayrollCalculationInput(
            user_id=line.user_id, user_display=line.user.get_full_name() or line.user.username,
            year=run.year, month=run.month, gross_monthly_wage=line.gross_monthly_wage,
            monthly_working_days=line.monthly_working_days,
            monthly_standard_hours=line.monthly_standard_hours,
            overtime_entries=ot, standby_entries=sb,
            weekday_standby_rate=Decimal(str(snapshot.get('weekday_standby_hourly_rate', config.weekday_standby_hourly_rate))),
            weekend_standby_rate=Decimal(str(snapshot.get('weekend_standby_hourly_rate', config.weekend_standby_hourly_rate))),
            tax_brackets=_build_tax_bracket_inputs(rule_set),
            contribution_rates=_build_contribution_rate_inputs(rule_set),
            overtime_categories=_build_overtime_category_inputs(rule_set),
            rounding_mode=snapshot.get('rounding_mode', config.rounding_mode),
            rounding_precision=snapshot.get('rounding_precision', config.rounding_precision),
            missing_timestamp_fallback_category=snapshot.get(
                'missing_timestamp_fallback_category', config.missing_timestamp_fallback_category),
            holiday_dates=_get_source_holidays(config, [*ot, *sb]),
            overtime_is_taxable=snapshot.get('overtime_is_taxable', config.overtime_is_taxable),
            standby_is_taxable=snapshot.get('standby_is_taxable', config.standby_is_taxable),
            overtime_is_contribution_bearing=snapshot.get(
                'overtime_is_contribution_bearing', config.overtime_is_contribution_bearing),
            standby_is_contribution_bearing=snapshot.get(
                'standby_is_contribution_bearing', config.standby_is_contribution_bearing),
            rule_set_code=rule_set.code, rule_set_version=rule_set.version,
        )
        return inp

    # ------------------------------------------------------------------ output
    def _report(self, plans, skipped, target):
        self.stdout.write(f'Target rule set: {target.code} v{target.version}\n')
        for plan in plans:
            run = plan['run']
            old_ot = sum((p['line'].overtime_amount for p in plan['lines']), Decimal('0'))
            new_ot = sum((p['new'].overtime_amount for p in plan['lines']), Decimal('0'))
            old_net = sum((p['line'].net_pay for p in plan['lines']), Decimal('0'))
            new_net = sum((p['new'].net_pay for p in plan['lines']), Decimal('0'))
            self.stdout.write(self.style.MIGRATE_HEADING(
                f'Run {run.pk} {run.period_label}: {len(plan["lines"])} lines, '
                f'overtime {old_ot} -> {new_ot} ({new_ot - old_ot:+}), net {old_net} -> {new_net} ({new_net - old_net:+})'
            ))
            for p in plan['lines']:
                delta = p['new'].overtime_amount - p['line'].overtime_amount
                if delta:
                    self.stdout.write(
                        f'   {p["line"].user.username}: overtime {p["line"].overtime_amount} -> '
                        f'{p["new"].overtime_amount} ({delta:+}), net {p["line"].net_pay} -> {p["new"].net_pay}'
                    )
        for run, reason in skipped:
            self.stdout.write(self.style.WARNING(f'SKIPPED {reason}'))

    # ------------------------------------------------------------------ backup
    def _write_backup(self, plans, backup_dir) -> Path:
        directory = Path(backup_dir)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f'reprice_{datetime.now():%Y%m%d_%H%M%S}.json'
        payload = {'format': 1, 'runs': []}
        for plan in plans:
            run = plan['run']
            payload['runs'].append({
                'run_id': run.pk, 'rule_set_id': run.rule_set_id, 'totals': run.totals,
                'lines': [
                    {'id': p['line'].pk,
                     'values': {f: _json_safe(getattr(p['line'], f)) for f in LINE_FIELDS}}
                    for p in plan['lines']
                ],
                'entries': [
                    {'id': e.pk, 'overtime_amount': str(e.overtime_amount)}
                    for p in plan['lines'] for e in p['entries'] if e.source_kind == 'overtime'
                ],
            })
        path.write_text(json.dumps(payload, indent=1, default=str), encoding='utf-8')
        return path

    # ------------------------------------------------------------------- apply
    def _apply_run(self, plan, target):
        run = plan['run']
        with transaction.atomic():
            locked = PayrollRun.objects.select_for_update().get(pk=run.pk)
            if locked.status != 'finalized':
                raise CommandError(f'Run {run.pk} is no longer finalized; aborting.')
            for p in plan['lines']:
                values = _line_values(p['new'])
                # Queryset updates deliberately bypass the finalized-line guards.
                PayrollLine.objects.filter(pk=p['line'].pk).update(**values)
                amounts = {
                    d['source_id']: Decimal(d['amount'])
                    for d in p['new'].entry_details if d['source_kind'] == 'overtime'
                }
                for entry in p['entries']:
                    if entry.source_kind == 'overtime':
                        PayrollRunEntry.objects.filter(pk=entry.pk).update(
                            overtime_amount=amounts[entry.source_id])
            totals = aggregate_line_totals(PayrollLine.objects.filter(run_id=run.pk))
            PayrollRun.objects.filter(pk=run.pk).update(rule_set=target, totals=totals)
            for p in plan['lines']:
                fresh = PayrollLine.objects.get(pk=p['line'].pk)
                for name in DECIMAL_FIELDS:
                    if getattr(fresh, name) != getattr(p['new'], name):
                        raise CommandError(
                            f'Verification failed for run {run.pk} {name}; rolled back this run.')
        self._audit(run, target)
        self.stdout.write(f'  applied run {run.pk} {run.period_label}')

    def _audit(self, run, target):
        try:
            from plugins.audit_log.signals import log_action
            log_action(
                user=None, action='payroll_reprice_finalized',
                description=f'Repriced finalized payroll {run.period_label} with {target.code}',
                new_values={'run_id': run.pk, 'rule_set': target.code},
                old_values={'rule_set_id': run.rule_set_id},
                ip_address='', user_agent='',
            )
        except Exception:  # noqa: BLE001 - audit is best effort, the backup is the record
            self.stdout.write(self.style.WARNING('Audit log entry could not be written.'))

    # ----------------------------------------------------------------- restore
    def _restore(self, options):
        payload = json.loads(Path(options['restore']).read_text(encoding='utf-8'))
        if payload.get('format') != 1:
            raise CommandError('Unrecognised backup file.')
        for item in payload['runs']:
            run = PayrollRun.objects.filter(pk=item['run_id'], status='finalized').first()
            if run is None:
                self.stdout.write(self.style.WARNING(f'SKIPPED run {item["run_id"]}: not finalized/missing'))
                continue
            if not options['apply']:
                self.stdout.write(f'Would restore run {run.pk} {run.period_label} ({len(item["lines"])} lines)')
                continue
            with transaction.atomic():
                for line in item['lines']:
                    values = {
                        name: (Decimal(value) if name in DECIMAL_FIELDS else value)
                        for name, value in line['values'].items()
                    }
                    PayrollLine.objects.filter(pk=line['id'], run_id=run.pk).update(**values)
                for entry in item['entries']:
                    PayrollRunEntry.objects.filter(pk=entry['id'], run_id=run.pk).update(
                        overtime_amount=Decimal(entry['overtime_amount']))
                PayrollRun.objects.filter(pk=run.pk).update(
                    rule_set_id=item['rule_set_id'], totals=item['totals'])
            self.stdout.write(f'  restored run {run.pk} {run.period_label}')
        if not options['apply']:
            self.stdout.write(self.style.WARNING('DRY RUN - add --apply --confirm to restore.'))
