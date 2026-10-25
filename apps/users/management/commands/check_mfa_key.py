"""Verify MFA_ENCRYPTION_KEYS can still read every enrolled seed.

Run on boot and after any server move. A wrong or missing key does not break
the site, it fails closed (enrolled users cannot finish signing in), so this
makes that state loud instead of letting it surface as a support ticket.

    python manage.py check_mfa_key            # report only
    python manage.py check_mfa_key --reencrypt  # also move every seed to the first key (rotation)
"""

from django.core.management.base import BaseCommand, CommandError

from apps.users.models import UserMFA
from core.utils.crypto import SecretDecryptError, decrypt_text, reencrypt_text


class Command(BaseCommand):
    help = 'Check (and optionally re-encrypt) stored MFA seeds against MFA_ENCRYPTION_KEYS.'

    def add_arguments(self, parser):
        parser.add_argument('--reencrypt', action='store_true', help='Re-encrypt every readable seed under the first key.')

    def handle(self, *args, reencrypt=False, **options):
        total = bad = 0
        for row in UserMFA.objects.all().iterator():
            total += 1
            try:
                decrypt_text(row.secret_ciphertext)
            except SecretDecryptError:
                bad += 1
                self.stderr.write(f'user {row.user_id}: seed cannot be decrypted with the configured keys')
                continue
            if reencrypt:
                row.secret_ciphertext = reencrypt_text(row.secret_ciphertext)
                row.save(update_fields=['secret_ciphertext', 'updated_at'])
        if bad:
            raise CommandError(
                f'{bad} of {total} MFA seeds are unreadable. MFA_ENCRYPTION_KEYS does not match the '
                'database; restore the original key(s) or reset those users with reset_user_mfa.'
            )
        self.stdout.write(self.style.SUCCESS(f'All {total} MFA seeds are readable.'))
