"""Reorganisations: moving a member between Managers / Line Managers.

Ownership of KPI data (documents, import batches, monthly KPIs) is the member's
and never changes. Who may read or review it is recomputed on every request from
the member's current ``italian_tl`` / ``albanian_tl`` links, so a move hands the
whole squad view to the new leader and removes it from the old one.
"""
from datetime import date, datetime, timezone as dt_tz

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.users.models import Team
from plugins.ticket_kpi.analytics import compute_monthly_kpi
from plugins.ticket_kpi.models import (
    ExportProfile,
    KPIEvidence,
    MonthlyKPI,
    NormalizedTicket,
    TicketImportBatch,
)
from plugins.ticket_kpi.viewsets import (
    KPIEvidenceViewSet,
    TicketKPIDashboardViewSet,
    TicketKPIReportViewSet,
    TicketUploadViewSet,
)

User = get_user_model()
MONTH = date(2026, 3, 1)
factory = APIRequestFactory()


def _rows(response):
    data = response.data
    return data['results'] if isinstance(data, dict) and 'results' in data else data


def _leader(username, code):
    user = User.objects.create_user(username=username, password='testpass123')
    Team.objects.create(name=f'Team {code}', code=code, team_leader=user)
    return user


class TeamMoveTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.lm1 = _leader('lm1', 'L1')
        cls.lm2 = _leader('lm2', 'L2')
        cls.mgr1 = _leader('mgr1', 'M1')
        cls.mgr2 = _leader('mgr2', 'M2')
        for mgr in (cls.mgr1, cls.mgr2):
            mgr.profile.is_italian_tl_role = True
            mgr.profile.save()

        cls.member = User.objects.create_user(username='mover', password='testpass123')
        cls.bystander = User.objects.create_user(username='bystander', password='testpass123')
        cls._link(cls, lm=cls.lm1, mgr=cls.mgr1)

        profile = ExportProfile.objects.create(
            name='P', field_mapping={'ticket_id': 'Number'}, is_global=True
        )
        cls.batch = TicketImportBatch.objects.create(
            user=cls.member, month=MONTH, profile=profile, record_count=3
        )
        for i in range(3):
            created = datetime(2026, 3, 2 + i, 9, tzinfo=dt_tz.utc)
            NormalizedTicket.objects.create(
                batch=cls.batch, row_index=i, ticket_id=f'T{i}', status='closed',
                created_at=created, resolved_at=created.replace(hour=15),
                time_to_resolution_hours=6,
            )
        compute_monthly_kpi(cls.member, MONTH)
        cls.doc = cls._doc(cls.member, 'mine.txt')
        cls.other_doc = cls._doc(cls.bystander, 'other.txt')

    @staticmethod
    def _doc(user, name):
        doc = KPIEvidence(user=user, month=MONTH, evidence_type='document', description=name)
        doc.file.save(name, ContentFile(b'x'), save=False)
        doc.save()
        return doc

    @staticmethod
    def _link(cls, lm=None, mgr=None):
        profile = cls.member.profile
        profile.albanian_tl = lm
        profile.italian_tl = mgr
        profile.save()

    def move(self, lm=..., mgr=...):
        profile = User.objects.get(pk=self.member.pk).profile
        if lm is not ...:
            profile.albanian_tl = lm
        if mgr is not ...:
            profile.italian_tl = mgr
        profile.save()

    # -- request helpers ---------------------------------------------------
    def docs_for(self, user):
        request = factory.get('/evidence/', {'month': '2026-03-01'})
        force_authenticate(request, user)
        return {d['id'] for d in _rows(KPIEvidenceViewSet.as_view({'get': 'list'})(request))}

    def doc_action(self, user, action, pk, data=None):
        mapping = {
            'retrieve': ({'get': 'retrieve'}, factory.get),
            'review': ({'post': 'review'}, factory.post),
            'unreview': ({'post': 'unreview'}, factory.post),
        }[action]
        request = mapping[1](f'/evidence/{pk}/', data)
        force_authenticate(request, user)
        return KPIEvidenceViewSet.as_view(mapping[0])(request, pk=pk)

    def batch_ids_for(self, user):
        request = factory.get('/upload/team_batches/', {'month': '2026-03-01'})
        force_authenticate(request, user)
        response = TicketUploadViewSet.as_view({'get': 'team_batches'})(request)
        return {b['id'] for b in _rows(response)} if response.status_code == 200 else set()

    def review_batch(self, user):
        request = factory.post(f'/upload/{self.batch.pk}/review_batch/')
        force_authenticate(request, user)
        return TicketUploadViewSet.as_view({'post': 'review_batch'})(request, pk=self.batch.pk)

    def summary_user_ids(self, user):
        request = factory.get('/dashboard/team_summary/', {'month': '2026-03-01'})
        force_authenticate(request, user)
        response = TicketKPIDashboardViewSet.as_view({'get': 'team_summary'})(request)
        if response.status_code != 200:
            return set()
        return {m['user_id'] for m in response.data.get('members', [])}

    def member_dashboard_status(self, user):
        request = factory.get(
            '/dashboard/monthly_summary/', {'month': '2026-03-01', 'user_id': self.member.id}
        )
        force_authenticate(request, user)
        return TicketKPIDashboardViewSet.as_view({'get': 'monthly_summary'})(request).status_code

    # -- scenarios ---------------------------------------------------------
    def test_line_manager_move_hands_the_whole_view_to_the_new_leader(self):
        self.assertIn(self.doc.id, self.docs_for(self.lm1))
        self.assertIn(self.batch.id, self.batch_ids_for(self.lm1))
        self.assertIn(self.member.id, self.summary_user_ids(self.lm1))
        self.assertEqual(self.member_dashboard_status(self.lm1), 200)
        self.assertNotIn(self.doc.id, self.docs_for(self.lm2))

        self.move(lm=self.lm2)

        for leader, has in ((self.lm1, False), (self.lm2, True)):
            self.assertEqual(self.doc.id in self.docs_for(leader), has, leader.username)
            self.assertEqual(self.batch.id in self.batch_ids_for(leader), has, leader.username)
            self.assertEqual(self.member.id in self.summary_user_ids(leader), has, leader.username)
            self.assertEqual(self.member_dashboard_status(leader), 200 if has else 403)
        self.assertEqual(self.doc_action(self.lm1, 'retrieve', self.doc.pk).status_code, 404)
        self.assertEqual(self.doc_action(self.lm1, 'review', self.doc.pk, {'status': 'approved'}).status_code, 404)
        self.assertEqual(self.review_batch(self.lm1).status_code, 403)
        self.assertEqual(self.review_batch(self.lm2).status_code, 200)

    def test_data_never_changes_owner_and_review_history_survives(self):
        self.doc_action(self.lm1, 'review', self.doc.pk, {'status': 'approved'})
        before = (KPIEvidence.objects.count(), NormalizedTicket.objects.count(), MonthlyKPI.objects.count())

        self.move(lm=self.lm2, mgr=self.mgr2)

        self.assertEqual(
            before,
            (KPIEvidence.objects.count(), NormalizedTicket.objects.count(), MonthlyKPI.objects.count()),
        )
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.user_id, self.member.id)
        self.assertEqual(self.doc.status, 'approved')
        self.assertEqual(self.doc.reviewed_by_id, self.lm1.id)  # history, not access
        self.assertEqual(MonthlyKPI.objects.get(user=self.member, month=MONTH).total_tickets, 3)

    def test_new_leader_takes_over_review_and_old_leader_cannot_undo_it(self):
        self.doc_action(self.lm1, 'review', self.doc.pk, {'status': 'approved'})
        self.move(lm=self.lm2)

        self.assertEqual(self.doc_action(self.lm1, 'unreview', self.doc.pk).status_code, 404)
        self.assertEqual(self.doc_action(self.lm2, 'unreview', self.doc.pk).status_code, 200)
        response = self.doc_action(self.lm2, 'review', self.doc.pk, {'status': 'rejected'})
        self.assertEqual(response.status_code, 200)
        self.doc.refresh_from_db()
        self.assertEqual((self.doc.status, self.doc.reviewed_by_id), ('rejected', self.lm2.id))

    def test_manager_and_line_manager_move_independently(self):
        self.move(mgr=self.mgr2)  # only the Manager changes
        self.assertNotIn(self.doc.id, self.docs_for(self.mgr1))
        self.assertIn(self.doc.id, self.docs_for(self.mgr2))
        self.assertIn(self.doc.id, self.docs_for(self.lm1))  # Line Manager keeps the view

        self.move(lm=self.lm2)  # now only the Line Manager changes
        self.assertNotIn(self.doc.id, self.docs_for(self.lm1))
        self.assertIn(self.doc.id, self.docs_for(self.lm2))
        self.assertIn(self.doc.id, self.docs_for(self.mgr2))  # Manager keeps the view

    def test_unassigned_member_is_visible_to_no_leader(self):
        self.move(lm=None, mgr=None)
        for leader in (self.lm1, self.lm2, self.mgr1, self.mgr2):
            self.assertNotIn(self.doc.id, self.docs_for(leader), leader.username)
            self.assertNotIn(self.batch.id, self.batch_ids_for(leader), leader.username)
        self.assertIn(self.doc.id, self.docs_for(self.member))  # the owner never loses their data

    def test_members_own_access_and_bystanders_are_unaffected_by_a_move(self):
        self.move(lm=self.lm2, mgr=self.mgr2)
        self.assertEqual(self.docs_for(self.member), {self.doc.id})
        self.assertNotIn(self.other_doc.id, self.docs_for(self.lm2))
        self.assertEqual(self.docs_for(self.bystander), {self.other_doc.id})

    def test_a_move_between_two_requests_never_leaks_to_the_old_leader(self):
        # The old leader loads the list, then the move lands, then they act on a stale id.
        stale = self.docs_for(self.lm1)
        self.assertIn(self.doc.id, stale)
        self.move(lm=self.lm2)
        self.assertEqual(self.doc_action(self.lm1, 'review', self.doc.pk, {'status': 'approved'}).status_code, 404)
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.status, 'pending')

    def test_exports_follow_the_move_too(self):
        def export_status(user):
            request = factory.get('/reports/export_csv/', {'year': 2026, 'user_ids': str(self.member.id)})
            force_authenticate(request, user)
            return TicketKPIReportViewSet.as_view({'get': 'export_csv'})(request).status_code

        self.assertEqual(export_status(self.lm1), 200)
        self.move(lm=self.lm2)
        self.assertEqual(export_status(self.lm1), 403)
        self.assertEqual(export_status(self.lm2), 200)
