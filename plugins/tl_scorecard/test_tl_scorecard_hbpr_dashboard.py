"""HBPR workspace endpoints: assignment-backed cadence/EPR overview and the
in-scope people list.

The overview is the HBPR's attention surface. It carries cadence and EPR
governance evidence only — never employee one-on-one data, and never
approval/decision counts (the HBPR does not approve a PIP or decide a
promotion, so an attention card about them would imply an action they cannot
take).
"""
from datetime import date, timedelta

from rest_framework.test import APIRequestFactory, force_authenticate

from .models import HbprGovernanceEvidence
from .test_tl_scorecard_hbpr import HbprScorecardBase, _make_user
from .viewsets_hbpr import HbprViewSet


class HbprWorkspaceOverviewTests(HbprScorecardBase):
    def _get(self, action, user, **params):
        request = APIRequestFactory().get('/x/', params)
        force_authenticate(request, user=user)
        return HbprViewSet.as_view({'get': action})(request)

    def _leader(self, data=None, **params):
        data = data if data is not None else self._get('overview', self.hbpr, **params).data
        return next(r for r in data['leaders'] if r['id'] == self.tl.id)

    def _evidence(self, kind, *, occurred_on=None, year=None, assignment=None):
        return HbprGovernanceEvidence.objects.create(
            assignment=assignment or self.assignment,
            kind=kind,
            occurred_on=occurred_on or date.today(),
            reporting_year=year,
            shared_summary='Agreed the Q priorities.',
            recorded_by=self.tl,
        )

    def test_overview_lists_assigned_leaders_with_cadence_and_epr_state(self):
        data = self._get('overview', self.hbpr).data
        self.assertEqual([r['id'] for r in data['leaders']], [self.tl.id])
        row = data['leaders'][0]
        self.assertEqual(row['cadence'], 'weekly')
        self.assertEqual(row['team_size'], 1)
        self.assertIsNone(row['last_meeting_on'])
        # No cadence meeting recorded yet: the cadence has not started.
        self.assertEqual(row['cadence_status'], 'not_started')
        self.assertFalse(row['epr_mid_year'])
        self.assertFalse(row['epr_year_end'])
        self.assertEqual(row['evidence_count'], 0)

    def test_team_size_counts_shared_team_members_like_the_scope(self):
        # `get_team_member_ids()` also returns members of a team the AL TL
        # belongs to; such a member is in the read scope, so the count must
        # include them (counting only the direct FK would understate the team).
        from apps.users.models.core import Team

        team = Team.objects.create(name='Shared team', code='SHARED')
        self.tl.profile.teams.add(team)
        shared = _make_user('shared_team_member')
        shared.profile.teams.add(team)
        self.assertEqual(self._leader()['team_size'], 2)

    def test_unassigned_tl_never_appears(self):
        ids = {r['id'] for r in self._get('overview', self.hbpr).data['leaders']}
        self.assertNotIn(self.other_tl.id, ids)
        self.assertNotIn(self.hbpr.id, ids)

    def test_cadence_status_tracks_the_latest_cadence_meeting(self):
        today = date.today()
        self._evidence('cadence_meeting', occurred_on=today)
        row = self._leader()
        self.assertEqual(row['last_meeting_on'], today)
        self.assertEqual(row['cadence_status'], 'on_track')
        self.assertEqual(row['next_due_on'], today + timedelta(days=7))

    def test_overdue_cadence_is_counted_in_needs_attention(self):
        self._evidence('cadence_meeting', occurred_on=date.today() - timedelta(days=30))
        data = self._get('overview', self.hbpr).data
        self.assertEqual(self._leader(data)['cadence_status'], 'overdue')
        self.assertEqual(data['needs_attention']['cadence_overdue'], 1)
        self.assertEqual(data['needs_attention']['cadence_due'], 0)

    def test_missing_epr_evidence_counts_by_year(self):
        data = self._get('overview', self.hbpr).data
        self.assertEqual(data['needs_attention']['missing_mid_year_evidence'], 1)
        self.assertEqual(data['needs_attention']['missing_year_end_evidence'], 1)

        year = date.today().year
        self._evidence('epr_mid_year', year=year)
        data = self._get('overview', self.hbpr).data
        self.assertTrue(self._leader(data)['epr_mid_year'])
        self.assertEqual(data['needs_attention']['missing_mid_year_evidence'], 0)
        self.assertEqual(data['needs_attention']['missing_year_end_evidence'], 1)

    def test_epr_evidence_for_another_year_does_not_satisfy_this_year(self):
        self._evidence('epr_mid_year', year=date.today().year - 1)
        data = self._get('overview', self.hbpr).data
        self.assertFalse(self._leader(data)['epr_mid_year'])
        self.assertEqual(data['needs_attention']['missing_mid_year_evidence'], 1)

    def test_reporting_year_param_scopes_epr_status(self):
        last_year = date.today().year - 1
        self._evidence('epr_mid_year', year=last_year)
        data = self._get('overview', self.hbpr, year=last_year).data
        self.assertEqual(data['reporting_year'], last_year)
        self.assertTrue(self._leader(data)['epr_mid_year'])

    def test_recent_evidence_counts_new_governance_updates(self):
        self._evidence('cadence_meeting', occurred_on=date.today())
        self.assertEqual(
            self._get('overview', self.hbpr).data['needs_attention']['recent_evidence'], 1
        )
        self._evidence('cadence_meeting', occurred_on=date.today() - timedelta(days=30))
        self.assertEqual(
            self._get('overview', self.hbpr).data['needs_attention']['recent_evidence'], 1
        )

    def test_evidence_count_and_last_evidence_on_roll_up_across_kinds(self):
        older = date.today() - timedelta(days=20)
        self._evidence('cadence_meeting', occurred_on=older)
        self._evidence('epr_year_end', occurred_on=date.today(), year=date.today().year)
        row = self._leader()
        self.assertEqual(row['evidence_count'], 2)
        self.assertEqual(row['last_evidence_on'], date.today())

    def test_overview_never_exposes_one_on_one_or_decision_data(self):
        data = self._get('overview', self.hbpr).data
        for forbidden in ('one_on_one_stale_days', 'tls_behind_on_one_on_ones'):
            self.assertNotIn(forbidden, data)
        attention = data['needs_attention']
        for forbidden in ('pips_awaiting_approval', 'promotions_to_decide', 'absences_overdue'):
            self.assertNotIn(forbidden, attention)
        for row in data['leaders']:
            for forbidden in ('people_without_recent_one_on_one', 'pending_pips', 'active_pips'):
                self.assertNotIn(forbidden, row)

    def test_bad_year_is_400(self):
        self.assertEqual(self._get('overview', self.hbpr, year='x').status_code, 400)
        self.assertEqual(self._get('overview', self.hbpr, year=1999).status_code, 400)

    def test_only_hbpr_may_open_it(self):
        for user in (self.tl, self.member, self.staff, self.other_tl):
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
            u.profile.albanian_tl = self.tl
            u.profile.save()
        self.assertEqual(self._query_count(), before)


class HbprWorkspacePeopleTests(HbprScorecardBase):
    def _get(self, action, user, **params):
        request = APIRequestFactory().get('/x/', params)
        force_authenticate(request, user=user)
        return HbprViewSet.as_view({'get': action})(request)

    def test_people_show_both_tls_and_open_pip(self):
        results = self._get('people', self.hbpr).data['results']
        self.assertEqual([p['id'] for p in results], [self.member.id])
        person = results[0]
        self.assertEqual(person['albanian_tl']['id'], self.tl.id)
        self.assertIsNone(person['italian_tl'])
        self.assertEqual(person['open_pip'], 'draft')
        self.assertNotIn('last_one_on_one', person)

    def test_people_never_include_out_of_scope_or_the_tls_themselves(self):
        ids = {p['id'] for p in self._get('people', self.hbpr).data['results']}
        self.assertNotIn(self.other_member.id, ids)
        self.assertNotIn(self.tl.id, ids)
        self.assertNotIn(self.hbpr.id, ids)

    def test_people_search_and_paging(self):
        other = _make_user('zz_second', first_name='Zed')
        other.profile.albanian_tl = self.tl
        other.profile.save()
        data = self._get('people', self.hbpr, q='zed').data
        self.assertEqual(data['count'], 1)
        data = self._get('people', self.hbpr, limit=1, offset=1).data
        self.assertEqual((data['count'], len(data['results'])), (2, 1))

    def test_bad_paging_params_are_400(self):
        self.assertEqual(self._get('people', self.hbpr, limit='x').status_code, 400)
        self.assertEqual(self._get('people', self.hbpr, limit=0).status_code, 400)
