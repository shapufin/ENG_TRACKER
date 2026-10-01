"""HBPR access to scorecard records: scoped reads, read-only everywhere except
the participation actions (approve / decide), and never acting on oneself."""
from datetime import date

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission
from apps.users.models.core import UserProfile

from .models import Absence, EPRCycle, IdleFlag, Meeting, PIPRecord, PromotionFlag
from .viewsets import (
    AbsenceViewSet,
    EPRCycleViewSet,
    IdleFlagViewSet,
    MeetingViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
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
        # HBPR gets plugin `view` only (what the manifest will grant).
        PluginPermission.objects.get(plugin_name='tl_scorecard', action='view') \
            .allowed_roles.add(Role.objects.get(code='hbpr'))

        self.hbpr = _make_user('hbpr_sc')
        assign_role(self.hbpr, 'hbpr')

        # In scope: Italian TL + report.
        self.it_tl = _make_user('it_tl_sc')
        assign_role(self.it_tl, 'italian_tl')
        self.it_member = _make_user('it_member_sc')
        self.it_member.profile.italian_tl = self.it_tl
        self.it_member.profile.save()

        # Out of scope: Albanian TL + report.
        self.al_tl = _make_user('al_tl_sc')
        assign_role(self.al_tl, 'albanian_tl')
        self.al_member = _make_user('al_member_sc')
        self.al_member.profile.albanian_tl = self.al_tl
        self.al_member.profile.save()

        self.staff = _make_user('staff_sc', is_staff=True)

        today = date.today()
        self.pip_in = PIPRecord.objects.create(employee=self.it_member, tl=self.it_tl, start_date=today)
        self.pip_out = PIPRecord.objects.create(employee=self.al_member, tl=self.al_tl, start_date=today)
        self.promo_in = PromotionFlag.objects.create(
            employee=self.it_member, nominated_by=self.it_tl, nominated_on=today)
        self.promo_out = PromotionFlag.objects.create(
            employee=self.al_member, nominated_by=self.al_tl, nominated_on=today)
        self.absence_in = Absence.objects.create(
            employee=self.it_member, flagged_by=self.it_tl, absence_date=today)
        self.absence_out = Absence.objects.create(
            employee=self.al_member, flagged_by=self.al_tl, absence_date=today)
        self.idle_in = IdleFlag.objects.create(
            employee=self.it_member, flagged_by=self.it_tl, flagged_on=today)
        self.idle_out = IdleFlag.objects.create(
            employee=self.al_member, flagged_by=self.al_tl, flagged_on=today)
        self.meeting_in = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.it_tl, counterparty=self.it_member,
            occurred_on=today)
        self.meeting_out = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.al_tl, counterparty=self.al_member,
            occurred_on=today)
        self.epr_in = EPRCycle.objects.create(user=self.it_member, year=today.year)
        self.epr_out = EPRCycle.objects.create(user=self.al_member, year=today.year)

    def _list_ids(self, viewset, user):
        request = self.factory.get('/x/')
        force_authenticate(request, user=user)
        response = viewset.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        return {row['id'] for row in rows}


class HbprManifestTests(TestCase):
    """The manifests grant HBPR read access only, never `manage`."""

    def test_manifest_grants_hbpr_view_but_not_manage(self):
        call_command('seed_plugin_permissions')
        view = PluginPermission.objects.get(plugin_name='tl_scorecard', action='view')
        manage = PluginPermission.objects.get(plugin_name='tl_scorecard', action='manage')
        self.assertIn('hbpr', set(view.allowed_roles.values_list('code', flat=True)))
        self.assertNotIn('hbpr', set(manage.allowed_roles.values_list('code', flat=True)))

    def test_engagement_view_includes_hbpr(self):
        call_command('seed_plugin_permissions')
        view = PluginPermission.objects.get(plugin_name='engagement', action='view')
        self.assertIn('hbpr', set(view.allowed_roles.values_list('code', flat=True)))


class HbprScopedReadTests(HbprScorecardBase):
    def test_hbpr_sees_only_in_scope_records_on_every_viewset(self):
        cases = [
            (PIPRecordViewSet, self.pip_in, self.pip_out),
            (PromotionFlagViewSet, self.promo_in, self.promo_out),
            (AbsenceViewSet, self.absence_in, self.absence_out),
            (IdleFlagViewSet, self.idle_in, self.idle_out),
            (MeetingViewSet, self.meeting_in, self.meeting_out),
            (EPRCycleViewSet, self.epr_in, self.epr_out),
        ]
        for viewset, inside, outside in cases:
            with self.subTest(viewset=viewset.__name__):
                ids = self._list_ids(viewset, self.hbpr)
                self.assertIn(inside.id, ids)
                self.assertNotIn(outside.id, ids)

    def test_in_scope_record_by_a_staff_member_is_not_exposed(self):
        # Owner TL must be in the Italian population too, not just the subject.
        pip = PIPRecord.objects.create(
            employee=self.it_member, tl=self.staff, start_date=date.today())
        self.assertNotIn(pip.id, self._list_ids(PIPRecordViewSet, self.hbpr))

    def test_plain_employee_is_denied_and_tl_sees_own_only(self):
        request = self.factory.get('/x/')
        force_authenticate(request, user=self.it_member)
        resp = PIPRecordViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self._list_ids(PIPRecordViewSet, self.it_tl), {self.pip_in.id})

    def test_tl_who_is_also_hbpr_gets_the_union(self):
        assign_role(self.al_tl, 'hbpr')
        ids = self._list_ids(PIPRecordViewSet, self.al_tl)
        self.assertEqual(ids, {self.pip_out.id, self.pip_in.id})


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
        self.assertEqual(self._row(IdleFlagViewSet, self.idle_in.id, self.it_tl)['notes'], 'private idle note')
        self.assertEqual(self._row(AbsenceViewSet, self.absence_in.id, self.staff)['notes'], 'private absence note')


class HbprExportScopeTests(HbprScorecardBase):
    def test_export_excludes_records_about_people_outside_the_team(self):
        import io
        import zipfile

        ex_member = _make_user('ex_member_sc', first_name='Former', last_name='Colleague')
        PIPRecord.objects.create(employee=ex_member, tl=self.it_tl, start_date=date.today())
        Absence.objects.create(employee=ex_member, flagged_by=self.it_tl, absence_date=date.today())
        PromotionFlag.objects.create(
            employee=ex_member, nominated_by=self.it_tl, nominated_on=date.today())

        request = self.factory.get('/x/', {'leader_id': self.it_tl.id})
        force_authenticate(request, user=self.hbpr)
        resp = TLScorecardViewSet.as_view({'get': 'export'})(request)
        self.assertEqual(resp.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            text = zf.read('xl/sharedStrings.xml').decode('utf-8')
        self.assertNotIn('ex_member_sc', text)
        # sanity: the workbook does list people (this team's own PIP)
        PIPRecord.objects.filter(employee=self.it_member).exists()


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
            'employee': self.it_member.id, 'start_date': str(date.today())})
        force_authenticate(request, user=self.hbpr)
        resp = PIPRecordViewSet.as_view({'post': 'create'})(request)
        self.assertEqual(resp.status_code, 403)


class HbprParticipationTests(HbprScorecardBase):
    def _approve(self, pip, user):
        request = self.factory.post('/x/')
        force_authenticate(request, user=user)
        return PIPRecordViewSet.as_view({'post': 'approve'})(request, pk=pip.id)

    def _decide(self, flag, user, outcome='promoted'):
        request = self.factory.post('/x/', {'status': outcome})
        force_authenticate(request, user=user)
        return PromotionFlagViewSet.as_view({'post': 'decide'})(request, pk=flag.id)

    def test_hbpr_can_approve_an_in_scope_pip(self):
        resp = self._approve(self.pip_in, self.hbpr)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.pip_in.refresh_from_db()
        self.assertEqual(self.pip_in.status, 'active')
        self.assertEqual(self.pip_in.approved_by_id, self.hbpr.id)

    def test_hbpr_cannot_approve_an_out_of_scope_pip(self):
        resp = self._approve(self.pip_out, self.hbpr)
        self.assertEqual(resp.status_code, 404)
        self.pip_out.refresh_from_db()
        self.assertEqual(self.pip_out.status, 'draft')

    def test_hbpr_can_decide_an_in_scope_promotion(self):
        resp = self._decide(self.promo_in, self.hbpr)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.promo_in.refresh_from_db()
        self.assertEqual(self.promo_in.status, 'promoted')

    def test_hbpr_cannot_decide_an_out_of_scope_promotion(self):
        self.assertEqual(self._decide(self.promo_out, self.hbpr).status_code, 404)

    def test_tl_cannot_approve_or_decide(self):
        self.assertEqual(self._approve(self.pip_in, self.it_tl).status_code, 403)
        self.assertEqual(self._decide(self.promo_in, self.it_tl).status_code, 403)

    def test_staff_who_owns_the_pip_cannot_approve_it(self):
        pip = PIPRecord.objects.create(
            employee=self.it_member, tl=self.staff, start_date=date.today())
        self.assertEqual(self._approve(pip, self.staff).status_code, 403)

    def test_staff_who_nominated_cannot_decide_their_own_nomination(self):
        flag = PromotionFlag.objects.create(
            employee=self.it_member, nominated_by=self.staff, nominated_on=date.today())
        self.assertEqual(self._decide(flag, self.staff).status_code, 403)

    def test_staff_can_still_approve_someone_elses_pip(self):
        self.assertEqual(self._approve(self.pip_in, self.staff).status_code, 200)

    def test_hbpr_who_is_also_the_employee_cannot_approve_their_own_pip(self):
        self.hbpr.profile.italian_tl = self.it_tl
        self.hbpr.profile.save()
        own = PIPRecord.objects.create(
            employee=self.hbpr, tl=self.it_tl, start_date=date.today())
        self.assertIn(self._approve(own, self.hbpr).status_code, (403, 404))
        own.refresh_from_db()
        self.assertEqual(own.status, 'draft')


class HbprScorecardEndpointTests(HbprScorecardBase):
    def _get(self, action_name, user, **params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'get': action_name})(request)

    def test_hbpr_can_view_an_in_scope_tl_scorecard(self):
        self.assertEqual(self._get('scorecard', self.hbpr, leader_id=self.it_tl.id).status_code, 200)

    def test_hbpr_cannot_view_an_out_of_scope_tl_scorecard(self):
        self.assertEqual(self._get('scorecard', self.hbpr, leader_id=self.al_tl.id).status_code, 403)

    def test_hbpr_scorecard_without_leader_id_is_rejected_not_self(self):
        # An HBPR has no team of their own; they must name an in-scope TL.
        self.assertEqual(self._get('scorecard', self.hbpr).status_code, 400)

    def test_a_tl_may_pass_their_own_leader_id(self):
        self.assertEqual(self._get('scorecard', self.it_tl, leader_id=self.it_tl.id).status_code, 200)

    def test_escalations_honours_an_in_scope_leader_id(self):
        self.assertEqual(self._get('escalations', self.hbpr, leader_id=self.it_tl.id).status_code, 200)
        self.assertEqual(self._get('escalations', self.hbpr, leader_id=self.al_tl.id).status_code, 403)
