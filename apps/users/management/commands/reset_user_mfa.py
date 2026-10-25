"""Break-glass: remove a user's second factor from the server shell.

    docker compose exec backend python manage.py reset_user_mfa <username>

For someone who lost both their device and their backup codes and cannot ask a
superuser in the app (or is the only superuser).
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.users.services import mfa as mfa_service
from apps.users.services.tokens import revoke_refresh_tokens


class Command(BaseCommand):
    help = "Remove a user's two-factor authentication and end their sessions."

    def add_arguments(self, parser):
        parser.add_argument('username')

    def handle(self, *args, username, **options):
        user = get_user_model().objects.filter(username=username).first()
        if user is None:
            raise CommandError(f'No user named {username!r}.')
        if not mfa_service.is_enrolled(user):
            self.stdout.write(f'{username} has no second factor; nothing to reset.')
            return
        mfa_service.remove_mfa(user)
        revoke_refresh_tokens(user)
        mfa_service.audit(None, 'mfa_reset', f'Second factor of {username} reset from the command line', user)
        self.stdout.write(self.style.SUCCESS(
            f'Second factor removed for {username}. If MFA is required for them they enrol again at next sign-in.'
        ))
