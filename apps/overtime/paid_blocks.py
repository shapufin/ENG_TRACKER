"""Paid blocks: overtime entries on one day that start inside the same paid hour.

A block opens at the first entry's start and is paid for one hour. An entry that
starts inside the block shares it, and work past the block's end extends it by
whole hours. An entry that starts at or after the end opens a new block.

Inside a block every paid hour is shared by the entries that worked in it, in
proportion to the minutes each worked there. So an entry that runs a minute past
the hour carries the extra hour, and two short entries inside one hour split it.

``recalculate_day`` rewrites ``hours`` (the paid share) and the paid window on a
user's entries for one day. Approved entries share the hours of the blocks built
from approved entries only. Pending entries show the share they would get if
everything pending were approved. Entries already paid in a finalized payroll
run are frozen at the hours payroll paid, so a new sibling only gets what is
left of the block.
"""

import math
from dataclasses import dataclass, field
from datetime import time
from decimal import Decimal

QUARTER = Decimal('0.25')
HUNDREDTH = Decimal('0.01')


def split_hours(total: Decimal, weights: list[float]) -> list[Decimal]:
    """Share ``total`` hours over entries by weight, adding up exactly.

    Quarter-hour steps while there are few entries, hundredths otherwise.
    """
    if total <= 0 or not weights:
        return [Decimal('0.00')] * len(weights)
    step = QUARTER if len(weights) <= total * 4 else HUNDREDTH
    units = int(total / step)
    weight_sum = sum(weights) or 1
    exact = [w / weight_sum * units for w in weights]
    shares = [math.floor(x) for x in exact]
    if units >= len(weights):
        shares = [max(1, s) for s in shares]
    leftover = units - sum(shares)
    by_remainder = sorted(range(len(weights)), key=lambda i: -(exact[i] - math.floor(exact[i])))
    i = 0
    while leftover > 0:
        shares[by_remainder[i % len(weights)]] += 1
        leftover -= 1
        i += 1
    while leftover < 0:
        shares[shares.index(max(shares))] -= 1
        leftover += 1
    return [(step * s).quantize(HUNDREDTH) for s in shares]


@dataclass
class Block:
    start: int
    end: int
    keys: list = field(default_factory=list)
    spans: dict = field(default_factory=dict)

    @property
    def hours(self) -> int:
        return (self.end - self.start) // 60

    def exact_hours(self) -> dict:
        """Hours each entry earns: every paid hour split by the minutes worked in it."""
        exact = {key: 0.0 for key in self.keys}
        for slot in range(self.hours):
            low, high = self.start + 60 * slot, self.start + 60 * (slot + 1)
            worked = {k: max(0, min(high, e) - max(low, s)) for k, (s, e) in self.spans.items()}
            total = sum(worked.values())
            for key in self.keys:
                exact[key] += worked[key] / total if total else 1 / len(self.keys)
        return exact

    def shares(self, keys: list, hours: Decimal | None = None) -> list[Decimal]:
        """Quantised share of ``hours`` (default the whole block) for ``keys``."""
        exact = self.exact_hours()
        return split_hours(Decimal(self.hours) if hours is None else hours, [exact[k] for k in keys])


def compute_blocks(entries) -> list[Block]:
    """Group ``(key, start_minute, end_minute)`` entries into paid blocks."""
    blocks: list[Block] = []
    current = None
    for key, start, end in sorted(entries, key=lambda e: (e[1], e[2])):
        if end <= start:
            end += 24 * 60
        if current is not None and start < current.end:
            if end > current.end:
                current.end += math.ceil((end - current.end) / 60) * 60
        else:
            current = Block(start=start, end=start + max(1, math.ceil((end - start) / 60)) * 60)
            blocks.append(current)
        current.keys.append(key)
        current.spans[key] = (start, end)
    return blocks


def frozen_log_hours(ids) -> dict:
    """``{entry pk: hours payroll paid}`` for entries already in a finalized payroll run."""
    try:
        from plugins.payroll.models import PayrollRunEntry
    except ImportError:
        return {}
    return dict(
        PayrollRunEntry.objects.filter(
            source_kind='overtime', source_id__in=list(ids), status='finalized',
        ).values_list('source_id', 'hours')
    )


def _minute(t: time) -> int:
    return t.hour * 60 + t.minute


def _clock(minute: int) -> time:
    minute %= 24 * 60
    return time(minute // 60, minute % 60)


def plan_shares(status: dict, span: dict, frozen: dict) -> dict:
    """``{key: (hours, window_start, window_end)}`` for every entry whose pay can still change.

    ``status`` maps key -> 'approved' | 'pending', ``span`` key -> (start, end)
    minutes, ``frozen`` key -> hours payroll already paid. Approved entries
    share the blocks built from approved entries only; pending entries show the
    share they would get if everything pending were approved.
    """
    new = {}

    def paid_in(block):
        return sum((frozen[k] for k in block.keys if k in frozen), Decimal(0))

    def share_out(block, only_pending):
        window = (_clock(block.start), _clock(block.end))
        free = [k for k in block.keys if k not in frozen]
        shares = block.shares(free, max(Decimal(block.hours) - paid_in(block), Decimal(0)))
        for k, share in zip(free, shares):
            if not only_pending or status[k] == 'pending':
                new[k] = (share, *window)

    approved = [k for k, st in status.items() if st == 'approved']
    for block in compute_blocks((k, *span[k]) for k in approved):
        share_out(block, only_pending=False)
    for block in compute_blocks((k, *span[k]) for k in status):
        share_out(block, only_pending=True)
    return new


def preview_share(user_id, work_date, start: time, end: time, exclude_pk=None) -> tuple:
    """What a new (pending) entry would be paid, as ``(hours, window_start, window_end)``."""
    from .models import OvertimeLog

    siblings = OvertimeLog.objects.filter(
        user_id=user_id, date=work_date, is_deleted=False,
        start_time__isnull=False, end_time__isnull=False,
    ).exclude(status='rejected')
    if exclude_pk is not None:
        siblings = siblings.exclude(pk=exclude_pk)
    logs = list(siblings)
    approved = [log.pk for log in logs if log.status == 'approved']
    frozen = frozen_log_hours(approved) if approved else {}
    status = {log.pk: log.status for log in logs}
    span = {log.pk: (_minute(log.start_time), _minute(log.end_time)) for log in logs}
    status['new'], span['new'] = 'pending', (_minute(start), _minute(end))
    return plan_shares(status, span, frozen)['new']


def recalculate_after_delete(sender, instance, **kwargs):
    """``post_delete`` receiver: the entry's siblings may now have the block to themselves."""
    if instance.start_time and instance.end_time:
        recalculate_day(instance.user_id, instance.date)


def recalculate_day(user_id, work_date) -> dict:
    """Recompute paid shares for one user's day. Returns ``{pk: (hours, start, end)}``.

    Must run inside a transaction (it locks the day's rows). ``OvertimeLog.save``
    and the delete signal both do.
    """
    from .models import OvertimeLog

    logs = list(
        OvertimeLog.objects.select_for_update().filter(
            user_id=user_id, date=work_date, is_deleted=False,
            start_time__isnull=False, end_time__isnull=False,
        ).exclude(status='rejected')
    )
    if not logs:
        return {}
    by_pk = {log.pk: log for log in logs}
    span = {log.pk: (_minute(log.start_time), _minute(log.end_time)) for log in logs}
    approved = [pk for pk, log in by_pk.items() if log.status == 'approved']
    frozen = frozen_log_hours(approved) if approved else {}

    for pk, paid in frozen.items():
        if by_pk[pk].hours != paid:
            OvertimeLog.objects.filter(pk=pk).update(hours=paid)
            by_pk[pk].hours = paid

    new = plan_shares({pk: log.status for pk, log in by_pk.items()}, span, frozen)

    for pk, (hours, start, end) in new.items():
        log = by_pk[pk]
        if (log.hours, log.paid_window_start, log.paid_window_end) != (hours, start, end):
            OvertimeLog.objects.filter(pk=pk).update(
                hours=hours, paid_window_start=start, paid_window_end=end,
            )
    return new
