"""
Run scheduled analytics reports and email them to recipients.
This command should be run periodically (e.g., every hour via cron).
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.mail import EmailMessage
from django.conf import settings
from plugins.analytics.models import ScheduledReport
from plugins.analytics.reports import AnalyticsReportGenerator
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Execute scheduled analytics reports and send via email'

    def handle(self, *args, **options):
        now = timezone.now()
        
        # Find active reports that are due to run
        due_reports = ScheduledReport.objects.filter(
            is_active=True,
            next_run_at__lte=now
        )
        
        if not due_reports.exists():
            due_reports = ScheduledReport.objects.filter(
                is_active=True,
                next_run_at__isnull=True
            )

        self.stdout.write(f"Processing {due_reports.count()} scheduled reports...")

        for report in due_reports:
            try:
                self.stdout.write(f"Running report: {report.name}")

                if not report.recipients:
                    self.stdout.write(self.style.WARNING(
                        f"  Skipping {report.name}: no recipients configured."
                    ))
                    continue

                # Generate report data
                filter_preset = report.filter_preset or {}
                period = filter_preset.get('period', 'month')
                date_from = filter_preset.get('date_from')
                date_to = filter_preset.get('date_to')
                teams = filter_preset.get('teams', [])
                users = filter_preset.get('users', [])
                statuses = filter_preset.get('statuses', [])
                categories = filter_preset.get('categories', [])

                content_type = 'application/octet-stream'
                file_ext = 'bin'
                report_data = None

                if report.report_format == 'excel':
                    report_data = AnalyticsReportGenerator.generate_excel_report(
                        period, date_from, date_to, teams, users, statuses, categories
                    )
                    content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    file_ext = 'xlsx'
                elif report.report_format == 'csv':
                    report_data = AnalyticsReportGenerator.generate_csv_report(
                        period, date_from, date_to, teams, users, statuses, categories
                    )
                    content_type = 'text/csv'
                    file_ext = 'csv'
                elif report.report_format == 'pdf':
                    report_data = AnalyticsReportGenerator.generate_pdf_report(
                        period, date_from, date_to, teams, users, statuses, categories
                    )
                    content_type = 'application/pdf'
                    file_ext = 'pdf'

                if report_data:
                    # Create email
                    subject = f"Scheduled Analytics Report: {report.name}"
                    body = f"Please find attached the scheduled analytics report: {report.name}\n\nDescription: {report.description}"
                    
                    email = EmailMessage(
                        subject,
                        body,
                        settings.DEFAULT_FROM_EMAIL,
                        report.recipients
                    )
                    
                    filename = f"{report.name.replace(' ', '_')}_{now.strftime('%Y%m%d')}.{file_ext}"
                    email.attach(filename, report_data, content_type)
                    
                    email.send()
                    
                    # Update report timestamps
                    report.last_run_at = now
                    # Calculate next run
                    if report.schedule_type == 'daily':
                        report.next_run_at = now + timezone.timedelta(days=1)
                    elif report.schedule_type == 'weekly':
                        report.next_run_at = now + timezone.timedelta(weeks=1)
                    elif report.schedule_type == 'monthly':
                        # Simplistic next month
                        report.next_run_at = now + timezone.timedelta(days=30)
                    
                    report.save()
                    self.stdout.write(self.style.SUCCESS(f"Successfully sent report: {report.name}"))
                
            except Exception as e:
                logger.error(f"Error running scheduled report {report.id}: {str(e)}")
                self.stdout.write(self.style.ERROR(f"Failed to run report {report.name}: {str(e)}"))
