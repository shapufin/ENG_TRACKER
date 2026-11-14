"""Report users whose legacy role flag is set but whose active UserRole row is missing.

Role identity is read from two places until the flags are retired (audithandover.md S1). The
flags are the written-but-authoritative-today source for HR and the two leader roles, so a flag
without its row means the other reader refuses what this one allows. Default run writes nothing.
``--fix`` creates the missing rows through ``assign_role``; it never removes a role.
"""
from django.core.management.base import BaseCommand

from apps.permissions.models import UserRole
from apps.permissions.services.role_service import assign_role
from apps.users.models import UserProfile

FLAG_ROLES = (
    ('is_hr_user', 'hr'),
    ('is_italian_tl_role', 'italian_tl'),
    ('is_albanian_tl_role', 'albanian_tl'),
)


class Command(BaseCommand):
    help = 'Report (or with --fix, backfill) role flags that have no matching active UserRole.'

    def add_arguments(self, parser):
        parser.add_argument('--fix', action='store_true', help='Create the missing UserRole rows.')

    def handle(self, *args, **options):
        drift = 0
        profiles = UserProfile.objects.select_related('user').filter(
            is_hr_user=True,
        ) | UserProfile.objects.select_related('user').filter(
            is_italian_tl_role=True,
        ) | UserProfile.objects.select_related('user').filter(is_albanian_tl_role=True)
        for profile in profiles.distinct().order_by('user__username'):
            for flag, code in FLAG_ROLES:
                if not getattr(profile, flag):
                    continue
                if UserRole.objects.filter(user=profile.user, role__code=code, is_active=True).exists():
                    continue
                drift += 1
                self.stdout.write(f'{profile.user.username}: flag {flag} set, no active role {code}')
                if options['fix']:
                    assign_role(profile.user, code)
        verb = 'fixed' if options['fix'] else 'found'
        self.stdout.write(f'{drift} user(s) with role drift ({verb}).')
