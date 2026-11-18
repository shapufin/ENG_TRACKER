"""Dashboard breakdown (categories action): client and status-group filters (plan P3.1)."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client
from plugins.ticket_kpi.models import NormalizedTicket, TicketImportBatch
from plugins.ticket_kpi.viewsets import TicketKPIDashboardViewSet

User = get_user_model()
factory = APIRequestFactory()
MONTH = date(2026, 3, 1)


class BreakdownFilterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username='bf_user', password='x')
        cls.other = User.objects.create_user(username='bf_other', password='x')
        cls.a = Client.objects.create(name='Acme', code='BFA')
        cls.b = Client.objects.create(name='Beta', code='BFB')
        batch = TicketImportBatch.objects.create(
            user=cls.user, month=MONTH, raw_file='ticket_imports/b.csv', record_count=4)
        batch.clients.set([cls.a])
        batch_b = TicketImportBatch.objects.create(
            user=cls.user, month=date(2026, 4, 1), raw_file='ticket_imports/b2.csv', record_count=1)
        batch_b.clients.set([cls.b])
        rows = [('Done', 'high', 'Network'), ('Open', 'high', 'Network'),
                ('Done', 'low', 'Email'), ('Parked', 'low', 'Email')]
        for i, (st, pr, ca) in enumerate(rows):
            NormalizedTicket.objects.create(
                batch=batch, row_index=i, ticket_id=str(i), status=st, priority=pr, category=ca)
        NormalizedTicket.objects.create(batch=batch_b, ticket_id='x', status='Done', priority='low', category='Other')

    def get(self, params, user=None):
        request = factory.get('/x/', {'month': '2026-03-01', **params})
        force_authenticate(request, user or self.user)
        return TicketKPIDashboardViewSet.as_view({'get': 'categories'})(request)

    def test_unfiltered_breakdown_has_status_and_available_clients(self):
        # MonthlyKPI is the fast path when no filter is set.
        from plugins.ticket_kpi.analytics import compute_monthly_kpi
        compute_monthly_kpi(self.user, MONTH)
        data = self.get({}).data
        self.assertTrue(data['has_data'])
        self.assertEqual(data['by_category'], {'Network': 2, 'Email': 2})
        self.assertEqual(data['by_status'], {'Done': 2, 'Open': 1, 'Parked': 1})
        self.assertEqual(data['clients'], [{'id': self.a.id, 'name': 'Acme'}])

    def test_client_filter_limits_every_breakdown(self):
        data = self.get({'client_id': self.a.id}).data
        self.assertEqual(data['by_priority'], {'high': 2, 'low': 2})
        empty = self.get({'client_id': self.b.id}).data
        self.assertEqual(empty['by_category'], {})

    def test_status_group_filter_keeps_only_that_group(self):
        data = self.get({'status_group': 'closed'}).data
        self.assertEqual(data['by_category'], {'Network': 1, 'Email': 1})
        other = self.get({'status_group': 'other'}).data
        self.assertEqual(other['by_status'], {'Parked': 1})

    def test_bad_filters_are_a_400(self):
        self.assertEqual(self.get({'client_id': 'abc'}).status_code, 400)
        self.assertEqual(self.get({'status_group': 'banana'}).status_code, 400)

    def test_filters_never_widen_access(self):
        request = factory.get('/x/', {'month': '2026-03-01', 'user_id': self.user.id, 'client_id': self.a.id})
        force_authenticate(request, self.other)
        response = TicketKPIDashboardViewSet.as_view({'get': 'categories'})(request)
        self.assertEqual(response.status_code, 403)
