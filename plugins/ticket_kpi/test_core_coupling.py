"""Guards for the seams between ticket_kpi and the core app.

Each test pins one place where KPI used to drift from, or hard-depend on, core.
"""

from datetime import date
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models.core import Client, OvertimeLog, normalize_ticket_reference
from apps.users.models import Team
from plugins.ticket_kpi.models import (
    MonthlyKPI,
    NormalizedTicket,
    TicketImportBatch,
    TicketOvertimeLink,
)
from plugins.ticket_kpi.plugin import TicketKPIPlugin
from plugins.ticket_kpi.signals import delete_kpi_on_batch_remove
from plugins.ticket_kpi.utils.ticket_match import normalize_ticket_id
from plugins.ticket_kpi.viewsets import (
    TicketOvertimeLinkViewSet,
    _get_tl_team_members,
    _is_tl_for_user,
)

REPO_ROOT = Path(settings.BASE_DIR)


class TeamScopeParityTests(TestCase):
    """KPI team scope must equal core's ``get_team_member_ids()`` (+ the TL)."""

    @classmethod
    def setUpTestData(cls):
        cls.tl = User.objects.create_user(username='par_tl', password='x')
        cls.direct = User.objects.create_user(username='par_direct', password='x')
        cls.peer = User.objects.create_user(username='par_peer', password='x')
        cls.stranger = User.objects.create_user(username='par_stranger', password='x')

        cls.direct.profile.italian_tl = cls.tl
        cls.direct.profile.save(update_fields=['italian_tl'])

        # TL is only a plain *member* of a shared team (not its leader).
        cls.other_leader = User.objects.create_user(username='par_lead', password='x')
        cls.shared = Team.objects.create(
            name='Shared', code='SHR', team_leader=cls.other_leader
        )
        cls.shared.members.add(cls.tl.profile, cls.peer.profile)

    def test_scope_matches_core_resolution(self):
        expected = set(self.tl.profile.get_team_member_ids()) | {self.tl.id}
        actual = set(_get_tl_team_members(self.tl).values_list('id', flat=True))
        self.assertEqual(actual, expected)
        self.assertIn(self.peer.id, actual)
        self.assertNotIn(self.stranger.id, actual)

    def test_is_tl_for_user_agrees_with_scope(self):
        self.assertTrue(_is_tl_for_user(self.tl, self.direct))
        self.assertTrue(_is_tl_for_user(self.tl, self.peer))
        self.assertFalse(_is_tl_for_user(self.tl, self.stranger))
        self.assertFalse(_is_tl_for_user(self.tl, self.tl))


class ItalianTlScopeTests(TestCase):
    """Italian TLs sit above the people KPI measures: never in a roster, except as the viewer."""

    @classmethod
    def setUpTestData(cls):
        def make(name, **profile):
            user = User.objects.create_user(username=name, password='x')
            for field, value in profile.items():
                setattr(user.profile, field, value)
            user.profile.save()
            return user

        cls.al_tl = make('it_al_tl', is_albanian_tl_role=True)
        cls.it_tl = make('it_it_tl', is_italian_tl_role=True)
        cls.other_it_tl = make('it_other_it_tl', is_italian_tl_role=True)
        cls.member = make('it_member')
        cls.stranger = make('it_stranger')
        cls.member.profile.albanian_tl = cls.al_tl
        cls.member.profile.save(update_fields=['albanian_tl'])

        team = Team.objects.create(name='Mixed', code='MIX', team_leader=cls.al_tl)
        team.members.add(
            cls.al_tl.profile, cls.it_tl.profile, cls.other_it_tl.profile, cls.member.profile
        )

    def ids(self, viewer):
        return set(_get_tl_team_members(viewer).values_list('id', flat=True))

    def test_albanian_tl_roster_leaves_out_italian_tls(self):
        roster = self.ids(self.al_tl)
        self.assertIn(self.member.id, roster)
        self.assertIn(self.al_tl.id, roster)
        self.assertNotIn(self.it_tl.id, roster)
        self.assertNotIn(self.other_it_tl.id, roster)

    def test_italian_tl_keeps_their_own_row_but_not_a_peers(self):
        roster = self.ids(self.it_tl)
        self.assertIn(self.it_tl.id, roster)
        self.assertNotIn(self.other_it_tl.id, roster)
        self.assertNotIn(self.stranger.id, roster)


class LinkRepointTests(TestCase):
    """Updating a link must authorize against the link's CURRENT owner too."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = APIRequestFactory()
        cls.owner = User.objects.create_user(username='rp_owner', password='x')
        cls.hr = User.objects.create_user(username='rp_hr', password='x')
        cls.hr.profile.is_hr_user = True
        cls.hr.profile.save(update_fields=['is_hr_user'])
        cls.client_obj = Client.objects.create(name='RP Client', code='RP')

        def make(user, ref):
            batch = TicketImportBatch.objects.create(user=user, month=date(2026, 3, 1))
            batch.clients.add(cls.client_obj)
            ticket = NormalizedTicket.objects.create(
                batch=batch, row_index=1, ticket_id=ref, title='t', status='closed',
                created_at='2026-03-10T08:00:00Z',
            )
            log = OvertimeLog.objects.create(
                user=user, client=cls.client_obj, date=date(2026, 3, 10), hours=1,
            )
            return ticket, log

        cls.owner_ticket, cls.owner_log = make(cls.owner, 'INC-RP-1')
        cls.hr_ticket, cls.hr_log = make(cls.hr, 'INC-RP-2')
        cls.link = TicketOvertimeLink.objects.create(
            overtime_log=cls.owner_log,
            normalized_ticket=cls.owner_ticket,
            linked_by=cls.owner,
        )

    def test_hr_cannot_repoint_another_users_link_onto_own_records(self):
        request = self.factory.patch(
            f'/links/{self.link.id}/',
            {'overtime_log': self.hr_log.id, 'normalized_ticket': self.hr_ticket.id},
            format='json',
        )
        force_authenticate(request, user=self.hr)
        response = TicketOvertimeLinkViewSet.as_view({'patch': 'partial_update'})(
            request, pk=self.link.id
        )
        self.assertEqual(response.status_code, 403)
        self.link.refresh_from_db()
        self.assertEqual(self.link.overtime_log_id, self.owner_log.id)


class SharedHelperTests(SimpleTestCase):
    def test_ticket_normalizer_is_the_core_one(self):
        self.assertIs(normalize_ticket_id, normalize_ticket_reference)


class DeleteSignalTests(TestCase):
    def test_kpi_removed_when_only_overridden_batches_remain(self):
        user = User.objects.create_user(username='sig_user', password='x')
        month = date(2026, 3, 1)
        TicketImportBatch.objects.create(user=user, month=month, is_overridden=True)
        active = TicketImportBatch.objects.create(user=user, month=month)
        MonthlyKPI.objects.create(user=user, month=month)

        active.delete()
        delete_kpi_on_batch_remove(sender=TicketImportBatch, instance=active)

        self.assertFalse(MonthlyKPI.objects.filter(user=user, month=month).exists())


class PluginConfigTests(SimpleTestCase):
    def test_config_schema_declares_only_consumed_keys(self):
        self.assertEqual(
            set(TicketKPIPlugin().get_config_schema()), {'max_file_size_mb'}
        )


class CoreDoesNotImportKpiTests(SimpleTestCase):
    """Core (apps/, config/) must never reference KPI code (remove_plugin safety)."""

    def test_no_core_file_references_the_plugin_package(self):
        offenders = []
        for folder in ('apps', 'config'):
            for path in (REPO_ROOT / folder).rglob('*.py'):
                if 'migrations' in path.parts:
                    continue
                if 'plugins.ticket_kpi' in path.read_text(encoding='utf-8'):
                    offenders.append(str(path.relative_to(REPO_ROOT)))
        self.assertEqual(offenders, [])


class MonthlyKpiIndexTests(SimpleTestCase):
    """Moved here from apps/leave_management/test_indexes.py (core must not import KPI)."""

    def test_no_index_duplicates_a_unique_constraint(self):
        from django.db import models

        opts = MonthlyKPI._meta
        unique = [
            tuple(c.fields) for c in opts.constraints
            if isinstance(c, models.UniqueConstraint) and not c.condition
        ] + [tuple(u) for u in opts.unique_together]
        indexes = [tuple(i.fields) for i in opts.indexes]
        self.assertFalse(set(indexes) & set(unique))
