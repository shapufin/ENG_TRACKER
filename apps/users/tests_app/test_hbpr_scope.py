"""Tests for the HBPR role helpers and assignment-backed scope.

Scope is explicit: an HBPR sees exactly the Albanian TLs they have an open
``HbprAlbanianTlAssignment`` for, plus those TLs' team members. There is no
global Italian-TL population any more.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import (
    assign_role,
    find_blocked_hbpr_revocations,
    revoke_role,
)
from apps.users.models import Team, TeamMembership
from apps.users.services.hbpr_assignments import (
    create_assignment,
    end_assignment,
    reassign_assignment,
    today,
)
from apps.users.services.hbpr_scope import (
    get_hbpr_scope,
    hbpr_user_ids_for,
    is_hbpr,
)

User = get_user_model()


def _user(name, **kwargs):
    return User.objects.create_user(username=name, password='testpass', **kwargs)


class HbprScopeTestBase(TestCase):
    def setUp(self):
        for code in ('hbpr', 'italian_tl', 'albanian_tl', 'hr'):
            Role.objects.get_or_create(code=code, defaults={'name': code})

        self.hbpr = _user('hbpr')
        assign_role(self.hbpr, 'hbpr')

        # The assigned Albanian TL, with an FK report and a shared-team member.
        self.al_tl = _user('al-tl')
        assign_role(self.al_tl, 'albanian_tl')
        self.fk_report = _user('al-report')
        self.fk_report.profile.albanian_tl = self.al_tl
        self.fk_report.profile.save()

        self.team = Team.objects.create(name='AL Team', code='ALT', team_leader=self.al_tl)
        self.team_member = _user('team-member')
        TeamMembership.objects.create(
            user_profile=self.team_member.profile, team=self.team, is_primary_team=True,
        )

        # An unrelated Albanian TL (no assignment) and an outsider.
        self.other_al_tl = _user('other-al-tl')
        assign_role(self.other_al_tl, 'albanian_tl')
        self.other_report = _user('other-report')
        self.other_report.profile.albanian_tl = self.other_al_tl
        self.other_report.profile.save()
        self.outsider = _user('outsider')

        self.assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence='weekly', effective_from=date(2026, 10, 1),
        )


class HbprRoleSyncTests(HbprScopeTestBase):
    def test_sync_roles_grants_and_revokes_hbpr(self):
        from apps.users.services.user_creation import _sync_roles

        _sync_roles(self.outsider, ['employee', 'hbpr'])
        self.outsider.profile.refresh_from_db()
        self.assertIn('hbpr', self.outsider.profile.role_codes)
        self.assertTrue(self.outsider.profile.is_hbpr)

    def test_profile_is_hbpr_false_for_plain_user(self):
        self.assertFalse(self.outsider.profile.is_hbpr)

    def test_hbpr_code_is_not_matched_by_hr_icontains_filters(self):
        self.assertNotIn('hr', 'hbpr')


class IsHbprTests(HbprScopeTestBase):
    def test_true_for_active_role(self):
        self.assertTrue(is_hbpr(self.hbpr))

    def test_false_for_plain_user(self):
        self.assertFalse(is_hbpr(self.outsider))

    def test_false_for_staff_without_role(self):
        staff = _user('staff', is_staff=True)
        self.assertFalse(is_hbpr(staff))

    def test_false_after_revoke(self):
        end_assignment(
            assignment=self.assignment, effective_to=date(2026, 10, 2),
        )
        revoke_role(self.hbpr, 'hbpr')
        self.hbpr.profile.refresh_from_db()
        self.assertFalse(is_hbpr(self.hbpr))

    def test_does_not_match_hr_role(self):
        hr = _user('hr-user')
        assign_role(hr, 'hr')
        self.assertFalse(is_hbpr(hr))


class GetHbprScopeTests(HbprScopeTestBase):
    def test_none_for_non_hbpr(self):
        self.assertIsNone(get_hbpr_scope(self.outsider))

    def test_includes_assigned_tl(self):
        scope = get_hbpr_scope(self.hbpr)
        self.assertIn(self.al_tl.id, scope.tl_ids)
        self.assertTrue(scope.has_tl(self.al_tl.id))

    def test_includes_fk_reports_and_team_members(self):
        scope = get_hbpr_scope(self.hbpr)
        self.assertIn(self.fk_report.id, scope.member_ids)
        self.assertIn(self.team_member.id, scope.member_ids)
        self.assertTrue(scope.has_user(self.fk_report.id))

    def test_excludes_unassigned_tl_and_their_reports(self):
        scope = get_hbpr_scope(self.hbpr)
        for uid in (self.other_al_tl.id, self.other_report.id, self.outsider.id):
            self.assertFalse(scope.has_user(uid))

    def test_user_ids_is_union_of_tls_and_members(self):
        scope = get_hbpr_scope(self.hbpr)
        self.assertEqual(scope.user_ids, scope.tl_ids | scope.member_ids)

    def test_empty_scope_for_hbpr_without_assignments(self):
        lonely = _user('lonely-hbpr')
        assign_role(lonely, 'hbpr')
        scope = get_hbpr_scope(lonely)
        self.assertIsNotNone(scope)
        self.assertEqual(scope.tl_ids, frozenset())
        self.assertEqual(scope.member_ids, frozenset())

    def test_ended_assignment_drops_out_of_scope(self):
        end_assignment(
            assignment=self.assignment, effective_to=date(2026, 10, 2),
        )
        scope = get_hbpr_scope(self.hbpr)
        self.assertFalse(scope.has_tl(self.al_tl.id))
        self.assertFalse(scope.has_user(self.fk_report.id))

    def test_second_assignment_broadens_scope(self):
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.other_al_tl,
            cadence='monthly', effective_from=date(2026, 10, 1),
        )
        scope = get_hbpr_scope(self.hbpr)
        self.assertIn(self.al_tl.id, scope.tl_ids)
        self.assertIn(self.other_al_tl.id, scope.tl_ids)
        self.assertIn(self.other_report.id, scope.member_ids)

    def test_scope_is_per_hbpr(self):
        other = _user('hbpr-2')
        assign_role(other, 'hbpr')
        scope = get_hbpr_scope(other)
        self.assertEqual(scope.tl_ids, frozenset())

    def test_inactive_member_is_out_of_scope(self):
        self.fk_report.is_active = False
        self.fk_report.save()
        scope = get_hbpr_scope(self.hbpr)
        self.assertFalse(scope.has_user(self.fk_report.id))

    def test_inactive_assigned_tl_is_out_of_scope(self):
        self.al_tl.is_active = False
        self.al_tl.save()
        scope = get_hbpr_scope(self.hbpr)
        self.assertFalse(scope.has_tl(self.al_tl.id))
        self.assertFalse(scope.has_user(self.fk_report.id))

    def test_future_dated_assignment_grants_no_scope_yet(self):
        from datetime import timedelta

        end_assignment(
            assignment=self.assignment, effective_to=date(2026, 10, 2),
        )
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence='weekly',
            effective_from=date.today() + timedelta(days=30),
        )
        scope = get_hbpr_scope(self.hbpr)
        self.assertFalse(scope.has_tl(self.al_tl.id))
        self.assertFalse(scope.has_user(self.fk_report.id))

    def test_viewer_is_never_in_their_own_scope(self):
        # An HBPR who is also a report of the assigned AL TL must not see self.
        self.hbpr.profile.albanian_tl = self.al_tl
        self.hbpr.profile.save()
        scope = get_hbpr_scope(self.hbpr)
        self.assertFalse(scope.has_user(self.hbpr.id))
        self.assertNotIn(self.hbpr.id, scope.tl_ids)

    def test_assignment_ids_exposed(self):
        scope = get_hbpr_scope(self.hbpr)
        self.assertEqual(scope.assignment_ids, frozenset({self.assignment.id}))

    def test_memoised_on_the_user_instance(self):
        first = get_hbpr_scope(self.hbpr)
        with self.assertNumQueries(0):
            second = get_hbpr_scope(self.hbpr)
        self.assertIs(first, second)

    def test_staff_without_role_has_no_scope(self):
        staff = _user('staff-nobpr', is_staff=True)
        self.assertIsNone(get_hbpr_scope(staff))


class HbprUserIdsForTests(HbprScopeTestBase):
    def test_assigned_hbpr_is_notified_for_a_team_member(self):
        self.assertEqual(
            hbpr_user_ids_for(self.fk_report, owner_id=self.al_tl.id),
            [self.hbpr.id],
        )

    def test_no_owner_means_no_recipients(self):
        self.assertEqual(hbpr_user_ids_for(self.fk_report), [])

    def test_unassigned_owner_notifies_nobody(self):
        self.assertEqual(
            hbpr_user_ids_for(self.other_report, owner_id=self.other_al_tl.id),
            [],
        )

    def test_subject_outside_the_owners_team_notifies_nobody(self):
        self.assertEqual(
            hbpr_user_ids_for(self.outsider, owner_id=self.al_tl.id),
            [],
        )

    def test_hbpr_is_never_their_own_recipient(self):
        self.assertEqual(
            hbpr_user_ids_for(self.hbpr, owner_id=self.al_tl.id),
            [],
        )

    def test_inactive_hbpr_is_not_notified(self):
        self.hbpr.is_active = False
        self.hbpr.save()
        self.assertEqual(
            hbpr_user_ids_for(self.fk_report, owner_id=self.al_tl.id),
            [],
        )

    def test_ended_assignment_notifies_nobody(self):
        end_assignment(
            assignment=self.assignment, effective_to=date(2026, 10, 2),
        )
        self.assertEqual(
            hbpr_user_ids_for(self.fk_report, owner_id=self.al_tl.id),
            [],
        )

    def test_owner_themselves_notifies_their_hbpr(self):
        self.assertEqual(
            hbpr_user_ids_for(self.al_tl, owner_id=self.al_tl.id),
            [self.hbpr.id],
        )


class HbprUserListScopeTests(HbprScopeTestBase):
    """HBPR sees only their assigned population (plus themselves) on the users
    and profiles endpoints the admin Users page uses."""

    def setUp(self):
        super().setUp()
        from rest_framework.test import APIClient

        self.api = APIClient()
        self.api.force_authenticate(self.hbpr)

    @staticmethod
    def _rows(response):
        data = response.data
        if isinstance(data, dict):
            lists = [v for v in data.values() if isinstance(v, list)]
            if not lists:
                raise AssertionError(f'No list in response: {str(data)[:300]}')
            data = lists[0]
        return data

    def _ids(self, path, key):
        response = self.api.get(path, {'page_size': 200})
        self.assertEqual(response.status_code, 200)
        return {row[key] for row in self._rows(response)}

    def test_users_endpoint_scoped_to_assignment_and_self(self):
        ids = self._ids('/api/users/users/', 'id')
        self.assertIn(self.hbpr.id, ids)
        self.assertIn(self.al_tl.id, ids)
        self.assertIn(self.fk_report.id, ids)
        self.assertIn(self.team_member.id, ids)
        for uid in (self.other_al_tl.id, self.other_report.id, self.outsider.id):
            self.assertNotIn(uid, ids)

    def test_profiles_endpoint_scoped_to_assignment_and_self(self):
        response = self.api.get('/api/users/profiles/', {'page_size': 200})
        self.assertEqual(response.status_code, 200)
        rows = self._rows(response)
        user_ids = {
            row['user']['id'] if isinstance(row['user'], dict) else row['user']
            for row in rows
        }
        self.assertIn(self.al_tl.id, user_ids)
        self.assertIn(self.fk_report.id, user_ids)
        for uid in (self.other_al_tl.id, self.other_report.id, self.outsider.id):
            self.assertNotIn(uid, user_ids)

    def test_plain_employee_still_sees_only_self(self):
        self.api.force_authenticate(self.outsider)
        ids = self._ids('/api/users/users/', 'id')
        self.assertEqual(ids, {self.outsider.id})


class SyncRolesUnseededTests(HbprScopeTestBase):
    def test_granting_hbpr_when_the_role_is_missing_fails_loudly(self):
        from apps.users.services.user_creation import _sync_roles

        Role.objects.filter(code='hbpr').delete()
        with self.assertRaises(ValueError):
            _sync_roles(self.outsider, ['employee', 'hbpr'])


class HbprAssignmentDatesTests(HbprScopeTestBase):
    """An end date is the last day in effect; it must not cut scope short."""

    def setUp(self):
        super().setUp()
        self.today = today()
        self.assignment.effective_from = self.today - timedelta(days=30)
        self.assignment.save(update_fields=['effective_from'])

    def _end(self, days_from_today):
        end_assignment(
            assignment=self.assignment,
            effective_to=self.today + timedelta(days=days_from_today),
        )

    def test_future_end_date_keeps_scope_until_that_day(self):
        self._end(10)
        scope = get_hbpr_scope(self.hbpr)
        self.assertTrue(scope.has_tl(self.al_tl.id))
        self.assertTrue(scope.has_user(self.fk_report.id))
        self.assertEqual(
            hbpr_user_ids_for(self.fk_report, owner_id=self.al_tl.id), [self.hbpr.id],
        )

    def test_end_date_today_is_still_in_effect_today(self):
        self._end(0)
        self.assertTrue(get_hbpr_scope(self.hbpr).has_tl(self.al_tl.id))

    def test_past_end_date_removes_scope(self):
        self._end(-1)
        self.assertFalse(get_hbpr_scope(self.hbpr).has_tl(self.al_tl.id))

    def test_is_current_follows_the_end_date(self):
        self._end(10)
        self.assertTrue(self.assignment.is_current)
        self.assignment.effective_to = self.today - timedelta(days=1)
        self.assertFalse(self.assignment.is_current)

    def test_planned_handover_has_no_coverage_gap(self):
        new_hbpr = _user('hbpr-next')
        assign_role(new_hbpr, 'hbpr')
        start = self.today + timedelta(days=5)
        reassign_assignment(
            albanian_tl=self.al_tl, new_hbpr=new_hbpr, cadence='weekly',
            effective_from=start,
        )
        # Until the handover day the outgoing HBPR still covers the leader...
        self.assertTrue(get_hbpr_scope(self.hbpr).has_tl(self.al_tl.id))
        self.assertFalse(get_hbpr_scope(new_hbpr).has_tl(self.al_tl.id))
        self.assertEqual(
            hbpr_user_ids_for(self.al_tl, owner_id=self.al_tl.id), [self.hbpr.id],
        )

    def test_role_revocation_stays_blocked_until_the_end_date_passes(self):
        self._end(10)
        self.assertEqual(
            find_blocked_hbpr_revocations(self.hbpr, {'hbpr': False})[0]['role'], 'hbpr',
        )
        self._end_in_past()
        self.assertEqual(find_blocked_hbpr_revocations(self.hbpr, {'hbpr': False}), [])

    def _end_in_past(self):
        self.assignment.refresh_from_db()
        self.assignment.effective_to = self.today - timedelta(days=1)
        self.assignment.save(update_fields=['effective_to'])
