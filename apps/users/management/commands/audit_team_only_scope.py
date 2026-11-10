"""Read-only: who loses internal-data access when scope became link-only.

Before 2026-11-10 a leader also reached people through shared team membership and
``Team.team_leader``. Now only the ``italian_tl`` / ``albanian_tl`` link counts. Run this
on production BEFORE deploying, then assign the missing links (Users page, bulk edit).
Writes nothing.
"""
from django.core.management.base import BaseCommand

from apps.users.models import UserProfile


class Command(BaseCommand):
    help = 'List leaders and the people they reach only through a team (no italian_tl/albanian_tl link).'

    def handle(self, *args, **options):
        total_leaders = total_people = 0
        profiles = UserProfile.objects.filter(user__is_active=True).select_related('user')
        for profile in profiles:
            if not profile.is_team_leader:
                continue
            lost = (profile.get_calendar_member_ids() - profile.get_team_member_ids()) - {profile.user_id}
            if not lost:
                continue
            names = sorted(
                UserProfile.objects.filter(user_id__in=lost, user__is_active=True)
                .values_list('user__username', flat=True)
            )
            if not names:
                continue
            total_leaders += 1
            total_people += len(names)
            self.stdout.write(f'{profile.user.username}: {len(names)} reachable only via team -> {", ".join(names)}')
        self.stdout.write(
            f'{total_leaders} leader(s), {total_people} person(s) lose internal-data access '
            f'unless a Line Manager / Manager link is set.'
        )
