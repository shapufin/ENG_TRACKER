"""Taking a review back: ``unreview_batch``.

An admin may take back any review. A leader may take back only a review they made
themselves, so a month an admin reviewed stays admin-locked. Owners and strangers
may not. Un-reviewing reopens the leader's delete and replace rights.
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


class UnreviewBatchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.lm = _leader('ur_lm', 'UR1')
        cls.other_lm = _leader('ur_lm2', 'UR2')
        cls.member = User.objects.create_user(username='ur_member', password='x')
        cls.member.profile.albanian_tl = cls.lm
        cls.member.profile.save()
        cls.admin = User.objects.create_user(username='ur_admin', password='x', is_staff=True)

    def setUp(self):
        self.batch = TicketImportBatch.objects.create(
            user=self.member, month=date(2026, 3, 1), raw_file='ticket_imports/u.csv', record_count=3,
            reviewed_by=self.lm, reviewed_at=timezone.now())

    def call(self, user, action='unreview_batch', verb='post'):
        make = factory.post if verb == 'post' else factory.delete
        request = make(f'/upload/{self.batch.pk}/')
        force_authenticate(request, user)
        return TicketUploadViewSet.as_view({verb: action})(request, pk=self.batch.pk)

    def reviewed(self):
        self.batch.refresh_from_db()
        return self.batch.reviewed_by_id is not None

    def test_the_leader_takes_back_their_own_review(self):
        response = self.call(self.lm)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(self.reviewed())
        self.assertIsNone(self.batch.reviewed_at)

    def test_the_leader_may_then_delete_it(self):
        self.call(self.lm)
        self.assertEqual(self.call(self.lm, 'delete_team_batch', 'delete').status_code, 200)
        self.assertFalse(TicketImportBatch.objects.filter(pk=self.batch.pk).exists())

    def test_a_leader_cannot_take_back_an_admins_review(self):
        TicketImportBatch.objects.filter(pk=self.batch.pk).update(reviewed_by=self.admin)
        self.assertEqual(self.call(self.lm).status_code, 403)
        self.assertTrue(self.reviewed())

    def test_an_admin_takes_back_any_review(self):
        self.assertEqual(self.call(self.admin).status_code, 200)
        self.assertFalse(self.reviewed())

    def test_another_leader_cannot(self):
        self.assertEqual(self.call(self.other_lm).status_code, 403)
        self.assertTrue(self.reviewed())

    def test_the_member_cannot_take_back_a_review_of_their_own_upload(self):
        self.assertEqual(self.call(self.member).status_code, 403)
        self.assertTrue(self.reviewed())

    def test_an_unreviewed_upload_is_refused_clearly(self):
        TicketImportBatch.objects.filter(pk=self.batch.pk).update(reviewed_by=None, reviewed_at=None)
        response = self.call(self.admin)
        self.assertEqual(response.status_code, 400)
        self.assertIn('not reviewed', response.data['error'])

    def test_an_unknown_batch_is_404(self):
        request = factory.post('/upload/999999/')
        force_authenticate(request, self.admin)
        response = TicketUploadViewSet.as_view({'post': 'unreview_batch'})(request, pk=999999)
        self.assertEqual(response.status_code, 404)
