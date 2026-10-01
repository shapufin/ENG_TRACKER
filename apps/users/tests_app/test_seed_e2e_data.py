"""Contract for the deterministic fixture the Playwright role-workflow suite logs in as."""
from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone
from django.test import TestCase

from apps.permissions.models import UserRole
from apps.users.models import Team


def _roles(username):
    return set(
        UserRole.objects.filter(user__username=username, is_active=True)
        .values_list("role__code", flat=True)
    )


class SeedE2EDataTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_e2e_data", verbosity=0)

    def test_role_matrix(self):
        self.assertEqual(_roles("e2e_employee_a"), {"employee"})
        self.assertEqual(_roles("e2e_tl"), {"employee", "italian_tl"})
        self.assertEqual(_roles("e2e_hr"), {"employee", "hr"})
        self.assertEqual(_roles("e2e_admin"), {"employee", "admin"})
        self.assertEqual(_roles("e2e_tl_hr"), {"employee", "italian_tl", "hr"})
        self.assertEqual(_roles("e2e_tl_b"), {"employee", "albanian_tl"})
        self.assertEqual(_roles("e2e_cr"), {"employee", "cr_admin"})
        self.assertEqual(_roles("e2e_hbpr"), {"employee", "hbpr"})

    def test_hbpr_scope_covers_italian_team_but_not_the_albanian_team(self):
        from apps.users.services.hbpr_scope import get_hbpr_scope

        scope = get_hbpr_scope(User.objects.get(username="e2e_hbpr"))
        ids = {u.username: u.id for u in User.objects.filter(username__startswith="e2e_")}
        # e2e_tl_b reports to the Italian TL in the seeded org chart, so it is in scope.
        for name in ("e2e_tl", "e2e_employee_a", "e2e_employee_b", "e2e_tl_b"):
            self.assertTrue(scope.has_user(ids[name]), name)
        # Leak canaries: the Albanian TL's own report and the HBPR themselves.
        for name in ("e2e_employee_c", "e2e_hbpr"):
            self.assertFalse(scope.has_user(ids[name]), name)

    def test_superuser_is_a_real_superuser(self):
        user = User.objects.get(username="e2e_super")
        self.assertTrue(user.is_superuser and user.is_staff)

    def test_second_team_is_isolated_from_the_first(self):
        team_a = Team.objects.get(code="E2E_TEAM")
        team_b = Team.objects.get(code="E2E_TEAM_B")
        self.assertEqual(team_b.team_leader.username, "e2e_tl_b")
        self.assertEqual(team_a.team_leader.username, "e2e_tl")
        employee_c = User.objects.get(username="e2e_employee_c")
        self.assertEqual(employee_c.profile.albanian_tl.username, "e2e_tl_b")
        self.assertIsNone(employee_c.profile.italian_tl)
        member_ids_a = set(team_a.members.values_list("user__username", flat=True))
        self.assertNotIn("e2e_employee_c", member_ids_a)

    def test_seed_is_idempotent(self):
        before = (User.objects.count(), UserRole.objects.count(), Team.objects.count())
        call_command("seed_e2e_data", verbosity=0)
        self.assertEqual(before, (User.objects.count(), UserRole.objects.count(), Team.objects.count()))

    def test_fixture_employees_have_full_vacation_accrual(self):
        # Vacation accrues 1.8 days/month from the hire date (capped at 12 months); a
        # fixture "hired today" could only ever request ~2 days, which made the leave
        # workflow specs depend on the calendar.
        from apps.leave_management.viewsets import ensure_current_year_balance

        year = timezone.localdate().year
        for user in User.objects.filter(username__startswith="e2e_"):
            # The same call the leave-request validation makes before checking accrual.
            balance = ensure_current_year_balance(user, year)
            self.assertGreaterEqual(
                balance.get_effective_available_days(), 20, user.username
            )

    def test_org_chart_has_depth_italian_tl_then_albanian_tl_then_employee(self):
        # The live org chart is Italian TL -> Albanian TL -> employees; a fixture without that
        # chain renders childless roots (nothing to expand/collapse).
        from plugins.organigrama.services.tree_builder import build_full_tree

        def usernames_under(node):
            found = set()
            for child in node.get("children", []):
                found.add(child.get("username"))
                found |= usernames_under(child)
            return found

        tree = build_full_tree()
        roots = tree if isinstance(tree, list) else tree.get("roots", [])
        leader = next(node for node in roots if node.get("username") == "e2e_tl")
        albanian = next(child for child in leader["children"] if child.get("username") == "e2e_tl_b")
        self.assertIn("e2e_employee_c", usernames_under(albanian))
