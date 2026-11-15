"""Deactivating a leader in the Django admin asks for confirmation first (audithandover.md M2).

The form lists what the deactivation leaves behind and refuses to save until the admin
ticks the confirmation box. Reactivation, plain employees and a leader with nothing
left behind pass without it.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.users.models import Team
from apps.users.admin import LeaderAwareUserChangeForm

User = get_user_model()


class OffboardingConfirmTests(TestCase):
    def setUp(self):
        self.leader = User.objects.create_user(username='m2_leader', password='x', email='l@x.test')
        self.team = Team.objects.create(name='M2 Team', code='M2T', team_leader=self.leader)
        self.plain = User.objects.create_user(username='m2_plain', password='x', email='p@x.test')

    def _form(self, user, *, active, confirm=False):
        data = {
            'username': user.username,
            'password': user.password,
            'date_joined': user.date_joined.strftime('%Y-%m-%d %H:%M:%S'),
            'is_active': 'on' if active else '',
        }
        if confirm:
            data['confirm_offboarding'] = 'on'
        return LeaderAwareUserChangeForm(data=data, instance=user)

    def test_leader_of_an_active_team_must_confirm(self):
        form = self._form(self.leader, active=False)
        self.assertFalse(form.is_valid())
        self.assertIn('confirm_offboarding', form.errors)
        self.assertIn('M2 Team', str(form.errors['confirm_offboarding']))

    def test_confirmed_deactivation_is_allowed(self):
        form = self._form(self.leader, active=False, confirm=True)
        self.assertTrue(form.is_valid(), form.errors)

    def test_plain_employee_deactivates_without_confirmation(self):
        form = self._form(self.plain, active=False)
        self.assertTrue(form.is_valid(), form.errors)

    def test_reactivation_needs_no_confirmation(self):
        self.leader.is_active = False
        self.leader.save()
        form = self._form(self.leader, active=True)
        self.assertTrue(form.is_valid(), form.errors)

    def test_admin_change_page_offers_the_confirmation(self):
        from django.urls import reverse

        admin = User.objects.create_superuser(username='m2_admin', password='x', email='a@x.test')
        self.client.force_login(admin)
        response = self.client.get(reverse('admin:auth_user_change', args=[self.leader.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'confirm_offboarding')
