from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role, revoke_role
from apps.users.models import Team, TeamMembership
from apps.users.models.core import UserProfile
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
        Role.objects.get_or_create(code='hbpr', defaults={'name': 'HBPR'})
        Role.objects.get_or_create(code='italian_tl', defaults={'name': 'Italian TL'})
        Role.objects.get_or_create(code='albanian_tl', defaults={'name': 'Albanian TL'})

        self.hbpr = _user('hbpr')
        assign_role(self.hbpr, 'hbpr')

        # Italian TL with an FK report and a shared-team member.
        self.it_tl = _user('it-tl')
        assign_role(self.it_tl, 'italian_tl')
        self.fk_report = _user('fk-report')
        self.fk_report.profile.italian_tl = self.it_tl
        self.fk_report.profile.save()

        self.team = Team.objects.create(name='IT Team', code='ITT', team_leader=self.it_tl)
        self.team_member = _user('team-member')
        TeamMembership.objects.create(
            user_profile=self.team_member.profile, team=self.team, is_primary_team=True,
        )

        # Canary: Albanian TL and an unrelated employee must never be in scope.
        self.al_tl = _user('al-tl')
        assign_role(self.al_tl, 'albanian_tl')
        self.al_report = _user('al-report')
        self.al_report.profile.albanian_tl = self.al_tl
        self.al_report.profile.save()
        self.outsider = _user('outsider')


class HbprRoleSyncTests(HbprScopeTestBase):
    def test_sync_roles_grants_and_revokes_hbpr(self):
        from apps.users.services.user_creation import _sync_roles

        _sync_roles(self.outsider, ['employee', 'hbpr'])
        self.outsider.profile.refresh_from_db()
        self.assertIn('hbpr', self.outsider.profile.role_codes)
        self.assertTrue(self.outsider.profile.is_hbpr)

        _sync_roles(self.outsider, ['employee'])
        self.outsider.profile.refresh_from_db()
        self.assertNotIn('hbpr', self.outsider.profile.role_codes)
        self.assertFalse(self.outsider.profile.is_hbpr)

    def test_legacy_flag_path_leaves_hbpr_untouched(self):
        from apps.users.services.user_creation import _sync_legacy_roles

        _sync_legacy_roles(
            self.hbpr, is_hr=True, is_italian_tl_role=None, is_albanian_tl_role=None,
        )
        self.hbpr.profile.refresh_from_db()
        self.assertTrue(self.hbpr.profile.is_hbpr)

    def test_profile_is_hbpr_false_for_plain_user(self):
        self.assertFalse(self.outsider.profile.is_hbpr)

    def test_hbpr_code_is_not_matched_by_hr_icontains_filters(self):
        from apps.users.models import UserProfile

        self.assertFalse(
            UserProfile.objects.filter(
                user=self.hbpr, role_codes__icontains='hr',
            ).exists()
        )
        for code in ('italian_tl', 'albanian_tl'):
            self.assertFalse(
                UserProfile.objects.filter(
                    user=self.hbpr, role_codes__icontains=code,
                ).exists()
            )


class HbprUserListScopeTests(HbprScopeTestBase):
    """HBPR sees only the Italian population (plus themselves) on both the
    users endpoint and the profiles endpoint the admin Users page uses."""

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

    def test_users_endpoint_scoped_to_italian_population_and_self(self):
        ids = self._ids('/api/users/users/', 'id')
        self.assertIn(self.hbpr.id, ids)
        self.assertIn(self.it_tl.id, ids)
        self.assertIn(self.fk_report.id, ids)
        self.assertIn(self.team_member.id, ids)
        for uid in (self.al_tl.id, self.al_report.id, self.outsider.id):
            self.assertNotIn(uid, ids)

    def test_profiles_endpoint_scoped_to_italian_population_and_self(self):
        response = self.api.get('/api/users/profiles/', {'page_size': 200})
        self.assertEqual(response.status_code, 200)
        rows = self._rows(response)
        user_ids = {row['user']['id'] if isinstance(row['user'], dict) else row['user'] for row in rows}
        self.assertIn(self.it_tl.id, user_ids)
        self.assertIn(self.fk_report.id, user_ids)
        for uid in (self.al_tl.id, self.al_report.id, self.outsider.id):
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


class IsHbprTests(HbprScopeTestBase):
    def test_true_for_active_role(self):
        self.assertTrue(is_hbpr(self.hbpr))

    def test_false_for_plain_user(self):
        self.assertFalse(is_hbpr(self.outsider))

    def test_false_for_staff_without_role(self):
        staff = _user('staff', is_staff=True)
        self.assertFalse(is_hbpr(staff))

    def test_false_after_revoke(self):
        revoke_role(self.hbpr, 'hbpr')
        self.hbpr.profile.refresh_from_db()
        self.assertFalse(is_hbpr(self.hbpr))

    def test_does_not_match_hr_role(self):
        Role.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        hr = _user('hr-user')
        assign_role(hr, 'hr')
        self.assertFalse(is_hbpr(hr))


class GetHbprScopeTests(HbprScopeTestBase):
    def test_none_for_non_hbpr(self):
        self.assertIsNone(get_hbpr_scope(self.outsider))

    def test_includes_italian_tl(self):
        scope = get_hbpr_scope(self.hbpr)
        self.assertIn(self.it_tl.id, scope.tl_ids)
        self.assertTrue(scope.has_tl(self.it_tl.id))

    def test_includes_fk_reports_and_shared_team_members(self):
        scope = get_hbpr_scope(self.hbpr)
        self.assertIn(self.fk_report.id, scope.member_ids)
        self.assertIn(self.team_member.id, scope.member_ids)
        self.assertTrue(scope.has_user(self.fk_report.id))

    def test_excludes_albanian_tl_unrelated_and_their_reports(self):
        scope = get_hbpr_scope(self.hbpr)
        for uid in (self.al_tl.id, self.al_report.id, self.outsider.id):
            self.assertFalse(scope.has_user(uid))

    def test_user_ids_is_union_of_tls_and_members(self):
        scope = get_hbpr_scope(self.hbpr)
        self.assertEqual(scope.user_ids, scope.tl_ids | scope.member_ids)

    def test_excludes_stale_fk_to_user_who_lost_the_tl_role(self):
        revoke_role(self.it_tl, 'italian_tl')
        stale = _user('stale-report')
        stale.profile.italian_tl = self.it_tl
        stale.profile.save()
        scope = get_hbpr_scope(self.hbpr)
        self.assertNotIn(self.it_tl.id, scope.tl_ids)
        self.assertFalse(scope.has_user(stale.id))

    def test_inactive_tl_and_inactive_members_are_out_of_scope(self):
        self.it_tl.is_active = False
        self.it_tl.save()
        scope = get_hbpr_scope(self.hbpr)
        self.assertNotIn(self.it_tl.id, scope.tl_ids)
        self.assertFalse(scope.has_user(self.fk_report.id))

        self.it_tl.is_active = True
        self.it_tl.save()
        self.fk_report.is_active = False
        self.fk_report.save()
        fresh = _user('fresh-hbpr')
        assign_role(fresh, 'hbpr')
        self.assertFalse(get_hbpr_scope(fresh).has_user(self.fk_report.id))
        self.assertTrue(get_hbpr_scope(fresh).has_user(self.team_member.id))

    def test_legacy_flag_italian_tl_counts(self):
        legacy = _user('legacy-tl')
        legacy.profile.is_italian_tl_role = True
        legacy.profile.save()
        scope = get_hbpr_scope(self.hbpr)
        self.assertIn(legacy.id, scope.tl_ids)

    def test_empty_when_no_italian_tls(self):
        revoke_role(self.it_tl, 'italian_tl')
        scope = get_hbpr_scope(self.hbpr)
        self.assertEqual(scope.tl_ids, frozenset())
        self.assertEqual(scope.member_ids, frozenset())

    def test_viewer_is_never_in_their_own_scope(self):
        # An HBPR who is also an Italian TL's report must not see themselves.
        self.hbpr.profile.italian_tl = self.it_tl
        self.hbpr.profile.save()
        assign_role(self.hbpr, 'italian_tl')
        scope = get_hbpr_scope(self.hbpr)
        self.assertFalse(scope.has_user(self.hbpr.id))
        self.assertNotIn(self.hbpr.id, scope.tl_ids)

    def test_memoised_on_the_user_instance(self):
        first = get_hbpr_scope(self.hbpr)
        with self.assertNumQueries(0):
            second = get_hbpr_scope(self.hbpr)
        self.assertIs(first, second)

    def test_staff_without_role_has_no_scope(self):
        staff = _user('staff-nobpr', is_staff=True)
        self.assertIsNone(get_hbpr_scope(staff))


class HbprUserIdsForTests(HbprScopeTestBase):
    def test_in_scope_subject_notifies_all_hbprs(self):
        other = _user('hbpr-2')
        assign_role(other, 'hbpr')
        ids = set(hbpr_user_ids_for(self.fk_report))
        self.assertEqual(ids, {self.hbpr.id, other.id})

    def test_tl_subject_is_in_scope(self):
        self.assertEqual(set(hbpr_user_ids_for(self.it_tl)), {self.hbpr.id})

    def test_out_of_scope_subject_notifies_nobody(self):
        self.assertEqual(set(hbpr_user_ids_for(self.al_report)), set())

    def test_subject_is_never_their_own_recipient(self):
        assign_role(self.team_member, 'hbpr')
        ids = set(hbpr_user_ids_for(self.team_member))
        self.assertNotIn(self.team_member.id, ids)
        self.assertIn(self.hbpr.id, ids)

    def test_inactive_hbpr_user_is_excluded(self):
        self.hbpr.is_active = False
        self.hbpr.save()
        self.assertEqual(set(hbpr_user_ids_for(self.fk_report)), set())


class HbprSurvivesRoleEditsTests(TestCase):
    """Editing other roles through admin endpoints must not silently drop hbpr."""

    def setUp(self):
        from rest_framework.test import APIClient
        self.admin = User.objects.create_user('adm_hbpr_edit', password='x', is_staff=True)
        UserProfile.objects.get_or_create(user=self.admin)
        Role.objects.get_or_create(code='hbpr', defaults={'name': 'HBPR'})
        self.target = User.objects.create_user('tgt_hbpr_edit', password='x')
        UserProfile.objects.get_or_create(user=self.target)
        assign_role(self.target, 'hbpr')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_bulk_update_of_other_roles_keeps_hbpr(self):
        resp = self.client.post('/api/users/users/bulk_update/', {
            'user_ids': [self.target.id], 'is_hr': True,
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.target.profile.refresh_from_db()
        self.assertTrue(self.target.profile.is_hbpr)

    def test_update_user_without_hbpr_in_roles_revokes_it_so_clients_must_send_it(self):
        resp = self.client.put(f'/api/users/users/{self.target.id}/update_user/', {
            'roles': ['hr'],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.target.profile.refresh_from_db()
        self.assertFalse(self.target.profile.is_hbpr)
        resp = self.client.put(f'/api/users/users/{self.target.id}/update_user/', {
            'roles': ['hr', 'hbpr'],
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.target.profile.refresh_from_db()
        self.assertTrue(self.target.profile.is_hbpr)
