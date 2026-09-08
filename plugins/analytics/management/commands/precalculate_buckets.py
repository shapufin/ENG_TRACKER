from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Sum
from datetime import timedelta
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from plugins.analytics.models import AnalyticsDailyBucket
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Pre-calculate daily analytics buckets for high performance'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Number of days to backfill'
        )

    def handle(self, *args, **options):
        days = options['days']
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days)

        self.stdout.write(f"Pre-aggregating analytics from {start_date} to {end_date}...")

        current_date = start_date
        while current_date <= end_date:
            self._aggregate_day(current_date)
            current_date += timedelta(days=1)

        self.stdout.write(self.style.SUCCESS("✓ Pre-aggregation complete"))

        # Trigger threshold checks
        from plugins.analytics.alerts import AnalyticsAlertService
        self.stdout.write("Checking thresholds...")
        AnalyticsAlertService.check_thresholds()
        self.stdout.write(self.style.SUCCESS("✓ Threshold check complete"))

    def _aggregate_day(self, target_date):
        """Aggregates all metrics for a single day."""
        # 1. Leave Days (Aggregated)
        leave_requests = LeaveRequest.objects.filter(
            status='approved',
            start_date__lte=target_date,
            end_date__gte=target_date
        )
        # For simplicity in bucket, if a request covers the day, it counts as 1 day for that day
        # (Alternatively, handle partial days if supported by business logic)
        leave_total = float(leave_requests.count())

        # 2. Overtime Hours
        ot_logs = OvertimeLog.objects.filter(
            status='approved',
            date=target_date
        )
        ot_aggs = ot_logs.aggregate(
            total_hours=Sum('hours'),
        )
        ot_hours = float(ot_aggs['total_hours'] or 0)

        # 3. Standby Hours (map approved→completed for Analytics compatibility)
        standby_logs = StandbyLog.objects.filter(
            status='approved',
            date=target_date
        )
        standby_hours = float(standby_logs.aggregate(total=Sum('hours'))['total'] or 0)

        # 4. Team Breakdown (JSON)
        team_data = {}
        team_stats = ot_logs.values('user__profile__teams__name').annotate(
            hours=Sum('hours')
        )
        for ts in team_stats:
            team_name = ts['user__profile__teams__name'] or "Unassigned"
            team_data[team_name] = {
                'overtime_hours': float(ts['hours']),
                'leave_count': leave_requests.filter(user__profile__teams__name=team_name).count()
            }

        # 5. Client Breakdown (JSON)
        client_data = {}
        client_stats = ot_logs.values('client__name').annotate(
            hours=Sum('hours')
        )
        for cs in client_stats:
            client_name = cs['client__name'] or "Unknown"
            client_data[client_name] = float(cs['hours'])

        # Update or create bucket
        AnalyticsDailyBucket.objects.update_or_create(
            date=target_date,
            defaults={
                'leave_days': leave_total,
                'overtime_hours': ot_hours,
                'standby_hours': standby_hours,
                'team_data': team_data,
                'client_data': client_data
            }
        )
        self.stdout.write(f"  Processed {target_date}")
