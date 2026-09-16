"""Tests for per-Tech level scales and level-aware Tech assignments.

A Tech level is a *grade a person holds inside a Tech* (Infrastructure L3),
not a child Tech. The scale is per-Tech and admin-managed from the GUI, so a
new level never needs a migration.
"""
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.users.models import Team, Tech, TechLevel, UserTech


class TechLevelModelTests(TestCase):
    def setUp(self):
        self.infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        self.db = Tech.objects.create(name="Database", code="DB")

    def test_levels_are_scoped_per_tech(self):
        """The same level code may exist under two different Techs."""
        TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        TechLevel.objects.create(tech=self.db, name="L1", code="L1", rank=1)

        self.assertEqual(TechLevel.objects.filter(code="L1").count(), 2)

    def test_duplicate_code_within_one_tech_is_rejected(self):
        TechLevel.objects.create(tech=self.infra, name="Level One", code="L1", rank=1)

        with self.assertRaises(IntegrityError), transaction.atomic():
            TechLevel.objects.create(tech=self.infra, name="Level Uno", code="L1", rank=2)

    def test_duplicate_rank_within_one_tech_is_rejected(self):
        TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)

        with self.assertRaises(IntegrityError), transaction.atomic():
            TechLevel.objects.create(tech=self.infra, name="L2", code="L2", rank=1)

    def test_code_is_upper_cased_on_save(self):
        level = TechLevel.objects.create(tech=self.infra, name="Senior", code="sr", rank=1)

        self.assertEqual(level.code, "SR")

    def test_levels_order_by_rank_not_name(self):
        TechLevel.objects.create(tech=self.infra, name="Advanced", code="L3", rank=3)
        TechLevel.objects.create(tech=self.infra, name="Beginner", code="L1", rank=1)
        TechLevel.objects.create(tech=self.infra, name="Capable", code="L2", rank=2)

        self.assertEqual(
            list(self.infra.levels.values_list("code", flat=True)),
            ["L1", "L2", "L3"],
        )

    def test_level_is_not_soft_deletable(self):
        """A soft-deleted level would still be FK-referenced by UserTech and
        still read as somebody's current grade, because M2M/FK reads do not
        filter ``is_deleted``. Hard delete + SET_NULL is the only correct
        "retire a grade" semantic, so the mixin must not be here at all.
        """
        field_names = {field.name for field in TechLevel._meta.get_fields()}

        self.assertNotIn('is_deleted', field_names)
        self.assertNotIn('deleted_at', field_names)
        self.assertNotIn('deleted_by', field_names)
        self.assertFalse(hasattr(TechLevel, 'soft_delete'))

    def test_deleting_a_level_keeps_the_assignment(self):
        """SET_NULL: retiring a level must not unassign the person's Tech."""
        level = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        user = User.objects.create_user(username="level-del", password="test123")
        UserTech.objects.create(user_profile=user.profile, tech=self.infra, level=level)

        level.delete()

        assignment = UserTech.objects.get(user_profile=user.profile, tech=self.infra)
        self.assertIsNone(assignment.level)
        self.assertIn(self.infra, user.profile.techs.all())


class UserTechThroughModelTests(TestCase):
    """The through model must adopt the pre-existing M2M table in place.

    `UserProfile.techs` was a plain M2M before levels existed. Converting it to
    an explicit `through=` model is a state-only migration over the table Django
    had already created, so these two assertions are what protect the existing
    rows from being dropped and recreated.
    """

    def test_through_model_reuses_the_original_m2m_table(self):
        self.assertEqual(UserTech._meta.db_table, "user_profiles_techs")

    def test_through_model_reuses_the_original_column_names(self):
        columns = {f.name: f.column for f in UserTech._meta.fields}

        self.assertEqual(columns["user_profile"], "userprofile_id")
        self.assertEqual(columns["tech"], "tech_id")

    def test_plain_set_still_works_and_leaves_level_unset(self):
        """Every pre-existing `.techs.set()` call site must keep working."""
        user = User.objects.create_user(username="set-user", password="test123")
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        db = Tech.objects.create(name="Database", code="DB")

        user.profile.techs.set([infra, db])

        self.assertEqual(
            set(user.profile.techs.values_list("code", flat=True)), {"INFRA", "DB"}
        )
        self.assertEqual(
            list(UserTech.objects.filter(user_profile=user.profile).values_list("level", flat=True)),
            [None, None],
        )

    def test_plain_add_still_works(self):
        user = User.objects.create_user(username="add-user", password="test123")
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")

        user.profile.techs.add(infra)

        self.assertIn(infra, user.profile.techs.all())

    def test_one_assignment_row_per_tech(self):
        user = User.objects.create_user(username="dupe-user", password="test123")
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        UserTech.objects.create(user_profile=user.profile, tech=infra)

        with self.assertRaises(IntegrityError), transaction.atomic():
            UserTech.objects.create(user_profile=user.profile, tech=infra)

    def test_level_from_another_tech_is_rejected(self):
        """A Database level cannot grade an Infrastructure assignment."""
        user = User.objects.create_user(username="mismatch-user", password="test123")
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        db = Tech.objects.create(name="Database", code="DB")
        db_level = TechLevel.objects.create(tech=db, name="L1", code="L1", rank=1)

        assignment = UserTech(user_profile=user.profile, tech=infra, level=db_level)

        with self.assertRaises(ValidationError):
            assignment.full_clean()

    def test_a_person_holds_a_different_level_per_tech(self):
        user = User.objects.create_user(username="multi-level", password="test123")
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        db = Tech.objects.create(name="Database", code="DB")
        infra_l3 = TechLevel.objects.create(tech=infra, name="L3", code="L3", rank=3)
        db_l1 = TechLevel.objects.create(tech=db, name="L1", code="L1", rank=1)

        UserTech.objects.create(user_profile=user.profile, tech=infra, level=infra_l3)
        UserTech.objects.create(user_profile=user.profile, tech=db, level=db_l1)

        held = {
            row.tech.code: row.level.code
            for row in UserTech.objects.filter(user_profile=user.profile).select_related("tech", "level")
        }
        self.assertEqual(held, {"INFRA": "L3", "DB": "L1"})


class TechLevelAPITests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="level-admin", password="test123", email="la@example.com"
        )
        self.infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        self.db = Tech.objects.create(name="Database", code="DB")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_admin_creates_a_level(self):
        response = self.client.post(
            "/api/users/tech-levels/",
            {"tech": self.infra.id, "name": "L1", "code": "l1", "rank": 1},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["code"], "L1")

    def test_non_admin_cannot_create_a_level(self):
        employee = User.objects.create_user(username="level-employee", password="test123")
        client = APIClient()
        client.force_authenticate(employee)

        response = client.post(
            "/api/users/tech-levels/",
            {"tech": self.infra.id, "name": "L1", "code": "L1", "rank": 1},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_any_authenticated_user_can_read_levels(self):
        TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        employee = User.objects.create_user(username="reader", password="test123")
        client = APIClient()
        client.force_authenticate(employee)

        response = client.get("/api/users/tech-levels/")

        self.assertEqual(response.status_code, 200)

    def test_levels_filter_by_tech(self):
        TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        TechLevel.objects.create(tech=self.db, name="J", code="J", rank=1)

        response = self.client.get(f"/api/users/tech-levels/?tech={self.infra.id}")

        self.assertEqual(response.status_code, 200)
        codes = {row["code"] for row in response.data["results"]}
        self.assertEqual(codes, {"L1"})

    def test_tech_detail_nests_its_levels_in_rank_order(self):
        TechLevel.objects.create(tech=self.infra, name="L2", code="L2", rank=2)
        TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)

        response = self.client.get(f"/api/users/techs/{self.infra.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([lvl["code"] for lvl in response.data["levels"]], ["L1", "L2"])

    def test_reorder_levels_rewrites_ranks(self):
        first = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        second = TechLevel.objects.create(tech=self.infra, name="L2", code="L2", rank=2)
        third = TechLevel.objects.create(tech=self.infra, name="L3", code="L3", rank=3)

        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/reorder_levels/",
            {"level_ids": [third.id, first.id, second.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            list(self.infra.levels.values_list("code", flat=True)),
            ["L3", "L1", "L2"],
        )

    def test_reorder_rejects_a_level_from_another_tech(self):
        mine = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        theirs = TechLevel.objects.create(tech=self.db, name="J", code="J", rank=1)

        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/reorder_levels/",
            {"level_ids": [mine.id, theirs.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_reorder_requires_every_level_of_the_tech(self):
        """A partial list would leave the remaining levels with stale ranks."""
        first = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        TechLevel.objects.create(tech=self.infra, name="L2", code="L2", rank=2)

        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/reorder_levels/",
            {"level_ids": [first.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_reorder_survives_ranks_above_the_level_ids(self):
        """Regression: the temporary rank offset must be derived from the
        highest existing RANK, not the highest level id. When ranks sit above
        the ids, an id-derived offset lands on a rank that is still in use and
        trips the (tech, rank) unique constraint mid-reorder.
        """
        low = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=7)
        mid = TechLevel.objects.create(tech=self.infra, name="L2", code="L2", rank=8)
        high = TechLevel.objects.create(tech=self.infra, name="L3", code="L3", rank=9)

        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/reorder_levels/",
            {"level_ids": [high.id, mid.id, low.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            list(self.infra.levels.values_list("code", "rank")),
            [("L3", 1), ("L2", 2), ("L1", 3)],
        )

    def test_reorder_requires_admin(self):
        level = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        employee = User.objects.create_user(username="reorder-employee", password="test123")
        client = APIClient()
        client.force_authenticate(employee)

        response = client.post(
            f"/api/users/techs/{self.infra.id}/reorder_levels/",
            {"level_ids": [level.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class LevelAwareAssignmentAPITests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="assign-admin", password="test123", email="aa@example.com"
        )
        self.infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        self.db = Tech.objects.create(name="Database", code="DB")
        self.l1 = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        self.l3 = TechLevel.objects.create(tech=self.infra, name="L3", code="L3", rank=3)
        self.db_junior = TechLevel.objects.create(tech=self.db, name="Junior", code="JR", rank=1)
        self.user = User.objects.create_user(username="assign-user", password="test123")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _assignment(self, tech):
        return UserTech.objects.get(user_profile=self.user.profile, tech=tech)

    def test_bulk_update_accepts_the_legacy_plain_id_list(self):
        """The data-import users importer still sends bare Tech IDs."""
        response = self.client.post(
            "/api/users/users/bulk_update/",
            {"user_ids": [self.user.id], "techs": [self.infra.id, self.db.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            set(self.user.profile.techs.values_list("code", flat=True)), {"INFRA", "DB"}
        )
        self.assertIsNone(self._assignment(self.infra).level)

    def test_bulk_update_accepts_tech_level_pairs(self):
        response = self.client.post(
            "/api/users/users/bulk_update/",
            {
                "user_ids": [self.user.id],
                "techs": [
                    {"tech": self.infra.id, "level": self.l3.id},
                    {"tech": self.db.id, "level": None},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._assignment(self.infra).level_id, self.l3.id)
        self.assertIsNone(self._assignment(self.db).level)

    def test_bulk_update_rejects_an_inactive_tech_with_a_sensible_message(self):
        """Bulk update targets EXISTING users, so the error must not talk about
        new users or the post-creation dialog."""
        retired = Tech.objects.create(name="Legacy", code="LEGACY", is_active=False)

        response = self.client.post(
            "/api/users/users/bulk_update/",
            {"user_ids": [self.user.id], "techs": [retired.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        message = str(response.data)
        self.assertIn("inactive", message.lower())
        self.assertNotIn("new users", message)

    def test_bulk_update_keeps_an_inactive_tech_the_user_already_holds(self):
        """Matches the profile-PATCH rule: an inactive Tech is allowed when the
        user already has it, otherwise admins cannot bulk-edit those users."""
        retired = Tech.objects.create(name="Legacy", code="LEGACY", is_active=False)
        UserTech.objects.create(user_profile=self.user.profile, tech=retired)

        response = self.client.post(
            "/api/users/users/bulk_update/",
            {"user_ids": [self.user.id], "techs": [retired.id, self.infra.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            set(self.user.profile.techs.values_list("code", flat=True)),
            {"LEGACY", "INFRA"},
        )

    def test_bulk_update_rejects_a_level_from_another_tech(self):
        response = self.client.post(
            "/api/users/users/bulk_update/",
            {
                "user_ids": [self.user.id],
                "techs": [{"tech": self.infra.id, "level": self.db_junior.id}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_profile_patch_sets_levels(self):
        response = self.client.patch(
            f"/api/users/profiles/{self.user.profile.id}/",
            {"techs": [{"tech": self.infra.id, "level": self.l1.id}]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._assignment(self.infra).level_id, self.l1.id)

    def test_profile_patch_preserves_an_existing_level_when_sent_plain_ids(self):
        """A legacy plain-ID payload must not silently wipe assigned levels."""
        UserTech.objects.create(user_profile=self.user.profile, tech=self.infra, level=self.l3)

        response = self.client.patch(
            f"/api/users/profiles/{self.user.profile.id}/",
            {"techs": [self.infra.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._assignment(self.infra).level_id, self.l3.id)

    def test_add_users_to_tech_with_a_level(self):
        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/add_users/",
            {"user_ids": [self.user.id], "level": self.l3.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._assignment(self.infra).level_id, self.l3.id)

    def test_add_users_records_when_the_assignment_was_made(self):
        self.client.post(
            f"/api/users/techs/{self.infra.id}/add_users/",
            {"user_ids": [self.user.id]},
            format="json",
        )

        self.assertIsNotNone(self._assignment(self.infra).assigned_at)

    def test_add_users_reports_regrades_separately_from_additions(self):
        """`added` counts new members only; re-grading an existing member is a
        different outcome and must not be reported as 0 work done."""
        UserTech.objects.create(user_profile=self.user.profile, tech=self.infra, level=self.l1)
        newcomer = User.objects.create_user(username="newcomer", password="test123")

        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/add_users/",
            {"user_ids": [self.user.id, newcomer.id], "level": self.l3.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["added"], 1)
        self.assertEqual(response.data["regraded"], 1)

    def test_add_users_rejects_a_level_from_another_tech(self):
        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/add_users/",
            {"user_ids": [self.user.id], "level": self.db_junior.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_add_users_relevels_an_existing_member(self):
        """Re-adding an existing member with a level updates their grade."""
        UserTech.objects.create(user_profile=self.user.profile, tech=self.infra, level=self.l1)

        response = self.client.post(
            f"/api/users/techs/{self.infra.id}/add_users/",
            {"user_ids": [self.user.id], "level": self.l3.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._assignment(self.infra).level_id, self.l3.id)

    def test_user_payload_exposes_the_level(self):
        UserTech.objects.create(user_profile=self.user.profile, tech=self.infra, level=self.l3)

        response = self.client.get(f"/api/users/users/{self.user.id}/")

        self.assertEqual(response.status_code, 200)
        entry = next(t for t in response.data["techs"] if t["code"] == "INFRA")
        self.assertEqual(entry["level"]["code"], "L3")
        self.assertEqual(entry["level"]["rank"], 3)

    def test_user_payload_level_is_null_when_ungraded(self):
        self.user.profile.techs.add(self.infra)

        response = self.client.get(f"/api/users/users/{self.user.id}/")

        entry = next(t for t in response.data["techs"] if t["code"] == "INFRA")
        self.assertIsNone(entry["level"])

    def test_inactive_level_is_hidden_from_the_user_payload(self):
        self.l3.is_active = False
        self.l3.save(update_fields=["is_active"])
        UserTech.objects.create(user_profile=self.user.profile, tech=self.infra, level=self.l3)

        response = self.client.get(f"/api/users/users/{self.user.id}/")

        entry = next(t for t in response.data["techs"] if t["code"] == "INFRA")
        self.assertIsNone(entry["level"])


class TechLevelQueryBudgetTests(TestCase):
    """Tech assignment reads must not scale with the number of rows.

    ``UserProfileSerializer`` nests ``UserSerializer``, whose ``get_techs``
    reaches ``user.profile`` — a reverse OneToOne that ``select_related('user')``
    does NOT populate. Without an explicit ``user__profile__tech_assignments``
    prefetch that is one extra query per row, which is exactly what these tests
    pin down.
    """

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="budget-admin", password="test123", email="ba@example.com"
        )
        self.infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        # Two levels, alternated across seeded users, so the level prefetch
        # covers more than one id and cannot be confused with a lazy read.
        self.l1 = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        self.l2 = TechLevel.objects.create(tech=self.infra, name="L2", code="L2", rank=2)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _seed(self, count, offset=0):
        """Each seeded user gets a Tech assignment AND leads a team.

        The team leader matters: ``teams_detail`` nests ``TeamSerializer``, whose
        ``team_leader`` is a ``UserSerializer`` — and its ``get_techs`` reaches
        ``leader.profile``. Seeding leaders is what makes this test able to catch
        that second, easily-missed N+1.
        """
        for index in range(count):
            number = offset + index
            user = User.objects.create_user(
                username=f"budget-user-{number}", password="test123"
            )
            UserTech.objects.create(
                user_profile=user.profile,
                tech=self.infra,
                level=self.l1 if number % 2 else self.l2,
            )
            team = Team.objects.create(
                name=f"Budget Team {number}", code=f"BT{number}", team_leader=user
            )
            user.profile.teams.add(team)

    def _tech_query_count(self, url):
        """Count every Tech-related query the request issues.

        Counted by table rather than by SQL shape on purpose: a bulk prefetch
        over a single id renders as ``WHERE id = 1``, not ``IN (1)``, so shape
        cannot distinguish a prefetch from a lazy read. Growth across row counts
        can.
        """
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        return sum(
            1 for query in ctx.captured_queries
            if 'user_profiles_techs' in query['sql'] or 'tech_levels' in query['sql']
        )

    def test_profiles_list_tech_queries_do_not_grow_with_rows(self):
        self._seed(4)
        few = self._tech_query_count('/api/users/profiles/?page_size=50')
        self._seed(16, offset=4)
        many = self._tech_query_count('/api/users/profiles/?page_size=50')

        self.assertEqual(
            few, many,
            f'Tech queries grew {few} -> {many} as rows went 5 -> 21. A nested '
            f'UserSerializer is reading Tech per row; add the missing prefetch.',
        )

    def test_users_list_tech_queries_do_not_grow_with_rows(self):
        self._seed(4)
        few = self._tech_query_count('/api/users/users/?page_size=50')
        self._seed(16, offset=4)
        many = self._tech_query_count('/api/users/users/?page_size=50')

        self.assertEqual(few, many, f'Tech queries grew {few} -> {many}.')


class TechLevelFilterTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="filter-admin", password="test123", email="fa@example.com"
        )
        self.infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        self.db = Tech.objects.create(name="Database", code="DB")
        self.l1 = TechLevel.objects.create(tech=self.infra, name="L1", code="L1", rank=1)
        self.l2 = TechLevel.objects.create(tech=self.infra, name="L2", code="L2", rank=2)
        self.l3 = TechLevel.objects.create(tech=self.infra, name="L3", code="L3", rank=3)
        self.db_junior = TechLevel.objects.create(tech=self.db, name="Junior", code="JR", rank=1)

        self.senior = User.objects.create_user(username="senior", password="test123")
        self.junior = User.objects.create_user(username="junior", password="test123")
        self.ungraded = User.objects.create_user(username="ungraded", password="test123")
        UserTech.objects.create(user_profile=self.senior.profile, tech=self.infra, level=self.l3)
        UserTech.objects.create(user_profile=self.junior.profile, tech=self.infra, level=self.l1)
        UserTech.objects.create(user_profile=self.ungraded.profile, tech=self.infra)
        # The senior is a Database junior — proves rank filters are per-tech-aware.
        UserTech.objects.create(user_profile=self.senior.profile, tech=self.db, level=self.db_junior)

        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _usernames(self, response):
        return {row["user"]["username"] for row in response.data["results"]}

    def test_filter_by_level_ids(self):
        response = self.client.get(f"/api/users/profiles/?tech_level={self.l3.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._usernames(response), {"senior"})

    def test_filter_by_minimum_rank(self):
        response = self.client.get("/api/users/profiles/?min_tech_level_rank=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._usernames(response), {"senior"})

    def test_minimum_rank_is_scoped_by_the_tech_filter(self):
        """min rank alone spans techs; combined with a tech it must not leak.

        The senior is INFRA L3 but only a DB Junior, so filtering DB with a
        minimum rank of 2 must return nobody — the rank must be evaluated on
        the *same* assignment row as the tech, not across separate rows.
        """
        response = self.client.get(
            f"/api/users/profiles/?tech={self.db.id}&min_tech_level_rank=2"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._usernames(response), set())

    def test_malformed_minimum_rank_is_rejected_not_ignored(self):
        """Silently dropping the filter would return the full unfiltered list
        and look like "no matches were excluded" — worse than an error."""
        response = self.client.get("/api/users/profiles/?min_tech_level_rank=abc")

        self.assertEqual(response.status_code, 400)
        self.assertIn("min_tech_level_rank", str(response.data))

    def test_negative_minimum_rank_is_rejected(self):
        response = self.client.get("/api/users/profiles/?min_tech_level_rank=-1")

        self.assertEqual(response.status_code, 400)

    def test_ungraded_assignment_is_excluded_by_a_level_filter(self):
        response = self.client.get(
            f"/api/users/profiles/?tech_level={self.l1.id},{self.l3.id}"
        )

        self.assertEqual(self._usernames(response), {"senior", "junior"})

    def test_tech_facets_break_down_by_level(self):
        response = self.client.get("/api/users/profiles/tech_facets/")

        self.assertEqual(response.status_code, 200)
        infra = next(f for f in response.data["techs"] if f["id"] == self.infra.id)
        counts = {lvl["code"]: lvl["count"] for lvl in infra["levels"]}
        self.assertEqual(counts["L3"], 1)
        self.assertEqual(counts["L1"], 1)
        self.assertEqual(counts["L2"], 0)
        self.assertEqual(infra["no_level_count"], 1)

    def test_level_facet_counts_ignore_the_level_selection_itself(self):
        """Faceted search: sibling level chips keep their counts when one is on."""
        response = self.client.get(f"/api/users/profiles/tech_facets/?tech_level={self.l3.id}")

        infra = next(f for f in response.data["techs"] if f["id"] == self.infra.id)
        counts = {lvl["code"]: lvl["count"] for lvl in infra["levels"]}
        self.assertEqual(counts["L1"], 1)
        self.assertEqual(counts["L3"], 1)
