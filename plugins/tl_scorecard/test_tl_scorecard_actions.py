"""State-changing actions (PIP return/complete/cancel, idle resolve, absence
address, meeting share, promotion decision audit) and note privacy."""
from datetime import date, datetime, timezone as dt_timezone
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from core.utils import timezone_local
from core.utils.timezone_local import business_today
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .testing import make_user as _make_user
from .models import Absence, IdleFlag, Meeting, MeetingAttendee, PIPRecord, PromotionFlag
from .viewsets import (
    AbsenceViewSet,
    IdleFlagViewSet,
    MeetingAttendeeViewSet,
    MeetingViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
)


class ActionsBase(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        for code in ('hbpr', 'italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        call_command('seed_plugin_permissions')
        self.hbpr = _make_user('hbpr_act')
        assign_role(self.hbpr, 'hbpr')
        # The assigned Albanian TL (owns the records) + their report.
        self.tl = _make_user('tl_act')
        assign_role(self.tl, 'albanian_tl')
        self.member = _make_user('member_act')
        self.member.profile.albanian_tl = self.tl
        self.member.profile.save()
        HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )
        # An unassigned Albanian TL.
        self.other_tl = _make_user('other_tl_act')
        assign_role(self.other_tl, 'albanian_tl')
        self.staff = _make_user('staff_act', is_staff=True)
        self.today = business_today()

    def call(self, viewset, action_name, user, pk=None, data=None, method='post'):
        request = getattr(self.factory, method)('/x/', data or {}, format='json')
        force_authenticate(request, user=user)
        kwargs = {'pk': pk} if pk is not None else {}
        return viewset.as_view({method: action_name})(request, **kwargs)


class PipTransitionTests(ActionsBase):
    def setUp(self):
        super().setUp()
        self.pip = PIPRecord.objects.create(
            employee=self.member, tl=self.tl, start_date=self.today, notes='private evidence')

    def _active(self):
        self.pip.status = 'active'
        self.pip.approved_by = self.staff
        self.pip.approved_at = timezone.now()
        self.pip.save()

    def test_approved_pip_cannot_be_reassigned_or_redated(self):
        self._active()
        other = _make_user('other_member_act')
        other.profile.italian_tl = self.tl
        other.profile.save()
        resp = self.call(
            PIPRecordViewSet, 'partial_update', self.tl, self.pip.id,
            {'employee': other.id}, method='patch')
        self.assertEqual(resp.status_code, 400)
        resp = self.call(
            PIPRecordViewSet, 'partial_update', self.tl, self.pip.id,
            {'start_date': '2020-01-01'}, method='patch')
        self.assertEqual(resp.status_code, 400)
        self.pip.refresh_from_db()
        self.assertEqual(self.pip.employee_id, self.member.id)

    def test_hbpr_cannot_return_a_draft_pip(self):
        resp = self.call(PIPRecordViewSet, 'reject', self.hbpr, self.pip.id, {'status_note': 'Needs evidence'})
        self.assertIn(resp.status_code, (403, 404))
        self.pip.refresh_from_db()
        self.assertEqual(self.pip.status, 'draft')

    def test_staff_can_return_a_draft_pip_with_a_reason(self):
        resp = self.call(PIPRecordViewSet, 'reject', self.staff, self.pip.id, {'status_note': 'Needs evidence'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.pip.refresh_from_db()
        self.assertEqual(self.pip.status, 'cancelled')
        self.assertEqual(self.pip.status_note, 'Needs evidence')
        self.assertEqual(self.pip.closed_on, self.today)

    def test_return_requires_a_reason(self):
        resp = self.call(PIPRecordViewSet, 'reject', self.staff, self.pip.id, {})
        self.assertEqual(resp.status_code, 400)
        self.pip.refresh_from_db()
        self.assertEqual(self.pip.status, 'draft')

    def test_return_only_applies_to_a_draft(self):
        self._active()
        resp = self.call(PIPRecordViewSet, 'reject', self.staff, self.pip.id, {'status_note': 'x'})
        self.assertEqual(resp.status_code, 409)

    def test_tl_cannot_return_their_own_pip(self):
        resp = self.call(PIPRecordViewSet, 'reject', self.tl, self.pip.id, {'status_note': 'x'})
        self.assertEqual(resp.status_code, 403)

    def test_owner_tl_can_complete_an_active_pip(self):
        self._active()
        resp = self.call(PIPRecordViewSet, 'complete', self.tl, self.pip.id, {'status_note': 'Goals met'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.pip.refresh_from_db()
        self.assertEqual((self.pip.status, self.pip.closed_on), ('completed', self.today))

    def test_owner_tl_can_cancel_an_active_pip_with_a_reason(self):
        self._active()
        resp = self.call(PIPRecordViewSet, 'cancel', self.tl, self.pip.id, {'status_note': 'Moved team'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.pip.refresh_from_db()
        self.assertEqual(self.pip.status, 'cancelled')

    def test_cancel_requires_a_reason(self):
        self._active()
        self.assertEqual(self.call(PIPRecordViewSet, 'cancel', self.tl, self.pip.id, {}).status_code, 400)

    def test_cannot_close_a_draft_or_a_terminal_pip(self):
        self.assertEqual(
            self.call(PIPRecordViewSet, 'complete', self.tl, self.pip.id, {}).status_code, 409)
        self._active()
        self.call(PIPRecordViewSet, 'complete', self.tl, self.pip.id, {})
        self.assertEqual(
            self.call(PIPRecordViewSet, 'cancel', self.tl, self.pip.id, {'status_note': 'x'}).status_code, 409)

    def test_another_tl_cannot_close_the_pip(self):
        self._active()
        resp = self.call(PIPRecordViewSet, 'complete', self.other_tl, self.pip.id, {})
        self.assertEqual(resp.status_code, 404)

    def test_hbpr_cannot_complete_or_cancel(self):
        self._active()
        for name in ('complete', 'cancel'):
            resp = self.call(PIPRecordViewSet, name, self.hbpr, self.pip.id, {'status_note': 'x'})
            self.assertIn(resp.status_code, (403, 404), name)
        self.pip.refresh_from_db()
        self.assertEqual(self.pip.status, 'active')


class PromotionAuditTests(ActionsBase):
    def test_decide_records_who_and_why(self):
        flag = PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.tl, nominated_on=self.today)
        resp = self.call(
            PromotionFlagViewSet, 'decide', self.staff, flag.id,
            {'status': 'declined', 'decision_note': 'Not yet'})
        self.assertEqual(resp.status_code, 200, resp.data)
        flag.refresh_from_db()
        self.assertEqual(flag.decided_by_id, self.staff.id)
        self.assertEqual(flag.decision_note, 'Not yet')

    def test_hbpr_cannot_decide(self):
        flag = PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.tl, nominated_on=self.today)
        resp = self.call(
            PromotionFlagViewSet, 'decide', self.hbpr, flag.id, {'status': 'promoted'})
        self.assertIn(resp.status_code, (403, 404))
        flag.refresh_from_db()
        self.assertEqual(flag.status, 'nominated')


class IdleAndAbsenceActionTests(ActionsBase):
    def test_idle_resolve_sets_status_and_date_together(self):
        flag = IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=self.today)
        resp = self.call(IdleFlagViewSet, 'resolve', self.tl, flag.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        flag.refresh_from_db()
        self.assertEqual((flag.status, flag.resolved_on), ('resolved', self.today))
        self.assertEqual(self.call(IdleFlagViewSet, 'resolve', self.tl, flag.id).status_code, 409)

    def test_idle_resolve_stamps_the_tirana_day_at_2330_utc(self):
        # 23:30 UTC on the 19th is already the 20th in Europe/Tirane.
        instant = datetime(2026, 10, 19, 23, 30, tzinfo=dt_timezone.utc)
        fake = mock.MagicMock(wraps=datetime)
        fake.now.side_effect = lambda tz=None: instant.astimezone(tz)
        flag = IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=date(2026, 10, 19))
        with mock.patch.object(timezone_local, 'datetime', fake):
            resp = self.call(IdleFlagViewSet, 'resolve', self.tl, flag.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        flag.refresh_from_db()
        self.assertEqual(flag.resolved_on, date(2026, 10, 20))

    def test_idle_status_cannot_be_patched_directly(self):
        flag = IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=self.today)
        self.call(IdleFlagViewSet, 'partial_update', self.tl, flag.id,
                  {'status': 'resolved', 'resolved_on': str(self.today)}, method='patch')
        flag.refresh_from_db()
        self.assertEqual((flag.status, flag.resolved_on), ('open', None))

    def test_absence_address_sets_the_date_once(self):
        absence = Absence.objects.create(
            employee=self.member, flagged_by=self.tl, absence_date=self.today)
        resp = self.call(AbsenceViewSet, 'address', self.tl, absence.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        absence.refresh_from_db()
        self.assertEqual(absence.addressed_on, self.today)
        self.assertEqual(self.call(AbsenceViewSet, 'address', self.tl, absence.id).status_code, 409)

    def test_absence_addressed_on_cannot_be_patched_directly(self):
        absence = Absence.objects.create(
            employee=self.member, flagged_by=self.tl, absence_date=self.today)
        self.call(AbsenceViewSet, 'partial_update', self.tl, absence.id,
                  {'addressed_on': str(self.today)}, method='patch')
        absence.refresh_from_db()
        self.assertIsNone(absence.addressed_on)

    def test_other_tl_cannot_resolve_or_address(self):
        flag = IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=self.today)
        self.assertEqual(self.call(IdleFlagViewSet, 'resolve', self.other_tl, flag.id).status_code, 404)


class MeetingShareAndPrivacyTests(ActionsBase):
    def setUp(self):
        super().setUp()
        self.meeting = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.tl, counterparty=self.member,
            occurred_on=self.today, notes='private TL notes')

    def test_organizer_can_share_a_summary_with_the_counterparty(self):
        resp = self.call(MeetingViewSet, 'share', self.tl, self.meeting.id, {'summary': 'We agreed X'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.meeting.refresh_from_db()
        self.assertEqual(self.meeting.shared_summary, 'We agreed X')
        self.assertIsNotNone(self.meeting.shared_at)
        self.assertEqual(self.meeting.notes, 'private TL notes')

    def test_share_requires_a_summary_and_the_organizer(self):
        self.assertEqual(self.call(MeetingViewSet, 'share', self.tl, self.meeting.id, {}).status_code, 400)
        resp = self.call(MeetingViewSet, 'share', self.other_tl, self.meeting.id, {'summary': 'x'})
        self.assertEqual(resp.status_code, 404)

    def _read(self, user):
        request = self.factory.get('/x/')
        force_authenticate(request, user=user)
        return MeetingViewSet.as_view({'get': 'retrieve'})(request, pk=self.meeting.id)

    def test_hbpr_cannot_read_a_one_on_one_at_all(self):
        # Employee one-on-ones are never part of the HBPR slice, so an HBPR
        # gets not-found even though the owner TL is assigned to them.
        self.assertEqual(self._read(self.hbpr).status_code, 404)

    def test_owner_tl_reads_their_own_private_notes(self):
        self.assertEqual(self._read(self.tl).data['notes'], 'private TL notes')

    def test_hbpr_does_not_see_pip_private_notes_but_sees_shared_notes(self):
        pip = PIPRecord.objects.create(
            employee=self.member, tl=self.tl, start_date=self.today,
            notes='private evidence', shared_notes='Plan summary')
        request = self.factory.get('/x/')
        force_authenticate(request, user=self.hbpr)
        data = PIPRecordViewSet.as_view({'get': 'retrieve'})(request, pk=pip.id).data
        self.assertEqual(data['notes'], '')
        self.assertEqual(data['shared_notes'], 'Plan summary')
        force_authenticate(request, user=self.tl)
        data = PIPRecordViewSet.as_view({'get': 'retrieve'})(request, pk=pip.id).data
        self.assertEqual(data['notes'], 'private evidence')


class AttendeeRulesTests(ActionsBase):
    def setUp(self):
        super().setUp()
        self.meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.tl, occurred_on=self.today,
            team=None)

    def test_hrbp_attendee_must_be_an_hbpr_hr_or_staff(self):
        resp = self.call(
            MeetingAttendeeViewSet, 'create', self.tl, None,
            {'meeting': self.meeting.id, 'user': self.member.id, 'role': 'hrbp'})
        self.assertEqual(resp.status_code, 400)
        resp = self.call(
            MeetingAttendeeViewSet, 'create', self.tl, None,
            {'meeting': self.meeting.id, 'user': self.hbpr.id, 'role': 'hrbp'})
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_attendee_notes_are_visible_only_to_the_attendee_and_staff(self):
        att = MeetingAttendee.objects.create(
            meeting=self.meeting, user=self.hbpr, role='hrbp', notes='my own notes')

        def read(user):
            request = self.factory.get('/x/')
            force_authenticate(request, user=user)
            return MeetingAttendeeViewSet.as_view({'get': 'retrieve'})(request, pk=att.id).data

        self.assertEqual(read(self.hbpr)['notes'], 'my own notes')
        self.assertEqual(read(self.staff)['notes'], 'my own notes')
        self.assertEqual(read(self.tl)['notes'], '')


class AttendeeOwnNotesTests(ActionsBase):
    """HBPR is read-only: it never writes attendee notes. The organizer (TL)
    still manages attendees on their own meetings."""

    def setUp(self):
        super().setUp()
        self.meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.tl, occurred_on=self.today)
        self.att = MeetingAttendee.objects.create(meeting=self.meeting, user=self.hbpr, role='hrbp')

    def test_hbpr_cannot_write_attendee_notes(self):
        resp = self.call(MeetingAttendeeViewSet, 'notes', self.hbpr, self.att.id, {'notes': 'Agreed actions'})
        self.assertIn(resp.status_code, (403, 404))
        self.att.refresh_from_db()
        self.assertEqual(self.att.notes, '')

    def test_cannot_write_someone_elses_notes(self):
        other = _make_user('hbpr_other')
        assign_role(other, 'hbpr')
        resp = self.call(MeetingAttendeeViewSet, 'notes', other, self.att.id, {'notes': 'x'})
        self.assertIn(resp.status_code, (403, 404))
        self.att.refresh_from_db()
        self.assertEqual(self.att.notes, '')

    def test_out_of_scope_meeting_is_not_reachable(self):
        outsider = _make_user('albanian_only_tl')
        assign_role(outsider, 'albanian_tl')
        meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=outsider, occurred_on=self.today)
        att = MeetingAttendee.objects.create(meeting=meeting, user=self.hbpr, role='hrbp')
        resp = self.call(MeetingAttendeeViewSet, 'notes', self.hbpr, att.id, {'notes': 'x'})
        self.assertIn(resp.status_code, (403, 404))
        att.refresh_from_db()
        self.assertEqual(att.notes, '')

    def test_the_tl_cannot_use_it_to_write_the_attendees_notes(self):
        resp = self.call(MeetingAttendeeViewSet, 'notes', self.tl, self.att.id, {'notes': 'x'})
        self.assertIn(resp.status_code, (403, 404))


class LegacyPipRowTests(ActionsBase):
    """Plans created before status became server-controlled were saved as
    'active' with no approval; they are still pending approval, not running."""

    def setUp(self):
        super().setUp()
        self.legacy = PIPRecord.objects.create(
            employee=self.member, tl=self.tl, start_date=self.today, status='active')

    def test_legacy_pending_plan_can_be_approved(self):
        resp = self.call(PIPRecordViewSet, 'approve', self.staff, self.legacy.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.legacy.refresh_from_db()
        self.assertEqual((self.legacy.status, self.legacy.approved_by_id), ('active', self.staff.id))
        self.assertIsNotNone(self.legacy.approved_at)

    def test_legacy_pending_plan_can_be_returned(self):
        resp = self.call(PIPRecordViewSet, 'reject', self.staff, self.legacy.id, {'status_note': 'Rework'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.legacy.refresh_from_db()
        self.assertEqual(self.legacy.status, 'cancelled')

    def test_hbpr_cannot_approve_or_return(self):
        for name, data in (('approve', None), ('reject', {'status_note': 'x'})):
            resp = self.call(PIPRecordViewSet, name, self.hbpr, self.legacy.id, data)
            self.assertIn(resp.status_code, (403, 404), name)

    def test_legacy_pending_plan_is_still_awaiting_approval(self):
        # A row saved 'active' without an approval stays pending — the flag the
        # approve/reject actions gate on. (It is no longer surfaced in the HBPR
        # overview, which carries cadence/EPR attention only.)
        self.assertTrue(self.legacy.awaiting_approval)

    def test_approved_plan_still_cannot_be_approved_twice(self):
        self.call(PIPRecordViewSet, 'approve', self.staff, self.legacy.id)
        resp = self.call(PIPRecordViewSet, 'approve', self.staff, self.legacy.id)
        self.assertEqual(resp.status_code, 409)


class PromotionDecideResponseTests(ActionsBase):
    def test_decide_response_keeps_notes_for_a_viewer_who_may_see_them(self):
        flag = PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.tl, nominated_on=self.today, notes='tl notes')
        resp = self.call(PromotionFlagViewSet, 'decide', self.staff, flag.id, {'status': 'promoted'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['notes'], 'tl notes')


class CadenceEditTests(ActionsBase):
    """The assigned Albanian TL changes their own HBPR meeting schedule."""

    def post(self, user, data, query=''):
        from .viewsets import TLScorecardViewSet
        request = self.factory.post(f'/x/{query}', data, format='json')
        force_authenticate(request, user=user)
        return TLScorecardViewSet.as_view({'post': 'change_cadence'})(request)

    def test_assigned_tl_changes_their_cadence(self):
        resp = self.post(self.tl, {'cadence': 'monthly', 'cadence_day_of_week': 3, 'cadence_nth_week': 2})
        self.assertEqual(resp.status_code, 200, resp.data)
        row = HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl)
        self.assertEqual((row.cadence, row.cadence_day_of_week, row.cadence_nth_week), ('monthly', 3, 2))
        self.assertEqual(resp.data['assignment']['cadence'], 'monthly')
        self.assertIs(resp.data['assignment']['can_edit_cadence'], True)

    def test_other_tl_cannot_change_a_schedule(self):
        data = {'cadence': 'monthly'}
        self.assertEqual(self.post(self.other_tl, data).status_code, 400)  # no open assignment of their own
        self.assertEqual(self.post(self.other_tl, data, f'?leader_id={self.tl.id}').status_code, 403)
        self.assertEqual(HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl).cadence, 'weekly')

    def test_hbpr_cannot_change_a_cadence(self):
        resp = self.post(self.hbpr, {'cadence': 'monthly'}, f'?leader_id={self.tl.id}')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl).cadence, 'weekly')

    def test_invalid_cadence_is_rejected(self):
        self.assertEqual(self.post(self.tl, {'cadence': 'daily'}).status_code, 400)
        self.assertEqual(self.post(self.tl, {}).status_code, 400)
        self.assertEqual(self.post(self.tl, {'cadence': 'weekly', 'cadence_day_of_week': 9}).status_code, 400)

    def test_nth_week_rules_are_400_not_500(self):
        resp = self.post(self.tl, {'cadence': 'monthly', 'cadence_nth_week': 2, 'cadence_day_of_week': None})
        self.assertEqual(resp.status_code, 400)
        resp = self.post(self.tl, {'cadence': 'weekly', 'cadence_nth_week': 2, 'cadence_day_of_week': 1})
        self.assertEqual(resp.status_code, 400)
        row = HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl)
        self.assertEqual((row.cadence, row.cadence_nth_week), ('weekly', None))

    def test_switching_away_from_monthly_week_clears_it(self):
        self.post(self.tl, {'cadence': 'monthly', 'cadence_day_of_week': 3, 'cadence_nth_week': 2})
        resp = self.post(self.tl, {'cadence': 'weekly', 'cadence_day_of_week': 1, 'cadence_nth_week': None})
        self.assertEqual(resp.status_code, 200, resp.data)
        row = HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl)
        self.assertEqual((row.cadence, row.cadence_day_of_week, row.cadence_nth_week), ('weekly', 1, None))

    def test_cadence_change_is_audited(self):
        from django.contrib.contenttypes.models import ContentType
        from plugins.audit_log.models import AuditLog
        row = HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl)
        self.post(self.tl, {'cadence': 'monthly', 'cadence_day_of_week': 3, 'cadence_nth_week': 2})
        log = AuditLog.objects.get(
            action='update', object_id=row.id,
            content_type=ContentType.objects.get_for_model(HbprAlbanianTlAssignment))
        self.assertEqual(log.user_id, self.tl.id)
        self.assertEqual(log.old_values['cadence'], 'weekly')
        self.assertEqual(log.new_values, {'cadence': 'monthly', 'cadence_day_of_week': 3, 'cadence_nth_week': 2})

    def test_failed_change_writes_no_audit_row(self):
        from plugins.audit_log.models import AuditLog
        before = AuditLog.objects.count()
        self.post(self.tl, {'cadence': 'daily'})
        self.assertEqual(AuditLog.objects.count(), before)

    def test_staff_can_change_a_leader_schedule(self):
        resp = self.post(self.staff, {'cadence': 'biweekly', 'cadence_day_of_week': 2}, f'?leader_id={self.tl.id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl).cadence, 'biweekly')

    def test_partnership_read_reports_edit_rights(self):
        from .viewsets import TLScorecardViewSet

        def read(user, query=''):
            request = self.factory.get(f'/x/{query}')
            force_authenticate(request, user=user)
            return TLScorecardViewSet.as_view({'get': 'partnership'})(request).data['assignment']

        self.assertIs(read(self.tl)['can_edit_cadence'], True)
        self.assertIs(read(self.hbpr, f'?leader_id={self.tl.id}')['can_edit_cadence'], False)

    def test_admin_create_keeps_the_monthly_week(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.staff)
        resp = client.post('/api/users/hbpr-assignments/', {
            'hbpr': self.hbpr.id, 'albanian_tl': self.other_tl.id, 'cadence': 'monthly',
            'cadence_day_of_week': 3, 'cadence_nth_week': 2, 'effective_from': '2026-01-05',
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        row = HbprAlbanianTlAssignment.objects.get(albanian_tl=self.other_tl)
        self.assertEqual((row.cadence_day_of_week, row.cadence_nth_week), (3, 2))

    def test_admin_create_and_patch_reject_a_bad_schedule_with_400(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.staff)
        resp = client.post('/api/users/hbpr-assignments/', {
            'hbpr': self.hbpr.id, 'albanian_tl': self.other_tl.id, 'cadence': 'weekly',
            'cadence_nth_week': 2, 'effective_from': '2026-01-05',
        }, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertFalse(HbprAlbanianTlAssignment.objects.filter(albanian_tl=self.other_tl).exists())
        row = HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl)
        resp = client.patch(f'/api/users/hbpr-assignments/{row.id}/', {'cadence_nth_week': 2}, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_employee_cannot_change_a_cadence(self):
        """No plugin grant at all: `manage` is denied before the handler runs.

        Deliberately no `?leader_id=` — with one, `_resolve_leader` would 403
        too and the test could pass without ever reaching the permission gate.
        """
        employee = _make_user('employee_act')
        resp = self.post(employee, {'cadence': 'monthly'})
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl).cadence, 'weekly')

    def test_audit_is_best_effort_when_the_plugin_is_absent(self):
        """A deployment without audit_log must not fail the change."""
        import sys

        from plugins.audit_log.models import AuditLog

        from .viewsets.scorecard import _audit_cadence_change

        assignment = HbprAlbanianTlAssignment.objects.get(albanian_tl=self.tl)
        before = AuditLog.objects.count()
        with mock.patch.dict(sys.modules, {'plugins.audit_log.signals': None}):
            # Must not raise: the schedule is already saved by the time we log.
            _audit_cadence_change(self.tl, assignment, {'cadence': 'weekly'}, {'cadence': 'monthly'})
        self.assertEqual(AuditLog.objects.count(), before)
