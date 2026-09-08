from django.core.management.base import BaseCommand
from apps.dashboard.models import DashboardWidget
from django.core.exceptions import ValidationError

class Command(BaseCommand):
    help = 'Validates all DashboardWidget configurations'

    def handle(self, *args, **options):
        widgets = DashboardWidget.objects.all()
        total = widgets.count()
        valid = 0
        invalid = 0
        
        self.stdout.write(f"Validating {total} widgets...")
        
        for widget in widgets:
            try:
                widget.clean()
                valid += 1
            except ValidationError as e:
                invalid += 1
                self.stderr.write(self.style.ERROR(f"Invalid config for widget '{widget.name}' (ID: {widget.id}): {e}"))
            except Exception as e:
                invalid += 1
                self.stderr.write(self.style.ERROR(f"Error validating widget '{widget.name}' (ID: {widget.id}): {e}"))
                
        self.stdout.write(self.style.SUCCESS(f"Validation complete: {valid} valid, {invalid} invalid."))
