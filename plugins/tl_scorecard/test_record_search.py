"""`?q=` text search on the six record list endpoints.

Search applies *after* scoping (TL own-rows, HBPR slice, staff-everything),
so it can only ever narrow what the viewer is already allowed to list.
"""
from datetime import date

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole

from .models import (
    Absence,
    IdleFlag,
    Meeting,
    PIPRecord,
    PromotionFlag,
    ReviewDelivery,
)
from .testing import make_user as _make_user
from .viewsets import (
    AbsenceViewSet,
    IdleFlagViewSet,
    MeetingViewSet,
    PIPRecordViewSet,
    PromotionFlagViewSet,
    ReviewDeliveryViewSet,
)


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


class RecordSearchTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.tl = _make_user('tl_q')
        _assign_tl_role(self.tl)
        self.member = _make_user('member_q', first_name='Aldair', last_name='Xhelili')
        self.member.profile.italian_tl = self.tl
        self.member.profile.save()
        self.other_tl = _make_user('other_tl_q')
        _assign_tl_role(self.other_tl)
        today = date.today()
        Meeting.objects.create(
            organizer=self.tl, meeting_type='tl_sync', counterparty=self.member,
            occurred_on=today, notes='Roadmap planning session',
        )
        # Same text on another TL's row: search must not widen scope.
        Meeting.objects.create(
            organizer=self.other_tl, meeting_type='tl_sync', counterparty=self.other_tl,
            occurred_on=today, notes='Roadmap planning session',
        )
        IdleFlag.objects.create(
            employee=self.member, flagged_by=self.tl, flagged_on=today,
            productivity_task='Docs overhaul',
        )
        Absence.objects.create(
            employee=self.member, flagged_by=self.tl, absence_date=today,
            reason='Family emergency',
        )
        ReviewDelivery.objects.create(
            leader=self.tl, period='2026-10', recipient='Ops Board',
            delivered_on=today, notes='Quarterly business review',
        )
        PIPRecord.objects.create(
            employee=self.member, tl=self.tl, start_date=today,
            status_note='Needs mentoring support',
        )
        PromotionFlag.objects.create(
            employee=self.member, nominated_by=self.tl, nominated_on=today,
            decision_note='Promotion committee review',
        )

    def _ids(self, viewset, q=None):
        params = {'q': q} if q is not None else {}
        request = self.factory.get('/', params)
        force_authenticate(request, user=self.tl)
        response = viewset.as_view({'get': 'list'})(request)
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        rows = data['results'] if isinstance(data, dict) else data
        return {row['id'] for row in rows}

    def test_matches_text_in_each_kinds_fields(self):
        cases = [
            (MeetingViewSet, 'roadmap'),
            (MeetingViewSet, 'Xhelili'),
            (IdleFlagViewSet, 'overhaul'),
            (AbsenceViewSet, 'emergency'),
            (ReviewDeliveryViewSet, 'Ops Board'),
            (ReviewDeliveryViewSet, '2026-10'),
            (PIPRecordViewSet, 'mentoring'),
            (PromotionFlagViewSet, 'committee'),
            (PIPRecordViewSet, 'Aldair'),
        ]
        for viewset, term in cases:
            with self.subTest(viewset=viewset.__name__, term=term):
                self.assertEqual(len(self._ids(viewset, term)), 1)

    def test_no_match_returns_empty(self):
        for viewset in (
            MeetingViewSet, IdleFlagViewSet, AbsenceViewSet,
            ReviewDeliveryViewSet, PIPRecordViewSet, PromotionFlagViewSet,
        ):
            with self.subTest(viewset=viewset.__name__):
                self.assertEqual(self._ids(viewset, 'zzz-no-such-text'), set())

    def test_blank_search_lists_everything(self):
        self.assertEqual(len(self._ids(MeetingViewSet, '')), 1)
        self.assertEqual(len(self._ids(MeetingViewSet)), 1)

    def test_search_never_widens_scope(self):
        # The other TL's identical roadmap note stays invisible.
        self.assertEqual(len(self._ids(MeetingViewSet, 'roadmap')), 1)
        mine = Meeting.objects.get(organizer=self.tl).id
        self.assertEqual(self._ids(MeetingViewSet, 'roadmap'), {mine})

    def test_staff_can_search_private_notes_and_owner_keeps_them(self):
        staff = _make_user('staff_q', is_staff=True)
        request = self.factory.get('/', {'q': 'roadmap'})
        force_authenticate(request, user=staff)
        rows = MeetingViewSet.as_view({'get': 'list'})(request).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        self.assertEqual(len(rows), 2)  # both TLs' meetings, matched on notes
        self.assertEqual(len(self._ids(MeetingViewSet, 'roadmap')), 1)  # owner

    def test_overlong_search_is_truncated_not_an_error(self):
        response_ids = self._ids(MeetingViewSet, 'x' * 500)
        self.assertEqual(response_ids, set())
