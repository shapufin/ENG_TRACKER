from django.apps import AppConfig


class TicketKPIConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins.ticket_kpi'
    verbose_name = 'Ticket KPI Plugin'

    def ready(self):
        # Signals are connected by plugin.py ready() on activation, NOT here.
        # AppConfig.ready() runs on every Django startup regardless of the
        # plugin's enabled/disabled state; connecting here would re-activate
        # signals for a disabled plugin after a server restart.
        pass
