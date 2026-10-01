"""HBPR dashboard endpoints: scoped counts, people list with both TLs, no leaks."""
from datetime import date, timedelta

from rest_framework.test import APIRequestFactory, force_authenticate

from .models import Absence, IdleFlag, Meeting, PIPRecord, PromotionFlag
from .test_tl_scorecard_hbpr import HbprScorecardBase, _make_user
from .viewsets_hbpr import HbprViewSet


class HbprDashboardTests(HbprScorecardBase):
    def _get(self, action, user, **params):
        request = APIRequestFactory().get('/x/', params)
        force_authenticate(request, user=user)
        return HbprViewSet.as_view({'get': action})(request)

    def test_needs_attention_counts_only_in_scope_records(self):
        data = self._get('overview', self.hbpr).data
        attention = data['needs_attention']
        # The base fixture has one draft PIP / nomination / idle / absence in scope
        # and an identical set owned by the Albanian-only TL, which must not count.
        self.assertEqual(attention['pips_awaiting_approval'], 1)
        self.assertEqual(attention['promotions_to_decide'], 1)

    def test_tl_table_lists_italian_tls_only(self):
        rows = self._get('overview', self.hbpr).data['tls']
        self.assertEqual([r['id'] for r in rows], [self.it_tl.id])
        self.assertEqual(rows[0]['pending_pips'], 1)
        self.assertEqual(rows[0]['open_absences'], 1)
        self.assertEqual(rows[0]['open_idle_flags'], 1)
        self.assertEqual(rows[0]['team_size'], 1)

    def test_overdue_absence_uses_the_sla_window(self):
        Absence.objects.filter(pk=self.absence_in.pk).update(
            absence_date=date.today() - timedelta(days=9))
        self.assertEqual(self._get('overview', self.hbpr).data['needs_attention']['absences_overdue'], 1)

    def test_one_on_one_staleness(self):
        Meeting.objects.all().delete()
        rows = self._get('overview', self.hbpr).data['tls']
        self.assertEqual(rows[0]['people_without_recent_one_on_one'], 1)
        Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.it_tl, counterparty=self.it_member,
            occurred_on=date.today())
        data = self._get('overview', self.hbpr).data
        self.assertEqual(data['tls'][0]['people_without_recent_one_on_one'], 0)
        self.assertEqual(data['needs_attention']['tls_behind_on_one_on_ones'], 0)

    def test_people_show_both_tls_and_open_pip(self):
        results = self._get('people', self.hbpr).data['results']
        self.assertEqual([p['id'] for p in results], [self.it_member.id])
        person = results[0]
        self.assertEqual(person['italian_tl']['id'], self.it_tl.id)
        self.assertIsNone(person['albanian_tl'])
        self.assertEqual(person['open_pip'], 'draft')

    def test_people_never_include_out_of_scope_or_the_tls_themselves(self):
        ids = {p['id'] for p in self._get('people', self.hbpr).data['results']}
        self.assertNotIn(self.al_member.id, ids)
        self.assertNotIn(self.it_tl.id, ids)
        self.assertNotIn(self.hbpr.id, ids)

    def test_people_search_and_paging(self):
        other = _make_user('zz_second', first_name='Zed')
        other.profile.italian_tl = self.it_tl
        other.profile.save()
        data = self._get('people', self.hbpr, q='zed').data
        self.assertEqual(data['count'], 1)
        data = self._get('people', self.hbpr, limit=1, offset=1).data
        self.assertEqual((data['count'], len(data['results'])), (2, 1))

    def test_bad_paging_params_are_400(self):
        self.assertEqual(self._get('people', self.hbpr, limit='x').status_code, 400)
        self.assertEqual(self._get('people', self.hbpr, limit=0).status_code, 400)

    def test_only_hbpr_may_open_it(self):
        for user in (self.it_tl, self.it_member, self.staff, self.al_tl):
            self.assertEqual(self._get('overview', user).status_code, 403, user.username)
            self.assertEqual(self._get('people', user).status_code, 403, user.username)

    def _query_count(self):
        from django.contrib.auth.models import User
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        fresh = User.objects.get(pk=self.hbpr.pk)  # scope is memoised per user instance
        with CaptureQueriesContext(connection) as ctx:
            self._get('overview', fresh)
        return len(ctx)

    def test_query_count_does_not_grow_with_people(self):
        before = self._query_count()
        for i in range(5):
            u = _make_user(f'extra_{i}')
            u.profile.italian_tl = self.it_tl
            u.profile.save()
        self.assertEqual(self._query_count(), before)
