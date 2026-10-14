"""Phase 6 audit findings T-F1..T-F4, reproduced as API calls."""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client, OvertimeLog
from apps.users.models import Team
from plugins.ticket_kpi.analytics import compute_yearly_summary
from plugins.ticket_kpi.models import (
    MonthlyKPI,
    NormalizedTicket,
    TicketImportBatch,
    TicketOvertimeLink,
)
from plugins.ticket_kpi.viewsets import (
    TicketKPIDashboardViewSet,
    TicketKPIReportViewSet,
    TicketOvertimeLinkViewSet,
    TicketUploadViewSet,
)


class Phase6Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.admin = User.objects.create_user(username='p6_admin', password='x', is_staff=True)
        cls.tl = User.objects.create_user(username='p6_tl', password='x')
        cls.member = User.objects.create_user(username='p6_member', password='x')
        cls.outsider = User.objects.create_user(username='p6_outsider', password='x')
        cls.team = Team.objects.create(name='P6 Team', code='P6', team_leader=cls.tl)
        cls.team.members.add(cls.tl.profile, cls.member.profile)

    def get(self, viewset, action, user, params=None):
        request = self.factory.get('/x/', params or {})
        force_authenticate(request, user=user)
        return viewset.as_view({'get': action})(request)


class EmptyUserIdsTests(Phase6Base):
    """T-F1."""

    def test_empty_team_yearly_summary_returns_no_rows(self):
        MonthlyKPI.objects.create(user=self.outsider, month=date(2026, 3, 1), total_tickets=7)
        empty_team = Team.objects.create(name='P6 Empty', code='P6E', team_leader=self.tl)
        resp = self.get(
            TicketKPIReportViewSet, 'yearly_summary', self.admin,
            {'year': 2026, 'team_id': empty_team.id})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['total_tickets'], 0)
        self.assertEqual(resp.data.get('per_user_summary', []), [])

    def test_empty_user_ids_in_analytics_means_nobody_not_everybody(self):
        MonthlyKPI.objects.create(user=self.outsider, month=date(2026, 3, 1), total_tickets=7)
        self.assertEqual(compute_yearly_summary(2026, user_ids=[])['total_tickets'], 0)
        self.assertEqual(compute_yearly_summary(2026, user_ids=None)['total_tickets'], 7)

    def test_empty_user_ids_with_client_filter_means_nobody(self):
        client = Client.objects.create(name='P6 Client', code='P6C')
        batch = TicketImportBatch.objects.create(user=self.outsider, month=date(2026, 3, 1))
        batch.clients.add(client)
        NormalizedTicket.objects.create(
            batch=batch, row_index=1, ticket_id='P6-1', title='t', status='closed',
            created_at='2026-03-10T08:00:00Z')
        self.assertEqual(
            compute_yearly_summary(2026, user_ids=[], client_ids=[client.id])['total_tickets'], 0)


class MonthsCapTests(Phase6Base):
    """T-F2."""

    def test_trend_months_is_capped(self):
        resp = self.get(TicketKPIDashboardViewSet, 'trend', self.tl, {'months': 200000})
        self.assertEqual(resp.status_code, 400)

    def test_team_trend_months_is_capped(self):
        resp = self.get(TicketKPIDashboardViewSet, 'team_trend', self.tl, {'months': 200000})
        self.assertEqual(resp.status_code, 400)

    def test_months_below_one_refused(self):
        resp = self.get(TicketKPIDashboardViewSet, 'trend', self.tl, {'months': 0})
        self.assertEqual(resp.status_code, 400)

    def test_default_and_twelve_months_still_work(self):
        self.assertEqual(self.get(TicketKPIDashboardViewSet, 'trend', self.tl).status_code, 200)
        self.assertEqual(
            self.get(TicketKPIDashboardViewSet, 'team_trend', self.tl, {'months': 12}).status_code, 200)


class AutoLinkReviewTests(Phase6Base):
    """T-F3."""

    def test_owner_cannot_self_confirm_an_auto_link_by_patch(self):
        client = Client.objects.create(name='P6 LClient', code='P6L')
        batch = TicketImportBatch.objects.create(user=self.member, month=date(2026, 3, 1))
        batch.clients.add(client)
        ticket = NormalizedTicket.objects.create(
            batch=batch, row_index=1, ticket_id='P6-L1', title='t', status='closed',
            created_at='2026-03-10T08:00:00Z')
        ot = OvertimeLog.objects.create(
            user=self.member, client=client, date=date(2026, 3, 10), hours=2)
        link = TicketOvertimeLink.objects.create(
            overtime_log=ot, normalized_ticket=ticket, link_method='auto',
            review_status='pending')
        request = self.factory.patch(
            f'/links/{link.pk}/', {'review_status': 'confirmed'}, format='json')
        force_authenticate(request, self.member)
        TicketOvertimeLinkViewSet.as_view({'patch': 'partial_update'})(request, pk=link.pk)
        link.refresh_from_db()
        self.assertEqual(link.review_status, 'pending')


class ReviewedBatchDeleteTests(Phase6Base):
    """T-F4."""

    def _delete(self, user, batch):
        request = self.factory.delete(f'/upload/{batch.pk}/delete_batch/')
        force_authenticate(request, user)
        return TicketUploadViewSet.as_view({'delete': 'delete_batch'})(request, pk=batch.pk)

    def _batch(self, reviewed):
        batch = TicketImportBatch.objects.create(user=self.member, month=date(2026, 3, 1))
        if reviewed:
            TicketImportBatch.objects.filter(pk=batch.pk).update(
                reviewed_by=self.tl, reviewed_at=timezone.now())
        return batch

    def test_tl_cannot_delete_reviewed_batch(self):
        batch = self._batch(reviewed=True)
        resp = self._delete(self.tl, batch)
        self.assertIn(resp.status_code, (403, 409), resp.data)
        self.assertTrue(TicketImportBatch.objects.filter(pk=batch.pk).exists())

    def test_tl_can_still_delete_unreviewed_batch(self):
        batch = self._batch(reviewed=False)
        self.assertEqual(self._delete(self.tl, batch).status_code, 200)

    def test_admin_can_still_delete_reviewed_batch(self):
        batch = self._batch(reviewed=True)
        self.assertEqual(self._delete(self.admin, batch).status_code, 200)
