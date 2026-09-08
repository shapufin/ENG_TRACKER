from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.users.models import Tech


class TechModelAndAssignmentTests(TestCase):
    def test_user_profile_supports_multiple_independent_tech_assignments(self):
        user = User.objects.create_user(username="tech-user", password="test123")
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        database = Tech.objects.create(name="Database", code="DB")

        user.profile.techs.set([infra, database])

        self.assertEqual(set(user.profile.techs.values_list("code", flat=True)), {"INFRA", "DB"})
        self.assertFalse(hasattr(infra, "calendar_workspaces"))

    def test_admin_user_create_assigns_techs(self):
        admin = User.objects.create_superuser(
            username="create-admin", password="test123", email="create@example.com"
        )
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.post(
            "/api/users/users/create_user/",
            {
                "username": "new-tech-user",
                "email": "new-tech@example.com",
                "password": "test123",
                "techs": [infra.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(list(response.data["techs"]), [{"id": infra.id, "name": "Infrastructure", "code": "INFRA"}])

    def test_admin_user_create_rejects_unknown_tech_ids(self):
        admin = User.objects.create_superuser(
            username="invalid-admin", password="test123", email="invalid@example.com"
        )
        client = APIClient()
        client.force_authenticate(admin)

        response = client.post(
            "/api/users/users/create_user/",
            {
                "username": "invalid-tech-user",
                "email": "invalid-tech@example.com",
                "password": "test123",
                "techs": [999999],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("tech", str(response.data).lower())

    def test_bulk_update_replaces_tech_assignments(self):
        admin = User.objects.create_superuser(
            username="bulk-admin", password="test123", email="bulk@example.com"
        )
        user = User.objects.create_user(username="bulk-user", password="test123")
        infra = Tech.objects.create(name="Infrastructure", code="INFRA")
        database = Tech.objects.create(name="Database", code="DB")
        client = APIClient()
        client.force_authenticate(admin)

        response = client.post(
            "/api/users/users/bulk_update/",
            {"user_ids": [user.id], "techs": [infra.id, database.id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(user.profile.techs.values_list("id", flat=True)), {infra.id, database.id})

    def test_tech_catalog_is_admin_managed(self):
        admin = User.objects.create_superuser(
            username="tech-admin", password="test123", email="admin@example.com"
        )
        client = APIClient()
        client.force_authenticate(admin)

        response = client.post(
            "/api/users/techs/",
            {"name": "Backup", "code": "BACKUP"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["code"], "BACKUP")


class TechMemberActionsTests(TestCase):
    """Tests for adding/removing users from a Tech via the Tech viewset."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="tech-members-admin", password="test123", email="tm@example.com"
        )
        self.tech = Tech.objects.create(name="Infrastructure", code="INFRA")
        self.user1 = User.objects.create_user(
            username="tm-user1", password="test123", first_name="User", last_name="One"
        )
        self.user2 = User.objects.create_user(
            username="tm-user2", password="test123", first_name="User", last_name="Two"
        )
        self.user3 = User.objects.create_user(
            username="tm-user3", password="test123", first_name="User", last_name="Three"
        )
        self.user1.profile.techs.add(self.tech)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_list_tech_members(self):
        """GET /api/users/techs/:id/users/ returns users assigned to the tech."""
        response = self.client.get(f"/api/users/techs/{self.tech.id}/users/")
        self.assertEqual(response.status_code, 200)
        usernames = {u["username"] for u in response.data["results"]}
        self.assertIn("tm-user1", usernames)
        self.assertNotIn("tm-user2", usernames)

    def test_add_users_to_tech(self):
        """POST /api/users/techs/:id/add_users/ adds users to the tech."""
        response = self.client.post(
            f"/api/users/techs/{self.tech.id}/add_users/",
            {"user_ids": [self.user2.id, self.user3.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("added", response.data)
        self.assertEqual(response.data["added"], 2)
        self.assertIn(self.tech, self.user2.profile.techs.all())
        self.assertIn(self.tech, self.user3.profile.techs.all())

    def test_add_users_skips_existing_members(self):
        """Adding a user already in the tech is idempotent (no duplicate, no error)."""
        response = self.client.post(
            f"/api/users/techs/{self.tech.id}/add_users/",
            {"user_ids": [self.user1.id, self.user2.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        # user1 was already a member, user2 is new → added=1
        self.assertEqual(response.data["added"], 1)
        self.assertIn(self.tech, self.user1.profile.techs.all())

    def test_remove_users_from_tech(self):
        """POST /api/users/techs/:id/remove_users/ removes users from the tech."""
        response = self.client.post(
            f"/api/users/techs/{self.tech.id}/remove_users/",
            {"user_ids": [self.user1.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("removed", response.data)
        self.assertEqual(response.data["removed"], 1)
        self.assertNotIn(self.tech, self.user1.profile.techs.all())

    def test_add_users_rejects_unknown_user_ids(self):
        """Unknown user IDs return 400, not a silent success."""
        response = self.client.post(
            f"/api/users/techs/{self.tech.id}/add_users/",
            {"user_ids": [999999]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_add_users_requires_admin(self):
        """Non-admin cannot add users to a tech."""
        non_admin = User.objects.create_user(username="non-admin-tm", password="test123")
        client = APIClient()
        client.force_authenticate(non_admin)
        response = client.post(
            f"/api/users/techs/{self.tech.id}/add_users/",
            {"user_ids": [self.user2.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_add_users_to_inactive_tech_allowed(self):
        """Adding users to an inactive tech is allowed."""
        self.tech.is_active = False
        self.tech.save(update_fields=["is_active"])
        response = self.client.post(
            f"/api/users/techs/{self.tech.id}/add_users/",
            {"user_ids": [self.user2.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.tech, self.user2.profile.techs.all())

    def test_add_users_rejects_non_integer_ids(self):
        """Non-integer user IDs return 400."""
        response = self.client.post(
            f"/api/users/techs/{self.tech.id}/add_users/",
            {"user_ids": ["abc", "def"]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_remove_users_rejects_non_integer_ids(self):
        """Non-integer user IDs in remove return 400."""
        response = self.client.post(
            f"/api/users/techs/{self.tech.id}/remove_users/",
            {"user_ids": ["not-a-number"]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class TechInactiveEditTests(TestCase):
    """Editing a user with inactive Tech assignments should not fail."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="inactive-edit-admin", password="test123", email="ie@example.com"
        )
        self.active_tech = Tech.objects.create(name="Infrastructure", code="INFRA")
        self.inactive_tech = Tech.objects.create(name="Legacy", code="LEGACY", is_active=False)
        self.user = User.objects.create_user(
            username="inactive-tech-user", password="test123", email="itu@example.com"
        )
        self.user.profile.techs.add(self.active_tech, self.inactive_tech)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_edit_user_keeps_inactive_tech(self):
        """PATCH with both active + already-assigned inactive tech succeeds."""
        response = self.client.patch(
            f"/api/users/profiles/{self.user.profile.id}/",
            {"techs": [self.active_tech.id, self.inactive_tech.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertIn(self.active_tech, self.user.profile.techs.all())
        self.assertIn(self.inactive_tech, self.user.profile.techs.all())

    def test_edit_user_rejects_new_inactive_tech(self):
        """PATCH with an unassigned inactive tech returns 400."""
        other_inactive = Tech.objects.create(name="Other Legacy", code="OTHER_LEG", is_active=False)
        response = self.client.patch(
            f"/api/users/profiles/{self.user.profile.id}/",
            {"techs": [self.active_tech.id, other_inactive.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_user_rejects_inactive_tech(self):
        """POST create_user with inactive tech returns 400."""
        response = self.client.post(
            "/api/users/users/create_user/",
            {
                "username": "new-inactive-tech",
                "email": "nit@example.com",
                "password": "test123",
                "techs": [self.inactive_tech.id],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_edit_user_can_remove_inactive_tech(self):
        """PATCH with only active techs removes the inactive tech assignment."""
        response = self.client.patch(
            f"/api/users/profiles/{self.user.profile.id}/",
            {"techs": [self.active_tech.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertIn(self.active_tech, self.user.profile.techs.all())
        self.assertNotIn(self.inactive_tech, self.user.profile.techs.all())

    def test_update_user_action_keeps_inactive_tech(self):
        """PUT update_user with already-assigned inactive tech succeeds.

        The update_user action on UserViewSet must match the serializer's
        validate_techs logic: inactive Techs already assigned to the user
        are allowed. Without this, admins cannot save edits to any user
        who has an inactive Tech assignment.
        """
        response = self.client.put(
            f"/api/users/users/{self.user.id}/update_user/",
            {
                "first_name": "Updated",
                "email": self.user.email,
                "techs": [self.active_tech.id, self.inactive_tech.id],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.user.profile.refresh_from_db()
        self.assertIn(self.active_tech, self.user.profile.techs.all())
        self.assertIn(self.inactive_tech, self.user.profile.techs.all())

    def test_update_user_action_rejects_new_inactive_tech(self):
        """PUT update_user with an unassigned inactive tech returns 400."""
        other_inactive = Tech.objects.create(name="Other Legacy", code="OTHER_LEG", is_active=False)
        response = self.client.put(
            f"/api/users/users/{self.user.id}/update_user/",
            {
                "first_name": "Updated",
                "email": self.user.email,
                "techs": [self.active_tech.id, other_inactive.id],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
