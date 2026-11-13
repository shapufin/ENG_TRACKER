"""Leader move, partial-team isolation, swap staleness, and frozen manager-change tests."""
from datetime import date, datetime
from io import StringIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.overtime.models import OvertimeLog
from apps.users.models import TeamMembership, UserProfile
from apps.users.services import team_lifecycle
from apps.users.viewsets import UserProfileViewSet, UserViewSet
from plugins.engagement import signals as engagement_signals
from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.plugin import EngagementPlugin
from plugins.engagement.services import compute_tl_metric, stale_snapshot_ids
from plugins.engagement.test_engagement import (
    _assign_tl_role,
    _make_client,
    _make_overtime,
    _make_team,
    _make_user,
)
from plugins.engagement.test_engagement_sla import _at
from plugins.engagement.viewsets import TLEngagementMetricsViewSet

TIRANE = ZoneInfo('Europe/Tirane')
OCT = date(2026, 10, 1)
NOV = date(2026, 11, 1)
DEC = date(2026, 12, 1)
NOV_11 = datetime(2026, 11, 11, 12, 0, tzinfo=TIRANE)
DEC_05 = datetime(2026, 12, 5, 12, 0, tzinfo=TIRANE)


class EngagementTeamMoveTests(TestCase):
    def setUp(self):
        engagement_signals.connect()
        self.factory = APIRequestFactory()
        self.client_obj = _make_client()
        self.staff = _make_user('tm_staff', is_staff=True)
        self.hr = _make_user('tm_hr')
        self.hr.profile.is_hr_user = True
        self.hr.profile.role_codes = ['hr']
        self.hr.profile.save()

        self.lm1 = _make_user('tm_lm1')
        _assign_tl_role(self.lm1, 'albanian_tl')
        self.lm2 = _make_user('tm_lm2')
        _assign_tl_role(self.lm2, 'albanian_tl')
        call_command('seed_plugin_permissions', verbosity=0)

    def _get(self, action, user, **params):
        request = self.factory.get(f'/api/plugins/engagement/metrics/{action}/', params)
        force_authenticate(request, user=user)
        return TLEngagementMetricsViewSet.as_view({'get': action.replace('-', '_')})(request)

    def _freeze_clock(self, moment):
        return (
            patch('plugins.engagement.services._now', return_value=moment),
            patch('django.utils.timezone.now', return_value=moment),
            patch('core.utils.timezone_local.business_today', return_value=moment.date()),
            patch('plugins.engagement.services.business_today', return_value=moment.date()),
            patch('plugins.engagement.signals.business_today', return_value=moment.date()),
            patch('plugins.engagement.viewsets.business_today', return_value=moment.date()),
        )

    def test_team_leader_leftover_with_zero_links_creates_no_snapshot(self):
        team = _make_team('Alpha', 'ALP', leader=self.lm1)
        member = _make_user('alp_m1')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.albanian_tl = self.lm2
        member.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            summary = self._get('summary', self.lm1)
            breakdown = self._get('team-breakdown', self.lm1)
            lm2_breakdown = self._get('team-breakdown', self.lm2)

        self.assertEqual(summary.data['team_count'], 0)
        self.assertEqual(breakdown.data, [])
        self.assertFalse(TLApprovalMetric.objects.filter(leader=self.lm1, team=team).exists())
        self.assertEqual([(r['team_name'], r['team_size']) for r in lm2_breakdown.data], [('Alpha', 1)])

    def test_moving_all_members_via_update_user_prunes_unfrozen_snapshot(self):
        team = _make_team('Beta', 'BETA')
        m1 = _make_user('beta_m1')
        m2 = _make_user('beta_m2')
        for m in (m1, m2):
            TeamMembership.objects.create(user_profile=m.profile, team=team)
            m.profile.albanian_tl = self.lm1
            m.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            self.assertEqual(self._get('summary', self.lm1).data['team_count'], 1)
            for m in (m1, m2):
                req = self.factory.patch(
                    f'/api/users/users/{m.id}/update_user/',
                    {'albanian_tl': self.lm2.id},
                    format='json',
                )
                force_authenticate(req, user=self.staff)
                resp = UserViewSet.as_view({'patch': 'update_user'})(req, pk=m.id)
                self.assertEqual(resp.status_code, 200)

            self.assertFalse(TLApprovalMetric.objects.filter(leader=self.lm1, team=team, month=NOV).exists())
            self.assertEqual(self._get('summary', self.lm1).data['team_count'], 0)
            self.assertEqual(self._get('team-breakdown', self.lm1).data, [])
            self.assertEqual([(r['team_name'], r['team_size']) for r in self._get('team-breakdown', self.lm2).data], [('Beta', 2)])

    def test_moving_members_via_bulk_update_set_tl_and_promotion_prunes_unfrozen_snapshot(self):
        team_bulk = _make_team('Bulk Team', 'BULK')
        m_bulk = _make_user('bulk_m')
        TeamMembership.objects.create(user_profile=m_bulk.profile, team=team_bulk)
        m_bulk.profile.albanian_tl = self.lm1
        m_bulk.profile.save()

        team_hr = _make_team('HR Team', 'HRTM')
        m_hr = _make_user('hr_m')
        TeamMembership.objects.create(user_profile=m_hr.profile, team=team_hr)
        m_hr.profile.albanian_tl = self.lm1
        m_hr.profile.save()

        team_promo = _make_team('Promo Team', 'PROMO')
        m_promo = _make_user('promo_m')
        TeamMembership.objects.create(user_profile=m_promo.profile, team=team_promo)
        m_promo.profile.albanian_tl = self.lm1
        m_promo.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            self.assertEqual(self._get('summary', self.lm1).data['team_count'], 3)

            # 1) bulk_update
            req = self.factory.post(
                '/api/users/users/bulk_update/',
                {'user_ids': [m_bulk.id], 'albanian_tl': self.lm2.id},
                format='json',
            )
            force_authenticate(req, user=self.staff)
            self.assertEqual(UserViewSet.as_view({'post': 'bulk_update'})(req).status_code, 200)
            self.assertFalse(TLApprovalMetric.objects.filter(leader=self.lm1, team=team_bulk, month=NOV).exists())

            # 2) HR set_team_leader
            req = self.factory.post(
                f'/api/users/profiles/{m_hr.profile.id}/set_team_leader/',
                {'role': 'albanian_tl', 'team_leader_user_id': self.lm2.id},
                format='json',
            )
            force_authenticate(req, user=self.hr)
            self.assertEqual(UserProfileViewSet.as_view({'post': 'set_team_leader'})(req, pk=m_hr.profile.id).status_code, 200)
            self.assertFalse(TLApprovalMetric.objects.filter(leader=self.lm1, team=team_hr, month=NOV).exists())

            # 3) Promotion to Line Manager clears albanian_tl
            req = self.factory.patch(
                f'/api/users/users/{m_promo.id}/update_user/',
                {'roles': ['albanian_tl']},
                format='json',
            )
            force_authenticate(req, user=self.staff)
            self.assertEqual(UserViewSet.as_view({'patch': 'update_user'})(req, pk=m_promo.id).status_code, 200)
            self.assertFalse(TLApprovalMetric.objects.filter(leader=self.lm1, team=team_promo, month=NOV).exists())
            self.assertEqual(self._get('summary', self.lm1).data['team_count'], 0)

    def test_frozen_snapshot_survives_with_changed_manager_date_and_stays_gone_in_future_months(self):
        team_gamma = _make_team('Gamma', 'GAMMA')
        team_stay = _make_team('Stay', 'STAY')
        m_gamma = _make_user('gamma_m')
        m_stay = _make_user('stay_m')
        TeamMembership.objects.create(user_profile=m_gamma.profile, team=team_gamma)
        TeamMembership.objects.create(user_profile=m_stay.profile, team=team_stay)
        m_gamma.profile.albanian_tl = self.lm1
        m_gamma.profile.save()
        m_stay.profile.albanian_tl = self.lm1
        m_stay.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            compute_tl_metric(self.lm1, team_gamma, OCT)
            compute_tl_metric(self.lm1, team_stay, OCT)
            compute_tl_metric(self.lm1, team_gamma, NOV)
            compute_tl_metric(self.lm1, team_stay, NOV)

            # Move m_gamma to lm2
            m_gamma.profile.albanian_tl = self.lm2
            m_gamma.profile.save()

            # Default / Nov shows only Stay
            nov_rows = self._get('team-breakdown', self.lm1).data
            self.assertEqual([r['team_name'] for r in nov_rows], ['Stay'])

            # Frozen Oct keeps Gamma with manager_changed=True & Nov 11 date; Stay is unchanged
            oct_rows = {r['team_name']: r for r in self._get('team-breakdown', self.lm1, month=OCT.isoformat()).data}
            self.assertEqual(set(oct_rows), {'Gamma', 'Stay'})
            self.assertTrue(oct_rows['Gamma']['manager_changed'])
            self.assertEqual(oct_rows['Gamma']['manager_changed_at'], '2026-11-11')
            self.assertTrue(oct_rows['Gamma']['frozen'])
            self.assertFalse(oct_rows['Stay']['manager_changed'])
            self.assertIsNone(oct_rows['Stay']['manager_changed_at'])

        # Next month (December): Gamma never reappears for lm1
        d1, d2, d3, d4, d5, d6 = self._freeze_clock(DEC_05)
        with d1, d2, d3, d4, d5, d6:
            dec_rows = self._get('team-breakdown', self.lm1, month=DEC.isoformat()).data
            self.assertEqual([r['team_name'] for r in dec_rows], ['Stay'])

    def test_reassigning_member_back_clears_manager_changed_at(self):
        team = _make_team('Return Team', 'RET')
        member = _make_user('ret_m')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.albanian_tl = self.lm1
        member.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            snap = compute_tl_metric(self.lm1, team, OCT)
            member.profile.albanian_tl = self.lm2
            member.profile.save()
            snap.refresh_from_db()
            self.assertEqual(snap.manager_changed_at, date(2026, 11, 11))

            member.profile.albanian_tl = self.lm1
            member.profile.save()
            snap.refresh_from_db()
            self.assertIsNone(snap.manager_changed_at)

    def test_archiving_team_does_not_mark_frozen_snapshots_as_changed_manager(self):
        team = _make_team('Archive Team', 'ARCH')
        member = _make_user('arch_m')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.albanian_tl = self.lm1
        member.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            compute_tl_metric(self.lm1, team, OCT)
            team_lifecycle.archive_team(team, request=None)
            rows = self._get('team-breakdown', self.lm1, month=OCT.isoformat()).data
            self.assertEqual(len(rows), 1)
            self.assertFalse(rows[0]['manager_changed'])
            self.assertIsNone(rows[0]['manager_changed_at'])

    def test_queryset_update_without_signals_prunes_unfrozen_and_marks_frozen_on_read(self):
        team = _make_team('BulkQuery Team', 'BQ')
        member = _make_user('bq_m')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.albanian_tl = self.lm1
        member.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            compute_tl_metric(self.lm1, team, OCT)
            compute_tl_metric(self.lm1, team, NOV)
            # Bypass signals via .update()
            UserProfile.objects.filter(user=member).update(albanian_tl=self.lm2)

            self.assertEqual(self._get('team-breakdown', self.lm1, month=NOV.isoformat()).data, [])
            self.assertFalse(TLApprovalMetric.objects.filter(leader=self.lm1, team=team, month=NOV).exists())

            oct_rows = self._get('team-breakdown', self.lm1, month=OCT.isoformat()).data
            self.assertTrue(oct_rows[0]['manager_changed'])
            self.assertEqual(oct_rows[0]['manager_changed_at'], '2026-11-11')

    def test_partial_team_shows_only_linked_member_and_never_marks_changed_manager(self):
        team = _make_team('Delta', 'DELTA', leader=self.lm2)
        m1, m2, m3 = _make_user('d_m1'), _make_user('d_m2'), _make_user('d_m3')
        for m in (m1, m2, m3):
            TeamMembership.objects.create(user_profile=m.profile, team=team)
        m1.profile.albanian_tl = self.lm1
        m1.profile.save()
        m2.profile.albanian_tl = self.lm2
        m2.profile.save()
        m3.profile.albanian_tl = self.lm2
        m3.profile.save()

        _make_overtime(
            m1, date(2026, 11, 3), _at(date(2026, 11, 3), 10),
            status='approved', approved_at=_at(date(2026, 11, 3), 12),
            approved_by=self.lm1, client=self.client_obj,
        )
        for m in (m2, m3):
            _make_overtime(m, date(2026, 11, 2), _at(date(2026, 11, 2), 10), status='pending', client=self.client_obj)

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            lm1_rows = self._get('team-breakdown', self.lm1, month=NOV.isoformat()).data
            lm2_rows = self._get('team-breakdown', self.lm2, month=NOV.isoformat()).data

        self.assertEqual(len(lm1_rows), 1)
        self.assertEqual(lm1_rows[0]['team_size'], 1)
        self.assertEqual(lm1_rows[0]['metrics']['overtime']['breaches'], 0)
        self.assertEqual(lm1_rows[0]['engagement_score'], 100.0)
        self.assertFalse(lm1_rows[0]['manager_changed'])

        self.assertEqual(len(lm2_rows), 1)
        self.assertEqual(lm2_rows[0]['team_size'], 2)
        self.assertEqual(lm2_rows[0]['metrics']['overtime']['breaches'], 2)

    def test_one_for_one_member_swap_detects_staleness_and_recomputes(self):
        team = _make_team('Epsilon', 'EPS')
        m1, m2 = _make_user('eps_m1'), _make_user('eps_m2')
        for m in (m1, m2):
            TeamMembership.objects.create(user_profile=m.profile, team=team)
        m1.profile.albanian_tl = self.lm1
        m1.profile.save()
        m2.profile.albanian_tl = self.lm2
        m2.profile.save()

        ot1 = _make_overtime(
            m1, date(2026, 11, 3), _at(date(2026, 11, 3), 10),
            status='approved', approved_at=_at(date(2026, 11, 3), 12),
            approved_by=self.lm1, client=self.client_obj,
        )
        OvertimeLog.objects.filter(pk=ot1.pk).update(updated_at=_at(date(2026, 11, 3), 12))
        ot2 = _make_overtime(m2, date(2026, 11, 2), _at(date(2026, 11, 2), 10), status='pending', client=self.client_obj)
        OvertimeLog.objects.filter(pk=ot2.pk).update(updated_at=_at(date(2026, 11, 2), 10))

        t1 = datetime(2026, 11, 11, 10, 0, tzinfo=TIRANE)
        p1, p2, p3, p4, p5, p6 = self._freeze_clock(t1)
        with p1, p2, p3, p4, p5, p6:
            snap = compute_tl_metric(self.lm1, team, NOV)
            self.assertEqual(snap.engagement_score, 100.0)

        # Swap 1-for-1 (size remains 1; m2's log untouched since t1)
        m1.profile.albanian_tl = self.lm2
        m1.profile.save()
        m2.profile.albanian_tl = self.lm1
        m2.profile.save()

        t2 = datetime(2026, 11, 11, 12, 0, tzinfo=TIRANE)
        q1, q2, q3, q4, q5, q6 = self._freeze_clock(t2)
        with q1, q2, q3, q4, q5, q6:
            self.assertIn(snap.pk, stale_snapshot_ids([snap]))
            rows = self._get('team-breakdown', self.lm1, month=NOV.isoformat()).data
            self.assertEqual(rows[0]['team_size'], 1)
            self.assertEqual(rows[0]['metrics']['overtime']['breaches'], 1)
            # Owner rule (2026-11-13): lm1 keeps the on-time decision they made on m1 before the swap,
            # so the score is no longer 0; the breach of m2's pending request still counts.
            self.assertEqual(rows[0]['metrics']['overtime']['decided'], 1)
            self.assertEqual(rows[0]['engagement_score'], 75.0)

    def test_recompute_command_prunes_orphaned_unfrozen_snapshots(self):
        team = _make_team('Cmd Team', 'CMD')
        member = _make_user('cmd_m')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.albanian_tl = self.lm1
        member.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            compute_tl_metric(self.lm1, team, NOV)
            UserProfile.objects.filter(user=member).update(albanian_tl=self.lm2)
            call_command('recompute_tl_metrics', month=NOV.isoformat(), stdout=StringIO())
            self.assertFalse(TLApprovalMetric.objects.filter(leader=self.lm1, team=team, month=NOV).exists())
            self.assertTrue(TLApprovalMetric.objects.filter(leader=self.lm2, team=team, month=NOV).exists())

    def test_raw_signal_saves_are_ignored_for_backup_restore_safety(self):
        team = _make_team('Raw Team', 'RAW')
        member = _make_user('raw_m')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.albanian_tl = self.lm1
        member.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            snap = compute_tl_metric(self.lm1, team, NOV)
            member.profile.albanian_tl = self.lm2
            member.profile.save_base(raw=True)
            self.assertTrue(TLApprovalMetric.objects.filter(pk=snap.pk).exists())

    def test_plugin_ready_and_disable_manage_signal_lifecycle(self):
        plugin = EngagementPlugin()
        self.addCleanup(engagement_signals.connect)
        plugin.disable()
        team = _make_team('Disable Team', 'DIS')
        member = _make_user('dis_m')
        TeamMembership.objects.create(user_profile=member.profile, team=team)
        member.profile.albanian_tl = self.lm1
        member.profile.save()

        p1, p2, p3, p4, p5, p6 = self._freeze_clock(NOV_11)
        with p1, p2, p3, p4, p5, p6:
            snap = compute_tl_metric(self.lm1, team, NOV)
            member.profile.albanian_tl = self.lm2
            member.profile.save()
            # Signal was disconnected: row stays until read/recompute prunes it
            self.assertTrue(TLApprovalMetric.objects.filter(pk=snap.pk).exists())
            plugin.ready()
            member.profile.albanian_tl = self.lm1
            member.profile.save()
            member.profile.albanian_tl = self.lm2
            member.profile.save()
            self.assertFalse(TLApprovalMetric.objects.filter(pk=snap.pk).exists())
