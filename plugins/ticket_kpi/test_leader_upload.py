"""A Manager or Line Manager imports the monthly tickets for a member of their squad.

Rules (plan 2026-11-18, D2-D6): the batch stays owned by the member, ``uploaded_by``
records who imported, the target must be on the leader's roster (link-only, Managers
excluded), clients are checked against the MEMBER, and a leader may replace a member's
batch only while it is unreviewed.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client
from apps.permissions.services.role_service import assign_role
from apps.users.models import Team
from plugins.ticket_kpi.models import ExportProfile, MonthlyKPI, TicketImportBatch
from plugins.ticket_kpi.serializers import TicketImportBatchSerializer
from plugins.ticket_kpi.viewsets import TicketUploadViewSet

User = get_user_model()
factory = APIRequestFactory()
MONTH = date(2026, 3, 1)
CSV = b'Number,State\n1,Open\n2,Closed\n'


def _leader(username, code):
    user = User.objects.create_user(username=username, password='x')
    Team.objects.create(name=f'Team {code}', code=code, team_leader=user)
    return user


class LeaderUploadBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.client_a = Client.objects.create(name='LU A', code='LUA')
        cls.client_b = Client.objects.create(name='LU B', code='LUB')
        cls.lm = _leader('lu_lm', 'LU1')
        cls.other_lm = _leader('lu_lm2', 'LU2')
        cls.mgr = _leader('lu_mgr', 'LUM')
        assign_role(cls.mgr, 'italian_tl')
        cls.member = User.objects.create_user(username='lu_member', password='x')
        cls.member.profile.albanian_tl = cls.lm
        cls.member.profile.italian_tl = cls.mgr
        cls.member.profile.save()
        cls.member.profile.clients.add(cls.client_a)
        # leaders hold clients the member does not (b), to prove the MEMBER's list decides
        for leader in (cls.lm, cls.mgr):
            leader.profile.clients.add(cls.client_a, cls.client_b)
        cls.stranger = User.objects.create_user(username='lu_stranger', password='x')
        cls.stranger.profile.albanian_tl = cls.other_lm
        cls.stranger.profile.save()
        cls.stranger.profile.clients.add(cls.client_a)
        cls.hr = User.objects.create_user(username='lu_hr', password='x')
        assign_role(cls.hr, 'hr')
        cls.employee = User.objects.create_user(username='lu_emp', password='x')
        cls.employee.profile.clients.add(cls.client_a)
        cls.admin = User.objects.create_user(username='lu_admin', password='x', is_staff=True)
        cls.root = User.objects.create_user(username='lu_root', password='x', is_superuser=True)
        cls.profile = ExportProfile.objects.create(
            name='LU', field_mapping={'ticket_id': 'Number', 'status': 'State'}, is_global=True)

    def call(self, user, action='import_batch', target=None, clients=None, **extra):
        data = {'file': SimpleUploadedFile('t.csv', CSV, content_type='text/csv'),
                'profile_id': self.profile.id, 'month': '2026-03-01', **extra}
        if target is not None:
            data['target_user_id'] = str(target)
        if clients:
            data['client_ids'] = ','.join(str(c) for c in clients)
        request = factory.post('/x/', data, format='multipart')
        force_authenticate(request, user)
        return TicketUploadViewSet.as_view({'post': action})(request)

    def batches(self, user):
        return TicketImportBatch.objects.filter(user=user)


class WhoMayImportForWhomTests(LeaderUploadBase):
    def test_line_manager_imports_for_own_member(self):
        response = self.call(self.lm, target=self.member.id, clients=[self.client_a.id])
        self.assertEqual(response.status_code, 201, response.data)
        batch = self.batches(self.member).get()
        self.assertEqual((batch.user, batch.uploaded_by), (self.member, self.lm))
        self.assertTrue(MonthlyKPI.objects.filter(user=self.member, month=MONTH).exists())
        self.assertFalse(MonthlyKPI.objects.filter(user=self.lm).exists())

    def test_manager_imports_for_member_of_the_squad(self):
        response = self.call(self.mgr, target=self.member.id, clients=[self.client_a.id])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.batches(self.member).get().uploaded_by, self.mgr)

    def test_admin_imports_for_any_non_superuser_but_not_a_superuser(self):
        self.assertEqual(self.call(self.admin, target=self.employee.id).status_code, 201)
        self.assertEqual(self.call(self.admin, target=self.root.id).status_code, 403)
        self.assertFalse(self.batches(self.root).exists())

    def test_everyone_else_is_refused_and_nothing_is_written(self):
        cases = [
            (self.other_lm, self.member.id),    # another leader's member
            (self.lm, self.stranger.id),        # not on my roster
            (self.lm, self.mgr.id),             # a Manager is never a target
            (self.hr, self.member.id),
            (self.employee, self.member.id),
            (self.lm, 999999),                  # unknown id: same answer, no existence leak
        ]
        for user, target in cases:
            response = self.call(user, target=target, clients=[self.client_a.id])
            self.assertEqual(response.status_code, 403, (user.username, target))
        self.assertFalse(self.batches(self.member).exists())
        self.assertFalse(self.batches(self.mgr).exists())

    def test_bad_target_id_is_a_400_and_own_id_is_a_normal_self_import(self):
        self.assertEqual(self.call(self.lm, target='abc').status_code, 400)
        response = self.call(self.lm, target=self.lm.id, clients=[self.client_a.id])
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.batches(self.lm).get().uploaded_by, self.lm)


class ClientRulesOnBehalfTests(LeaderUploadBase):
    def test_clients_are_checked_against_the_member_not_the_leader(self):
        response = self.call(self.lm, target=self.member.id, clients=[self.client_b.id])
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.batches(self.member).exists())

    def test_member_without_a_client_cannot_receive_an_import(self):
        bare = User.objects.create_user(username='lu_bare', password='x')
        bare.profile.albanian_tl = self.lm
        bare.profile.save()
        response = self.call(self.lm, target=bare.id)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.batches(bare).exists())


class ReplaceRulesTests(LeaderUploadBase):
    def setUp(self):
        self.call(self.lm, target=self.member.id, clients=[self.client_a.id])
        self.existing = self.batches(self.member).get()

    def test_existing_month_without_override_is_a_conflict(self):
        response = self.call(self.lm, target=self.member.id, clients=[self.client_a.id])
        self.assertEqual(response.status_code, 409)

    def test_leader_may_replace_an_unreviewed_batch(self):
        response = self.call(self.lm, target=self.member.id, clients=[self.client_a.id], override='true')
        self.assertEqual(response.status_code, 201, response.data)
        self.existing.refresh_from_db()
        self.assertTrue(self.existing.is_overridden)
        self.assertEqual(self.existing.overridden_by, self.lm)

    def test_leader_may_not_replace_a_reviewed_batch(self):
        self.existing.reviewed_by = self.lm
        self.existing.save(update_fields=['reviewed_by'])
        response = self.call(self.lm, target=self.member.id, clients=[self.client_a.id], override='true')
        self.assertEqual(response.status_code, 403)
        self.existing.refresh_from_db()
        self.assertFalse(self.existing.is_overridden)

    def test_admin_may_replace_a_reviewed_batch(self):
        self.existing.reviewed_by = self.lm
        self.existing.save(update_fields=['reviewed_by'])
        response = self.call(self.admin, target=self.member.id, override='true')
        self.assertEqual(response.status_code, 201, response.data)

    def test_the_member_still_cannot_replace_their_own_batch(self):
        response = self.call(self.member, clients=[self.client_a.id], override='true')
        self.assertEqual(response.status_code, 403)

    def test_preview_reports_the_members_existing_batch_not_the_leaders(self):
        response = self.call(self.lm, action='preview', target=self.member.id)
        self.assertTrue(response.data['has_existing_upload'])
        self.assertEqual(self.call(self.lm, action='preview').data['has_existing_upload'], False)

    def test_preview_for_a_member_outside_the_roster_is_refused(self):
        self.assertEqual(self.call(self.lm, action='preview', target=self.stranger.id).status_code, 403)


class ProvenanceTests(LeaderUploadBase):
    def test_serializer_names_the_uploader_only_when_it_is_not_the_owner(self):
        self.call(self.lm, target=self.member.id, clients=[self.client_a.id])
        self.call(self.employee, clients=[self.client_a.id])
        on_behalf = TicketImportBatchSerializer(self.batches(self.member).get()).data
        own = TicketImportBatchSerializer(self.batches(self.employee).get()).data
        self.assertEqual(on_behalf['uploaded_by_username'], 'lu_lm')
        self.assertIsNone(own['uploaded_by_username'])

    def test_an_import_on_behalf_writes_one_audit_row_and_a_self_import_none(self):
        from plugins.audit_log.models import AuditLog
        self.call(self.employee, clients=[self.client_a.id])
        self.assertFalse(AuditLog.objects.filter(action='create_for_user').exists())
        self.call(self.lm, target=self.member.id, clients=[self.client_a.id])
        row = AuditLog.objects.get(action='create_for_user')
        self.assertEqual(row.user, self.lm)
        self.assertIn('lu_member', row.description)


class RepeatedReplaceTests(LeaderUploadBase):
    def test_a_month_can_be_replaced_twice(self):
        self.call(self.lm, target=self.member.id, clients=[self.client_a.id])
        for _ in range(2):
            response = self.call(self.admin, target=self.member.id, override='true')
            self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.batches(self.member).filter(is_overridden=False).count(), 1)
        self.assertEqual(self.batches(self.member).filter(is_overridden=True).count(), 2)
