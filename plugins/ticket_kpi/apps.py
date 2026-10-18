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
        #
        # The OpenAPI enum name is registered here (plugin-owned) rather than in
        # config/settings.py, so core never references this package and the
        # plugin can be removed without editing settings. evidence_type exists
        # on both OvertimeLog and KPIEvidence with different choice sets.
        from django.conf import settings

        overrides = settings.SPECTACULAR_SETTINGS.setdefault('ENUM_NAME_OVERRIDES', {})
        overrides['KPIEvidenceTypeEnum'] = f'{self.name}.models.KPIEvidence.EVIDENCE_TYPES'
