"""Tests for the explicit HBPR ↔ Albanian TL assignment model and admin API.

The assignment is the single source of truth for HBPR scope: an HBPR sees
exactly the Albanian TLs they are assigned to (and those TLs' team members),
never a global role population. One open assignment per AL TL is enforced in
the write service; history is retained via effective dates.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.permissions.models import Role
from apps.permissions.services.role_service import (
    HbprAssignmentRevokeBlockedError,
    assign_role,
    revoke_role,
)
from apps.users.models import Team, TeamMembership
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from apps.users.services.hbpr_assignments import (
    AssignmentError,
    active_assignment_for_tl,
    active_assignments_for_hbpr,
    create_assignment,
    end_assignment,
    purge_ended_assignments,
    reassign_assignment,
    today,
)

User = get_user_model()


def _user(name, **kwargs):
    return User.objects.create_user(username=name, password="testpass", **kwargs)


class HbprAssignmentTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        for code, name in [
            ("hbpr", "HBPR"),
            ("albanian_tl", "Albanian TL"),
            ("italian_tl", "Italian TL"),
            ("employee", "Employee"),
        ]:
            Role.objects.get_or_create(code=code, defaults={"name": name})

        cls.admin = _user("admin", is_staff=True, is_superuser=True)
        cls.hbpr = _user("hbpr-user")
        assign_role(cls.hbpr, "hbpr")
        cls.hbpr2 = _user("hbpr-user-2")
        assign_role(cls.hbpr2, "hbpr")
        cls.al_tl = _user("al-tl")
        assign_role(cls.al_tl, "albanian_tl")
        cls.al_tl2 = _user("al-tl-2")
        assign_role(cls.al_tl2, "albanian_tl")
        cls.plain = _user("plain")

        cls.team = Team.objects.create(
            name="AL Team", code="ALT", team_leader=cls.al_tl
        )
        cls.member = _user("al-member")
        TeamMembership.objects.create(
            user_profile=cls.member.profile, team=cls.team, is_primary_team=True
        )


class AssignmentModelTests(HbprAssignmentTestBase):
    def test_clean_rejects_non_hbpr_user(self):
        assignment = HbprAlbanianTlAssignment(
            hbpr=self.plain, albanian_tl=self.al_tl, cadence="weekly",
            effective_from=date(2026, 10, 1),
        )
        with self.assertRaisesMessage(Exception, "hbpr"):
            assignment.clean()

    def test_clean_rejects_non_albanian_tl(self):
        assignment = HbprAlbanianTlAssignment(
            hbpr=self.hbpr, albanian_tl=self.hbpr2, cadence="weekly",
            effective_from=date(2026, 10, 1),
        )
        with self.assertRaisesMessage(Exception, "albanian"):
            assignment.clean()

    def test_clean_rejects_end_before_start(self):
        assignment = HbprAlbanianTlAssignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl, cadence="weekly",
            effective_from=date(2026, 10, 2), effective_to=date(2026, 10, 1),
        )
        with self.assertRaisesMessage(Exception, "effective_to"):
            assignment.clean()

    def test_clean_rejects_unknown_cadence(self):
        assignment = HbprAlbanianTlAssignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl, cadence="yearly",
            effective_from=date(2026, 10, 1),
        )
        with self.assertRaisesMessage(Exception, "cadence"):
            assignment.clean()

    def test_is_current_true_for_open_assignment(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.assertTrue(assignment.is_current)

    def test_is_current_false_after_end(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        ended = end_assignment(
            assignment=assignment, effective_to=date(2026, 10, 2),
            actor=self.admin,
        )
        self.assertFalse(ended.is_current)


class AssignmentServiceTests(HbprAssignmentTestBase):
    def test_create_assignment_persists_and_audits(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="biweekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.assertEqual(assignment.cadence, "biweekly")
        self.assertEqual(assignment.assigned_by, self.admin)
        self.assertIsNone(assignment.effective_to)

    def test_second_open_assignment_for_same_tl_is_rejected(self):
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        with self.assertRaises(AssignmentError):
            create_assignment(
                hbpr=self.hbpr2, albanian_tl=self.al_tl,
                cadence="weekly", effective_from=date(2026, 10, 5),
                assigned_by=self.admin,
            )

    def test_overlapping_dated_range_is_rejected(self):
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        end_assignment(
            assignment=HbprAlbanianTlAssignment.objects.get(
                albanian_tl=self.al_tl
            ),
            effective_to=date(2026, 10, 20), actor=self.admin,
        )
        with self.assertRaises(AssignmentError):
            create_assignment(
                hbpr=self.hbpr2, albanian_tl=self.al_tl,
                cadence="weekly", effective_from=date(2026, 10, 2),
                assigned_by=self.admin,
            )

    def test_reassignment_closes_prior_and_creates_new(self):
        start = today() + timedelta(days=5)
        first = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=today() - timedelta(days=10),
            assigned_by=self.admin,
        )
        replacement = reassign_assignment(
            albanian_tl=self.al_tl, new_hbpr=self.hbpr2,
            cadence="monthly", effective_from=start,
            actor=self.admin,
        )
        first.refresh_from_db()
        self.assertEqual(first.effective_to, start - timedelta(days=1))
        self.assertEqual(first.ended_by, self.admin)
        self.assertTrue(replacement.is_current)
        # The outgoing assignment stays in effect through its last day.
        self.assertTrue(first.is_current)

    def test_historical_rows_retained_after_end(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        end_assignment(
            assignment=assignment, effective_to=date(2026, 10, 2),
            actor=self.admin,
        )
        self.assertTrue(
            HbprAlbanianTlAssignment.objects.filter(
                pk=assignment.pk, effective_to=date(2026, 10, 2)
            ).exists()
        )

    def test_active_assignment_for_tl_returns_current_only(self):
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        current = active_assignment_for_tl(self.al_tl.id)
        self.assertIsNotNone(current)
        self.assertEqual(current.hbpr_id, self.hbpr.id)

    def test_active_assignment_for_tl_none_when_ended(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        end_assignment(
            assignment=assignment, effective_to=date(2026, 10, 2),
            actor=self.admin,
        )
        self.assertIsNone(active_assignment_for_tl(self.al_tl.id))

    def test_active_assignments_for_hbpr_excludes_ended(self):
        a1 = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl2,
            cadence="monthly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        end_assignment(assignment=a1, effective_to=date(2026, 10, 2),
                       actor=self.admin)
        current = active_assignments_for_hbpr(self.hbpr)
        self.assertEqual({a.albanian_tl_id for a in current}, {self.al_tl2.id})

    def test_next_due_on_weekly(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.assertEqual(
            assignment.next_due_on(last_meeting_on=date(2026, 10, 6)),
            date(2026, 10, 13),
        )

    def test_next_due_on_biweekly(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="biweekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.assertEqual(
            assignment.next_due_on(last_meeting_on=date(2026, 10, 6)),
            date(2026, 10, 20),
        )

    def test_next_due_on_monthly_clamps_to_month_end(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="monthly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.assertEqual(
            assignment.next_due_on(last_meeting_on=date(2026, 1, 31)),
            date(2026, 2, 28),
        )

    def test_next_due_on_monthly_leap_year(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="monthly", effective_from=date(2028, 1, 1),
            assigned_by=self.admin,
        )
        self.assertEqual(
            assignment.next_due_on(last_meeting_on=date(2028, 1, 31)),
            date(2028, 2, 29),
        )

    def test_next_due_on_monthly_dec_to_jan_rollover(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="monthly", effective_from=date(2026, 1, 1),
            assigned_by=self.admin,
        )
        self.assertEqual(
            assignment.next_due_on(last_meeting_on=date(2026, 12, 15)),
            date(2027, 1, 15),
        )

    def test_next_due_on_falls_back_to_effective_from(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.assertEqual(
            assignment.next_due_on(last_meeting_on=None), date(2026, 10, 8)
        )


class AssignmentPurgeTests(HbprAssignmentTestBase):
    """Ended rows purge after a 6-month retention window — but only rows no
    governance evidence references (the evidence FK is PROTECT). There is no
    scheduler, so the sweep runs on the staff-only admin list read and at
    container start via ``purge_hbpr_archive``."""

    def _ended_assignment(self, *, al_tl, hbpr=None, ended_days_ago):
        end = today() - timedelta(days=ended_days_ago)
        assignment = create_assignment(
            hbpr=hbpr or self.hbpr,
            albanian_tl=al_tl,
            cadence="weekly",
            effective_from=end - timedelta(days=30),
            assigned_by=self.admin,
        )
        return end_assignment(
            assignment=assignment, effective_to=end, actor=self.admin
        )

    def test_purge_deletes_evidence_free_rows_older_than_six_months(self):
        ended = self._ended_assignment(al_tl=self.al_tl, ended_days_ago=200)
        self.assertEqual(purge_ended_assignments(), 1)
        self.assertFalse(
            HbprAlbanianTlAssignment.objects.filter(pk=ended.pk).exists()
        )

    def test_purge_keeps_recently_ended_rows(self):
        ended = self._ended_assignment(al_tl=self.al_tl, ended_days_ago=10)
        self.assertEqual(purge_ended_assignments(), 0)
        self.assertTrue(
            HbprAlbanianTlAssignment.objects.filter(pk=ended.pk).exists()
        )

    def test_purge_never_touches_open_assignments(self):
        assignment = create_assignment(
            hbpr=self.hbpr,
            albanian_tl=self.al_tl,
            cadence="weekly",
            effective_from=today() - timedelta(days=400),
            assigned_by=self.admin,
        )
        self.assertEqual(purge_ended_assignments(), 0)
        self.assertTrue(
            HbprAlbanianTlAssignment.objects.filter(pk=assignment.pk).exists()
        )

    def test_purge_respects_the_six_month_boundary(self):
        from dateutil.relativedelta import relativedelta

        cutoff = today() - relativedelta(months=6)
        # One ends exactly at the cutoff (kept); a different TL's row ends the
        # day before (purged).
        boundary = create_assignment(
            hbpr=self.hbpr,
            albanian_tl=self.al_tl,
            cadence="weekly",
            effective_from=cutoff - timedelta(days=10),
            assigned_by=self.admin,
        )
        end_assignment(assignment=boundary, effective_to=cutoff, actor=self.admin)
        older = create_assignment(
            hbpr=self.hbpr,
            albanian_tl=self.al_tl2,
            cadence="weekly",
            effective_from=cutoff - timedelta(days=40),
            assigned_by=self.admin,
        )
        end_assignment(
            assignment=older,
            effective_to=cutoff - timedelta(days=1),
            actor=self.admin,
        )
        self.assertEqual(purge_ended_assignments(), 1)
        self.assertTrue(
            HbprAlbanianTlAssignment.objects.filter(pk=boundary.pk).exists()
        )
        self.assertFalse(
            HbprAlbanianTlAssignment.objects.filter(pk=older.pk).exists()
        )


class RoleRevocationGuardTests(HbprAssignmentTestBase):
    def test_revoking_hbpr_role_blocked_while_assignment_active(self):
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        with self.assertRaises(HbprAssignmentRevokeBlockedError):
            revoke_role(self.hbpr, "hbpr")

    def test_revoking_albanian_tl_role_blocked_while_assignment_active(self):
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        with self.assertRaises(HbprAssignmentRevokeBlockedError):
            revoke_role(self.al_tl, "albanian_tl")

    def test_revocation_allowed_after_assignment_ended(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        end_assignment(
            assignment=assignment, effective_to=date(2026, 10, 2),
            actor=self.admin,
        )
        revoke_role(self.hbpr, "hbpr")
        revoke_role(self.al_tl, "albanian_tl")


class AssignmentApiTests(HbprAssignmentTestBase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _list_url(self):
        return reverse("hbpr-assignment-list")

    def _detail_url(self, pk):
        return reverse("hbpr-assignment-detail", args=[pk])

    def _payload(self, **overrides):
        data = {
            "hbpr": self.hbpr.id,
            "albanian_tl": self.al_tl.id,
            "cadence": "weekly",
            "effective_from": "2026-10-01",
        }
        data.update(overrides)
        return data

    def test_admin_can_create_assignment(self):
        response = self.client.post(self._list_url(), self._payload())
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            HbprAlbanianTlAssignment.objects.filter(
                hbpr=self.hbpr, albanian_tl=self.al_tl
            ).exists()
        )

    def test_non_admin_cannot_create(self):
        self.client.force_authenticate(user=self.plain)
        response = self.client.post(self._list_url(), self._payload())
        self.assertEqual(response.status_code, 403)

    def test_hbpr_cannot_create_own_assignment(self):
        self.client.force_authenticate(user=self.hbpr)
        response = self.client.post(self._list_url(), self._payload())
        self.assertEqual(response.status_code, 403)

    def test_create_with_non_hbpr_id_is_400(self):
        response = self.client.post(
            self._list_url(), self._payload(hbpr=self.plain.id)
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("hbpr", str(response.data))

    def test_create_with_non_tl_id_is_400(self):
        response = self.client.post(
            self._list_url(), self._payload(albanian_tl=self.plain.id)
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("albanian_tl", str(response.data))

    def test_create_with_unknown_id_is_400(self):
        response = self.client.post(
            self._list_url(), self._payload(hbpr=99999)
        )
        self.assertEqual(response.status_code, 400)

    def test_admin_can_list_and_filter_current(self):
        create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.get(self._list_url(), {"current": "true"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        row = response.data["results"][0]
        self.assertEqual(row["cadence"], "weekly")
        self.assertTrue(row["is_current"])

    def test_current_filter_follows_the_end_date(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=today() - timedelta(days=30),
            assigned_by=self.admin,
        )
        end = today() + timedelta(days=10)
        self.client.post(
            self._detail_url(assignment.pk) + "end/", {"effective_to": end.isoformat()},
        )
        listed = lambda flag: len(  # noqa: E731
            self.client.get(self._list_url(), {"current": flag}).data["results"]
        )
        self.assertEqual((listed("true"), listed("false")), (1, 0))
        assignment.refresh_from_db()
        assignment.effective_to = today() - timedelta(days=1)
        assignment.save(update_fields=["effective_to"])
        self.assertEqual((listed("true"), listed("false")), (0, 1))

    def test_list_sweeps_stale_evidence_free_archive_rows(self):
        end = today() - timedelta(days=200)
        stale = create_assignment(
            hbpr=self.hbpr,
            albanian_tl=self.al_tl,
            cadence="weekly",
            effective_from=end - timedelta(days=30),
            assigned_by=self.admin,
        )
        end_assignment(assignment=stale, effective_to=end, actor=self.admin)
        response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            HbprAlbanianTlAssignment.objects.filter(pk=stale.pk).exists()
        )

    def test_end_action_closes_assignment(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.post(
            self._detail_url(assignment.pk) + "end/",
            {"effective_to": "2026-10-02"},
        )
        self.assertEqual(response.status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.effective_to, date(2026, 10, 2))
        self.assertEqual(assignment.ended_by, self.admin)

    def test_end_requires_date(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.post(self._detail_url(assignment.pk) + "end/", {})
        self.assertEqual(response.status_code, 400)

    def test_reassign_closes_prior_and_creates_replacement(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.post(
            self._detail_url(assignment.pk) + "reassign/",
            {
                "new_hbpr": self.hbpr2.id,
                "cadence": "monthly",
                "effective_from": "2026-11-01",
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.effective_to, date(2026, 10, 31))
        current = HbprAlbanianTlAssignment.objects.get(
            albanian_tl=self.al_tl, effective_to__isnull=True
        )
        self.assertEqual(current.hbpr_id, self.hbpr2.id)
        self.assertEqual(current.cadence, "monthly")

    def test_reassign_requires_new_hbpr(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.post(
            self._detail_url(assignment.pk) + "reassign/",
            {"cadence": "monthly", "effective_from": "2026-11-01"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_hbpr", str(response.data))

    def test_reassign_rejects_unknown_new_hbpr(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.post(
            self._detail_url(assignment.pk) + "reassign/",
            {"new_hbpr": 999999, "cadence": "monthly", "effective_from": "2026-11-01"},
        )
        self.assertEqual(response.status_code, 400)

    def test_reassign_requires_cadence(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.post(
            self._detail_url(assignment.pk) + "reassign/",
            {"new_hbpr": self.hbpr2.id, "effective_from": "2026-11-01"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cadence", str(response.data))

    def test_non_admin_cannot_reassign(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.client.force_authenticate(user=self.plain)
        response = self.client.post(
            self._detail_url(assignment.pk) + "reassign/",
            {"new_hbpr": self.hbpr2.id, "cadence": "monthly", "effective_from": "2026-11-01"},
        )
        self.assertEqual(response.status_code, 403)

    def test_patch_cannot_change_identity_fields(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.patch(
            self._detail_url(assignment.pk),
            {"hbpr": self.hbpr2.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.hbpr_id, self.hbpr.id)

    def test_patch_can_change_cadence(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.patch(
            self._detail_url(assignment.pk), {"cadence": "biweekly"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.cadence, "biweekly")

    def test_patch_cannot_change_effective_from(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.patch(
            self._detail_url(assignment.pk),
            {"effective_from": "2026-09-01"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertEqual(assignment.effective_from, date(2026, 10, 1))

    def test_patch_cannot_change_effective_to(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.patch(
            self._detail_url(assignment.pk),
            {"effective_to": "2026-10-02"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        assignment.refresh_from_db()
        self.assertIsNone(assignment.effective_to)

    def test_non_admin_cannot_end(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        self.client.force_authenticate(user=self.plain)
        response = self.client.post(
            self._detail_url(assignment.pk) + "end/",
            {"effective_to": "2026-10-02"},
        )
        self.assertEqual(response.status_code, 403)

    def test_no_delete_after_creation(self):
        assignment = create_assignment(
            hbpr=self.hbpr, albanian_tl=self.al_tl,
            cadence="weekly", effective_from=date(2026, 10, 1),
            assigned_by=self.admin,
        )
        response = self.client.delete(self._detail_url(assignment.pk))
        self.assertIn(response.status_code, (400, 403, 405))
        self.assertTrue(
            HbprAlbanianTlAssignment.objects.filter(pk=assignment.pk).exists()
        )

    def test_list_query_count_is_bounded(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        for i in range(12):
            tl = _user(f"al-tl-bulk-{i}")
            assign_role(tl, "albanian_tl")
            create_assignment(
                hbpr=self.hbpr, albanian_tl=tl,
                cadence="weekly", effective_from=date(2026, 10, 1),
                assigned_by=self.admin,
            )
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, 200)
        self.assertLess(len(ctx.captured_queries), 30)
