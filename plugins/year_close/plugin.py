"""Year Close plugin: frozen evidence sets for closed years (plan Y3)."""
from core.plugins.base import BasePlugin


class YearClosePlugin(BasePlugin):
    @property
    def name(self) -> str:
        return 'year_close'

    @property
    def verbose_name(self) -> str:
        return 'Year Close'

    @property
    def description(self) -> str:
        return (
            'Freezes a closed year into downloadable evidence: one ZIP per IT TL and '
            'team plus a company set, with manifests and checksums.'
        )

    @property
    def version(self) -> str:
        return '1.0.0'

    def get_permission_actions(self):
        # Downloading a closed year is a read-only, superuser-only surface (Y4);
        # the build itself is a scheduler/CLI action, not an API one.
        return ['view']

    def get_permission_manifest(self):
        return {
            'view': {'roles': ['admin'], 'public': False},
        }

    def get_scheduled_jobs(self):
        # Hourly and cheap when nothing is due: it returns before any heavy query
        # unless last year is eligible and not yet ready.
        return [
            ('close_year', 3600, 'plugins.year_close.services.closer.process_close_year'),
        ]
