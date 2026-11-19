"""Admins (staff or superuser) use Ticket Review for every team's imports.

A leader still sees only their own team; a plain employee sees nothing.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.users.models import Team
from plugins.ticket_kpi.models import TicketImportBatch
from plugins.ticket_kpi.viewsets import TicketUploadViewSet

User = get_user_model()
factory = APIRequestFactory()


def _leader(username, code):
    user = User.objects.create_user(username=username, password='x')
    Team.objects.create(name=f'Team {code}', code=code, team_leader=user)
    return user


def _member(username, leader):
    user = User.objects.create_user(username=username, password='x')
    user.profile.albanian_tl = leader
    user.profile.save()
    return user


class AdminTicketReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.lm1 = _leader('atr_lm1', 'AT1')
        cls.lm2 = _leader('atr_lm2', 'AT2')
        cls.m1 = _member('atr_m1', cls.lm1)
        cls.m2 = _member('atr_m2', cls.lm2)
        cls.admin = User.objects.create_user(username='atr_admin', password='x', is_staff=True)
        cls.root = User.objects.create_user(username='atr_root', password='x', is_superuser=True)
        cls.employee = User.objects.create_user(username='atr_emp', password='x')
        cls.b1 = TicketImportBatch.objects.create(
            user=cls.m1, month=date(2026, 3, 1), raw_file='ticket_imports/a.csv', record_count=1)
        cls.b2 = TicketImportBatch.objects.create(
            user=cls.m2, month=date(2026, 3, 1), raw_file='ticket_imports/b.csv', record_count=2,
            reviewed_by=cls.lm2, reviewed_at=timezone.now())

    def listing(self, user):
        request = factory.get('/upload/team_batches/')
        force_authenticate(request, user)
        response = TicketUploadViewSet.as_view({'get': 'team_batches'})(request)
        rows = response.data.get('results', response.data) if response.status_code == 200 else []
        return response.status_code, {b['id'] for b in rows}

    def delete(self, user, batch):
        request = factory.delete(f'/upload/{batch.pk}/')
        force_authenticate(request, user)
        return TicketUploadViewSet.as_view({'delete': 'delete_team_batch'})(request, pk=batch.pk)

    def test_staff_and_superuser_see_every_teams_imports(self):
        for user in (self.admin, self.root):
            status_code, ids = self.listing(user)
            self.assertEqual(status_code, 200, user.username)
            self.assertEqual(ids, {self.b1.id, self.b2.id}, user.username)

    def test_a_leader_still_sees_only_their_team(self):
        self.assertEqual(self.listing(self.lm1), (200, {self.b1.id}))

    def test_an_employee_still_gets_403(self):
        self.assertEqual(self.listing(self.employee)[0], 403)

    def test_an_admin_may_delete_any_batch_even_a_reviewed_one(self):
        self.assertEqual(self.delete(self.admin, self.b2).status_code, 200)
        self.assertFalse(TicketImportBatch.objects.filter(pk=self.b2.pk).exists())
        self.assertEqual(self.delete(self.root, self.b1).status_code, 200)

    def test_a_leader_still_cannot_delete_another_teams_batch(self):
        self.assertEqual(self.delete(self.lm1, self.b2).status_code, 404)
        self.assertTrue(TicketImportBatch.objects.filter(pk=self.b2.pk).exists())
