from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client, OvertimeLog
from apps.users.models import Team
from plugins.ticket_kpi.models import (
    NormalizedTicket,
    TicketImportBatch,
    TicketOvertimeLink,
)
from plugins.ticket_kpi.signals import auto_match_links_on_batch_import
from plugins.ticket_kpi.viewsets import TicketOvertimeLinkViewSet


class TicketOvertimeLinkTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.admin = User.objects.create_user(
            username='link_admin', password='testpass', is_staff=True
        )
        cls.tl = User.objects.create_user(username='link_tl', password='testpass')
        cls.member = User.objects.create_user(username='link_member', password='testpass')
        cls.other = User.objects.create_user(username='link_other', password='testpass')
        cls.hr = User.objects.create_user(username='link_hr', password='testpass')

        cls.team = Team.objects.create(
            name='Link Team', code='LINK', team_leader=cls.tl
        )
        cls.team.members.add(cls.tl.profile, cls.member.profile)
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save(update_fields=['is_hr_user'])

        cls.link_client = Client.objects.create(name='Link Client', code='LINK-CLIENT')
        cls.other_client = Client.objects.create(
            name='Other Link Client', code='OTHER-LINK-CLIENT'
        )
        cls.batch = TicketImportBatch.objects.create(
            user=cls.member,
            month=date(2026, 3, 1),
        )
        cls.batch.clients.add(cls.link_client)
        cls.ticket = NormalizedTicket.objects.create(
            batch=cls.batch,
            row_index=1,
            ticket_id='INC-LINK-001',
            title='Linkable ticket',
            status='closed',
            created_at='2026-03-10T08:00:00Z',
        )
        cls.ot = OvertimeLog.objects.create(
            user=cls.member,
            client=cls.link_client,
            date=date(2026, 3, 10),
            hours=2,
            evidence_type='ticket',
            evidence='INC-LINK-001',
        )

    def _request(self, method, user, data=None, query_params=None, pk=None):
        path = '/links/' if pk is None else f'/links/{pk}/'
        request = getattr(self.factory, method)(
            path, data=data or {}, query_params=query_params or {}, format='json'
        )
        force_authenticate(request, user=user)
        return request

    def test_owner_can_create_link_and_audit_is_best_effort(self):
        request = self._request(
            'post',
            self.member,
            {'overtime_log': self.ot.id, 'normalized_ticket': self.ticket.id},
        )
        with patch('plugins.ticket_kpi.viewsets._audit_link_action') as audit:
            response = TicketOvertimeLinkViewSet.as_view({'post': 'create'})(request)

        self.assertEqual(response.status_code, 201)
        link = TicketOvertimeLink.objects.get()
        self.assertEqual(link.link_method, 'manual')
        self.assertEqual(link.review_status, 'confirmed')
        audit.assert_called_once()

    def test_non_owner_non_tl_cannot_create_link(self):
        request = self._request(
            'post',
            self.other,
            {'overtime_log': self.ot.id, 'normalized_ticket': self.ticket.id},
        )
        response = TicketOvertimeLinkViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(TicketOvertimeLink.objects.exists())

    def test_tl_can_create_link_for_team_member(self):
        request = self._request(
            'post',
            self.tl,
            {'overtime_log': self.ot.id, 'normalized_ticket': self.ticket.id},
        )
        response = TicketOvertimeLinkViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 201)

    def test_hr_can_view_all_links_but_cannot_mutate(self):
        link = TicketOvertimeLink.objects.create(
            overtime_log=self.ot,
            normalized_ticket=self.ticket,
            linked_by=self.member,
        )
        list_request = self._request('get', self.hr)
        list_response = TicketOvertimeLinkViewSet.as_view({'get': 'list'})(list_request)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data['count'], 1)

        delete_request = self._request('delete', self.hr, pk=link.id)
        delete_response = TicketOvertimeLinkViewSet.as_view({'delete': 'destroy'})(
            delete_request, pk=link.id
        )
        self.assertEqual(delete_response.status_code, 403)
        self.assertTrue(TicketOvertimeLink.objects.filter(pk=link.id).exists())

    def test_client_and_date_scoping_are_enforced(self):
        wrong_client_ot = OvertimeLog.objects.create(
            user=self.member,
            client=self.other_client,
            date=date(2026, 3, 10),
            hours=2,
        )
        request = self._request(
            'post',
            self.member,
            {'overtime_log': wrong_client_ot.id, 'normalized_ticket': self.ticket.id},
        )
        response = TicketOvertimeLinkViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 400)

        outside_month_ot = OvertimeLog.objects.create(
            user=self.member,
            client=self.link_client,
            date=date(2026, 4, 1),
            hours=2,
        )
        request = self._request(
            'post',
            self.member,
            {'overtime_log': outside_month_ot.id, 'normalized_ticket': self.ticket.id},
        )
        response = TicketOvertimeLinkViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 400)

    def test_search_is_scoped_to_accessible_non_overridden_batches(self):
        other_batch = TicketImportBatch.objects.create(
            user=self.other, month=date(2026, 3, 1)
        )
        NormalizedTicket.objects.create(
            batch=other_batch, ticket_id='INC-LINK-001', title='Private ticket'
        )
        overridden_batch = TicketImportBatch.objects.create(
            user=self.member, month=date(2026, 3, 1), is_overridden=True
        )
        NormalizedTicket.objects.create(
            batch=overridden_batch, ticket_id='INC-LINK-001', title='Stale ticket'
        )

        request = self._request('get', self.member, query_params={'q': 'INC-LINK'})
        response = TicketOvertimeLinkViewSet.as_view({'get': 'search_tickets'})(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data['results']], [self.ticket.id])

    def test_duplicate_link_is_rejected(self):
        TicketOvertimeLink.objects.create(
            overtime_log=self.ot,
            normalized_ticket=self.ticket,
            linked_by=self.member,
        )
        request = self._request(
            'post',
            self.member,
            {'overtime_log': self.ot.id, 'normalized_ticket': self.ticket.id},
        )
        response = TicketOvertimeLinkViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(response.status_code, 400)

    def test_delete_source_rows_cascades_link(self):
        link = TicketOvertimeLink.objects.create(
            overtime_log=self.ot,
            normalized_ticket=self.ticket,
            linked_by=self.member,
        )
        self.ot.delete()
        self.assertFalse(TicketOvertimeLink.objects.filter(pk=link.pk).exists())

    def test_non_numeric_overtime_id_returns_400(self):
        request = self._request(
            'get', self.member, query_params={'overtime_log_id': 'not-an-int'}
        )
        response = TicketOvertimeLinkViewSet.as_view({'get': 'overtime_links'})(request)
        self.assertEqual(response.status_code, 400)

    def test_auto_match_creates_pending_exact_token_link(self):
        with self.captureOnCommitCallbacks(execute=True):
            auto_match_links_on_batch_import(
                sender=TicketImportBatch,
                instance=self.batch,
                created=True,
            )
        link = TicketOvertimeLink.objects.get()
        self.assertEqual(link.link_method, 'auto')
        self.assertEqual(link.review_status, 'pending')

    def test_auto_match_does_not_match_substrings_or_wrong_client(self):
        NormalizedTicket.objects.create(
            batch=self.batch,
            ticket_id='12',
            title='Short identifier',
        )
        OvertimeLog.objects.create(
            user=self.member,
            client=self.link_client,
            date=date(2026, 3, 11),
            hours=1,
            evidence='INC-12 123',
        )
        wrong_client_ot = OvertimeLog.objects.create(
            user=self.member,
            client=self.other_client,
            date=date(2026, 3, 12),
            hours=1,
            evidence='12',
        )
        with self.captureOnCommitCallbacks(execute=True):
            auto_match_links_on_batch_import(
                sender=TicketImportBatch,
                instance=self.batch,
                created=True,
            )
        self.assertFalse(
            TicketOvertimeLink.objects.filter(normalized_ticket__ticket_id='12').filter(
                overtime_log=wrong_client_ot
            ).exists()
        )
        self.assertTrue(
            TicketOvertimeLink.objects.filter(normalized_ticket__ticket_id='12').exists()
        )

    def test_auto_match_prioritizes_structured_references(self):
        structured_ot = OvertimeLog.objects.create(
            user=self.member,
            client=self.link_client,
            date=date(2026, 3, 13),
            hours=1,
            evidence='unrelated free text',
            ticket_references=['INC-LINK-001'],
        )
        with self.captureOnCommitCallbacks(execute=True):
            auto_match_links_on_batch_import(
                sender=TicketImportBatch,
                instance=self.batch,
                created=True,
            )
        self.assertTrue(
            TicketOvertimeLink.objects.filter(
                overtime_log=structured_ot,
                normalized_ticket=self.ticket,
            ).exists()
        )

    def test_auto_match_uses_structured_references_without_free_text(self):
        structured_only_ot = OvertimeLog.objects.create(
            user=self.member,
            client=self.link_client,
            date=date(2026, 3, 14),
            hours=1,
            evidence='',
            ticket_references=['INC-LINK-001'],
        )
        with self.captureOnCommitCallbacks(execute=True):
            auto_match_links_on_batch_import(
                sender=TicketImportBatch,
                instance=self.batch,
                created=True,
            )
        self.assertTrue(
            TicketOvertimeLink.objects.filter(
                overtime_log=structured_only_ot,
                normalized_ticket=self.ticket,
            ).exists()
        )

    def test_tl_can_review_pending_link(self):
        link = TicketOvertimeLink.objects.create(
            overtime_log=self.ot,
            normalized_ticket=self.ticket,
            linked_by=self.member,
            link_method='auto',
            review_status='pending',
        )
        request = self._request('post', self.tl, {'decision': 'confirmed'}, pk=link.id)
        response = TicketOvertimeLinkViewSet.as_view({'post': 'review'})(request, pk=link.id)
        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.review_status, 'confirmed')

    def test_owner_cannot_review_auto_match(self):
        link = TicketOvertimeLink.objects.create(
            overtime_log=self.ot,
            normalized_ticket=self.ticket,
            linked_by=self.member,
            link_method='auto',
            review_status='pending',
        )
        request = self._request('post', self.member, {'decision': 'confirmed'}, pk=link.id)
        response = TicketOvertimeLinkViewSet.as_view({'post': 'review'})(request, pk=link.id)
        self.assertEqual(response.status_code, 403)

    def test_tl_can_reject_pending_link(self):
        link = TicketOvertimeLink.objects.create(
            overtime_log=self.ot,
            normalized_ticket=self.ticket,
            linked_by=self.member,
            link_method='auto',
            review_status='pending',
        )
        request = self._request('post', self.tl, {'decision': 'rejected'}, pk=link.id)
        response = TicketOvertimeLinkViewSet.as_view({'post': 'review'})(request, pk=link.id)
        self.assertEqual(response.status_code, 200)
        link.refresh_from_db()
        self.assertEqual(link.review_status, 'rejected')
        self.assertEqual(link.reviewed_by, self.tl)

    def test_auto_match_does_not_create_links_for_overridden_batch(self):
        overridden = TicketImportBatch.objects.create(
            user=self.member, month=date(2026, 3, 1), is_overridden=True
        )
        overridden.clients.add(self.link_client)
        NormalizedTicket.objects.create(
            batch=overridden, ticket_id='INC-LINK-001', title='Stale'
        )
        with self.captureOnCommitCallbacks(execute=True):
            auto_match_links_on_batch_import(
                sender=TicketImportBatch, instance=overridden, created=True
            )
        self.assertFalse(
            TicketOvertimeLink.objects.filter(
                normalized_ticket__batch=overridden
            ).exists()
        )

    def test_batch_override_cascades_old_links_and_new_batch_auto_matches(self):
        TicketOvertimeLink.objects.create(
            overtime_log=self.ot,
            normalized_ticket=self.ticket,
            linked_by=self.member,
        )
        self.ticket.delete()
        self.assertFalse(TicketOvertimeLink.objects.exists())
        new_ticket = NormalizedTicket.objects.create(
            batch=self.batch,
            row_index=2,
            ticket_id='INC-LINK-001',
            title='Replacement ticket',
            status='closed',
            created_at='2026-03-10T08:00:00Z',
        )
        with self.captureOnCommitCallbacks(execute=True):
            auto_match_links_on_batch_import(
                sender=TicketImportBatch, instance=self.batch, created=True
            )
        self.assertTrue(
            TicketOvertimeLink.objects.filter(
                overtime_log=self.ot, normalized_ticket=new_ticket
            ).exists()
        )

    def test_disable_disconnects_all_three_signals(self):
        from django.db.models.signals import post_save, post_delete
        from plugins.ticket_kpi.plugin import TicketKPIPlugin
        from plugins.ticket_kpi.signals import (
            compute_kpi_on_import,
            delete_kpi_on_batch_remove,
            auto_match_links_on_batch_import,
        )

        plugin = TicketKPIPlugin()
        plugin.ready()
        save_before = post_save._live_receivers(TicketImportBatch)
        delete_before = post_delete._live_receivers(TicketImportBatch)
        self.assertTrue(any(compute_kpi_on_import in r for r in save_before))
        self.assertTrue(any(auto_match_links_on_batch_import in r for r in save_before))
        self.assertTrue(any(delete_kpi_on_batch_remove in r for r in delete_before))

        plugin.disable()
        # _live_receivers() returns (sync_receivers, async_receivers).
        save_after = post_save._live_receivers(TicketImportBatch)
        delete_after = post_delete._live_receivers(TicketImportBatch)
        self.assertEqual(save_after, ([], []))
        self.assertEqual(delete_after, ([], []))

    def test_disable_stops_auto_match_from_creating_new_links(self):
        from plugins.ticket_kpi.plugin import TicketKPIPlugin

        plugin = TicketKPIPlugin()
        plugin.ready()
        plugin.disable()
        # Saving a new batch must NOT trigger auto-match because the
        # signal is disconnected. Verify via the signal path, not by
        # calling the receiver directly (which would bypass disable()).
        new_batch = TicketImportBatch.objects.create(
            user=self.member, month=date(2026, 5, 1)
        )
        new_batch.clients.add(self.link_client)
        NormalizedTicket.objects.create(
            batch=new_batch, ticket_id='INC-LINK-001', title='New ticket'
        )
        self.assertFalse(TicketOvertimeLink.objects.exists())
