"""A Line Manager has no Line Manager above them (owner ruling 2026-11-10).

Promoting someone to Line Manager clears their own ``albanian_tl`` link. The Manager link
(``italian_tl``) and team membership stay. Giving a Line Manager an ``albanian_tl`` is refused.
"""
from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from apps.permissions.services.role_service import assign_role
from apps.users.models import Team


def _lm(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_albanian_tl_role = True
    user.profile.save()
    assign_role(user, 'albanian_tl')
    return user


def _manager(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_italian_tl_role = True
    user.profile.save()
    assign_role(user, 'italian_tl')
    return user


class LmPromotionLinkTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='pl_admin', password='x', email='a@a.a')
        self.old_lm = _lm('pl_old_lm')
        self.manager = _manager('pl_manager')
        self.emp = User.objects.create_user(username='pl_emp', password='x')
        self.emp.profile.albanian_tl = self.old_lm
        self.emp.profile.italian_tl = self.manager
        self.emp.profile.save()
        self.team = Team.objects.create(name='PL Team', code='PLT')
        self.emp.profile.teams.add(self.team)
        self.client.force_authenticate(self.admin)

    def _patch(self, user, payload):
        return self.client.patch(f'/api/users/users/{user.id}/update_user/', payload, format='json')

    def _links(self, user):
        user.profile.refresh_from_db()
        return user.profile.albanian_tl_id, user.profile.italian_tl_id

    def test_promotion_via_roles_clears_lm_link_and_keeps_manager_and_team(self):
        resp = self._patch(self.emp, {'roles': ['employee', 'albanian_tl']})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._links(self.emp), (None, self.manager.id))
        self.assertEqual(list(self.emp.profile.teams.values_list('id', flat=True)), [self.team.id])
        self.assertNotIn(self.emp.id, self.old_lm.profile.get_team_member_ids())

    def test_promotion_via_legacy_flag_clears_lm_link(self):
        resp = self._patch(self.emp, {'is_albanian_tl_role': True})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._links(self.emp), (None, self.manager.id))

    def test_bulk_promotion_clears_lm_link(self):
        other = User.objects.create_user(username='pl_emp2', password='x')
        other.profile.albanian_tl = self.old_lm
        other.profile.save()
        resp = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.emp.id, other.id], 'is_albanian_tl_role': True},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._links(self.emp), (None, self.manager.id))
        self.assertEqual(self._links(other), (None, None))

    def test_promotion_without_a_manager_returns_a_warning(self):
        self.emp.profile.italian_tl = None
        self.emp.profile.save()
        resp = self._patch(self.emp, {'roles': ['employee', 'albanian_tl']})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn('no_manager_after_promotion', [w['code'] for w in resp.data.get('warnings', [])])

    def test_promotion_with_a_manager_has_no_warning(self):
        resp = self._patch(self.emp, {'roles': ['employee', 'albanian_tl']})
        self.assertNotIn('no_manager_after_promotion', [w['code'] for w in resp.data.get('warnings', [])])

    def test_cannot_promote_and_assign_a_different_lm_in_one_request(self):
        other_lm = _lm('pl_other_lm0')
        resp = self._patch(self.emp, {'roles': ['employee', 'albanian_tl'], 'albanian_tl': other_lm.id})
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('albanian_tl', resp.data)
        self.assertEqual(self._links(self.emp)[0], self.old_lm.id)

    def test_promotion_echoing_the_current_link_is_cleared_not_refused(self):
        # The edit form re-sends the user's current link along with the new role.
        resp = self._patch(self.emp, {'roles': ['employee', 'albanian_tl'], 'albanian_tl': self.old_lm.id})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._links(self.emp)[0], None)

    def test_cannot_give_an_existing_lm_a_lm(self):
        other_lm = _lm('pl_other_lm')
        resp = self._patch(self.old_lm, {'albanian_tl': other_lm.id})
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_bulk_cannot_give_lms_a_lm(self):
        other_lm = _lm('pl_other_lm2')
        resp = self.client.post(
            '/api/users/users/bulk_update/',
            {'user_ids': [self.old_lm.id], 'albanian_tl': other_lm.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_create_user_as_lm_with_a_lm_is_refused(self):
        resp = self.client.post(
            '/api/users/users/create_user/',
            {
                'username': 'pl_new', 'email': 'newlm@example.com', 'password': 'Str0ng-Pass-2026!',
                'is_albanian_tl_role': True, 'albanian_tl': self.old_lm.id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('albanian_tl', resp.data)
        self.assertFalse(User.objects.filter(username='pl_new').exists())

    def test_set_team_leader_refuses_a_lm_under_a_lm(self):
        other_lm = _lm('pl_other_lm3')
        resp = self.client.post(
            f'/api/users/profiles/{self.old_lm.profile.id}/set_team_leader/',
            {'role': 'albanian_tl', 'team_leader_user_id': other_lm.id}, format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_importer_service_clears_and_refuses(self):
        from apps.users.services.user_creation import UserValidationError, update_user_profile

        update_user_profile(self.emp, is_albanian_tl_role=True)
        self.assertEqual(self._links(self.emp)[0], None)
        with self.assertRaises(UserValidationError):
            update_user_profile(self.old_lm, albanian_tl_id=self.manager.id, is_albanian_tl_role=True)

    def test_assigning_an_employee_to_a_lm_still_works(self):
        loose = User.objects.create_user(username='pl_loose', password='x')
        resp = self._patch(loose, {'albanian_tl': self.old_lm.id})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._links(loose)[0], self.old_lm.id)

    def test_resaving_an_existing_lm_with_no_link_changes_nothing(self):
        before = self._links(self.old_lm)
        resp = self._patch(self.old_lm, {'roles': ['employee', 'albanian_tl']})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self._links(self.old_lm), before)

    def test_revoking_the_role_does_not_restore_the_link(self):
        self._patch(self.emp, {'roles': ['employee', 'albanian_tl']})
        self._patch(self.emp, {'roles': ['employee']})
        self.assertEqual(self._links(self.emp)[0], None)
