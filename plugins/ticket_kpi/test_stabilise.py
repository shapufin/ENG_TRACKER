"""Stabilisation pass (audit 2026-11-18, docs/audits/ticket-kpi-2026-11-18/round-1.md)."""
from datetime import date

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.services.role_service import assign_role
from apps.users.models import Team

from plugins.ticket_kpi.analytics import compute_monthly_kpi
from plugins.ticket_kpi.models import ExportProfile, MonthlyKPI, NormalizedTicket, TicketImportBatch
from plugins.ticket_kpi.status_groups import status_group
from plugins.ticket_kpi.viewsets import TicketKPIDashboardViewSet, TicketUploadViewSet

factory = APIRequestFactory()


class StatusGroupTests(SimpleTestCase):
    """B1: one place decides which group a status belongs to."""

    def test_known_wordings_land_in_their_group(self):
        for word in ('closed', 'Closed', 'Done', 'COMPLETED', 'Solved', 'Resolved', 'Fulfilled'):
            self.assertEqual(status_group(word), 'closed', word)
        for word in ('open', 'New', 'In Progress', 'On Hold', 'Pending', 'Reopened', 'Assigned'):
            self.assertEqual(status_group(word), 'open', word)
        for word in ('cancelled', 'Canceled', 'Withdrawn', 'Rejected'):
            self.assertEqual(status_group(word), 'cancelled', word)

    def test_unknown_or_blank_is_other(self):
        self.assertEqual(status_group('Waiting for the moon'), 'other')
        self.assertEqual(status_group(''), 'other')
        self.assertEqual(status_group(None), 'other')


class MonthlyKpiStatusCountTests(TestCase):
    """B1: open + closed + cancelled + other must equal total, whatever the wording."""

    def test_counts_add_up_for_mixed_status_wording(self):
        user = User.objects.create_user(username='b1_user', password='x')
        month = date(2026, 3, 1)
        batch = TicketImportBatch.objects.create(
            user=user, month=month, raw_file='ticket_imports/x.csv', record_count=8)
        wording = ['Done', 'done', 'Completed', 'closed', 'In Progress', 'New',
                   'Cancelled', 'Waiting for the moon']
        for i, status in enumerate(wording):
            NormalizedTicket.objects.create(batch=batch, row_index=i, ticket_id=str(i), status=status)

        kpi = compute_monthly_kpi(user, month)

        self.assertEqual(kpi.total_tickets, 8)
        self.assertEqual(kpi.closed_tickets, 4)
        self.assertEqual(kpi.open_tickets, 2)
        cancelled = sum(c for s, c in kpi.by_status.items() if status_group(s) == 'cancelled')
        other = sum(c for s, c in kpi.by_status.items() if status_group(s) == 'other')
        self.assertEqual((cancelled, other), (1, 1))
        self.assertEqual(kpi.closed_tickets + kpi.open_tickets + cancelled + other, kpi.total_tickets)



class ManagerScopeTests(TestCase):
    """B5: a Line Manager's reach never includes a Manager, in any action."""

    @classmethod
    def setUpTestData(cls):
        cls.lm = User.objects.create_user(username='b5_lm', password='x')
        Team.objects.create(name='B5 Team', code='B5', team_leader=cls.lm)
        cls.manager = User.objects.create_user(username='b5_mgr', password='x')
        Team.objects.create(name='B5 M', code='B5M', team_leader=cls.manager)
        assign_role(cls.manager, 'italian_tl')
        cls.manager.profile.albanian_tl = cls.lm
        cls.manager.profile.save()
        cls.batch = TicketImportBatch.objects.create(
            user=cls.manager, month=date(2026, 3, 1), raw_file='ticket_imports/m.csv', record_count=1)

    def test_line_manager_cannot_open_a_managers_dashboard(self):
        request = factory.get('/x/', {'month': '2026-03-01', 'user_id': self.manager.id})
        force_authenticate(request, self.lm)
        response = TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})(request)
        self.assertEqual(response.status_code, 403)

    def test_line_manager_cannot_review_or_delete_a_managers_batch(self):
        for action, verb, make in (('review_batch', 'post', factory.post),
                                   ('delete_batch', 'delete', factory.delete)):
            request = make(f'/x/{self.batch.pk}/')
            force_authenticate(request, self.lm)
            response = TicketUploadViewSet.as_view({verb: action})(request, pk=self.batch.pk)
            self.assertEqual(response.status_code, 403, action)
        self.batch.refresh_from_db()
        self.assertIsNone(self.batch.reviewed_by)
        self.assertTrue(TicketImportBatch.objects.filter(pk=self.batch.pk).exists())


class SafeUploadErrorTests(TestCase):
    """B4 and B8: failures never echo internals; a JSON boolean is a valid override."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username='b4_user', password='x')
        from apps.overtime.models.core import Client
        cls.user.profile.clients.add(Client.objects.create(name='B4 C', code='B4C'))
        cls.profile = ExportProfile.objects.create(
            name='B4', field_mapping={'ticket_id': 'Number'}, is_global=True)

    def _post(self, action, fields, file_bytes=b'\xff\xfe\x00 not,a,table'):
        data = {'file': SimpleUploadedFile('t.csv', file_bytes, content_type='text/csv'), **fields}
        request = factory.post('/x/', data, format='multipart')
        force_authenticate(request, self.user)
        return TicketUploadViewSet.as_view({'post': action})(request)

    def test_a_broken_file_is_a_400_without_exception_text(self):
        from unittest import mock
        boom = RuntimeError('SECRET-INTERNAL-DETAIL')
        with mock.patch('plugins.ticket_kpi.viewsets.ColumnMapper.read_file', side_effect=boom):
            for action, fields in (('analyze', {}),
                                   ('preview', {'profile_id': self.profile.id}),
                                   ('import_batch', {'profile_id': self.profile.id, 'month': '2026-03-01'})):
                response = self._post(action, fields)
                self.assertEqual(response.status_code, 400, action)
                self.assertNotIn('SECRET-INTERNAL-DETAIL', str(response.data), action)

    def test_json_boolean_override_is_not_a_server_error(self):
        request = factory.post(
            '/x/', {'profile_id': self.profile.id, 'month': '2026-03-01', 'override': True}, format='json')
        force_authenticate(request, self.user)
        response = TicketUploadViewSet.as_view({'post': 'import_batch'})(request)
        self.assertLess(response.status_code, 500)


class ProfileSuggestionTests(TestCase):
    """B6: no profile is suggested when none of them fits the file."""

    def test_unrelated_file_gets_no_suggestion(self):
        user = User.objects.create_user(username='b6_user', password='x')
        ExportProfile.objects.create(
            name='B6', field_mapping={'ticket_id': 'Number', 'status': 'State'}, is_global=True)
        csv = SimpleUploadedFile('t.csv', b'foo,bar\n1,2\n', content_type='text/csv')
        request = factory.post('/x/', {'file': csv}, format='multipart')
        force_authenticate(request, user)
        response = TicketUploadViewSet.as_view({'post': 'analyze'})(request)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('suggested_profile', response.data)

    def test_matching_file_still_gets_its_profile(self):
        user = User.objects.create_user(username='b6_user2', password='x')
        profile = ExportProfile.objects.create(
            name='B6b', field_mapping={'ticket_id': 'Number', 'status': 'State'}, is_global=True)
        csv = SimpleUploadedFile('t.csv', b'Number,State\n1,Open\n', content_type='text/csv')
        request = factory.post('/x/', {'file': csv}, format='multipart')
        force_authenticate(request, user)
        response = TicketUploadViewSet.as_view({'post': 'analyze'})(request)
        self.assertEqual(response.data['suggested_profile']['id'], profile.id)


class SignalCostTests(TestCase):
    """B7 and B9: a review does not recompute the month; a raw delete is ignored."""

    def test_review_does_not_recompute_the_month(self):
        from unittest import mock
        user = User.objects.create_user(username='b7_user', password='x')
        batch = TicketImportBatch.objects.create(
            user=user, month=date(2026, 3, 1), raw_file='ticket_imports/r.csv', record_count=1)
        with mock.patch('plugins.ticket_kpi.analytics.compute_monthly_kpi') as recompute:
            with self.captureOnCommitCallbacks(execute=True):
                batch.reviewed_by = user
                batch.save(update_fields=['reviewed_by', 'reviewed_at'])
        recompute.assert_not_called()

    def test_creating_or_overriding_still_recomputes(self):
        from unittest import mock
        user = User.objects.create_user(username='b7_user2', password='x')
        with mock.patch('plugins.ticket_kpi.analytics.compute_monthly_kpi') as recompute:
            with self.captureOnCommitCallbacks(execute=True):
                batch = TicketImportBatch.objects.create(
                    user=user, month=date(2026, 3, 1), raw_file='ticket_imports/c.csv', record_count=1)
                batch.is_overridden = True
                batch.save()
        self.assertEqual(recompute.call_count, 2)

    def test_delete_receiver_ignores_raw_loads(self):
        from plugins.ticket_kpi.models import MonthlyKPI
        from plugins.ticket_kpi.signals import delete_kpi_on_batch_remove
        user = User.objects.create_user(username='b9_user', password='x')
        MonthlyKPI.objects.create(user=user, month=date(2026, 3, 1), total_tickets=3)
        batch = TicketImportBatch(user=user, month=date(2026, 3, 1))
        delete_kpi_on_batch_remove(TicketImportBatch, batch, raw=True)
        self.assertTrue(MonthlyKPI.objects.filter(user=user).exists())


class ClientsRequiredTests(TestCase):
    """B3 / D8: a non-admin needs an assigned client to import; clients stay inside theirs."""

    @classmethod
    def setUpTestData(cls):
        from apps.overtime.models.core import Client
        cls.client_a = Client.objects.create(name='B3 A', code='B3A')
        cls.client_b = Client.objects.create(name='B3 B', code='B3B')
        cls.profile = ExportProfile.objects.create(
            name='B3', field_mapping={'ticket_id': 'Number', 'status': 'State'}, is_global=True)
        cls.no_clients = User.objects.create_user(username='b3_none', password='x')
        cls.with_client = User.objects.create_user(username='b3_one', password='x')
        cls.with_client.profile.clients.add(cls.client_a)
        cls.admin = User.objects.create_user(username='b3_admin', password='x', is_staff=True)

    def _import(self, user, client_ids):
        csv = SimpleUploadedFile('t.csv', b'Number,State\n1,Open\n', content_type='text/csv')
        data = {'file': csv, 'profile_id': self.profile.id, 'month': '2026-03-01'}
        if client_ids:
            data['client_ids'] = ','.join(str(c) for c in client_ids)
        request = factory.post('/x/', data, format='multipart')
        force_authenticate(request, user)
        return TicketUploadViewSet.as_view({'post': 'import_batch'})(request)

    def test_user_without_clients_cannot_import(self):
        for ids in ([], [self.client_a.id]):
            response = self._import(self.no_clients, ids)
            self.assertEqual(response.status_code, 403, ids)
        self.assertFalse(TicketImportBatch.objects.filter(user=self.no_clients).exists())

    def test_user_cannot_tag_a_client_that_is_not_theirs(self):
        response = self._import(self.with_client, [self.client_b.id])
        self.assertEqual(response.status_code, 403)

    def test_user_with_a_client_imports(self):
        response = self._import(self.with_client, [self.client_a.id])
        self.assertEqual(response.status_code, 201, response.data)

    def test_admin_is_exempt(self):
        response = self._import(self.admin, [self.client_b.id])
        self.assertEqual(response.status_code, 201, response.data)


class TrendGapTests(TestCase):
    """F1: a month without data is a gap (null), never a measured 0 hours or 0 percent."""

    def test_empty_months_have_null_averages(self):
        from plugins.ticket_kpi.analytics import get_user_monthly_summary
        user = User.objects.create_user(username='f1_user', password='x')
        rows = get_user_monthly_summary(user, months=3)
        self.assertEqual(len(rows), 3)
        for row in rows:
            self.assertEqual(row['total_tickets'], 0)
            self.assertIsNone(row['avg_resolution_hours'])
            self.assertIsNone(row['sla_compliance_pct'])


class UnmappedStatusPreviewTests(TestCase):
    """D9: unknown statuses never block; the preview lists them and a mapping fixes them."""

    CSV = b'Number,State\n1,Open\n2,Parked\n3,Parked\n4,Zorp\n'

    @classmethod
    def setUpTestData(cls):
        from apps.overtime.models.core import Client
        cls.user = User.objects.create_user(username='d9_user', password='x')
        cls.user.profile.clients.add(Client.objects.create(name='D9', code='D9'))
        cls.profile = ExportProfile.objects.create(
            name='D9', field_mapping={'ticket_id': 'Number', 'status': 'State'},
            is_global=True, created_by=cls.user)

    def _call(self, action, extra=None):
        data = {'file': SimpleUploadedFile('t.csv', self.CSV, content_type='text/csv'),
                'profile_id': self.profile.id, 'month': '2026-03-01', **(extra or {})}
        request = factory.post('/x/', data, format='multipart')
        force_authenticate(request, self.user)
        return TicketUploadViewSet.as_view({'post': action})(request)

    def test_preview_lists_unmapped_statuses_with_counts(self):
        response = self._call('preview')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data['unmapped_statuses'],
            [{'value': 'Parked', 'count': 2}, {'value': 'Zorp', 'count': 1}])

    def test_status_override_maps_the_value_and_clears_the_warning(self):
        response = self._call('preview', {'status_overrides': '{"Parked": "open"}'})
        self.assertEqual(response.data['unmapped_statuses'], [{'value': 'Zorp', 'count': 1}])
        self.assertEqual(response.data['status_breakdown'].get('open'), 3)

    def test_invalid_override_group_is_a_400(self):
        self.assertEqual(self._call('preview', {'status_overrides': '{"Parked": "banana"}'}).status_code, 400)
        self.assertEqual(self._call('preview', {'status_overrides': '[1]'}).status_code, 400)

    def test_import_is_never_blocked_and_saving_persists_the_mapping(self):
        response = self._call('import_batch', {
            'status_overrides': '{"Parked": "open"}', 'save_mapping_overrides': 'true'})
        self.assertEqual(response.status_code, 201, response.data)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.value_transforms['status']['parked'], 'open')
        kpi = MonthlyKPI.objects.get(user=self.user, month=date(2026, 3, 1))
        self.assertEqual(kpi.open_tickets, 3)


class SeedDummyTicketsTests(TestCase):
    """The dev seeding command fills a user, and never overwrites real data by accident."""

    @override_settings(DEBUG=True)  # the test runner forces DEBUG off
    def test_seeds_then_refuses_without_replace(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        user = User.objects.create_user(username='seed_user', password='x')
        call_command('seed_dummy_tickets', username='seed_user', months='3,4')
        self.assertEqual(TicketImportBatch.objects.filter(user=user).count(), 2)
        self.assertEqual(MonthlyKPI.objects.filter(user=user).count(), 2)
        with self.assertRaises(CommandError):
            call_command('seed_dummy_tickets', username='seed_user')
        call_command('seed_dummy_tickets', username='seed_user', months='5', replace=True)
        self.assertEqual(TicketImportBatch.objects.filter(user=user).count(), 1)

    def test_refuses_when_debug_is_off(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        User.objects.create_user(username='seed_prod', password='x')
        with override_settings(DEBUG=False), self.assertRaises(CommandError):
            call_command('seed_dummy_tickets', username='seed_prod')
