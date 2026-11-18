"""Fill one user's Ticket KPI with made-up tickets, to look at the dashboard and charts.

Development data only: it refuses to run with DEBUG off, and it never touches a user
who already has import batches unless ``--replace`` is given.
"""
import random
from datetime import date, datetime, timezone

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.overtime.models.core import Client
from plugins.ticket_kpi.analytics import compute_monthly_kpi
from plugins.ticket_kpi.models import NormalizedTicket, TicketImportBatch

STATUSES = ['Closed'] * 8 + ['Done'] * 3 + ['In Progress'] * 3 + ['Open'] * 2 + ['Cancelled', 'Parked']
PRIORITIES = ['P1 - Critical'] * 2 + ['P2 - High'] * 4 + ['P3 - Moderate'] * 6 + ['P4 - Low'] * 3
CATEGORIES = ['Backup failure', 'Restore request', 'Job rescheduling', 'Disk space', 'Agent upgrade',
              'Licensing', 'Tape handling', 'Reporting', 'Access request', 'Network', 'Other']
CATEGORY_WEIGHTS = [10, 8, 6, 4, 3, 2, 2, 1, 1, 1, 1]


class Command(BaseCommand):
    help = 'Create dummy ticket batches (and the monthly KPIs) for one user. Development only.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--year', type=int, default=2026)
        parser.add_argument('--months', default='3,4,5', help='Comma-separated month numbers.')
        parser.add_argument('--replace', action='store_true', help='Delete the user\'s existing batches first.')

    def handle(self, *args, **opts):
        if not settings.DEBUG:
            raise CommandError('seed_dummy_tickets only runs with DEBUG on (development data).')
        user = get_user_model().objects.filter(username=opts['username']).first()
        if user is None:
            raise CommandError(f"No user named {opts['username']!r}.")
        existing = TicketImportBatch.objects.filter(user=user)
        if existing.exists():
            if not opts['replace']:
                raise CommandError('This user already has import batches; pass --replace to delete them.')
            existing.delete()

        clients = [
            Client.objects.get_or_create(code='DUM1', defaults={'name': 'Acme Backup'})[0],
            Client.objects.get_or_create(code='DUM2', defaults={'name': 'Northwind'})[0],
        ]
        user.profile.clients.add(*clients)
        rng = random.Random(7)
        total = 0
        for number in (int(m) for m in opts['months'].split(',')):
            month = date(opts['year'], number, 1)
            batch = TicketImportBatch.objects.create(
                user=user, uploaded_by=user, month=month, raw_file='ticket_imports/dummy.csv')
            batch.clients.set(clients if number != 3 else clients[:1])
            rows = [
                NormalizedTicket(
                    batch=batch, row_index=i, ticket_id=f'DUM{number}{i:03d}',
                    status=rng.choice(STATUSES), priority=rng.choice(PRIORITIES),
                    category=rng.choices(CATEGORIES, CATEGORY_WEIGHTS)[0],
                    created_at=datetime(opts['year'], number, rng.randint(1, 27), 9, tzinfo=timezone.utc),
                    time_to_resolution_hours=round(rng.expovariate(1 / 9), 1),
                )
                for i in range(rng.randint(40, 70))
            ]
            NormalizedTicket.objects.bulk_create(rows)
            batch.record_count = len(rows)
            batch.save(update_fields=['record_count'])
            compute_monthly_kpi(user, month)
            total += len(rows)
        self.stdout.write(self.style.SUCCESS(f'Seeded {total} dummy tickets for {user.username}.'))
