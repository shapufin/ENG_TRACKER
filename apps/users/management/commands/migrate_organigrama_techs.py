"""Convert Organigrama's temporary Team categories into independent Tech rows."""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.dashboard.models import CalendarWorkspace, PublicHoliday
from apps.users.models import Tech, Team, TeamMembership, UserProfile

TEMPORARY_CODES = {
    "INFRA": ("Infrastructure",),
    "BACKUP": ("Backup",),
    "DB": ("Database",),
}
PARENT_CODES = {"AL_OPS"}


class Command(BaseCommand):
    help = "Dry-run or remove temporary Organigrama Teams and migrate their members to Tech."

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm-delete",
            action="store_true",
            help="Execute the destructive Team/calendar cleanup after reporting targets.",
        )

    def handle(self, *args, **options):
        temporary_teams = Team.objects.filter(code__in=[*TEMPORARY_CODES, *PARENT_CODES])
        workspaces = CalendarWorkspace.objects.filter(team__in=temporary_teams)
        membership_count = TeamMembership.objects.filter(team__in=temporary_teams).count()
        self.stdout.write(
            self.style.WARNING(
                "Organigrama cleanup dry-run: "
                f"teams={temporary_teams.count()}, memberships={membership_count}, "
                f"calendar_workspaces={workspaces.count()}"
            )
        )
        self.stdout.write(
            "Target Team codes: " + ", ".join(temporary_teams.values_list("code", flat=True))
        )
        self.stdout.write(
            "Target calendar workspaces: " + ", ".join(workspaces.values_list("code", flat=True))
        )

        if not options["confirm_delete"]:
            self.stdout.write("No data changed (dry-run). Re-run with --confirm-delete after review.")
            return

        with transaction.atomic():
            for code, (name,) in TEMPORARY_CODES.items():
                tech, _ = Tech.objects.get_or_create(code=code, defaults={"name": name})
                if tech.name != name:
                    raise CommandError(f"Tech code {code} already belongs to {tech.name!r}.")
                profile_ids = TeamMembership.objects.filter(
                    team__code=code
                ).values_list("user_profile_id", flat=True)
                for profile_id in profile_ids:
                    UserProfile.objects.get(pk=profile_id).techs.add(tech)

            PublicHoliday.objects.filter(calendar__in=workspaces).delete()
            workspaces.delete()
            TeamMembership.objects.filter(team__in=temporary_teams).delete()
            temporary_teams.delete()

        self.stdout.write(self.style.SUCCESS("Organigrama Team-to-Tech cleanup completed."))
