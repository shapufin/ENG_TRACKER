"""Pure HR may read the org overtime/standby queue — and nothing else.

Both ``admin_logs`` actions document HR read access and guard themselves with
``has_hr_role``, but ``HrOnlyBlockedMixin`` used to 403 pure HR before the
action ran, so the documented contract was unreachable. ``hr_read_actions``
opens exactly that action, on SAFE_METHODS only: the personal list, writes and
approvals stay refused.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog

OT_ADMIN = "/api/overtime/logs/admin_logs/"
SB_ADMIN = "/api/standby/logs/admin_logs/"
OT_LIST = "/api/overtime/logs/"
SB_LIST = "/api/standby/logs/"


def make_hr(username="hr"):
    user = User.objects.create_user(username, password="x")
    user.profile.is_hr_user = True
    user.profile.save(update_fields=["is_hr_user"])
    return user


class HrAdminLogsReadTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.hr = make_hr()
        self.staff = User.objects.create_user("staff", password="x", is_staff=True)
        self.emp = User.objects.create_user("emp", password="x")
        self.owner = User.objects.create_user("owner", password="x", first_name="Ot", last_name="Owner")
        self.client_obj = Client.objects.create(name="Acme", code="ACM")
        self.ot = OvertimeLog.objects.create(
            user=self.owner, client=self.client_obj, date=date.today(),
            hours=Decimal("2"), status="approved",
        )
        self.sb = StandbyLog.objects.create(
            user=self.owner, date=date.today(), hours=Decimal("3"), status="approved",
        )

    def get(self, url, user=None):
        self.api.force_authenticate(user or self.hr)
        return self.api.get(url)

    def test_pure_hr_reads_the_overtime_queue(self):
        res = self.get(OT_ADMIN)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertEqual([r["id"] for r in rows], [self.ot.id])

    def test_pure_hr_reads_the_standby_queue(self):
        res = self.get(SB_ADMIN)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        rows = res.data["results"] if isinstance(res.data, dict) else res.data
        self.assertEqual([r["id"] for r in rows], [self.sb.id])

    def test_pure_hr_still_cannot_use_the_personal_list(self):
        """The exemption is scoped to the org read action, not the viewset."""
        self.assertEqual(self.get(OT_LIST).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.get(SB_LIST).status_code, status.HTTP_403_FORBIDDEN)

    def test_pure_hr_still_cannot_approve(self):
        self.api.force_authenticate(self.hr)
        res = self.api.post(f"/api/overtime/logs/{self.ot.id}/approve/", {})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.api.post(f"/api/standby/logs/{self.sb.id}/approve/", {})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_still_cannot_read_the_queue(self):
        self.assertEqual(self.get(OT_ADMIN, self.emp).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.get(SB_ADMIN, self.emp).status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_unchanged(self):
        self.assertEqual(self.get(OT_ADMIN, self.staff).status_code, status.HTTP_200_OK)
        self.assertEqual(self.get(SB_ADMIN, self.staff).status_code, status.HTTP_200_OK)
