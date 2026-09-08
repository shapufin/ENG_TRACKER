from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Sum
from datetime import timedelta
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from django.contrib.auth.models import User
from plugins.analytics.models import AnalyticsSnapshot


class Command(BaseCommand):
    help = 'Generate analytics snapshot with current metrics'

    def add_arguments(self, parser):
        parser.add_argument(
            '--snapshot-type',
            type=str,
            default='daily',
            choices=['daily', 'weekly', 'monthly'],
            help='Type of snapshot to generate (daily, weekly, monthly)'
        )
        parser.add_argument(
            '--date',
            type=str,
            help='Date for snapshot (YYYY-MM-DD format). Defaults to today.'
        )

    def handle(self, *args, **options):
        snapshot_type = options['snapshot_type']
        date_str = options.get('date')
        
        # Determine snapshot date
        if date_str:
            from datetime import datetime
            snapshot_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            snapshot_date = timezone.now().date()
        
        self.stdout.write(f'Generating {snapshot_type} snapshot for {snapshot_date}...')
        
        # Calculate date range based on snapshot type
        if snapshot_type == 'daily':
            start_date = snapshot_date
            end_date = snapshot_date + timedelta(days=1)
        elif snapshot_type == 'weekly':
            start_date = snapshot_date - timedelta(days=7)
            end_date = snapshot_date
        else:  # monthly
            start_date = snapshot_date - timedelta(days=30)
            end_date = snapshot_date
        
        # Calculate leave metrics
        leave_requests = LeaveRequest.objects.filter(
            created_at__gte=start_date,
            created_at__lt=end_date
        )
        leave_approved = leave_requests.filter(status='approved').count()
        leave_pending = leave_requests.filter(status='pending').count()
        leave_rejected = leave_requests.filter(status='rejected').count()
        
        # days_requested is a Python @property (business days) — cannot ORM-aggregate.
        leave_total_days = float(
            sum(lr.days_requested for lr in leave_requests.filter(status='approved'))
        )
        
        # Calculate overtime metrics
        overtime_logs = OvertimeLog.objects.filter(
            created_at__gte=start_date,
            created_at__lt=end_date
        )
        overtime_approved_hours = float(overtime_logs.filter(status='approved').aggregate(Sum('hours'))['hours__sum'] or 0)
        overtime_pending_hours = float(overtime_logs.filter(status='pending').aggregate(Sum('hours'))['hours__sum'] or 0)

        # Calculate standby metrics (map pending→scheduled, approved→completed for Analytics compatibility)
        standby_logs = StandbyLog.objects.filter(
            created_at__gte=start_date,
            created_at__lt=end_date
        )
        standby_scheduled = standby_logs.filter(status='pending').count()
        standby_completed = standby_logs.filter(status='approved').count()
        
        # Calculate user metrics
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        
        # Calculate total hours (from overtime + standby)
        total_hours = overtime_approved_hours + (standby_completed * 8)  # Assuming 8 hours per standby
        average_hours = total_hours / active_users if active_users > 0 else 0
        
        # Create or update snapshot
        snapshot, created = AnalyticsSnapshot.objects.update_or_create(
            snapshot_type=snapshot_type,
            snapshot_date=snapshot_date,
            defaults={
                'leave_approved_count': leave_approved,
                'leave_pending_count': leave_pending,
                'leave_rejected_count': leave_rejected,
                'leave_total_days': leave_total_days,
                'overtime_approved_hours': overtime_approved_hours,
                'overtime_pending_hours': overtime_pending_hours,
                'standby_scheduled_count': standby_scheduled,
                'standby_completed_count': standby_completed,
                'total_users': total_users,
                'active_users': active_users,
                'total_hours': total_hours,
                'average_hours': average_hours,
            }
        )
        
        if created:
            self.stdout.write(
                self.style.SUCCESS(f'✓ Created {snapshot_type} snapshot for {snapshot_date}')
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f'✓ Updated {snapshot_type} snapshot for {snapshot_date}')
            )
        
        # Display summary
        self.stdout.write('\nSnapshot Summary:')
        self.stdout.write(f'  Total Users: {total_users}')
        self.stdout.write(f'  Active Users: {active_users}')
        self.stdout.write(f'  Total Hours: {total_hours:.1f}')
        self.stdout.write(f'  Average Hours: {average_hours:.1f}')
        self.stdout.write(f'  Leave Approved: {leave_approved}')
        self.stdout.write(f'  Leave Pending: {leave_pending}')
        self.stdout.write(f'  Overtime Hours: {overtime_approved_hours:.1f}')
        self.stdout.write(f'  Standby Completed: {standby_completed}')
