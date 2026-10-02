"""HBPR access to scorecard records: assignment-scoped reads, strictly
read-only (no approve/decide), and never acting on oneself."""
from datetime import date

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission
from apps.users.models.core import UserProfile
from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .models import (
    Absence,
    EPRCycle,
    IdleFlag,
    Meeting,
    PIPRecord,
    PromotionFlag,
    ReviewDelivery,
)
from .viewsets import (
    AbsenceViewSet,
    EPRCycleViewSet,
    IdleFlagViewSet,
    MeetingViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
    ReviewDeliveryViewSet,
    TLScorecardViewSet,
)


def _make_user(username, **kwargs):
    user = User.objects.create_user(username=username, password='testpass123', **kwargs)
    UserProfile.objects.get_or_create(user=user)
    return user


class HbprScorecardBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        for code in ('hbpr', 'italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        # HBPR gets plugin `view` only (what the manifest grants).
        PluginPermission.objects.get(plugin_name='tl_scorecard', action='view') \
            .allowed_roles.add(Role.objects.get(code='hbpr'))

        self.hbpr = _make_user('hbpr_sc')
        assign_role(self.hbpr, 'hbpr')

        # In scope: the ASSIGNED Albanian TL + their report.
        self.tl = _make_user('assigned_tl_sc')
        assign_role(self.tl, 'albanian_tl')
        self.member = _make_user('assigned_member_sc')
        self.member.profile.albanian_tl = self.tl
        self.member.profile.save()
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )

        # Out of scope: an unassigned Albanian TL + their report.
        self.other_tl = _make_user('unassigned_tl_sc')
        assign_role(self.other_tl, 'albanian_tl')
        self.other_member = _make_user('unassigned_member_sc')
        self.other_member.profile.albanian_tl = self.other_tl
        self.other_member.profile.save()

        self.staff = _make_user('staff_sc', is_staff=True)

        today = date.today()
        self.pip_in = PIPRecord.objects.create(employee=self.member, tl=self.tl, start_date=today)
        self.pip_out = PIPRecord.objects.create(employee=self.other_member, tl=self.other_tl, start_date=today)
        self.promo_in = PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.tl, nominated_on=today)
        self.promo_out = PromotionFlag.objects.create(
            employee=self.other_member, nominated_by=self.other_tl, nominated_on=today)
        self.absence_in = Absence.objects.create(
            employee=self.member, flagged_by=self.tl, absence_date=today)
        self.absence_out = Absence.objects.create(
            employee=self.other_member, flagged_by=self.other_tl, absence_date=today)
        self.idle_in = IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=today)
        self.idle_out = IdleFlag.objects.create(
            employee=self.other_member, flagged_by=self.other_tl, flagged_on=today)
        self.meeting_in = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.tl, team=None, occurred_on=today)
        self.meeting_out = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.other_tl, team=None, occurred_on=today)
        self.one_on_one = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.member,
            occurred_on=today)
        self.epr_in = EPRCycle.objects.create(user=self.member, year=today.year)
        self.epr_out = EPRCycle.objects.create(user=self.other_member, year=today.year)

    def _list_ids(self, viewset, user):
        request = self.factory.get('/x/')
        force_authenticate(request, user=user)
        response = viewset.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in rows}


class HbprManifestTests(TestCase):
    """HBPR reads tl_scorecard only; `manage` and Engagement are not granted."""

    def test_manifest_grants_hbpr_view_but_not_manage(self):
        call_command('seed_plugin_permissions')
        view = PluginPermission.objects.get(plugin_name='tl_scorecard', action='view')
        manage = PluginPermission.objects.get(plugin_name='tl_scorecard', action='manage')
        self.assertIn('hbpr', set(view.allowed_roles.values_list('code', flat=True)))
        self.assertNotIn('hbpr', set(manage.allowed_roles.values_list('code', flat=True)))

    def test_engagement_view_excludes_hbpr_and_denies_it(self):
        call_command('seed_plugin_permissions')
        view = PluginPermission.objects.get(plugin_name='engagement', action='view')
        self.assertNotIn('hbpr', set(view.allowed_roles.values_list('code', flat=True)))
        self.assertIn('hbpr', set(view.denied_roles.values_list('code', flat=True)))


class HbprScopedReadTests(HbprScorecardBase):
    def test_hbpr_sees_only_assigned_records_on_every_viewset(self):
        cases = [
            (PIPRecordViewSet, self.pip_in, self.pip_out),
            (PromotionFlagViewSet, self.promo_in, self.promo_out),
            (AbsenceViewSet, self.absence_in, self.absence_out),
            (IdleFlagViewSet, self.idle_in, self.idle_out),
            (EPRCycleViewSet, self.epr_in, self.epr_out),
        ]
        for viewset, inside, outside in cases:
            with self.subTest(viewset=viewset.__name__):
                ids = self._list_ids(viewset, self.hbpr)
                self.assertIn(inside.id, ids)
                self.assertNotIn(outside.id, ids)

    def test_hbpr_never_sees_employee_one_on_one_meetings(self):
        ids = self._list_ids(MeetingViewSet, self.hbpr)
        self.assertIn(self.meeting_in.id, ids)
        self.assertNotIn(self.one_on_one.id, ids)
        self.assertNotIn(self.meeting_out.id, ids)

    def test_in_scope_record_by_a_staff_member_is_not_exposed(self):
        # Owner TL must be the assigned AL TL too, not just the subject.
        pip = PIPRecord.objects.create(
            employee=self.member, tl=self.staff, start_date=date.today())
        self.assertNotIn(pip.id, self._list_ids(PIPRecordViewSet, self.hbpr))

    def test_plain_employee_is_denied_and_tl_sees_own_only(self):
        request = self.factory.get('/x/')
        force_authenticate(request, user=self.member)
        resp = PIPRecordViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self._list_ids(PIPRecordViewSet, self.tl), {self.pip_in.id})

    def test_tl_who_is_also_hbpr_gets_the_union(self):
        # A user who is both an AL TL and an HBPR sees their own TL rows plus
        # the population they cover as HBPR.
        assign_role(self.hbpr, 'albanian_tl')
        own_member = _make_user('hbpr_own_member_sc')
        own_member.profile.albanian_tl = self.hbpr
        own_member.profile.save()
        own_pip = PIPRecord.objects.create(
            employee=own_member, tl=self.hbpr, start_date=date.today())
        ids = self._list_ids(PIPRecordViewSet, self.hbpr)
        self.assertEqual(ids, {own_pip.id, self.pip_in.id})


class HbprNotePrivacyTests(HbprScorecardBase):
    """TL free-text evidence stays private to the owner (and staff)."""

    def setUp(self):
        super().setUp()
        self.idle_in.notes = 'private idle note'
        self.idle_in.reference_url = 'https://example.test/idle'
        self.idle_in.save()
        self.absence_in.notes = 'private absence note'
        self.absence_in.reason = 'Sick leave'
        self.absence_in.save()
        self.promo_in.notes = 'private rationale'
        self.promo_in.save()

    def _row(self, viewset, pk, user):
        request = self.factory.get('/x/')
        force_authenticate(request, user=user)
        return viewset.as_view({'get': 'retrieve'})(request, pk=pk).data

    def test_hbpr_does_not_see_private_notes_on_any_record_type(self):
        for viewset, pk in (
            (IdleFlagViewSet, self.idle_in.id),
            (AbsenceViewSet, self.absence_in.id),
            (PromotionFlagViewSet, self.promo_in.id),
        ):
            with self.subTest(viewset=viewset.__name__):
                data = self._row(viewset, pk, self.hbpr)
                self.assertEqual(data['notes'], '')
                self.assertEqual(data.get('reference_url', ''), '')

    def test_hbpr_still_sees_the_substance_of_an_absence(self):
        self.assertEqual(self._row(AbsenceViewSet, self.absence_in.id, self.hbpr)['reason'], 'Sick leave')

    def test_owner_tl_and_staff_still_see_the_notes(self):
        self.assertEqual(self._row(IdleFlagViewSet, self.idle_in.id, self.tl)['notes'], 'private idle note')
        self.assertEqual(self._row(AbsenceViewSet, self.absence_in.id, self.staff)['notes'], 'private absence note')

    def test_hbpr_does_not_see_private_notes_on_review_deliveries(self):
        # Review deliveries are the one family the HBPR can read whose serializer
        # used to return the TL's private notes verbatim.
        review = ReviewDelivery.objects.create(
            leader=self.tl, period='2026-03', recipient='Ops', delivered_on=date.today(),
            notes='private review note', reference_url='https://example.test/review')
        data = self._row(ReviewDeliveryViewSet, review.id, self.hbpr)
        self.assertEqual(data['notes'], '')
        self.assertEqual(data['reference_url'], '')
        self.assertEqual(data['recipient'], 'Ops')
        self.assertEqual(self._row(ReviewDeliveryViewSet, review.id, self.tl)['notes'],
                         'private review note')


class HbprExportScopeTests(HbprScorecardBase):
    def test_export_excludes_records_about_people_outside_the_team(self):
        import io
        import zipfile

        ex_member = _make_user('ex_member_sc', first_name='Former', last_name='Colleague')
        PIPRecord.objects.create(employee=ex_member, tl=self.tl, start_date=date.today())
        Absence.objects.create(employee=ex_member, flagged_by=self.tl, absence_date=date.today())
        PromotionFlag.objects.create(
            employee=ex_member, nominated_by=self.tl, nominated_on=date.today())

        request = self.factory.get('/x/', {'leader_id': self.tl.id})
        force_authenticate(request, user=self.hbpr)
        resp = TLScorecardViewSet.as_view({'get': 'export'})(request)
        self.assertEqual(resp.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            text = zf.read('xl/sharedStrings.xml').decode('utf-8')
        self.assertNotIn('ex_member_sc', text)
        # sanity: the workbook does list people (this team's own PIP)
        PIPRecord.objects.filter(employee=self.member).exists()


class HbprReadOnlyTests(HbprScorecardBase):
    def test_hbpr_cannot_modify_or_delete_tl_records(self):
        request = self.factory.patch('/x/', {'notes': 'edited'})
        force_authenticate(request, user=self.hbpr)
        resp = PIPRecordViewSet.as_view({'patch': 'partial_update'})(request, pk=self.pip_in.id)
        self.assertIn(resp.status_code, (403, 404))
        request = self.factory.delete('/x/')
        force_authenticate(request, user=self.hbpr)
        resp = PIPRecordViewSet.as_view({'delete': 'destroy'})(request, pk=self.pip_in.id)
        self.assertIn(resp.status_code, (403, 404))
        self.assertTrue(PIPRecord.objects.filter(pk=self.pip_in.id).exists())
        self.assertEqual(PIPRecord.objects.get(pk=self.pip_in.id).notes, '')

    def test_hbpr_cannot_create_records(self):
        request = self.factory.post('/x/', {
            'employee': self.member.id, 'start_date': str(date.today())})
        force_authenticate(request, user=self.hbpr)
        resp = PIPRecordViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(resp.status_code, 403)


class HbprParticipationTests(HbprScorecardBase):
    """HBPR is read-only: it never approves a PIP or decides a promotion."""

    def _approve(self, pip, user):
        request = self.factory.post('/x/')
        force_authenticate(request, user=user)
        return PIPRecordViewSet.as_view({'post': 'approve'})(request, pk=pip.id)

    def _decide(self, flag, user, outcome='promoted'):
        request = self.factory.post('/x/', {'status': outcome})
        force_authenticate(request, user=user)
        return PromotionFlagViewSet.as_view({'post': 'decide'})(request, pk=flag.id)

    def test_hbpr_cannot_approve_an_in_scope_pip(self):
        resp = self._approve(self.pip_in, self.hbpr)
        self.assertIn(resp.status_code, (403, 404))
        self.pip_in.refresh_from_db()
        self.assertEqual(self.pip_in.status, 'draft')

    def test_hbpr_cannot_decide_an_in_scope_promotion(self):
        resp = self._decide(self.promo_in, self.hbpr)
        self.assertIn(resp.status_code, (403, 404))
        self.promo_in.refresh_from_db()
        self.assertEqual(self.promo_in.status, 'nominated')

    def test_owner_tl_cannot_approve_or_decide(self):
        self.assertEqual(self._approve(self.pip_in, self.tl).status_code, 403)
        self.assertEqual(self._decide(self.promo_in, self.tl).status_code, 403)

    def test_staff_who_owns_the_pip_cannot_approve_it(self):
        pip = PIPRecord.objects.create(
            employee=self.member, tl=self.staff, start_date=date.today())
        self.assertEqual(self._approve(pip, self.staff).status_code, 403)

    def test_staff_who_nominated_cannot_decide_their_own_nomination(self):
        flag = PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.staff, nominated_on=date.today())
        self.assertEqual(self._decide(flag, self.staff).status_code, 403)

    def test_staff_can_still_approve_someone_elses_pip(self):
        self.assertEqual(self._approve(self.pip_in, self.staff).status_code, 200)


class HbprScorecardEndpointTests(HbprScorecardBase):
    def _get(self, action_name, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': action_name})(request)

    def test_hbpr_can_view_an_assigned_tl_scorecard(self):
        self.assertEqual(self._get('scorecard', self.hbpr, leader_id=self.tl.id).status_code, 200)

    def test_hbpr_cannot_view_an_unassigned_tl_scorecard(self):
        self.assertEqual(self._get('scorecard', self.hbpr, leader_id=self.other_tl.id).status_code, 403)

    def test_hbpr_scorecard_without_leader_id_is_rejected_not_self(self):
        # An HBPR has no team of their own; they must name an assigned TL.
        self.assertEqual(self._get('scorecard', self.hbpr).status_code, 400)

    def test_a_tl_may_pass_their_own_leader_id(self):
        self.assertEqual(self._get('scorecard', self.tl, leader_id=self.tl.id).status_code, 200)

    def test_escalations_honours_an_assigned_leader_id(self):
        self.assertEqual(self._get('escalations', self.hbpr, leader_id=self.tl.id).status_code, 200)
        self.assertEqual(self._get('escalations', self.hbpr, leader_id=self.other_tl.id).status_code, 403)


class HbprOneOnOneLeakTests(HbprScorecardBase):
    """Employee one-on-ones stay invisible through every route, not just
    the meeting list: attendee rows and scorecard aggregates included."""

    def test_hbpr_never_sees_attendee_rows_of_a_one_on_one(self):
        from .models import MeetingAttendee
        from .viewsets import MeetingAttendeeViewSet

        secret = MeetingAttendee.objects.create(
            meeting=self.one_on_one, user=self.staff, role='observer')
        visible = MeetingAttendee.objects.create(
            meeting=self.meeting_in, user=self.staff, role='observer')
        ids = self._list_ids(MeetingAttendeeViewSet, self.hbpr)
        self.assertIn(visible.id, ids)
        self.assertNotIn(secret.id, ids)
        request = self.factory.get('/x/')
        force_authenticate(request, user=self.hbpr)
        resp = MeetingAttendeeViewSet.as_view({'get': 'retrieve'})(request, pk=secret.id)
        self.assertEqual(resp.status_code, 404)

    def test_hbpr_cannot_retrieve_a_one_on_one_by_guessed_id(self):
        """A guessed meeting id must look exactly like an id that does not exist.

        The list omission alone is not the contract: the id is guessable, so the
        detail route has to resolve through the same scoped queryset and answer
        indistinguishably from a missing row.
        """
        view = MeetingViewSet.as_view({'get': 'retrieve'})

        def retrieve(pk):
            request = self.factory.get('/x/')
            force_authenticate(request, user=self.hbpr)
            return view(request, pk=pk)

        secret = retrieve(self.one_on_one.id)
        missing = retrieve(999_999)
        self.assertEqual(secret.status_code, 404)
        self.assertEqual(
            secret.status_code, missing.status_code,
            'a guessed one-on-one id must be indistinguishable from a missing id',
        )
        # The in-scope team meeting stays retrievable, so the 404 above is the
        # one-on-one exclusion and not a blanket HBPR read failure.
        self.assertEqual(retrieve(self.meeting_in.id).status_code, 200)

    def _get(self, action, user, **params):
        request = self.factory.get('/x/', {'leader_id': self.tl.id, **params})
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': action})(request)

    def test_scorecard_hides_one_on_one_compliance_from_hbpr(self):
        resp = self._get('scorecard', self.hbpr)
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['meetings']['one_on_one_compliance_pct'])

    def test_scorecard_keeps_one_on_one_compliance_for_owner_and_staff(self):
        for user in (self.tl, self.staff):
            with self.subTest(user=user.username):
                resp = self._get('scorecard', user)
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.data['meetings']['one_on_one_compliance_pct'], 100.0)

    def test_trend_hides_one_on_one_compliance_from_hbpr(self):
        resp = self._get('trend', self.hbpr, months=2)
        self.assertEqual(resp.status_code, 200)
        for point in resp.data:
            self.assertIsNone(point['meetings']['one_on_one_compliance_pct'])
