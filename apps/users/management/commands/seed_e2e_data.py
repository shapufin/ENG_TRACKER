"""
Seed deterministic E2E test data (users, team, and client).

Creates Employee A/B, TL, HR, Admin, and TL+HR users with fixed test-only
credentials, plus the team/client relationships needed by role-aware
Playwright tests. Idempotent — safe to run repeatedly; existing records are
reused and unrelated users are never modified.

Usage:
    python manage.py seed_e2e_data
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.leave_management.models import LeaveBalance
from apps.overtime.models import Client
from apps.permissions.services.role_service import assign_role
from apps.users.models import Team, TeamMembership, UserProfile

E2E_PASSWORD = "e2e_pass_2026"
E2E_USERS = [
    {
        "username": "e2e_employee_a",
        "email": "e2e_a@example.com",
        "first_name": "E2E",
        "last_name": "EmployeeA",
    },
    {
        "username": "e2e_employee_b",
        "email": "e2e_b@example.com",
        "first_name": "E2E",
        "last_name": "EmployeeB",
    },
    {
        "username": "e2e_tl",
        "email": "e2e_tl@example.com",
        "first_name": "E2E",
        "last_name": "TeamLeader",
        "is_italian_tl_role": True,
    },
    {
        "username": "e2e_hr",
        "email": "e2e_hr@example.com",
        "first_name": "E2E",
        "last_name": "HR",
        "is_hr_user": True,
    },
    {
        "username": "e2e_admin",
        "email": "e2e_admin@example.com",
        "first_name": "E2E",
        "last_name": "Admin",
        "is_staff": True,
    },
    {
        "username": "e2e_tl_hr",
        "email": "e2e_tl_hr@example.com",
        "first_name": "E2E",
        "last_name": "TLHR",
        "is_italian_tl_role": True,
        "is_hr_user": True,
    },
]

E2E_TEAM = {"name": "E2E Test Team", "code": "E2E_TEAM"}
E2E_CLIENT = {"name": "E2E Test Client", "code": "E2E", "is_active": True}
E2E_CALENDAR = {"name": "E2E Team Calendar", "code": "E2E_CAL"}


class Command(BaseCommand):
    help = "Seed deterministic E2E users, team relationships, and client for Playwright."

    def handle(self, *args, **options):
        users = {}
        for cfg in E2E_USERS:
            defaults = {
                "email": cfg["email"],
                "first_name": cfg["first_name"],
                "last_name": cfg["last_name"],
                "is_active": True,
                "is_staff": cfg.get("is_staff", False),
            }
            user, _ = User.objects.get_or_create(
                username=cfg["username"], defaults=defaults
            )
            user.email = cfg["email"]
            user.first_name = cfg["first_name"]
            user.last_name = cfg["last_name"]
            user.is_active = True
            user.is_staff = cfg.get("is_staff", False)
            user.set_password(E2E_PASSWORD)
            user.save()

            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.is_hr_user = cfg.get("is_hr_user", False)
            profile.is_italian_tl_role = cfg.get("is_italian_tl_role", False)
            profile.is_albanian_tl_role = cfg.get("is_albanian_tl_role", False)
            profile.save(update_fields=[
                "is_hr_user",
                "is_italian_tl_role",
                "is_albanian_tl_role",
            ])
            assign_role(user, "employee")
            if cfg.get("is_staff"):
                assign_role(user, "admin")
            if cfg.get("is_hr_user"):
                assign_role(user, "hr")
            if cfg.get("is_italian_tl_role"):
                assign_role(user, "italian_tl")
            if cfg.get("is_albanian_tl_role"):
                assign_role(user, "albanian_tl")
            users[cfg["username"]] = user

        team, _ = Team.objects.get_or_create(
            code=E2E_TEAM["code"], defaults={"name": E2E_TEAM["name"]}
        )
        team.name = E2E_TEAM["name"]
        team.team_leader = users["e2e_tl"]
        team.save(update_fields=["name", "team_leader"])

        # TL+HR is also a team member so the multi-role fixture has both
        # explicit TL role and normal team visibility.
        for username in ("e2e_employee_a", "e2e_employee_b", "e2e_tl", "e2e_tl_hr"):
            profile = users[username].profile
            TeamMembership.objects.get_or_create(
                user_profile=profile,
                team=team,
                defaults={"is_primary_team": username != "e2e_tl"},
            )

        # Direct TL assignment makes the employee-management relationship
        # deterministic even if team membership behavior changes.
        for username in ("e2e_employee_a", "e2e_employee_b"):
            profile = users[username].profile
            profile.italian_tl = users["e2e_tl"]
            profile.save(update_fields=["italian_tl"])

        client, client_created = Client.objects.get_or_create(
            code=E2E_CLIENT["code"],
            defaults={
                "name": E2E_CLIENT["name"],
                "is_active": E2E_CLIENT["is_active"],
            },
        )
        client.name = E2E_CLIENT["name"]
        client.is_active = E2E_CLIENT["is_active"]
        client.save(update_fields=["name", "is_active"])

        # Calendar workspace linked to the E2E team so calendar E2E tests
        # can exercise the full authenticated calendar workflow.
        calendar, calendar_created = CalendarWorkspace.objects.get_or_create(
            code=E2E_CALENDAR["code"],
            defaults={"name": E2E_CALENDAR["name"], "team": team},
        )
        calendar.name = E2E_CALENDAR["name"]
        calendar.team = team
        calendar.save(update_fields=["name", "team"])

        for user in users.values():
            user.profile.clients.add(client)
            LeaveBalance.objects.update_or_create(
                user=user,
                leave_type="vacation",
                year=timezone.localdate().year,
                is_carry_over=False,
                defaults={"total_days": 22, "used_days": 0, "pending_days": 0},
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"E2E seed complete: {len(users)} users, "
                f"team={team.code}, client={'created' if client_created else 'exists'}, "
                f"calendar={'created' if calendar_created else 'exists'}."
            )
        )
