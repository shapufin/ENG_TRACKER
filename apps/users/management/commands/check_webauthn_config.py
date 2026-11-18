"""Report (and optionally validate) the passkey settings.

Passkeys are bound to the RP ID for life: a wrong hostname or an http origin locks
every registered passkey out (TOTP keeps working). Run after any hostname, proxy or
TLS change and before a server move.

    python manage.py check_webauthn_config               # report
    python manage.py check_webauthn_config --production  # also apply the production rules
"""

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import BaseCommand, CommandError

from apps.users.models import WebAuthnCredential
from config.webauthn_config import parse_webauthn_settings


class Command(BaseCommand):
    help = 'Show the passkey RP ID, origins and credential count; --production validates them strictly.'

    def add_arguments(self, parser):
        parser.add_argument('--production', action='store_true', help='Require https origins and a matching RP ID.')

    def handle(self, *args, production=False, **options):
        rp_id = settings.WEBAUTHN_RP_ID
        origins = list(settings.WEBAUTHN_ORIGINS)
        count = WebAuthnCredential.objects.count()
        self.stdout.write(f'RP ID:   {rp_id or "(unset)"}')
        self.stdout.write(f'Origins: {", ".join(origins) or "(unset)"}')
        self.stdout.write(f'{count} passkey{"" if count == 1 else "s"} registered.')
        if not rp_id and not origins:
            self.stdout.write(self.style.WARNING(
                'Passkeys are OFF: set WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS to enable them (TOTP is unaffected).'
            ))
            return
        try:
            parse_webauthn_settings(rp_id, ','.join(origins), production=production)
        except ImproperlyConfigured as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS('Passkey settings OK.'))
