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
from datetime import date

from django.utils import timezone

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.leave_management.models import LeaveBalance
from apps.overtime.models import Client
from apps.permissions.models import Role
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
    # Added for the role-workflow suite (kept after the originals so the
    # existing specs' fixtures are unchanged):
    {
        "username": "e2e_super",
        "email": "e2e_super@example.com",
        "first_name": "E2E",
        "last_name": "Superuser",
        "is_staff": True,
        "is_superuser": True,
    },
    {
        "username": "e2e_cr",
        "email": "e2e_cr@example.com",
        "first_name": "E2E",
        "last_name": "ControlRoom",
        "extra_roles": ["cr_admin"],
    },
    {
        "username": "e2e_tl_b",
        "email": "e2e_tl_b@example.com",
        "first_name": "E2E",
        "last_name": "TeamLeaderB",
        "is_albanian_tl_role": True,
    },
    {
        "username": "e2e_employee_c",
        "email": "e2e_c@example.com",
        "first_name": "E2E",
        "last_name": "EmployeeC",
    },
    {
        "username": "e2e_hbpr",
        "email": "e2e_hbpr@example.com",
        "first_name": "E2E",
        "last_name": "HBPR",
        "extra_roles": ["hbpr"],
    },
]

E2E_TEAM = {"name": "E2E Test Team", "code": "E2E_TEAM"}
E2E_TEAM_B = {"name": "E2E Test Team B", "code": "E2E_TEAM_B"}
E2E_CLIENT = {"name": "E2E Test Client", "code": "E2E", "is_active": True}
E2E_CALENDAR = {"name": "E2E Team Calendar", "code": "E2E_CAL"}


class Command(BaseCommand):
    help = "Seed deterministic E2E users, team relationships, and client for Playwright."

    def handle(self, *args, **options):
        # Idempotent, so the fixture works whether or not the role migration ran.
        Role.objects.get_or_create(
            code="hbpr", defaults={"name": "HR Business Partner (Italy)"}
        )
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
            user.is_superuser = cfg.get("is_superuser", False)
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
            for extra_role in cfg.get("extra_roles", []):
                assign_role(user, extra_role)
            if cfg.get("is_staff") and not cfg.get("is_superuser"):
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

        # Second, independent team (Albanian TL) so scoping tests can prove one
        # TL never sees the other team's people.
        team_b, _ = Team.objects.get_or_create(
            code=E2E_TEAM_B["code"], defaults={"name": E2E_TEAM_B["name"]}
        )
        team_b.name = E2E_TEAM_B["name"]
        team_b.team_leader = users["e2e_tl_b"]
        team_b.save(update_fields=["name", "team_leader"])
        for username in ("e2e_employee_c", "e2e_tl_b"):
            TeamMembership.objects.get_or_create(
                user_profile=users[username].profile,
                team=team_b,
                defaults={"is_primary_team": username != "e2e_tl_b"},
            )
        employee_c = users["e2e_employee_c"].profile
        employee_c.albanian_tl = users["e2e_tl_b"]
        employee_c.save(update_fields=["albanian_tl"])
        # The live org chart is Italian TL -> Albanian TL -> employees; hang Team B's leader
        # under Team A's so the chart has real depth (expand/collapse, scoped chains).
        tl_b = users["e2e_tl_b"].profile
        tl_b.italian_tl = users["e2e_tl"]
        tl_b.save(update_fields=["italian_tl"])

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

        # Long-tenured staff: vacation accrues 1.8 days/month from the hire date
        # (capped at 12 months), and an unset hire date would default to "today" on
        # the first leave request, leaving only ~2 requestable days.
        hire_date = date(timezone.localdate().year - 2, 1, 1)
        for user in users.values():
            profile = user.profile
            profile.clients.add(client)
            profile.hire_date = hire_date
            profile.save(update_fields=["hire_date"])
            LeaveBalance.objects.update_or_create(
                user=user,
                leave_type="vacation",
                year=timezone.localdate().year,
                is_carry_over=False,
                defaults={
                    "total_days": 22,
                    "used_days": 0,
                    "pending_days": 0,
                    "accrual_start_date": hire_date,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"E2E seed complete: {len(users)} users, "
                f"team={team.code}, client={'created' if client_created else 'exists'}, "
                f"calendar={'created' if calendar_created else 'exists'}."
            )
        )
