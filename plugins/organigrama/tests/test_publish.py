"""
Phase D — Publish revisions and audience targeting.

Verifies atomic publish/unpublish, revision immutability, audience
resolution (role/group/all), and viewer visibility isolation.
"""
import uuid
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.permissions.models import Group, Role, UserGroup, UserRole
from plugins.organigrama.models import (
    OrgChart,
    OrgChartAudienceRole,
    OrgChartAudienceGroup,
    OrgChartNode,
    OrgChartEdge,
)
from plugins.organigrama.serializers import OrgChartWriteSerializer
from plugins.organigrama.services.draft_service import create_chart, save_draft
from plugins.organigrama.services.publish_service import (
    publish_chart,
    unpublish_chart,
    PublishValidationError,
)
from plugins.organigrama.services.audience_service import user_can_view_chart, list_visible_chart_ids


def _node(shape="person", name="Node", **overrides):
    base = {
        "node_uuid": str(uuid.uuid4()),
        "shape_type": shape,
        "display_name": name,
        "position_x": 0.0,
        "position_y": 0.0,
        "width": 180,
        "height": 80,
        "custom_fields": {},
    }
    base.update(overrides)
    return base


def _edge(source, target, **overrides):
    base = {
        "edge_uuid": str(uuid.uuid4()),
        "source_uuid": source["node_uuid"],
        "target_uuid": target["node_uuid"],
        "edge_type": "reports_to",
    }
    base.update(overrides)
    return base


class PublishServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(
            username="staff", password="testpass", is_staff=True
        )
        cls.user = User.objects.create_user(
            username="user", password="testpass"
        )

    def test_publish_creates_revision_and_sets_status(self):
        chart = create_chart(name="Engineering", created_by=self.staff)
        root = _node(name="CEO")
        child = _node(name="CTO")
        edge = _edge(root, child)
        save_draft(
            chart,
            [root, child],
            [edge],
            expected_revision_number=0,
            updated_by=self.staff,
        )

        revision = publish_chart(chart, published_by=self.staff)

        chart.refresh_from_db()
        self.assertEqual(chart.status, "published")
        self.assertEqual(chart.published_revision, revision)
        self.assertEqual(revision.version, 1)
        self.assertEqual(revision.published_by, self.staff)
        self.assertIn("nodes", revision.payload)
        self.assertIn("edges", revision.payload)

    def test_publish_rejects_invalid_draft(self):
        chart = create_chart(name="Bad", created_by=self.staff)
        # Bypass save_draft to inject an invalid self-edge directly.
        n = OrgChartNode.objects.create(
            chart=chart,
            node_uuid=uuid.uuid4(),
            shape_type="person",
            display_name="A",
            width=180,
            height=80,
        )
        OrgChartEdge.objects.create(
            chart=chart,
            source=n,
            target=n,
            edge_type="reports_to",
        )

        with self.assertRaises(PublishValidationError):
            publish_chart(chart, published_by=self.staff)

        chart.refresh_from_db()
        self.assertIsNone(chart.published_revision)
        self.assertEqual(chart.status, "draft")

    def test_unpublish_clears_published_revision(self):
        chart = create_chart(name="Temp", created_by=self.staff)
        a = _node(name="A")
        save_draft(chart, [a], [], expected_revision_number=0, updated_by=self.staff)
        publish_chart(chart, published_by=self.staff)

        unpublish_chart(chart)

        chart.refresh_from_db()
        self.assertIsNone(chart.published_revision)
        self.assertEqual(chart.status, "draft")

    def test_publish_rejects_empty_chart(self):
        """G3: a chart with zero nodes cannot be published."""
        chart = create_chart(name="Empty", created_by=self.staff)
        save_draft(chart, [], [], expected_revision_number=0, updated_by=self.staff)
        with self.assertRaises(PublishValidationError):
            publish_chart(chart, published_by=self.staff)
        chart.refresh_from_db()
        self.assertEqual(chart.status, "draft")
        self.assertIsNone(chart.published_revision)

    def test_publish_rejects_empty_selected_audience(self):
        """G2: publishing with audience_mode=selected and no roles/groups is rejected."""
        chart = create_chart(name="Empty Audience", created_by=self.staff)
        a = _node(name="A")
        save_draft(chart, [a], [], expected_revision_number=0, updated_by=self.staff)
        chart.audience_mode = "selected"
        chart.save(update_fields=["audience_mode"])
        with self.assertRaises(PublishValidationError):
            publish_chart(chart, published_by=self.staff)
        chart.refresh_from_db()
        self.assertEqual(chart.status, "draft")
        self.assertIsNone(chart.published_revision)

    def test_write_rejects_invalid_selected_audience_targets(self):
        """Selected audiences must contain real, allowlisted targets."""
        invalid_role = OrgChartWriteSerializer(
            data={"name": "Invalid role", "audience_mode": "selected", "audience_role_codes": ["unknown"]}
        )
        self.assertFalse(invalid_role.is_valid())

        invalid_group = OrgChartWriteSerializer(
            data={"name": "Invalid group", "audience_mode": "selected", "audience_group_ids": [999999999]}
        )
        self.assertFalse(invalid_group.is_valid())

    def test_write_rejects_invalid_audience_targets_for_all_authenticated(self):
        invalid_role = OrgChartWriteSerializer(
            data={
                "name": "Invalid public role",
                "audience_mode": "all_authenticated",
                "audience_role_codes": ["unknown"],
            }
        )
        self.assertFalse(invalid_role.is_valid())

        invalid_group = OrgChartWriteSerializer(
            data={
                "name": "Invalid public group",
                "audience_mode": "all_authenticated",
                "audience_group_ids": [999999999],
            }
        )
        self.assertFalse(invalid_group.is_valid())

    def test_publish_allows_selected_audience_with_role(self):
        """G2: selected audience with at least one role publishes normally."""
        chart = create_chart(name="With Role", created_by=self.staff)
        a = _node(name="A")
        save_draft(chart, [a], [], expected_revision_number=0, updated_by=self.staff)
        chart.audience_mode = "selected"
        chart.save(update_fields=["audience_mode"])
        chart.audience_roles.create(role_code="hr")
        revision = publish_chart(chart, published_by=self.staff)
        chart.refresh_from_db()
        self.assertEqual(chart.status, "published")
        self.assertEqual(chart.published_revision, revision)


class AudienceResolverTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(
            username="staff", password="testpass", is_staff=True
        )
        cls.hr_user = User.objects.create_user(
            username="hr_user", password="testpass"
        )
        cls.role = Role.objects.get_or_create(code="hr", defaults={"name": "HR"})[0]
        UserRole.objects.create(user=cls.hr_user, role=cls.role, is_active=True)
        cls.regular = User.objects.create_user(
            username="regular", password="testpass"
        )
        cls.group = Group.objects.get_or_create(
            code="eng", defaults={"name": "Engineering"}
        )[0]
        cls.group_user = User.objects.create_user(
            username="group_user", password="testpass"
        )
        UserGroup.objects.create(user=cls.group_user, group=cls.group)

    def _publish(self, audience_mode, roles=None, groups=None):
        chart = create_chart(name="Audience", created_by=self.staff)
        a = _node(name="A")
        save_draft(chart, [a], [], expected_revision_number=0, updated_by=self.staff)
        publish_chart(chart, published_by=self.staff)
        chart.audience_mode = audience_mode
        chart.save(update_fields=["audience_mode"])
        if roles:
            for code in roles:
                chart.audience_roles.create(role_code=code)
        if groups:
            for g in groups:
                chart.audience_groups.create(group=g)
        return chart

    def test_all_authenticated_visible_to_regular_user(self):
        chart = self._publish("all_authenticated")
        self.assertTrue(user_can_view_chart(self.regular, chart))

    def test_private_admin_visible_only_to_staff(self):
        chart = self._publish("private_admin")
        self.assertTrue(user_can_view_chart(self.staff, chart))
        self.assertFalse(user_can_view_chart(self.regular, chart))

    def test_selected_role_match(self):
        chart = self._publish("selected", roles=["hr"])
        self.assertTrue(user_can_view_chart(self.hr_user, chart))
        self.assertFalse(user_can_view_chart(self.regular, chart))

    def test_selected_group_match(self):
        chart = self._publish("selected", groups=[self.group])
        self.assertTrue(user_can_view_chart(self.group_user, chart))
        self.assertFalse(user_can_view_chart(self.regular, chart))

    def test_selected_empty_audience_is_invalid(self):
        chart = self._publish("selected")
        self.assertFalse(user_can_view_chart(self.regular, chart))
        self.assertFalse(user_can_view_chart(self.staff, chart))

    def test_draft_not_visible_to_viewers(self):
        chart = create_chart(name="Draft", created_by=self.staff)
        chart.audience_mode = "all_authenticated"
        chart.save(update_fields=["audience_mode"])
        self.assertFalse(user_can_view_chart(self.regular, chart))

    def test_role_plus_group_or_semantics(self):
        chart = self._publish("selected", roles=["hr"], groups=[self.group])
        self.assertTrue(user_can_view_chart(self.hr_user, chart))
        self.assertTrue(user_can_view_chart(self.group_user, chart))
        self.assertFalse(user_can_view_chart(self.regular, chart))

    def test_role_user_without_matching_role_only_group(self):
        chart = self._publish("selected", groups=[self.group])
        self.assertFalse(user_can_view_chart(self.hr_user, chart))
        self.assertTrue(user_can_view_chart(self.group_user, chart))


class AudienceListParityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(
            username="staff2", password="testpass", is_staff=True
        )
        cls.hr_user = User.objects.create_user(
            username="hr_user2", password="testpass"
        )
        cls.role = Role.objects.get_or_create(code="hr", defaults={"name": "HR"})[0]
        UserRole.objects.create(user=cls.hr_user, role=cls.role, is_active=True)
        cls.regular = User.objects.create_user(
            username="regular2", password="testpass"
        )
        cls.group = Group.objects.get_or_create(
            code="eng2", defaults={"name": "Engineering 2"}
        )[0]
        cls.group_user = User.objects.create_user(
            username="group_user2", password="testpass"
        )
        UserGroup.objects.create(user=cls.group_user, group=cls.group)

    def _publish(self, audience_mode, roles=None, groups=None):
        chart = create_chart(name="Parity", slug=str(uuid.uuid4()), created_by=self.staff)
        a = _node(name="A")
        save_draft(chart, [a], [], expected_revision_number=0, updated_by=self.staff)
        publish_chart(chart, published_by=self.staff)
        chart.audience_mode = audience_mode
        chart.save(update_fields=["audience_mode"])
        if roles:
            for code in roles:
                chart.audience_roles.create(role_code=code)
        if groups:
            for g in groups:
                chart.audience_groups.create(group=g)
        return chart

    def test_list_visible_chart_ids_matches_user_can_view_chart(self):
        public_chart = self._publish("all_authenticated")
        admin_chart = self._publish("private_admin")
        role_chart = self._publish("selected", roles=["hr"])
        group_chart = self._publish("selected", groups=[self.group])
        empty_chart = self._publish("selected")
        draft_chart = create_chart(name="Draft", created_by=self.staff)
        draft_chart.audience_mode = "all_authenticated"
        draft_chart.save(update_fields=["audience_mode"])

        visible = list_visible_chart_ids(self.hr_user)
        for chart in [public_chart, role_chart]:
            self.assertIn(chart.id, visible)
            self.assertTrue(user_can_view_chart(self.hr_user, chart))
        for chart in [admin_chart, group_chart, empty_chart, draft_chart]:
            self.assertNotIn(chart.id, visible)
            self.assertFalse(user_can_view_chart(self.hr_user, chart))

    def test_list_visible_chart_ids_for_group_user(self):
        public_chart = self._publish("all_authenticated")
        group_chart = self._publish("selected", groups=[self.group])

        visible = list_visible_chart_ids(self.group_user)
        self.assertIn(public_chart.id, visible)
        self.assertIn(group_chart.id, visible)
        self.assertNotIn(self._publish("selected", roles=["hr"]).id, visible)

    def test_list_visible_chart_ids_includes_private_admin_for_staff(self):
        """Parity: staff see private_admin charts in the directory.

        ``user_can_view_chart`` returns True for staff on private_admin charts,
        so ``list_visible_chart_ids`` must include them for staff too —
        otherwise the directory omits charts the resolver says they can view.
        """
        public_chart = self._publish("all_authenticated")
        admin_chart = self._publish("private_admin")

        visible = list_visible_chart_ids(self.staff)
        self.assertIn(public_chart.id, visible)
        self.assertIn(admin_chart.id, visible)
        # Resolver parity for the same charts.
        self.assertTrue(user_can_view_chart(self.staff, admin_chart))

    def test_list_visible_chart_ids_excludes_private_admin_for_non_staff(self):
        admin_chart = self._publish("private_admin")
        visible = list_visible_chart_ids(self.regular)
        self.assertNotIn(admin_chart.id, visible)
        self.assertFalse(user_can_view_chart(self.regular, admin_chart))


class AudienceAtomicityTests(TestCase):
    """Chart metadata and audience rows must commit or roll back together.

    Regression for the non-atomic create/update path: the serializer created
    or updated the chart row first, then mutated audience rows in a separate
    operation. A failure in audience mutation could leave the chart with
    stale or missing audience targeting. Both paths must now be wrapped in a
    single ``transaction.atomic()`` block.
    """

    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(
            username="atomic_staff", password="testpass", is_staff=True
        )
        cls.group = Group.objects.get_or_create(
            code="atomic_eng", defaults={"name": "Atomic Engineering"}
        )[0]

    def _make_serializer(self, data, instance=None):
        factory = APIRequestFactory()
        request = factory.post("/charts/", data, format="json")
        # Set user directly — force_authenticate targets DRF's Request wrapper,
        # but the serializer reads context["request"].user from the plain
        # HttpRequest we pass here.
        request.user = self.staff
        return OrgChartWriteSerializer(
            instance=instance,
            data=data,
            context={"request": request},
        )

    def test_create_rolls_back_chart_when_audience_write_fails(self):
        """If audience bulk_create fails, the chart row must not persist."""
        serializer = self._make_serializer(
            data={
                "name": "Atomic Create",
                "audience_mode": "selected",
                "audience_role_codes": ["hr"],
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with patch.object(
            OrgChartAudienceRole.objects,
            "bulk_create",
            side_effect=IntegrityError("simulated audience failure"),
        ):
            with self.assertRaises(IntegrityError):
                serializer.save()

        # The chart row must have been rolled back — no chart with this name.
        self.assertFalse(
            OrgChart.objects.filter(name="Atomic Create").exists(),
            "Chart row persisted despite audience write failure — not atomic.",
        )

    def test_update_rolls_back_chart_fields_when_audience_write_fails(self):
        """If audience bulk_create fails on update, chart field changes roll back."""
        chart = create_chart(name="Before Update", created_by=self.staff)
        original_name = chart.name

        serializer = self._make_serializer(
            data={
                "name": "After Update",
                "audience_mode": "selected",
                "audience_role_codes": ["hr"],
            },
            instance=chart,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with patch.object(
            OrgChartAudienceRole.objects,
            "bulk_create",
            side_effect=IntegrityError("simulated audience failure"),
        ):
            with self.assertRaises(IntegrityError):
                serializer.save()

        chart.refresh_from_db()
        self.assertEqual(
            chart.name,
            original_name,
            "Chart name changed despite audience write failure — not atomic.",
        )
        # No audience rows should exist (the prior empty set is preserved).
        self.assertEqual(chart.audience_roles.count(), 0)

    def test_update_rolls_back_audience_replacement_on_group_write_failure(self):
        """Audience replacement (delete + bulk_create) must be atomic too.

        Pre-existing audience rows must survive a failure during the
        replacement bulk_create, otherwise a partial delete leaves the chart
        with no audience targeting.
        """
        chart = create_chart(name="Group Atomic", created_by=self.staff)
        chart.audience_mode = "selected"
        chart.save(update_fields=["audience_mode"])
        chart.audience_groups.create(group=self.group)
        self.assertEqual(chart.audience_groups.count(), 1)

        serializer = self._make_serializer(
            data={
                "name": "Group Atomic",
                "audience_mode": "selected",
                "audience_group_ids": [self.group.id],
            },
            instance=chart,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with patch.object(
            OrgChartAudienceGroup.objects,
            "bulk_create",
            side_effect=IntegrityError("simulated group failure"),
        ):
            with self.assertRaises(IntegrityError):
                serializer.save()

        chart.refresh_from_db()
        # The pre-existing audience group row must survive — the delete must
        # roll back with the failed bulk_create.
        self.assertEqual(
            chart.audience_groups.count(),
            1,
            "Audience group row lost during failed replacement — not atomic.",
        )
