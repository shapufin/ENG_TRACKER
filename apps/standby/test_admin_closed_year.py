"""The Django admin cannot change or delete standby rows of a closed year (audit 2026-11-17 M2)."""
from datetime import date

from django.contrib.auth.models import User
from django.test import TestCase

from apps.standby.models import StandbyLog
from apps.users.services.approval_periods import clear_closed_year_cache, close_year

CLOSED = 2020


class StandbyAdminClosedYearTests(TestCase):
    def setUp(self):
        clear_closed_year_cache()
        self.addCleanup(clear_closed_year_cache)
        self.admin = User.objects.create_superuser('sb_admin', 'a@x.test', 'x')
        self.client.force_login(self.admin)
        self.owner = User.objects.create_user('sb_owner', password='x')
        self.frozen = StandbyLog.objects.create(
            user=self.owner, date=date(CLOSED, 6, 10), hours=2, status='rejected',
        )
        close_year(CLOSED)

    def url(self, suffix=''):
        return f'/django-admin/standby/standbylog/{self.frozen.pk}/{suffix}'

    def test_the_delete_view_refuses_a_closed_year_row(self):
        response = self.client.post(self.url('delete/'), {'post': 'yes'})
        self.assertEqual(response.status_code, 403)
        self.assertTrue(StandbyLog.objects.filter(pk=self.frozen.pk).exists())

    def test_the_bulk_delete_action_refuses_a_closed_year_row(self):
        self.client.post('/django-admin/standby/standbylog/', {
            'action': 'delete_selected', '_selected_action': [self.frozen.pk], 'post': 'yes',
        })
        self.assertTrue(StandbyLog.objects.filter(pk=self.frozen.pk).exists())

    def test_a_closed_year_row_cannot_be_moved_out_of_its_year(self):
        response = self.client.post(self.url('change/'), {
            'user': self.owner.pk, 'date': '2026-06-10', 'hours': '2', 'status': 'rejected',
        })
        self.assertIn(response.status_code, (302, 403))
        self.frozen.refresh_from_db()
        self.assertEqual(self.frozen.date, date(CLOSED, 6, 10))

    def test_an_open_year_row_is_still_deletable(self):
        open_row = StandbyLog.objects.create(
            user=self.owner, date=date(CLOSED + 1, 6, 10), hours=2, status='rejected',
        )
        self.client.post(f'/django-admin/standby/standbylog/{open_row.pk}/delete/', {'post': 'yes'})
        self.assertFalse(StandbyLog.objects.filter(pk=open_row.pk).exists())
