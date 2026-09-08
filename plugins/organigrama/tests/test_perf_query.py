"""
Performance query testing for Organigrama plugin.
"""
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.contrib.auth.models import User
from django.db.models import Count
from plugins.organigrama.models import (
    OrgChart,
    OrgChartNode,
    OrgChartEdge,
    OrgChartAudienceRole,
    OrgChartAudienceGroup,
)
from plugins.organigrama.services.audience_service import (
    user_can_view_chart,
    get_user_role_codes,
    get_user_group_ids,
    list_visible_chart_ids,
)
from plugins.organigrama.services.draft_service import get_draft


class OrganigramaPerformanceTest(TestCase):
    
    def setUp(self):
        self.user = User.objects.create(username='testuser')
        self.chart = OrgChart.objects.create(name='Test Chart', slug='test-chart', status='published')
        self.node = OrgChartNode.objects.create(chart=self.chart, shape_type='person', display_name='Test Node')
        self.edge = OrgChartEdge.objects.create(chart=self.chart, source=self.node, target=self.node, edge_type='reports_to')
        OrgChartAudienceRole.objects.create(chart=self.chart, role_code='employee')
    
    def test_list_charts_with_prefetch(self):
        """Test list endpoint query count."""
        with CaptureQueriesContext(connection) as ctx:
            qs = OrgChart.objects.annotate(node_count=Count("nodes")).prefetch_related("audience_roles", "audience_groups", "published_revision")
            _ = list(qs)
        print(f"\n[OK] LIST CHARTS WITH PREFETCH: {len(ctx)} queries")
        for i, q in enumerate(ctx, 1):
            print(f"  Q{i}: {q['sql'][:80]}...")
        self.assertLess(len(ctx), 5, "List endpoint should use <=5 queries")
    
    def test_get_draft_queries(self):
        """Test get_draft endpoint query count."""
        with CaptureQueriesContext(connection) as ctx:
            _ = get_draft(self.chart)
        print(f"\n[OK] GET DRAFT: {len(ctx)} queries")
        for i, q in enumerate(ctx, 1):
            print(f"  Q{i}: {q['sql'][:80]}...")
        self.assertLess(len(ctx), 5, "get_draft should use <=5 queries")
    
    def test_user_can_view_chart_with_prefetch(self):
        """Test user_can_view_chart with prefetched audience."""
        with CaptureQueriesContext(connection) as ctx:
            chart_prefetch = OrgChart.objects.prefetch_related("audience_roles", "audience_groups").get(pk=self.chart.pk)
            _ = user_can_view_chart(self.user, chart_prefetch)
        print(f"\n[OK] USER CAN VIEW (WITH PREFETCH): {len(ctx)} queries")
        for i, q in enumerate(ctx, 1):
            print(f"  Q{i}: {q['sql'][:80]}...")
    
    def test_user_can_view_chart_without_prefetch(self):
        """Test user_can_view_chart without prefetch (N+1 check)."""
        with CaptureQueriesContext(connection) as ctx:
            chart_no_prefetch = OrgChart.objects.get(pk=self.chart.pk)
            _ = user_can_view_chart(self.user, chart_no_prefetch)
        print(f"\n[OK] USER CAN VIEW (NO PREFETCH): {len(ctx)} queries")
        for i, q in enumerate(ctx, 1):
            print(f"  Q{i}: {q['sql'][:80]}...")
    
    def test_get_user_role_codes(self):
        """Test get_user_role_codes query count."""
        with CaptureQueriesContext(connection) as ctx:
            _ = get_user_role_codes(self.user)
        print(f"\n[OK] GET USER ROLE CODES: {len(ctx)} queries")
        for i, q in enumerate(ctx, 1):
            print(f"  Q{i}: {q['sql'][:80]}...")
    
    def test_get_user_group_ids(self):
        """Test get_user_group_ids query count."""
        with CaptureQueriesContext(connection) as ctx:
            _ = get_user_group_ids(self.user)
        print(f"\n[OK] GET USER GROUP IDS: {len(ctx)} queries")
        for i, q in enumerate(ctx, 1):
            print(f"  Q{i}: {q['sql'][:80]}...")

    def test_list_visible_chart_ids_at_scale(self):
        """Measure list_visible_chart_ids with a realistic dataset.

        Creates 200 published charts across all three audience modes, with
        role and group audiences, then measures the query count and captures
        the SQL for EXPLAIN-style review. This is a measurement test, not a
        pass/fail perf gate — the assertion is deliberately loose (<=10
        queries) so it documents the current cost without flaking on
        environment differences.
        """
        from apps.permissions.models import UserGroup, Group

        # Build a user with a role and a group membership.
        viewer = User.objects.create_user(username="viewer", password="x")
        viewer.profile.is_hr_user = True
        viewer.profile.save(update_fields=["is_hr_user"])
        group = Group.objects.create(name="Viewers")
        UserGroup.objects.create(user=viewer, group=group, is_deleted=False)

        # 80 all_authenticated charts
        for i in range(80):
            OrgChart.objects.create(
                name=f"public-{i}", slug=f"public-{i}", status="published",
                audience_mode="all_authenticated",
            )
        # 60 selected charts — half role-matched, half group-matched
        for i in range(30):
            c = OrgChart.objects.create(
                name=f"role-{i}", slug=f"role-{i}", status="published",
                audience_mode="selected",
            )
            OrgChartAudienceRole.objects.create(chart=c, role_code="hr")
        for i in range(30):
            c = OrgChart.objects.create(
                name=f"group-{i}", slug=f"group-{i}", status="published",
                audience_mode="selected",
            )
            OrgChartAudienceGroup.objects.create(chart=c, group=group)
        # 60 private_admin charts (viewer is not staff, so excluded)
        for i in range(60):
            OrgChart.objects.create(
                name=f"admin-{i}", slug=f"admin-{i}", status="published",
                audience_mode="private_admin",
            )

        with CaptureQueriesContext(connection) as ctx:
            visible = list_visible_chart_ids(viewer)

        # 80 public + 30 role + 30 group = 140 visible (dedup may reduce
        # if a chart matched both, but here each selected chart has only
        # one audience row type).
        self.assertEqual(len(visible), 140)

        # Measurement: capture query count and SQL for documentation.
        # The current OR + distinct() implementation issues a small constant
        # number of queries (role/group resolution + the main filter).
        print(f"\n[MEASURE] LIST_VISIBLE_AT_SCALE: {len(ctx)} queries for 200 charts")
        for i, q in enumerate(ctx, 1):
            print(f"  Q{i}: {q['sql'][:120]}...")
        # Loose bound — documents current cost; not a hard perf gate.
        self.assertLessEqual(len(ctx), 10, "list_visible_chart_ids should be <=10 queries at 200 charts")

    def test_list_visible_chart_ids_parity_with_user_can_view_chart_at_scale(self):
        """Verify list_visible_chart_ids and user_can_view_chart agree at scale."""
        from apps.permissions.models import UserGroup, Group

        viewer = User.objects.create_user(username="parity_viewer", password="x")
        viewer.profile.is_hr_user = True
        viewer.profile.save(update_fields=["is_hr_user"])
        group = Group.objects.create(name="ParityViewers")
        UserGroup.objects.create(user=viewer, group=group, is_deleted=False)

        charts = []
        for i in range(20):
            c = OrgChart.objects.create(
                name=f"pub-{i}", slug=f"pub-{i}", status="published",
                audience_mode="all_authenticated",
            )
            charts.append(c)
        for i in range(20):
            c = OrgChart.objects.create(
                name=f"role-{i}", slug=f"role-{i}", status="published",
                audience_mode="selected",
            )
            OrgChartAudienceRole.objects.create(chart=c, role_code="hr")
            charts.append(c)
        for i in range(20):
            c = OrgChart.objects.create(
                name=f"grp-{i}", slug=f"grp-{i}", status="published",
                audience_mode="selected",
            )
            OrgChartAudienceGroup.objects.create(chart=c, group=group)
            charts.append(c)

        visible_ids = list_visible_chart_ids(viewer)
        prefetched = OrgChart.objects.prefetch_related("audience_roles", "audience_groups").filter(
            status="published"
        )
        for chart in prefetched:
            can_view = user_can_view_chart(viewer, chart)
            in_list = chart.id in visible_ids
            self.assertEqual(
                can_view, in_list,
                f"Parity mismatch on chart {chart.id} ({chart.name}): "
                f"user_can_view_chart={can_view}, in list={in_list}",
            )
