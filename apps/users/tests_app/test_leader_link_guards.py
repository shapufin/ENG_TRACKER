"""Every way to write a leader link goes through the same guards (audit 2026-11-13).

A leader link grants approval rights, payroll scope and queue access, so a write path that
skips the checks (own-leader, circular, inactive or non-leader target, Line Manager above a
Line Manager) is a privilege hole. Each change is also audited.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.reports.models import AuditLog
from apps.users.services.user_creation import UserValidationError, update_user_profile


def _lm(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_albanian_tl_role = True
    user.profile.save()
    return user


def _manager(username):
    user = User.objects.create_user(username=username, password='x')
    user.profile.is_italian_tl_role = True
    user.profile.save()
    return user


class LeaderLinkGuardTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='llg_admin', password='x', is_staff=True)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.lm = _lm('llg_lm')
        self.manager = _manager('llg_mgr')
        self.emp = User.objects.create_user(username='llg_emp', password='x')
        self.plain = User.objects.create_user(username='llg_plain', password='x')

    def _set_leader(self, target, role, leader_id):
        return self.api.post(
            f'/api/users/profiles/{target.profile.id}/set_team_leader/',
            {'role': role, 'team_leader_user_id': leader_id}, format='json',
        )

    # -- profile PATCH can no longer write links, roles or teams -------------
    def test_profile_patch_cannot_write_leader_links_or_role_flags(self):
        response = self.api.patch(
            f'/api/users/profiles/{self.lm.profile.id}/',
            {'is_albanian_tl_role': False, 'albanian_tl': self.lm.id, 'italian_tl': self.manager.id},
            format='json',
        )
        self.assertIn(response.status_code, (200, 400))
        self.lm.profile.refresh_from_db()
        self.assertTrue(self.lm.profile.is_albanian_tl_role)
        self.assertIsNone(self.lm.profile.albanian_tl_id)
        self.assertIsNone(self.lm.profile.italian_tl_id)

    # -- set_team_leader -------------------------------------------------------
    def test_a_user_cannot_be_their_own_leader(self):
        response = self._set_leader(self.manager, 'italian_tl', self.manager.id)
        self.assertEqual(response.status_code, 400)
        self.manager.profile.refresh_from_db()
        self.assertIsNone(self.manager.profile.italian_tl_id)

    def test_circular_manager_links_are_refused(self):
        other = _manager('llg_mgr2')
        self.assertEqual(self._set_leader(self.manager, 'italian_tl', other.id).status_code, 200)
        self.assertEqual(self._set_leader(other, 'italian_tl', self.manager.id).status_code, 400)

    def test_an_inactive_leader_cannot_be_linked(self):
        User.objects.filter(pk=self.lm.pk).update(is_active=False)
        self.assertEqual(self._set_leader(self.emp, 'albanian_tl', self.lm.id).status_code, 400)

    def test_a_link_change_is_audited(self):
        before = AuditLog.objects.filter(extra_data__operation='leader_link_changed').count()
        self.assertEqual(self._set_leader(self.emp, 'albanian_tl', self.lm.id).status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(extra_data__operation='leader_link_changed').count(), before + 1,
        )

    # -- update_user (admin edit) ----------------------------------------------
    def test_update_user_refuses_self_link(self):
        response = self.api.patch(
            f'/api/users/users/{self.manager.id}/update_user/', {'italian_tl': self.manager.id}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.manager.profile.refresh_from_db()
        self.assertIsNone(self.manager.profile.italian_tl_id)

    # -- service used by the importer ------------------------------------------
    def test_service_refuses_a_target_without_the_leader_role(self):
        with self.assertRaises(UserValidationError):
            update_user_profile(self.emp, albanian_tl_id=self.plain.id)

    def test_service_refuses_self_link(self):
        with self.assertRaises(UserValidationError):
            update_user_profile(self.manager, italian_tl_id=self.manager.id)

    def test_service_links_a_real_leader_and_audits_it(self):
        update_user_profile(self.emp, albanian_tl_id=self.lm.id)
        self.emp.profile.refresh_from_db()
        self.assertEqual(self.emp.profile.albanian_tl_id, self.lm.id)
        self.assertTrue(AuditLog.objects.filter(extra_data__operation='leader_link_changed').exists())

    # -- bulk delete clears links with an audit row -----------------------------
    def test_deleting_a_leader_audits_the_cleared_links(self):
        self.emp.profile.albanian_tl = self.lm
        self.emp.profile.save()
        response = self.api.post('/api/users/users/bulk_delete/', {'ids': [self.lm.id]}, format='json')
        self.assertIn(response.status_code, (200, 204), getattr(response, 'data', None))
        self.assertTrue(AuditLog.objects.filter(extra_data__operation='leader_links_cleared').exists())
        self.emp.profile.refresh_from_db()
        self.assertIsNone(self.emp.profile.albanian_tl_id)


class DeferredImporterLinkTests(TestCase):
    """A leader named later in the same file is linked by finalize_batch, with the same guards."""

    def test_a_deferred_link_cannot_put_a_line_manager_above_a_line_manager(self):
        from plugins.data_import.importers.users import UserImporter

        importer = UserImporter()
        rows = [
            {'__row_index': 1, 'username': 'dl_lm_a', 'email': 'a@example.com', 'is_albanian_tl': True,
             'albanian_tl_username': 'dl_lm_b'},
            {'__row_index': 2, 'username': 'dl_lm_b', 'email': 'b@example.com', 'is_albanian_tl': True},
        ]
        options = {'password_strategy': 'generate'}
        context = importer.prepare_batch(rows, options)
        for row in rows:
            importer.commit_row(row, options, context=context)
        importer.finalize_batch(context, options)
        self.assertIsNone(User.objects.get(username='dl_lm_a').profile.albanian_tl_id)

    def test_a_deferred_link_to_a_non_leader_is_skipped(self):
        from plugins.data_import.importers.users import UserImporter

        importer = UserImporter()
        rows = [
            {'__row_index': 1, 'username': 'dl_emp', 'email': 'e@example.com', 'italian_tl_username': 'dl_plain'},
            {'__row_index': 2, 'username': 'dl_plain', 'email': 'p@example.com'},
        ]
        options = {'password_strategy': 'generate'}
        context = importer.prepare_batch(rows, options)
        for row in rows:
            importer.commit_row(row, options, context=context)
        importer.finalize_batch(context, options)
        self.assertIsNone(User.objects.get(username='dl_emp').profile.italian_tl_id)
