"""`hbpr/records/`: server-side pages that reuse the resource viewsets' own scope."""
from datetime import date

from rest_framework.test import force_authenticate

from .models import Absence, IdleFlag, PIPRecord
from .test_tl_scorecard_hbpr import HbprScorecardBase
from .viewsets import PIPRecordViewSet
from .viewsets_hbpr import HbprViewSet


class HbprRecordsEndpointTests(HbprScorecardBase):
    def _get(self, user, **params):
        request = self.factory.get('/api/plugins/tl_scorecard/hbpr/records/', params)
        force_authenticate(request, user=user)
        return HbprViewSet.as_view({'get': 'records'})(request)

    def test_page_equals_what_the_resource_viewset_lists_for_the_same_hbpr(self):
        response = self._get(self.hbpr, kind='pips')
        self.assertEqual(response.status_code, 200, response.data)
        listed = self._list_ids(PIPRecordViewSet, self.hbpr)
        self.assertEqual({r['id'] for r in response.data['results']}, listed)
        self.assertEqual(response.data['count'], len(listed))
        self.assertNotIn(self.pip_out.id, listed)

    def test_never_returns_an_employee_one_on_one(self):
        response = self._get(self.hbpr, kind='meetings')
        ids = {r['id'] for r in response.data['results']}
        self.assertIn(self.meeting_in.id, ids)
        self.assertNotIn(self.one_on_one.id, ids)
        self.assertNotIn(self.meeting_out.id, ids)

    def test_kind_is_required_and_validated(self):
        self.assertEqual(self._get(self.hbpr).status_code, 400)
        self.assertEqual(self._get(self.hbpr, kind='one_on_ones').status_code, 400)

    def test_only_an_hbpr_may_call_it(self):
        for user in (self.tl, self.member, self.staff):
            with self.subTest(user=user.username):
                self.assertEqual(self._get(user, kind='pips').status_code, 403)

    def test_limit_offset_and_count(self):
        for i in range(3):
            PIPRecord.objects.create(
                employee=self.member, tl=self.tl, start_date=date(2026, 1, 1 + i))
        total = self._get(self.hbpr, kind='pips').data['count']
        self.assertEqual(total, 4)
        first = self._get(self.hbpr, kind='pips', limit=3, offset=0).data
        second = self._get(self.hbpr, kind='pips', limit=3, offset=3).data
        self.assertEqual((first['count'], len(first['results'])), (4, 3))
        self.assertEqual((second['count'], len(second['results'])), (4, 1))
        ids = [r['id'] for r in first['results'] + second['results']]
        self.assertEqual(len(set(ids)), 4)

    def test_same_date_rows_page_in_a_stable_total_order(self):
        # A date alone is not a total order: ties must break on id or offset
        # paging can repeat/skip rows between pages.
        same_day = [
            PIPRecord.objects.create(employee=self.member, tl=self.tl, start_date=date(2026, 2, 2)).id
            for _ in range(3)
        ]
        ids = [r['id'] for r in self._get(self.hbpr, kind='pips', limit=100).data['results']]
        self.assertEqual([i for i in ids if i in same_day], sorted(same_day, reverse=True))

    def test_bad_paging_params_are_400(self):
        for params in (
            {'limit': 'x'}, {'offset': '-1'}, {'limit': '0'}, {'leader': 'abc'},
            {'offset': str(10 ** 30)},  # beyond the DB integer range: 400, never a 500
        ):
            with self.subTest(params=params):
                self.assertEqual(self._get(self.hbpr, kind='pips', **params).status_code, 400)

    def test_leader_filter_cannot_widen_scope(self):
        self.assertEqual(self._get(self.hbpr, kind='pips', leader=self.tl.id).data['count'], 1)
        # An out-of-scope leader is simply empty, never someone else's rows.
        self.assertEqual(self._get(self.hbpr, kind='pips', leader=self.other_tl.id).data['count'], 0)

    def test_status_and_period_filters(self):
        self.assertEqual(self._get(self.hbpr, kind='pips', status='draft').data['count'], 1)
        self.assertEqual(self._get(self.hbpr, kind='pips', status='cancelled').data['count'], 0)
        self.assertEqual(self._get(self.hbpr, kind='pips', period='2000-01').data['count'], 0)
        this_month = date.today().strftime('%Y-%m')
        self.assertEqual(self._get(self.hbpr, kind='pips', period=this_month).data['count'], 1)
        self.assertEqual(self._get(self.hbpr, kind='pips', period='2026-13').status_code, 400)

    def test_absence_status_filter(self):
        Absence.objects.filter(pk=self.absence_in.pk).update(addressed_on=date.today())
        self.assertEqual(self._get(self.hbpr, kind='absences', status='addressed').data['count'], 1)
        self.assertEqual(self._get(self.hbpr, kind='absences', status='open').data['count'], 0)
        self.assertEqual(self._get(self.hbpr, kind='absences', status='bogus').status_code, 400)

    def test_private_notes_stay_redacted(self):
        IdleFlag.objects.filter(pk=self.idle_in.pk).update(notes='private idle note')
        results = self._get(self.hbpr, kind='idle').data['results']
        self.assertEqual([r['notes'] for r in results], [''])

    def test_query_count_does_not_grow_with_rows(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        def count():
            with CaptureQueriesContext(connection) as ctx:
                self._get(self.hbpr, kind='pips', limit=100)
            return len(ctx)

        baseline = count()
        for i in range(5):
            PIPRecord.objects.create(
                employee=self.member, tl=self.tl, start_date=date(2026, 2, 1 + i))
        self.assertLessEqual(count(), baseline + 1)
