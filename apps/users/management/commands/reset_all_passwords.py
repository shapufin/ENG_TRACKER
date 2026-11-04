"""Reset all user passwords to a specified default password.

    python manage.py reset_all_passwords <new_password>

WARNING: This is a development utility. Do not use in production.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.users.services.tokens import revoke_refresh_tokens


class Command(BaseCommand):
    help = "Reset all user passwords to a specified default password."

    def add_arguments(self, parser):
        parser.add_argument('password', type=str, help='New password for all users')
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Skip confirmation prompt'
        )

    def handle(self, *args, password, yes, **options):
        if not settings.DEBUG:
            raise CommandError('reset_all_passwords can only run when DEBUG=True.')

        User = get_user_model()

        # Confirm action
        self.stdout.write(self.style.WARNING(
            f'WARNING: This will reset passwords for ALL users to: {password}'
        ))
        
        if not yes:
            try:
                confirm = input('Type "yes" to confirm: ')
            except EOFError:
                self.stdout.write(self.style.ERROR(
                    'Non-interactive environment detected. Use --yes flag to skip confirmation.'
                ))
                return
            
            if confirm.lower() != 'yes':
                self.stdout.write(self.style.WARNING('Aborted.'))
                return
        
        # Reset all user passwords
        users = User.objects.all()
        count = 0
        
        for user in users:
            user.set_password(password)
            user.save()
            revoke_refresh_tokens(user)
            count += 1
        
        self.stdout.write(self.style.SUCCESS(
            f'Successfully reset passwords for {count} users.'
        ))
