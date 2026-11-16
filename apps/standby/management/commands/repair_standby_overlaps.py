"""Repair standby rows saved by the old weekly generator (handover 2026-11-16, Batch C).

The old generator saved Friday 18:00-09:00 (15h) AND Saturday 00:00-23:59 (24h), so the
9 hours after midnight were counted twice. This command fixes one shape only, the
"tail covered" pair: row A crosses midnight, row B is dated the next day, starts at
00:00 and ends at or after the end of A. A's ``end_time`` becomes 00:00 and its hours
are recomputed (15 becomes 6). B is untouched; nothing is created, deleted or re-dated.

It never changes a pair that was already paid (finalized payroll entry), a row in a
closed year, or any other overlap shape: those are listed under "needs a human".

Safety rails (same shape as ``reprice_finalized_payroll``):
* ``--month YYYY-MM`` is required: only pairs whose row A is dated in that month are in scope.
* Dry run by default: prints the report, writes nothing.
* ``--apply`` also needs ``--confirm REPAIR-STANDBY``. A JSON backup is written first;
  ``--restore FILE`` (same flags) puts the old values back and skips a row changed since.
* All writes in one transaction with ``select_for_update``. Status, approver, submitted_at
  and processing period are not touched, rows are written with ``.update()`` so no
  notification or signal fires, and one audit row is written per changed entry.
* Idempotent. Draft payroll runs holding a changed row are listed: an admin must
  regenerate them, the command never edits payroll.

Usage:
    py -3.14 manage.py repair_standby_overlaps --month 2026-11
    py -3.14 manage.py repair_standby_overlaps --month 2026-11 --apply --confirm REPAIR-STANDBY
"""
import json
from decimal import Decimal
from datetime import date, time, timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.standby.models import StandbyLog
from apps.users.services.approval_periods import is_year_closed

CONFIRM_PHRASE = 'REPAIR-STANDBY'
MIDNIGHT = time(0, 0)


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _span(log):
    """Absolute [start, end) in minutes on one timeline; 00:00-00:00 is a full day."""
    start = (log.date - date(2000, 1, 1)).days * 1440 + _minutes(log.start_time)
    length = (_minutes(log.end_time) - _minutes(log.start_time)) % 1440 or 1440
    return start, start + length


def _hours_to_midnight(start: time) -> int:
    return -(-((1440 - _minutes(start)) % 1440 or 1440) // 60)


def _is_tail_covered(a, b) -> bool:
    crosses = _minutes(a.end_time) <= _minutes(a.start_time) and a.end_time != MIDNIGHT
    if not crosses or b.date != a.date + timedelta(days=1) or b.start_time != MIDNIGHT:
        return False
    b_end = _minutes(b.end_time) or 1440  # 00:00 end means midnight of the same row's end day
    return b_end >= _minutes(a.end_time)


class Command(BaseCommand):
    help = 'Trim overlapping standby rows left by the old weekly generator (dry run by default).'

    def add_arguments(self, parser):
        parser.add_argument('--month', help='Month in scope, YYYY-MM (row A is dated in it).')
        parser.add_argument('--apply', action='store_true', help='Write the changes.')
        parser.add_argument('--confirm', default='', help=f'Must be {CONFIRM_PHRASE} with --apply.')
        parser.add_argument('--backup-dir', default='standby_repair_backups')
        parser.add_argument('--restore', help='Backup JSON file to restore (needs --apply/--confirm).')

    def handle(self, *args, **options):
        if options['apply'] and options['confirm'] != CONFIRM_PHRASE:
            raise CommandError(f'--apply requires --confirm {CONFIRM_PHRASE}.')
        if options['restore']:
            return self._restore(options)
        month = self._parse_month(options['month'])
        fixable, human = self._plan(month)
        self._report(month, fixable, human)
        if not options['apply']:
            self.stdout.write(self.style.WARNING(
                f'DRY RUN - nothing written. Add --apply --confirm {CONFIRM_PHRASE} to apply.'
            ))
            return
        if not fixable:
            return
        backup = self._write_backup(fixable, options['backup_dir'])
        self.stdout.write(f'Backup written: {backup}')
        changed = self._apply(fixable)
        self._list_drafts(changed)
        self.stdout.write(self.style.SUCCESS(
            f'Trimmed {len(changed)} row(s). To undo: --restore {backup} --apply --confirm {CONFIRM_PHRASE}'
        ))

    # --------------------------------------------------------------- planning
    @staticmethod
    def _parse_month(value):
        if not value:
            raise CommandError('--month YYYY-MM is required.')
        try:
            year, month = (int(part) for part in value.split('-'))
            return date(year, month, 1)
        except ValueError as exc:
            raise CommandError('--month must look like 2026-11.') from exc

    def _plan(self, month):
        first = month
        last = (month.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        rows = list(
            StandbyLog.objects.filter(
                is_deleted=False, start_time__isnull=False, end_time__isnull=False,
                date__gte=first - timedelta(days=1), date__lte=last + timedelta(days=1),
            ).exclude(status='rejected').order_by('user_id', 'date', 'start_time')
        )
        paid = self._paid_ids({r.pk for r in rows})
        by_user = {}
        for row in rows:
            by_user.setdefault(row.user_id, []).append(row)
        fixable, human = [], []
        for user_rows in by_user.values():
            for index, a in enumerate(user_rows):
                for b in user_rows[index + 1:]:
                    (a0, a1), (b0, b1) = _span(a), _span(b)
                    if not (a0 < b1 and b0 < a1):
                        continue
                    first_row, second_row = (a, b) if a0 <= b0 else (b, a)
                    if not (first <= first_row.date <= last):
                        continue
                    reason = self._blocker(first_row, second_row, paid)
                    pair = (first_row, second_row, (min(a1, b1) - max(a0, b0)) / 60)
                    (human if reason else fixable).append(pair + (reason,))
        return fixable, human

    @staticmethod
    def _paid_ids(pks):
        try:
            from plugins.payroll.models import PayrollRunEntry
        except ImportError:
            return set()
        return set(
            PayrollRunEntry.objects.filter(
                source_kind='standby', source_id__in=pks, status='finalized',
            ).values_list('source_id', flat=True)
        )

    @staticmethod
    def _blocker(a, b, paid):
        """Why this pair needs a human, or None when it is the fixable shape."""
        if a.pk in paid or b.pk in paid:
            return 'already paid (finalized payroll)'
        if is_year_closed(a.date.year) or is_year_closed(b.date.year):
            return 'year is closed'
        if not _is_tail_covered(a, b):
            return 'overlap shape not covered by the repair'
        return None

    # ----------------------------------------------------------------- output
    def _report(self, month, fixable, human):
        self.stdout.write(f'Standby overlap report for {month:%Y-%m}: {len(fixable)} fixable, '
                          f'{len(human)} need a human.')
        removed = 0
        for a, b, overlap, _ in fixable:
            new_hours = _hours_to_midnight(a.start_time)
            removed += a.hours - new_hours
            self.stdout.write(
                f'  FIX user={a.user_id} {a.date} {a.start_time:%H:%M}-{a.end_time:%H:%M} ({a.hours}h) '
                f'-> {a.start_time:%H:%M}-00:00 ({new_hours}h); covered by {b.date} '
                f'{b.start_time:%H:%M}-{b.end_time:%H:%M} [{a.status}/{b.status}]'
            )
        self.stdout.write(f'Hours to be removed: {removed}')
        for a, b, overlap, reason in human:
            self.stdout.write(self.style.WARNING(
                f'  NEEDS A HUMAN user={a.user_id} {a.date} {a.start_time:%H:%M}-{a.end_time:%H:%M} '
                f'vs {b.date} {b.start_time:%H:%M}-{b.end_time:%H:%M}: {overlap:g}h overlap, {reason} '
                f'[{a.status}/{b.status}]'
            ))

    # ----------------------------------------------------------------- backup
    def _write_backup(self, fixable, backup_dir) -> Path:
        directory = Path(backup_dir)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f'standby_repair_{timezone.now():%Y%m%d_%H%M%S}.json'
        rows = []
        for a, _b, _o, _r in fixable:
            rows.append({
                'pk': a.pk, 'old_end_time': a.end_time.isoformat(), 'old_hours': str(a.hours),
                'new_end_time': '00:00:00', 'new_hours': str(_hours_to_midnight(a.start_time)),
                'updated_at': a.updated_at.isoformat() if a.updated_at else None,
            })
        path.write_text(json.dumps({'format': 1, 'rows': rows}, indent=1), encoding='utf-8')
        return path

    # ------------------------------------------------------------------ apply
    def _apply(self, fixable):
        changed = []
        with transaction.atomic():
            locked = {
                row.pk: row
                for row in StandbyLog.objects.select_for_update().filter(pk__in=[p[0].pk for p in fixable])
            }
            for a, _b, _o, _r in fixable:
                row = locked[a.pk]
                if row.end_time != a.end_time or row.hours != a.hours:
                    continue  # changed since planning
                new_hours = _hours_to_midnight(row.start_time)
                StandbyLog.objects.filter(pk=row.pk).update(end_time=MIDNIGHT, hours=new_hours)
                self._audit(row, new_hours)
                changed.append(row.pk)
        return changed

    def _audit(self, row, new_hours):
        try:
            from plugins.audit_log.signals import log_action
        except ImportError:
            return  # audit plugin not installed: the JSON backup is the record
        log_action(
            user=None, action='standby_overlap_repaired',
            description=f'repair_standby_overlaps: standby {row.pk} {row.date} end '
                        f'{row.end_time:%H:%M}->00:00, hours {row.hours}->{new_hours}',
            old_values={'end_time': row.end_time.isoformat(), 'hours': str(row.hours)},
            new_values={'end_time': '00:00:00', 'hours': str(new_hours)},
            ip_address='', user_agent='',
        )

    def _list_drafts(self, changed):
        try:
            from plugins.payroll.models import PayrollRunEntry
        except ImportError:
            return
        runs = sorted(set(
            PayrollRunEntry.objects.filter(source_kind='standby', source_id__in=changed)
            .exclude(status='finalized').values_list('run_id', flat=True)
        ))
        if runs:
            self.stdout.write(self.style.WARNING(
                'Regenerate these draft payroll runs (admin "Regenerate"), they hold the old hours: '
                + ', '.join(f'run {r}' for r in runs)
            ))

    # ---------------------------------------------------------------- restore
    def _restore(self, options):
        payload = json.loads(Path(options['restore']).read_text(encoding='utf-8'))
        if payload.get('format') != 1:
            raise CommandError('Unrecognised backup file.')
        with transaction.atomic():
            for item in payload['rows']:
                row = StandbyLog.objects.select_for_update().filter(pk=item['pk']).first()
                new_end = time.fromisoformat(item['new_end_time'])
                if row is None or row.end_time != new_end or row.hours != Decimal(item['new_hours']):
                    self.stdout.write(self.style.WARNING(f'SKIPPED row {item["pk"]}: missing or changed since repair'))
                    continue
                if not options['apply']:
                    self.stdout.write(f'Would restore row {row.pk}')
                    continue
                StandbyLog.objects.filter(pk=row.pk).update(
                    end_time=time.fromisoformat(item['old_end_time']), hours=Decimal(item['old_hours']),
                )
                self.stdout.write(f'  restored row {row.pk}')
        if not options['apply']:
            self.stdout.write(self.style.WARNING('DRY RUN - add --apply --confirm to restore.'))
