"""Purge ended HBPR ↔ Albanian TL assignments past the retention window.

Ended assignments are audit history, but evidence-free history does not need
to live forever: ``purge_ended_assignments`` deletes rows whose ``effective_to``
is older than ``ARCHIVE_RETENTION_MONTHS`` (6). Rows still referenced by
``HbprGovernanceEvidence`` (PROTECT FK) are never touched.

There is no scheduler in this deployment, so this runs on every container
start (see docker/entrypoint.sh) — a reconciler, not a one-shot. The
staff-only admin list also sweeps lazily on read, so the two entry points
cannot drift: both call the same service.
"""
from django.core.management.base import BaseCommand

from apps.users.services.hbpr_assignments import purge_ended_assignments


class Command(BaseCommand):
    help = 'Delete ended, evidence-free HBPR assignments older than 6 months.'

    def handle(self, *args, **options):
        deleted = purge_ended_assignments()
        if deleted:
            self.stdout.write(
                f'Purged {deleted} ended HBPR assignment(s) past retention.'
            )
