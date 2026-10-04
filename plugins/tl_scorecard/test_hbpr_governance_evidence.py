"""HBPR ↔ Albanian TL governance evidence: cadence meetings and the mid-year /
year-end EPR participation record. Authored by the assigned AL TL only; read and
exported by the assigned HBPR and staff."""
from datetime import date, timedelta

from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .testing import make_user as _make_user
from .models import HbprGovernanceEvidence
from .viewsets import HbprGovernanceEvidenceViewSet


class EvidenceBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        for code in ('hbpr', 'albanian_tl', 'italian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        self.hbpr = _make_user('hbpr_ev')
        assign_role(self.hbpr, 'hbpr')
        self.tl = _make_user('tl_ev')
        assign_role(self.tl, 'albanian_tl')
        self.member = _make_user('member_ev')
        self.member.profile.albanian_tl = self.tl
        self.member.profile.save()
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )
        # An unassigned AL TL + their own assignment to a different HBPR.
        self.other_tl = _make_user('other_tl_ev')
        assign_role(self.other_tl, 'albanian_tl')
        self.other_hbpr = _make_user('other_hbpr_ev')
        assign_role(self.other_hbpr, 'hbpr')
        self.other_assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.other_hbpr, albanian_tl=self.other_tl,
            cadence='monthly', effective_from=date(2020, 1, 1),
        )
        self.staff = _make_user('staff_ev', is_staff=True)
        # The app's calendar day is the UTC day (TIME_ZONE='UTC'), not the host's.
        self.today = timezone.localdate()

    def call(self, action_name, user, pk=None, data=None, method='post'):
        request = getattr(self.factory, method)('/x/', data or {}, format='json')
        force_authenticate(request, user=user)
        kwargs = {'pk': pk} if pk is not None else {}
        return HbprGovernanceEvidenceViewSet.as_view({method: action_name})(request, **kwargs)

    def _list_ids(self, user):
        request = self.factory.get('/x/')
        force_authenticate(request, user=user)
        response = HbprGovernanceEvidenceViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in rows}

    def _cadence(self, assignment=None, **overrides):
        data = {
            'assignment': (assignment or self.assignment).id,
            'kind': 'cadence_meeting',
            'occurred_on': str(self.today),
            'shared_summary': 'Weekly sync',
        }
        data.update(overrides)
        return data


class AssignmentPurgeProtectionTests(EvidenceBase):
    """The archive purge deletes ended assignments older than 6 months — but
    never one the evidence PROTECT FK still references."""

    def test_evidence_bearing_assignment_survives_the_purge(self):
        from apps.users.services.hbpr_assignments import purge_ended_assignments

        self.assignment.effective_to = self.today - timedelta(days=200)
        self.assignment.save(update_fields=['effective_to'])
        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today - timedelta(days=200),
            recorded_by=self.tl,
        )
        self.assertEqual(purge_ended_assignments(), 0)
        self.assertTrue(
            HbprAlbanianTlAssignment.objects.filter(pk=self.assignment.pk).exists()
        )

    def test_evidence_free_assignment_is_purged(self):
        from apps.users.services.hbpr_assignments import purge_ended_assignments

        self.other_assignment.effective_to = self.today - timedelta(days=200)
        self.other_assignment.save(update_fields=['effective_to'])
        purge_ended_assignments()
        self.assertFalse(
            HbprAlbanianTlAssignment.objects.filter(
                pk=self.other_assignment.pk
            ).exists()
        )


class EvidenceModelTests(EvidenceBase):
    def test_epr_kind_requires_reporting_year(self):
        row = HbprGovernanceEvidence(
            assignment=self.assignment, kind='epr_mid_year',
            occurred_on=self.today, recorded_by=self.tl,
        )
        with self.assertRaises(Exception):
            row.full_clean()

    def test_cadence_kind_requires_null_reporting_year(self):
        row = HbprGovernanceEvidence(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl, reporting_year=2026,
        )
        with self.assertRaises(Exception):
            row.full_clean()

    def test_cadence_meetings_are_repeatable(self):
        for _ in range(3):
            HbprGovernanceEvidence.objects.create(
                assignment=self.assignment, kind='cadence_meeting',
                occurred_on=self.today, recorded_by=self.tl,
            )
        self.assertEqual(
            HbprGovernanceEvidence.objects.filter(
                assignment=self.assignment, kind='cadence_meeting'
            ).count(),
            3,
        )

    def test_epr_record_is_unique_per_assignment_kind_year(self):
        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='epr_mid_year',
            occurred_on=self.today, recorded_by=self.tl, reporting_year=2026,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                HbprGovernanceEvidence.objects.create(
                    assignment=self.assignment, kind='epr_mid_year',
                    occurred_on=self.today, recorded_by=self.tl, reporting_year=2026,
                )


class EvidenceWriteTests(EvidenceBase):
    def test_assigned_tl_can_create_cadence_evidence(self):
        resp = self.call('create', self.tl, data=self._cadence())
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['recorded_by'], self.tl.id)
        self.assertIsNone(resp.data['updated_by'])

    def test_hbpr_cannot_create_evidence(self):
        resp = self.call('create', self.hbpr, data=self._cadence())
        self.assertIn(resp.status_code, (403, 404))

    def test_unassigned_tl_cannot_create_for_this_assignment(self):
        resp = self.call('create', self.other_tl, data=self._cadence())
        self.assertIn(resp.status_code, (403, 404))

    def test_cannot_create_for_another_assignments_tl(self):
        resp = self.call(
            'create', self.tl, data=self._cadence(assignment=self.other_assignment)
        )
        self.assertIn(resp.status_code, (403, 404))

    def test_epr_evidence_requires_a_year(self):
        resp = self.call('create', self.tl, data=self._cadence(
            kind='epr_mid_year', reporting_year=None))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('reporting_year', str(resp.data))

    def test_update_stamps_updated_by_and_keeps_recorded_by(self):
        row = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
        )
        resp = self.call(
            'partial_update', self.tl, pk=row.id,
            data={'shared_summary': 'Updated summary'}, method='patch')
        self.assertEqual(resp.status_code, 200, resp.data)
        row.refresh_from_db()
        self.assertEqual(row.shared_summary, 'Updated summary')
        self.assertEqual(row.recorded_by_id, self.tl.id)
        self.assertEqual(row.updated_by_id, self.tl.id)

    def test_hbpr_cannot_update_evidence(self):
        row = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
        )
        resp = self.call(
            'partial_update', self.hbpr, pk=row.id,
            data={'shared_summary': 'x'}, method='patch')
        self.assertIn(resp.status_code, (403, 404))
        row.refresh_from_db()
        self.assertEqual(row.shared_summary, '')

    def test_recorded_by_is_never_taken_from_the_payload(self):
        resp = self.call('create', self.tl, data=self._cadence(
            recorded_by=self.hbpr.id, updated_by=self.hbpr.id))
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['recorded_by'], self.tl.id)
        self.assertIsNone(resp.data['updated_by'])

    def test_destroy_is_not_available(self):
        row = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
        )
        resp = self.call('destroy', self.tl, pk=row.id, method='delete')
        self.assertIn(resp.status_code, (403, 404, 405))
        self.assertTrue(HbprGovernanceEvidence.objects.filter(pk=row.id).exists())


class EvidenceReadTests(EvidenceBase):
    def setUp(self):
        super().setUp()
        self.mine = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
        )
        self.theirs = HbprGovernanceEvidence.objects.create(
            assignment=self.other_assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.other_tl,
        )

    def test_assigned_hbpr_sees_only_their_evidence(self):
        ids = self._list_ids(self.hbpr)
        self.assertIn(self.mine.id, ids)
        self.assertNotIn(self.theirs.id, ids)

    def test_other_hbpr_sees_only_their_evidence(self):
        ids = self._list_ids(self.other_hbpr)
        self.assertIn(self.theirs.id, ids)
        self.assertNotIn(self.mine.id, ids)

    def test_tl_sees_only_their_own_evidence(self):
        ids = self._list_ids(self.tl)
        self.assertEqual(ids, {self.mine.id})

    def test_staff_sees_everything(self):
        ids = self._list_ids(self.staff)
        self.assertEqual(ids, {self.mine.id, self.theirs.id})

    def test_plain_employee_is_denied(self):
        request = self.factory.get('/x/')
        force_authenticate(request, user=self.member)
        resp = HbprGovernanceEvidenceViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(resp.status_code, 403)


class EvidenceCadenceStatusTests(EvidenceBase):
    def test_cadence_status_and_next_due_are_exposed(self):
        row = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
        )
        resp = self.call('retrieve', self.tl, pk=row.id, method='get')
        self.assertEqual(resp.status_code, 200, resp.data)
        # Weekly cadence: next due is a week after the last meeting.
        self.assertEqual(
            resp.data['next_due_on'], str(self.today + timedelta(days=7))
        )

    def test_cadence_status_reports_due_on_the_exact_due_date(self):
        # One shared definition: on the due date the state is 'due', not
        # 'on_track' (the inline copy this serializer used to carry never could).
        row = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today - timedelta(days=7), recorded_by=self.tl,
        )
        resp = self.call('retrieve', self.tl, pk=row.id, method='get')
        self.assertEqual(resp.data['next_due_on'], str(self.today))
        self.assertEqual(resp.data['cadence_status'], 'due')


class EvidenceWriteGuardTests(EvidenceBase):
    """Evidence cannot be re-homed or back-dated from the future."""

    def _row(self):
        return HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, shared_summary='Weekly sync', recorded_by=self.tl,
        )

    def test_evidence_cannot_be_moved_to_another_assignment(self):
        row = self._row()
        resp = self.call(
            'partial_update', self.tl, pk=row.id,
            data={'assignment': self.other_assignment.id}, method='patch',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        row.refresh_from_db()
        self.assertEqual(row.assignment_id, self.assignment.id)

    def test_patching_the_same_assignment_back_still_succeeds(self):
        # The frontend round-trips `assignment` on every save; an unchanged echo
        # must not be treated as a move.
        row = self._row()
        resp = self.call(
            'partial_update', self.tl, pk=row.id,
            data={'assignment': self.assignment.id, 'shared_summary': 'Revised'}, method='patch',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        row.refresh_from_db()
        self.assertEqual(row.shared_summary, 'Revised')

    def test_future_dated_evidence_is_rejected(self):
        future = str(self.today + timedelta(days=1))
        resp = self.call('create', self.tl, data=self._cadence(occurred_on=future))
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertFalse(HbprGovernanceEvidence.objects.filter(occurred_on=future).exists())

    def test_today_is_still_allowed(self):
        resp = self.call('create', self.tl, data=self._cadence(occurred_on=str(self.today)))
        self.assertEqual(resp.status_code, 201, resp.data)


class EvidenceScopeHardeningTests(EvidenceBase):
    """An HBPR reads evidence only for assignments that are actually in scope —
    the same rule `hbpr_scope` applies (effective, and an active AL TL)."""

    def _evidence_for(self, assignment):
        return HbprGovernanceEvidence.objects.create(
            assignment=assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.staff,
        )

    def _new_al_tl(self, username):
        tl = _make_user(username)
        assign_role(tl, 'albanian_tl')
        return tl

    def test_future_dated_assignment_grants_no_evidence_access(self):
        future_tl = self._new_al_tl('future_tl_ev')
        future = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=future_tl, cadence='weekly',
            effective_from=self.today + timedelta(days=10),
        )
        row = self._evidence_for(future)
        self.assertNotIn(row.id, self._list_ids(self.hbpr))

    def test_deactivated_al_tl_assignment_evidence_is_hidden(self):
        gone_tl = self._new_al_tl('gone_tl_ev')
        gone = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=gone_tl, cadence='weekly',
            effective_from=date(2020, 1, 1),
        )
        row = self._evidence_for(gone)
        self.assertIn(row.id, self._list_ids(self.hbpr))
        gone_tl.is_active = False
        gone_tl.save(update_fields=['is_active'])
        self.assertNotIn(row.id, self._list_ids(self.hbpr))

    def test_bad_year_and_assignment_params_are_400_not_500(self):
        for params in ({'year': 'abc'}, {'assignment': 'abc'}):
            with self.subTest(params=params):
                request = self.factory.get('/x/', params)
                force_authenticate(request, user=self.hbpr)
                resp = HbprGovernanceEvidenceViewSet.as_view({'get': 'list'})(request)
                self.assertEqual(resp.status_code, 400, params)

    def test_evidence_filters_by_kind_and_year(self):
        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
        )
        epr = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='epr_mid_year',
            occurred_on=self.today, recorded_by=self.tl, reporting_year=2026,
        )
        request = self.factory.get('/x/', {'kind': 'epr_mid_year'})
        force_authenticate(request, user=self.tl)
        rows = HbprGovernanceEvidenceViewSet.as_view({'get': 'list'})(request).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        self.assertEqual([r['id'] for r in rows], [epr.id])


class EvidenceExportTests(EvidenceBase):
    def _export(self, user, leader_id):
        from .viewsets import TLScorecardViewSet

        request = self.factory.get('/x/', {'leader_id': leader_id})
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': 'export'})(request)

    def test_export_includes_the_evidence_sheet_and_rows(self):
        import io
        import zipfile

        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='epr_mid_year',
            occurred_on=self.today, recorded_by=self.tl,
            reporting_year=self.today.year,
            shared_summary='Mid-year participation', action_items='Follow up',
        )
        resp = self._export(self.hbpr, self.tl.id)
        self.assertEqual(resp.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            shared = zf.read('xl/sharedStrings.xml').decode('utf-8')
        self.assertIn('Mid-year participation', shared)
        self.assertIn('Follow up', shared)
        self.assertIn('Albanian TL evidence', shared)

    def test_export_excludes_other_assignments_evidence(self):
        import io
        import zipfile

        HbprGovernanceEvidence.objects.create(
            assignment=self.other_assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.other_tl,
            shared_summary='Other team secret',
        )
        resp = self._export(self.hbpr, self.tl.id)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            shared = zf.read('xl/sharedStrings.xml').decode('utf-8')
        self.assertNotIn('Other team secret', shared)


class EvidenceStaffReadOnlyTests(EvidenceBase):
    """Evidence is the AL TL's record: staff audit it, they never author it."""

    def test_staff_cannot_create_evidence(self):
        resp = self.call('create', self.staff, data=self._cadence())
        self.assertIn(resp.status_code, (403, 404))
        self.assertFalse(HbprGovernanceEvidence.objects.exists())

    def test_staff_cannot_update_evidence(self):
        row = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
        )
        resp = self.call(
            'partial_update', self.staff, pk=row.id,
            data={'shared_summary': 'staff edit'}, method='patch')
        self.assertIn(resp.status_code, (403, 404))
        row.refresh_from_db()
        self.assertEqual(row.shared_summary, '')


class EvidenceExportTenureTests(EvidenceBase):
    """An HBPR exports evidence for the assignments they own, not the history
    a previous HBPR built up with the same AL TL."""

    def test_new_hbpr_export_excludes_the_previous_hbprs_evidence(self):
        import io
        import zipfile

        from apps.users.services.hbpr_assignments import reassign_assignment
        from .viewsets import TLScorecardViewSet

        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
            shared_summary='Predecessor era note',
        )
        successor = _make_user('successor_ev')
        assign_role(successor, 'hbpr')
        new = reassign_assignment(
            albanian_tl=self.tl, new_hbpr=successor, cadence='weekly',
            effective_from=date(2020, 1, 2), actor=self.staff,
        )
        HbprGovernanceEvidence.objects.create(
            assignment=new, kind='cadence_meeting',
            occurred_on=self.today, recorded_by=self.tl,
            shared_summary='Successor era note',
        )

        def shared_strings(user):
            request = self.factory.get('/x/', {'leader_id': self.tl.id})
            force_authenticate(request, user=user)
            resp = TLScorecardViewSet.as_view({'get': 'export'})(request)
            self.assertEqual(resp.status_code, 200)
            with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                return zf.read('xl/sharedStrings.xml').decode('utf-8')

        hbpr_text = shared_strings(successor)
        self.assertIn('Successor era note', hbpr_text)
        self.assertNotIn('Predecessor era note', hbpr_text)
        # The AL TL and staff still get the full package.
        for user in (self.tl, self.staff):
            text = shared_strings(user)
            self.assertIn('Predecessor era note', text)
            self.assertIn('Successor era note', text)


class EvidenceServerSideFilterTests(EvidenceBase):
    """`period_year` and `leader` let the timeline page on the server."""

    def _ids(self, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        response = HbprGovernanceEvidenceViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in rows}

    def test_period_year_matches_cadence_by_date_and_epr_by_reporting_year(self):
        cadence_now = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=date(2026, 3, 1), recorded_by=self.tl)
        cadence_old = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=date(2025, 3, 1), recorded_by=self.tl)
        epr_now = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='epr_mid_year', reporting_year=2026,
            occurred_on=date(2026, 6, 1), recorded_by=self.tl)
        ids = self._ids(self.hbpr, period_year=2026)
        self.assertEqual(ids, {cadence_now.id, epr_now.id})
        self.assertNotIn(cadence_old.id, ids)

    def test_leader_filter_is_scoped_by_the_assignment_scope(self):
        mine = HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=date(2026, 3, 1), recorded_by=self.tl)
        HbprGovernanceEvidence.objects.create(
            assignment=self.other_assignment, kind='cadence_meeting',
            occurred_on=date(2026, 3, 1), recorded_by=self.other_tl)
        self.assertEqual(self._ids(self.hbpr, leader=self.tl.id), {mine.id})
        # Asking for someone else's leader yields nothing, never their rows.
        self.assertEqual(self._ids(self.hbpr, leader=self.other_tl.id), set())

    def test_bad_values_are_400(self):
        for params in ({'period_year': 'x'}, {'leader': 'x'}):
            request = self.factory.get('/x/', params)
            force_authenticate(request, user=self.hbpr)
            response = HbprGovernanceEvidenceViewSet.as_view({'get': 'list'})(request)
            self.assertEqual(response.status_code, 400, params)
