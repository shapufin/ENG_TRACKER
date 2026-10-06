"""EPR stage evidence (EPRStageRecord + complete_stage), read-only
completed_at invariants, HBPR redaction, employee-shared summaries, and the
year-end evidence pack."""
from datetime import date

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.models import Role, UserRole
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import PluginPermission
from apps.users.models.hbpr import HbprAlbanianTlAssignment

from .testing import make_user as _make_user
from .models import EPRCycle, EPRGoal, EPRStageRecord, HbprGovernanceEvidence
from .services import epr_metrics
from .viewsets import EPRCycleViewSet, EPRGoalViewSet, EPRStageRecordViewSet
from .viewsets_my_records import MyRecordsViewSet
from .viewsets.evidence import HbprGovernanceEvidenceViewSet


def _assign_tl_role(user, code='italian_tl'):
    role, _ = Role.objects.get_or_create(code=code, defaults={'name': code})
    UserRole.objects.get_or_create(user=user, role=role, defaults={'is_active': True})


class CompleteStageTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.leader = _make_user('leader_stage')
        _assign_tl_role(self.leader)
        self.member = _make_user('member_stage')
        self.member.profile.italian_tl = self.leader
        self.member.profile.save()
        self.staff = _make_user('staff_stage', is_staff=True)
        self.cycle = EPRCycle.objects.create(user=self.member, year=2026)

    def _complete(self, user, pk, data):
        request = self.factory.post(f'/x/{pk}/complete_stage/', data or {}, format='json')
        force_authenticate(request, user=user)
        return EPRCycleViewSet.as_view({'post': 'complete_stage'})(request, pk=pk)

    def _add_goals(self, count=5):
        for i in range(count):
            EPRGoal.objects.create(cycle=self.cycle, description=f'Goal {i}')

    def test_complete_stage_creates_record_and_timestamp(self):
        self._add_goals()
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'Mid-year review held.',
            'reference_url': 'https://workday.example/review/1',
            'shared_with_employee': True,
        })
        self.assertEqual(resp.status_code, 200, resp.data)
        self.cycle.refresh_from_db()
        self.assertIsNotNone(self.cycle.mid_year_completed_at)
        record = EPRStageRecord.objects.get(cycle=self.cycle, stage='mid_year')
        self.assertEqual(record.summary, 'Mid-year review held.')
        self.assertEqual(record.reference_url, 'https://workday.example/review/1')
        self.assertTrue(record.shared_with_employee)
        self.assertEqual(record.recorded_by, self.leader)

    def test_complete_stage_requires_a_summary(self):
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': '   ',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('summary', resp.data)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.mid_year_completed_at)
        self.assertFalse(EPRStageRecord.objects.filter(cycle=self.cycle).exists())

    def test_complete_stage_rejects_unknown_stage(self):
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'bogus', 'summary': 'x',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('stage', resp.data)

    def test_complete_stage_rejects_an_overlong_reference_url(self):
        # objects.create skips full_clean — without the guard a URLField
        # overflow would surface as a DB error, not a 400.
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'Held.',
            'reference_url': 'https://example.com/' + 'a' * 200,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('reference_url', resp.data)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.mid_year_completed_at)

    def test_complete_stage_twice_conflicts(self):
        self._add_goals()
        first = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'Held.',
        })
        self.assertEqual(first.status_code, 200, first.data)
        second = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'Again.',
        })
        self.assertEqual(second.status_code, 409)
        self.assertEqual(
            EPRStageRecord.objects.filter(cycle=self.cycle, stage='mid_year').count(), 1)

    def test_complete_stage_response_includes_the_new_record(self):
        """The 200 payload must carry the evidence row it just created — the
        cycle's prefetch cache is stale by then and must not be serialized."""
        self._add_goals()
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'Mid-year review held.',
        })
        self.assertEqual(resp.status_code, 200, resp.data)
        rows = [r for r in resp.data['stage_records'] if r['stage'] == 'mid_year']
        self.assertEqual(len(rows), 1, resp.data['stage_records'])
        self.assertEqual(rows[0]['summary'], 'Mid-year review held.')

    def test_complete_stage_conflicting_row_returns_409_not_500(self):
        """Simulates the race: the evidence row already exists but the
        timestamp was not yet visible to this request's read — the unique
        constraint must surface as 409, never a 500."""
        EPRStageRecord.objects.create(
            cycle=self.cycle, stage='final_review', summary='x',
            recorded_by=self.leader,
        )
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'final_review', 'summary': 'Held.',
        })
        self.assertEqual(resp.status_code, 409)

    def test_complete_stage_rejects_a_malformed_reference_url(self):
        """objects.create skips full_clean, so URL format must be checked here."""
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'Held.', 'reference_url': 'not a url',
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn('reference_url', resp.data)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.mid_year_completed_at)

    def test_goal_setting_requires_5_goals(self):
        self._add_goals(4)
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'goal_setting', 'summary': 'Goals agreed.',
        })
        self.assertEqual(resp.status_code, 400)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.goal_setting_completed_at)

    def test_goal_setting_completes_with_5_goals(self):
        self._add_goals(5)
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'goal_setting', 'summary': 'Goals agreed.',
        })
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_other_stages_do_not_need_goals(self):
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'final_review', 'summary': 'Final held.',
        })
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_outsider_tl_cannot_complete(self):
        outsider = _make_user('outsider_stage')
        outsider_cycle = EPRCycle.objects.create(user=outsider, year=2026)
        resp = self._complete(self.leader, outsider_cycle.id, {
            'stage': 'mid_year', 'summary': 'Held.',
        })
        self.assertEqual(resp.status_code, 404)
        self.assertIsNone(EPRCycle.objects.get(pk=outsider_cycle.id).mid_year_completed_at)

    def test_staff_can_complete_stage(self):
        self._add_goals()
        resp = self._complete(self.staff, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'Held by HR.',
        })
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(
            EPRStageRecord.objects.get(cycle=self.cycle).recorded_by, self.staff)

    def test_goal_setting_with_goal_titles_replaces_and_stamps(self):
        self._add_goals(2)
        titles = [f' Workday  Goal {index} ' for index in range(1, 6)]
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'goal_setting',
            'summary': 'Workday goals confirmed.',
            'goal_titles': titles,
        })

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(
            list(self.cycle.goals.order_by('id').values_list('description', flat=True)),
            [f'Workday Goal {index}' for index in range(1, 6)],
        )
        self.cycle.refresh_from_db()
        self.assertIsNotNone(self.cycle.goal_setting_completed_at)

    def test_invalid_goal_titles_preserve_existing_goals_and_stage(self):
        self._add_goals(2)
        old_ids = list(self.cycle.goals.values_list('id', flat=True))
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'goal_setting',
            'summary': 'Workday goals confirmed.',
            'goal_titles': ['One', 'Two', 'Three', 'Four', 'one'],
        })

        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('goal_titles', resp.data)
        self.assertEqual(list(self.cycle.goals.values_list('id', flat=True)), old_ids)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.goal_setting_completed_at)
        self.assertFalse(EPRStageRecord.objects.filter(cycle=self.cycle).exists())

    def test_mid_year_without_titles_confirms_existing_goals(self):
        self._add_goals()
        old_ids = list(self.cycle.goals.values_list('id', flat=True))
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'No goal changes.',
        })

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(list(self.cycle.goals.values_list('id', flat=True)), old_ids)
        self.cycle.refresh_from_db()
        self.assertIsNotNone(self.cycle.mid_year_completed_at)

    def test_mid_year_without_titles_requires_existing_five_goal_set(self):
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year', 'summary': 'No goal changes.',
        })

        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('goals', resp.data)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.mid_year_completed_at)

    def test_mid_year_with_titles_replaces_goals_atomically(self):
        self._add_goals()
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year',
            'summary': 'Updated Workday goals confirmed.',
            'goal_titles': [f'Revised {index}' for index in range(1, 6)],
        })

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(
            list(self.cycle.goals.order_by('id').values_list('description', flat=True)),
            [f'Revised {index}' for index in range(1, 6)],
        )

    def test_mid_year_with_too_few_titles_preserves_old_goals(self):
        self._add_goals()
        old_ids = list(self.cycle.goals.values_list('id', flat=True))
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year',
            'summary': 'Updated Workday goals confirmed.',
            'goal_titles': ['One', 'Two', 'Three', 'Four'],
        })

        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('goal_titles', resp.data)
        self.assertEqual(list(self.cycle.goals.values_list('id', flat=True)), old_ids)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.mid_year_completed_at)
        self.assertFalse(EPRStageRecord.objects.filter(cycle=self.cycle).exists())

    def test_failed_mid_year_record_creation_rolls_back_goal_replacement(self):
        """A preexisting evidence row simulates the race; rollback must restore
        the prior goal set rather than leave deleted/replaced rows behind."""
        self._add_goals()
        old_ids = list(self.cycle.goals.values_list('id', flat=True))
        EPRStageRecord.objects.create(
            cycle=self.cycle, stage='mid_year', summary='Concurrent save.',
            recorded_by=self.leader,
        )
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year',
            'summary': 'Updated Workday goals confirmed.',
            'goal_titles': [f'Revised {index}' for index in range(1, 6)],
        })

        self.assertEqual(resp.status_code, 409)
        self.assertEqual(list(self.cycle.goals.values_list('id', flat=True)), old_ids)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.mid_year_completed_at)

    def test_final_review_rejects_goal_titles_and_preserves_rows(self):
        self._add_goals()
        old_ids = list(self.cycle.goals.values_list('id', flat=True))
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'final_review',
            'summary': 'Final review held.',
            'goal_titles': [f'Revised {index}' for index in range(1, 6)],
        })

        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('goal_titles', resp.data)
        self.assertEqual(list(self.cycle.goals.values_list('id', flat=True)), old_ids)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.final_review_completed_at)

    def test_goal_titles_rejected_after_mid_year_completed(self):
        self._add_goals()
        self.cycle.mid_year_completed_at = timezone.now()
        self.cycle.save(update_fields=['mid_year_completed_at'])
        old_ids = list(self.cycle.goals.values_list('id', flat=True))
        resp = self._complete(self.leader, self.cycle.id, {
            'stage': 'mid_year',
            'summary': 'Late replacement.',
            'goal_titles': [f'Revised {index}' for index in range(1, 6)],
        })

        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertEqual(list(self.cycle.goals.values_list('id', flat=True)), old_ids)

    def test_direct_epr_goal_endpoint_is_read_only(self):
        goal = EPRGoal.objects.create(cycle=self.cycle, description='Existing')

        for method, mapping, pk, data in (
            ('post', {'post': 'create'}, None,
             {'cycle': self.cycle.id, 'description': 'New'}),
            ('patch', {'patch': 'partial_update'}, goal.id,
             {'description': 'Changed'}),
            ('put', {'put': 'update'}, goal.id,
             {'cycle': self.cycle.id, 'description': 'Changed'}),
            ('delete', {'delete': 'destroy'}, goal.id, None),
        ):
            request = getattr(self.factory, method)(f'/x/{pk or ""}', data, format='json')
            force_authenticate(request, user=self.leader)
            kwargs = {'pk': pk} if pk is not None else {}
            resp = EPRGoalViewSet.as_view(mapping)(request, **kwargs)
            self.assertEqual(resp.status_code, 405, (method, resp.data))

        goal.refresh_from_db()
        self.assertEqual(goal.description, 'Existing')

    def test_completed_at_fields_not_patchable(self):
        """Mirrors Absence.addressed_on: the only writer is the action."""
        request = self.factory.patch(
            f'/x/{self.cycle.id}/',
            {'goal_setting_completed_at': timezone.now().isoformat()},
            format='json',
        )
        force_authenticate(request, user=self.leader)
        resp = EPRCycleViewSet.as_view({'patch': 'partial_update'})(request, pk=self.cycle.id)
        self.assertEqual(resp.status_code, 200)
        self.cycle.refresh_from_db()
        self.assertIsNone(self.cycle.goal_setting_completed_at)


class StageRecordAccessTests(TestCase):
    """Scope/permission on the stage-record resource + serializer redaction."""

    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        for code in ('hbpr', 'italian_tl', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        PluginPermission.objects.get(plugin_name='tl_scorecard', action='view') \
            .allowed_roles.add(Role.objects.get(code='hbpr'))

        self.hbpr = _make_user('hbpr_stage')
        assign_role(self.hbpr, 'hbpr')
        self.tl = _make_user('tl_stage')
        assign_role(self.tl, 'albanian_tl')
        self.member = _make_user('member_stage_h')
        self.member.profile.albanian_tl = self.tl
        self.member.profile.save()
        HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl,
            cadence='weekly', effective_from=date(2020, 1, 1),
        )
        self.other_tl = _make_user('other_tl_stage')
        assign_role(self.other_tl, 'albanian_tl')
        self.staff = _make_user('staff_stage_h', is_staff=True)

        self.cycle = EPRCycle.objects.create(
            user=self.member, year=2026, mid_year_completed_at=timezone.now())
        self.record = EPRStageRecord.objects.create(
            cycle=self.cycle, stage='mid_year', summary='Private stage notes.',
            reference_url='https://workday.example/r/1', recorded_by=self.tl)

    def _call(self, viewset, mapping, user, pk=None, data=None, method='get'):
        request = getattr(self.factory, method)(f'/x/{pk or ""}', data or {}, format='json')
        force_authenticate(request, user=user)
        kwargs = {'pk': pk} if pk is not None else {}
        return viewset.as_view(mapping)(request, **kwargs)

    def test_owner_tl_sees_full_stage_records(self):
        resp = self._call(EPRCycleViewSet, {'get': 'retrieve'}, self.tl, pk=self.cycle.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        rows = resp.data['stage_records']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['summary'], 'Private stage notes.')
        self.assertEqual(rows[0]['reference_url'], 'https://workday.example/r/1')

    def test_hbpr_sees_evidence_metadata_not_content(self):
        resp = self._call(EPRCycleViewSet, {'get': 'retrieve'}, self.hbpr, pk=self.cycle.id)
        self.assertEqual(resp.status_code, 200, resp.data)
        rows = resp.data['stage_records']
        self.assertEqual(len(rows), 1)
        self.assertNotIn('summary', rows[0])
        self.assertNotIn('reference_url', rows[0])
        self.assertTrue(rows[0]['has_reference'])
        self.assertEqual(rows[0]['recorded_by_name'], self.tl.get_full_name() or self.tl.username)

    def test_hbpr_gets_no_stage_records_from_the_standalone_endpoint(self):
        """The embed is the only HBPR read path (existence metadata). The
        standalone endpoint serves the FULL serializer, so the HBPR branch
        must be empty — otherwise the redaction has a side door."""
        listing = self._call(EPRStageRecordViewSet, {'get': 'list'}, self.hbpr)
        self.assertEqual(listing.status_code, 200, listing.data)
        payload = (
            listing.data.get('results') if isinstance(listing.data, dict) else listing.data
        )
        self.assertEqual(payload, [])
        detail = self._call(
            EPRStageRecordViewSet, {'get': 'retrieve'}, self.hbpr, pk=self.record.id)
        self.assertIn(detail.status_code, (403, 404))

    def test_owner_tl_can_patch_stage_record(self):
        resp = self._call(
            EPRStageRecordViewSet, {'patch': 'partial_update'}, self.tl,
            pk=self.record.id, data={'summary': 'Corrected.'}, method='patch')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.record.refresh_from_db()
        self.assertEqual(self.record.summary, 'Corrected.')

    def test_staff_can_patch_stage_record(self):
        resp = self._call(
            EPRStageRecordViewSet, {'patch': 'partial_update'}, self.staff,
            pk=self.record.id, data={'summary': 'Staff fix.'}, method='patch')
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_hbpr_cannot_patch_stage_record(self):
        resp = self._call(
            EPRStageRecordViewSet, {'patch': 'partial_update'}, self.hbpr,
            pk=self.record.id, data={'summary': 'Nope.'}, method='patch')
        self.assertEqual(resp.status_code, 403)
        self.record.refresh_from_db()
        self.assertEqual(self.record.summary, 'Private stage notes.')

    def test_other_tl_cannot_patch_stage_record(self):
        resp = self._call(
            EPRStageRecordViewSet, {'patch': 'partial_update'}, self.other_tl,
            pk=self.record.id, data={'summary': 'Nope.'}, method='patch')
        self.assertIn(resp.status_code, (403, 404))

    def test_stage_records_cannot_be_created_directly(self):
        resp = self._call(
            EPRStageRecordViewSet, {'post': 'create'}, self.tl,
            data={'cycle': self.cycle.id, 'stage': 'final_review', 'summary': 'x'},
            method='post')
        self.assertEqual(resp.status_code, 405)


class MyRecordsSharedSummaryTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        self.member = _make_user('member_myepr')
        self.tl = _make_user('tl_myepr')
        self.cycle = EPRCycle.objects.create(
            user=self.member, year=2026, final_review_completed_at=timezone.now())
        EPRStageRecord.objects.create(
            cycle=self.cycle, stage='final_review', summary='Shared outcome.',
            shared_with_employee=True, recorded_by=self.tl)
        EPRStageRecord.objects.create(
            cycle=self.cycle, stage='mid_year', summary='Private mid-year.',
            shared_with_employee=False, recorded_by=self.tl)

    def test_only_shared_stage_summaries_reach_my_records(self):
        request = self.factory.get('/x/')
        force_authenticate(request, user=self.member)
        resp = MyRecordsViewSet.as_view({'get': 'list'})(request)
        self.assertEqual(resp.status_code, 200)
        cycle = resp.data['epr_cycles'][0]
        stages = {s['stage']: s['summary'] for s in cycle['stage_summaries']}
        self.assertEqual(stages, {'final_review': 'Shared outcome.'})


class YearEndPackTests(TestCase):
    """GET hbpr-evidence/year-end-pack/?assignment=&year= per assignment+year."""

    def setUp(self):
        self.factory = APIRequestFactory()
        call_command('seed_plugin_permissions')
        for code in ('hbpr', 'albanian_tl'):
            Role.objects.get_or_create(code=code, defaults={'name': code})
        PluginPermission.objects.get(plugin_name='tl_scorecard', action='view') \
            .allowed_roles.add(Role.objects.get(code='hbpr'))

        self.hbpr = _make_user('hbpr_pack')
        assign_role(self.hbpr, 'hbpr')
        self.tl = _make_user('tl_pack')
        assign_role(self.tl, 'albanian_tl')
        # Ended assignment covering Jan 6-19 2025 (14 days → 2 weekly meetings).
        self.assignment = HbprAlbanianTlAssignment.objects.create(
            hbpr=self.hbpr, albanian_tl=self.tl, cadence='weekly',
            effective_from=date(2025, 1, 6), effective_to=date(2025, 1, 19),
        )
        self.other_tl = _make_user('other_tl_pack')
        assign_role(self.other_tl, 'albanian_tl')
        self.other_hbpr = _make_user('other_hbpr_pack')
        assign_role(self.other_hbpr, 'hbpr')
        self.staff = _make_user('staff_pack', is_staff=True)

        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='cadence_meeting',
            occurred_on=date(2025, 1, 10), shared_summary='Week one sync.',
            action_items='Follow up on staffing.', recorded_by=self.tl)
        HbprGovernanceEvidence.objects.create(
            assignment=self.assignment, kind='epr_mid_year',
            occurred_on=date(2025, 6, 20), reporting_year=2025,
            shared_summary='HBPR joined mid-year EPR.', recorded_by=self.tl)

    def _pack(self, user, params):
        request = self.factory.get('/x/', params)
        force_authenticate(request, user=user)
        return HbprGovernanceEvidenceViewSet.as_view({'get': 'year_end_pack'})(request)

    def test_pack_counts_held_vs_expected_and_epr_rows(self):
        resp = self._pack(self.tl, {'assignment': self.assignment.id, 'year': '2025'})
        self.assertEqual(resp.status_code, 200, resp.data)
        data = resp.data
        self.assertEqual(data['cadence_expected'], 2)
        self.assertEqual(data['cadence_held'], 1)
        self.assertEqual(data['coverage_pct'], 50.0)
        self.assertEqual(len(data['meetings']), 1)
        self.assertEqual(data['meetings'][0]['shared_summary'], 'Week one sync.')
        self.assertEqual(
            data['epr_mid_year']['shared_summary'], 'HBPR joined mid-year EPR.')
        self.assertIsNone(data['epr_year_end'])

    def test_pack_readable_by_assigned_hbpr_and_staff(self):
        for user in (self.hbpr, self.staff):
            resp = self._pack(user, {'assignment': self.assignment.id, 'year': '2025'})
            self.assertEqual(resp.status_code, 200, (user, resp.data))

    def test_pack_denies_foreign_tl_and_hbpr(self):
        for user in (self.other_tl, self.other_hbpr):
            resp = self._pack(user, {'assignment': self.assignment.id, 'year': '2025'})
            self.assertEqual(resp.status_code, 403, (user, resp.data))

    def test_pack_requires_assignment_and_year(self):
        self.assertEqual(
            self._pack(self.tl, {}).status_code, 400)
        self.assertEqual(
            self._pack(self.tl, {'assignment': self.assignment.id}).status_code, 400)
        self.assertEqual(
            self._pack(self.tl, {'assignment': 'x', 'year': '2025'}).status_code, 400)


class EprMetricsEvidenceTests(TestCase):
    def test_stage_evidence_counters(self):
        member = _make_user('member_evid')
        tl = _make_user('tl_evid')
        cycle = EPRCycle.objects.create(
            user=member, year=2026, mid_year_completed_at=timezone.now())
        EPRStageRecord.objects.create(
            cycle=cycle, stage='mid_year', summary='Held.', recorded_by=tl)
        # A second cycle completed without evidence (pre-migration style).
        EPRCycle.objects.create(
            user=member, year=2025,
            goal_setting_completed_at=timezone.make_aware(timezone.datetime(2025, 3, 1)))

        result = epr_metrics({member.id}, 2026)
        self.assertEqual(result['stages_completed'], 1)
        self.assertEqual(result['stages_with_evidence'], 1)
