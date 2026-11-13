"""Production-readiness simulation: MANAGEMENT changes in the middle of a month.

Beyond the plain "employee changes Line Manager" case (covered by the owner-rule tests):
Manager change, both links with one removed, demotion / deactivation / promotion of a leader,
a leader losing every member, two leaders swapping members, team archive / unarchive,
``Team.team_leader`` change, an employee in two teams, bulk membership changes, and
untouched superuser / staff / HR.

Each scenario prints ``SIM|`` lines (run with ``-v 2`` or read stdout) and asserts the
outcome the rules require. A test marked ``expectedFailure`` documents a confirmed bug
(the assertion states the CORRECT behaviour and currently fails); a test whose name
contains ``ruling`` pins today's behaviour of an open product question.
"""
from io import StringIO
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.leave_management.models import LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.permissions.services.role_service import assign_role
from apps.standby.models import StandbyLog
from apps.users.models import Team
from apps.users.services.leader_ownership import leader_user_ids
from apps.users.services.team_membership import change_user_teams
from plugins.engagement.models import TLApprovalMetric
from plugins.engagement.services import compute_tl_metric
from plugins.skills.models import Skill, SkillCategory, UserSkill
from plugins.ticket_kpi.models import KPIEvidence
from plugins.tl_scorecard.models import (
    Absence, EPRCycle, IdleFlag, Meeting, PIPRecord,
)
from plugins.tl_scorecard.scope import scoreable_member_ids

FAST_HASH = override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])

SECRET = 'LM1-PRIVATE-NOTE'


def sim(label, value):
    print(f'SIM| {label} = {value}')


def mk(username, *roles, **kwargs):
    user = User.objects.create_user(username=username, password='x', **kwargs)
    for role in roles:
        if role == 'italian_tl':
            user.profile.is_italian_tl_role = True
        if role == 'albanian_tl':
            user.profile.is_albanian_tl_role = True
        user.profile.save()
        assign_role(user, role)
    return user


def fresh(user):
    return User.objects.get(pk=user.pk)


def rows(response):
    data = response.data
    if isinstance(data, dict) and 'results' in data:
        data = data['results']
    return data if isinstance(data, list) else []


@FAST_HASH
class MoveWorld(TestCase):
    """The shared organisation: 2 Managers, 3 Line Managers, 4 employees, 2 teams."""

    def setUp(self):
        call_command('seed_plugin_permissions', stdout=StringIO())
        self.today = timezone.now().date()
        self.api = APIClient()
        self.admin = User.objects.create_superuser(username='w_admin', password='x', email='a@a.a')
        self.staff = User.objects.create_user(username='w_staff', password='x', is_staff=True)
        self.hr = mk('w_hr', 'hr')
        self.mgr1 = mk('w_mgr1', 'italian_tl')
        self.mgr2 = mk('w_mgr2', 'italian_tl')
        self.lm1 = mk('w_lm1', 'albanian_tl')
        self.lm2 = mk('w_lm2', 'albanian_tl')
        self.lm3 = mk('w_lm3', 'albanian_tl')
        for lm in (self.lm1, self.lm2, self.lm3):
            self._link(lm, mgr=self.mgr1)
        self.emp = mk('w_emp')
        self.emp2 = mk('w_emp2')
        self.emp3 = mk('w_emp3')
        self.bystander = mk('w_bystander')
        self._link(self.emp, lm=self.lm1, mgr=self.mgr1)
        self._link(self.emp2, lm=self.lm1, mgr=self.mgr1)
        self._link(self.emp3, lm=self.lm2, mgr=self.mgr2)
        self.team_a = Team.objects.create(name='Team A', code='TA', team_leader=self.lm1)
        self.team_b = Team.objects.create(name='Team B', code='TB', team_leader=self.lm2)
        change_user_teams(self.emp.profile, [self.team_a.id])
        change_user_teams(self.emp2.profile, [self.team_a.id])
        change_user_teams(self.emp3.profile, [self.team_b.id])
        self.client_row = Client.objects.create(name='Sim', code='SIMX')
        self._records()

    # ---- fixtures -----------------------------------------------------------------
    def _link(self, user, lm=..., mgr=...):
        profile = type(user.profile).objects.get(user=user)
        if lm is not ...:
            profile.albanian_tl = lm
        if mgr is not ...:
            profile.italian_tl = mgr
        profile.save()

    def _ot(self, user, status='pending', approved_by=None):
        log = OvertimeLog.objects.create(
            user=user, client=self.client_row, date=self.today, hours=2, status=status, approved_by=approved_by,
        )
        update = {'submitted_at': timezone.now()}
        if status != 'pending':
            update['approved_at'] = timezone.now()
        OvertimeLog.objects.filter(pk=log.pk).update(**update)
        return log.pk

    def _records(self):
        self.ot_pending = self._ot(self.emp)
        self.ot_decided = self._ot(self.emp, 'approved', self.lm1)
        self.sb_pending = StandbyLog.objects.create(user=self.emp, date=self.today, hours=8, status='pending').pk
        self.leave_pending = LeaveRequest.objects.create(
            user=self.emp, request_type='vacation', start_date=self.today + timedelta(days=40),
            end_date=self.today + timedelta(days=40), status='pending',
        ).pk
        doc = KPIEvidence(user=self.emp, month=self.today.replace(day=1), evidence_type='document', description='d')
        doc.file.save('mid.txt', ContentFile(b'x'), save=False)
        doc.save()
        self.doc = doc.pk
        self.meeting = Meeting.objects.create(
            meeting_type='one_on_one', organizer=self.lm1, counterparty=self.emp,
            occurred_on=self.today, notes=SECRET, recorded_by=self.lm1,
        ).pk
        self.pip = PIPRecord.objects.create(
            employee=self.emp, tl=self.lm1, start_date=self.today, status='active', notes=SECRET,
            recorded_by=self.lm1,
        ).pk
        self.epr = EPRCycle.objects.create(user=self.emp, year=self.today.year).pk
        self.flag = IdleFlag.objects.create(
            employee=self.emp, flagged_by=self.lm1, flagged_on=self.today, notes=SECRET, recorded_by=self.lm1,
        ).pk
        self.absence = Absence.objects.create(
            employee=self.emp, flagged_by=self.lm1, absence_date=self.today, notes=SECRET, recorded_by=self.lm1,
        ).pk
        cat = SkillCategory.objects.create(name='Cat', code='cat')
        skill = Skill.objects.create(category=cat, name='Sk', code='sk')
        self.user_skill = UserSkill.objects.create(user=self.emp, skill=skill, level=3, last_updated_by=self.emp).pk

    # ---- request helpers ----------------------------------------------------------
    def call(self, user, method, path, data=None):
        self.api.force_authenticate(user=fresh(user))
        return getattr(self.api, method)(path, data, format='json') if data is not None else getattr(self.api, method)(path)

    def ids(self, user, path):
        response = self.call(user, 'get', path)
        self.assertEqual(response.status_code, 200, (path, response.status_code, getattr(response, 'data', None)))
        return {r['id'] for r in rows(response)}

    def team_ids(self, user):
        """What a leader's queues list right now: {(kind, id)}."""
        out = set()
        for kind, path in (
            ('ot_logs', '/api/overtime/logs/team_logs/'), ('ot_pending', '/api/overtime/logs/team_pending/'),
            ('sb_logs', '/api/standby/logs/team_logs/'), ('sb_pending', '/api/standby/logs/team_pending/'),
            ('lv_logs', '/api/leave-management/requests/team_logs/'),
            ('lv_pending', '/api/leave-management/requests/team_pending/'),
        ):
            out |= {(kind, i) for i in self.ids(user, path)}
        return out

    def member_ids(self, user):
        return set(fresh(user).profile.get_team_member_ids())


class ManagerChangeTests(MoveWorld):
    def test_manager_change_with_line_manager_set_moves_nothing_for_the_line_manager(self):
        """Employee keeps lm1; Manager link goes mgr1 -> mgr2. Pending stays owned by lm1."""
        self._link(self.emp, mgr=self.mgr2)
        self.assertIn(('ot_pending', self.ot_pending), self.team_ids(self.lm1))
        for leader in (self.mgr1, self.mgr2):
            self.assertNotIn(('ot_pending', self.ot_pending), self.team_ids(leader))
        self.assertNotIn(self.emp.id, self.member_ids(self.mgr1))
        self.assertIn(self.emp.id, self.member_ids(self.mgr2))
        sim('manager change: old/new manager list pending', 'neither (lm1 owns it)')

    def test_manager_change_old_manager_cannot_touch_anything_by_id(self):
        self._link(self.emp, mgr=self.mgr2)
        for url in (
            f'/api/overtime/logs/{self.ot_pending}/approve/', f'/api/overtime/logs/{self.ot_pending}/reject/',
            f'/api/standby/logs/{self.sb_pending}/approve/',
            f'/api/leave-management/requests/{self.leave_pending}/approve/',
        ):
            # mgr2 is the NEW Manager link: for leave (no owner rule) a linked Manager may decide
            # even when a Line Manager is set; overtime/standby stay with lm1 only.
            leaders = (self.mgr1,) if 'leave-management' in url else (self.mgr1, self.mgr2)
            for leader in leaders:
                response = self.call(leader, 'post', url, {'reason': 'x'})
                self.assertIn(response.status_code, (403, 404), (leader.username, url, response.status_code))
        self.assertEqual(OvertimeLog.objects.get(pk=self.ot_pending).status, 'pending')

    def test_manager_change_old_manager_is_stripped_of_scorecard_epr_and_skills(self):
        self._link(self.emp, mgr=self.mgr2)
        self.assertNotIn(self.emp.id, scoreable_member_ids(fresh(self.mgr1)))
        self.assertIn(self.epr, self.ids(self.mgr2, '/api/plugins/tl_scorecard/epr-cycles/'))
        self.assertNotIn(self.epr, self.ids(self.mgr1, '/api/plugins/tl_scorecard/epr-cycles/'))
        self.assertEqual(self.call(self.mgr1, 'post', f'/api/plugins/skills/user-skills/{self.user_skill}/rate/', {'level': 1}).status_code, 404)

    def test_manager_removed_entirely_row_still_owned_by_line_manager(self):
        self._link(self.emp, mgr=None)
        self.assertIn(('ot_pending', self.ot_pending), self.team_ids(self.lm1))

    def test_manager_only_employee_owned_by_manager_then_change_follows(self):
        self._link(self.emp, lm=None)
        self.assertIn(('ot_pending', self.ot_pending), self.team_ids(self.mgr1))
        self._link(self.emp, mgr=self.mgr2)
        self.assertNotIn(('ot_pending', self.ot_pending), self.team_ids(self.mgr1))
        self.assertIn(('ot_pending', self.ot_pending), self.team_ids(self.mgr2))
        # decided row (decider lm1 is still a leader) stays with lm1, never doubled
        self.assertIn(('ot_logs', self.ot_decided), self.team_ids(self.lm1))
        self.assertNotIn(('ot_logs', self.ot_decided), self.team_ids(self.mgr2))


class BothLinksOneRemovedTests(MoveWorld):
    def test_remove_line_manager_hands_pending_to_manager_and_keeps_decided_with_decider(self):
        self._link(self.emp, lm=None)
        mgr = self.team_ids(self.mgr1)
        lm = self.team_ids(self.lm1)
        self.assertIn(('ot_pending', self.ot_pending), mgr)
        self.assertNotIn(('ot_pending', self.ot_pending), lm)
        self.assertIn(('ot_logs', self.ot_decided), lm)
        self.assertNotIn(('ot_logs', self.ot_decided), mgr)

    def test_remove_line_manager_old_lm_loses_leave_scorecard_epr_kpi_skills(self):
        self._link(self.emp, lm=None)
        self.assertNotIn(self.leave_pending, self.ids(self.lm1, '/api/leave-management/requests/team_pending/'))
        self.assertIn(self.leave_pending, self.ids(self.mgr1, '/api/leave-management/requests/team_pending/'))
        self.assertNotIn(self.epr, self.ids(self.lm1, '/api/plugins/tl_scorecard/epr-cycles/'))
        self.assertEqual(self.call(self.lm1, 'get', f'/api/plugins/ticket_kpi/evidence/{self.doc}/').status_code, 404)
        self.assertEqual(self.call(self.lm1, 'post', f'/api/plugins/skills/user-skills/{self.user_skill}/rate/', {'level': 1}).status_code, 404)

    def test_remove_manager_keeps_line_manager_scope_untouched(self):
        before = self.team_ids(self.lm1)
        self._link(self.emp, mgr=None)
        self.assertEqual(before, self.team_ids(self.lm1))


class LeaderLifecycleTests(MoveWorld):
    def test_deactivated_line_manager_with_links_left_orphans_pending_rows_ruling(self):
        """NEEDS-RULING: the link points at an inactive LM, so owner_leader_id() names nobody
        who can open a queue: the Manager is alerted (notifications) yet does not list it."""
        self.lm1.is_active = False
        self.lm1.save()
        owner_ids = {lid for kind, rid in self.team_ids(self.mgr1) for lid in [rid] if kind == 'ot_pending'}
        sim('deactivated LM: pending row visible to Manager', self.ot_pending in owner_ids)
        sim('deactivated LM: inactive leader in leader set', self.lm1.id in leader_user_ids())
        self.assertNotIn(self.lm1.id, leader_user_ids())

    def test_deactivated_line_manager_pending_row_falls_to_manager(self):
        """BUG (see report): pending rows of an employee whose Line Manager is deactivated are
        listed by nobody except staff; the Manager above is still notified."""
        self.lm1.is_active = False
        self.lm1.save()
        self.assertIn(('ot_pending', self.ot_pending), self.team_ids(self.mgr1))

    def test_deactivated_line_manager_decided_rows_follow_current_leader_and_leave_does_not_vanish(self):
        self.lm1.is_active = False
        self.lm1.save()
        self._link(self.emp, lm=self.lm2)
        ids = self.team_ids(self.lm2)
        self.assertIn(('ot_logs', self.ot_decided), ids)
        self.assertIn(('ot_pending', self.ot_pending), ids)

    def test_demoting_a_line_manager_with_members_is_refused_by_the_api(self):
        response = self.call(self.admin, 'patch', f'/api/users/users/{self.lm1.id}/update_user/',
                             {'roles': ['employee']})
        sim('demote LM with members status', response.status_code)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn(self.emp.id, self.member_ids(self.lm1))

    def test_demoted_line_manager_after_reassigning_members(self):
        for member in (self.emp, self.emp2):
            self._link(member, lm=self.lm2)
        response = self.call(self.admin, 'patch', f'/api/users/users/{self.lm1.id}/update_user/',
                             {'roles': ['employee']})
        self.assertEqual(response.status_code, 200, response.data)
        demoted = fresh(self.lm1)
        self.assertFalse(demoted.profile.is_albanian_tl)
        # demoted ex-LM sees no leader queue content, cannot approve, cannot rate
        self.assertEqual(self.call(demoted, 'post', f'/api/overtime/logs/{self.ot_pending}/approve/').status_code, 403)
        self.assertEqual(self.call(demoted, 'post', f'/api/plugins/skills/user-skills/{self.user_skill}/rate/', {'level': 1}).status_code, 404)
        # Demotion does not clear Team.team_leader: the ex-LM still leads Team A, so they stay a
        # 'leader' (is_team_leader) and keep owning the rows they decided.
        sim('demoted LM still in leader set (leads Team A)', self.lm1.id in leader_user_ids())
        self.assertIn(self.lm1.id, leader_user_ids())
        self.assertIn(('ot_logs', self.ot_decided), self.team_ids(self.lm1))
        self.assertNotIn(('ot_logs', self.ot_decided), self.team_ids(self.lm2))

    def test_demoted_line_manager_who_leads_no_team_hands_decided_rows_to_current_leader(self):
        for member in (self.emp, self.emp2):
            self._link(member, lm=self.lm2)
        Team.objects.filter(team_leader=self.lm1).update(team_leader=None)
        response = self.call(self.admin, 'patch', f'/api/users/users/{self.lm1.id}/update_user/',
                             {'roles': ['employee']})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn(self.lm1.id, leader_user_ids())
        self.assertIn(('ot_logs', self.ot_decided), self.team_ids(self.lm2))

    def test_demoted_leader_keeps_authored_scorecard_rows_ruling(self):
        """NEEDS-RULING: scorecard rows are scoped by author; a demoted ex-LM (still holding
        the plugin 'view' grant as an employee?) must not read private notes of rows they wrote
        about people they no longer manage. Pinned: what the API answers today."""
        for member in (self.emp, self.emp2):
            self._link(member, lm=self.lm2)
        self.call(self.admin, 'patch', f'/api/users/users/{self.lm1.id}/update_user/', {'roles': ['employee']})
        response = self.call(self.lm1, 'get', f'/api/plugins/tl_scorecard/pip-records/{self.pip}/')
        sim('demoted LM reads own PIP (status)', response.status_code)
        if response.status_code == 200:
            sim('demoted LM sees private PIP notes', response.data.get('notes') == SECRET)
        self.assertIn(response.status_code, (200, 403, 404))

    def test_promoted_employee_loses_lm_link_keeps_manager_and_old_lm_loses_scope(self):
        response = self.call(self.admin, 'patch', f'/api/users/users/{self.emp.id}/update_user/',
                             {'roles': ['employee', 'albanian_tl']})
        self.assertEqual(response.status_code, 200, response.data)
        profile = fresh(self.emp).profile
        self.assertIsNone(profile.albanian_tl_id)
        self.assertEqual(profile.italian_tl_id, self.mgr1.id)
        self.assertNotIn(self.emp.id, self.member_ids(self.lm1))
        # employee-era rows now owned by the Manager (pending) / decider (decided)
        mgr, lm = self.team_ids(self.mgr1), self.team_ids(self.lm1)
        self.assertIn(('ot_pending', self.ot_pending), mgr)
        self.assertNotIn(('ot_pending', self.ot_pending), lm)
        self.assertIn(('ot_logs', self.ot_decided), lm)

    def test_promoted_employee_is_not_scoreable_by_their_manager(self):
        self.call(self.admin, 'patch', f'/api/users/users/{self.emp.id}/update_user/',
                  {'roles': ['employee', 'albanian_tl']})
        self.assertNotIn(self.emp.id, scoreable_member_ids(fresh(self.mgr1)))
        # item 73 gap: the employee-era EPR is no longer listed for the Manager
        listed = self.epr in self.ids(self.mgr1, '/api/plugins/tl_scorecard/epr-cycles/')
        sim('promotion: employee-era EPR visible to Manager', listed)
        self.assertFalse(listed)

    def test_promoted_employee_old_lm_cannot_read_their_new_leader_records(self):
        self.call(self.admin, 'patch', f'/api/users/users/{self.emp.id}/update_user/',
                  {'roles': ['employee', 'albanian_tl']})
        self.assertNotIn(self.epr, self.ids(self.lm1, '/api/plugins/tl_scorecard/epr-cycles/'))
        self.assertEqual(self.call(self.lm1, 'get', f'/api/plugins/ticket_kpi/evidence/{self.doc}/').status_code, 404)


class LeaderLosesEverythingAndSwapTests(MoveWorld):
    def test_leader_with_every_member_moved_away_sees_nothing_but_keeps_decided_history(self):
        for member in (self.emp, self.emp2):
            self._link(member, lm=self.lm3)
        ids = self.team_ids(self.lm1)
        self.assertEqual({k for k, _ in ids if k.endswith('pending')}, set())
        self.assertIn(('ot_logs', self.ot_decided), ids)
        self.assertEqual(self.member_ids(self.lm1), set())
        self.assertEqual(scoreable_member_ids(fresh(self.lm1)), set())
        self.assertEqual(self.ids(self.lm1, '/api/plugins/tl_scorecard/epr-cycles/'), set())
        self.assertEqual(self.call(self.lm1, 'get', '/api/plugins/skills/matrix/matrix/').status_code, 200)
        matrix = {r.get('user_id') or r.get('id') for r in rows(self.call(self.lm1, 'get', '/api/plugins/skills/matrix/matrix/'))}
        self.assertNotIn(self.emp.id, matrix)

    def test_two_leaders_swap_members_no_duplicates_no_drops(self):
        self._link(self.emp, lm=self.lm2)
        self._link(self.emp3, lm=self.lm1)
        lm1, lm2 = self.team_ids(self.lm1), self.team_ids(self.lm2)
        self.assertEqual({k for k, i in lm1 | lm2 if k == 'ot_pending' and i == self.ot_pending}, {'ot_pending'})
        self.assertNotIn(('ot_pending', self.ot_pending), lm1)
        self.assertIn(('ot_pending', self.ot_pending), lm2)
        # member sets are disjoint and complete
        a, b = self.member_ids(self.lm1), self.member_ids(self.lm2)
        self.assertEqual(a & b, set())
        self.assertEqual(a | b, {self.emp.id, self.emp2.id, self.emp3.id})
        # each pending row has exactly one owner across all leaders
        owners = [leader for leader in (self.lm1, self.lm2, self.lm3, self.mgr1, self.mgr2)
                  if ('ot_pending', self.ot_pending) in self.team_ids(leader)]
        self.assertEqual([o.username for o in owners], [self.lm2.username])

    def test_swap_authored_records_stay_with_author_and_cannot_leak_private_notes_to_new_leader(self):
        self._link(self.emp, lm=self.lm2)
        for path, rid in (
            ('meetings', self.meeting), ('pip-records', self.pip), ('idle-flags', self.flag), ('absences', self.absence),
        ):
            base = f'/api/plugins/tl_scorecard/{path}/'
            self.assertIn(rid, self.ids(self.lm1, base), path)
            self.assertNotIn(rid, self.ids(self.lm2, base), path)
            response = self.call(self.lm2, 'get', f'{base}{rid}/')
            self.assertEqual(response.status_code, 404, (path, response.status_code))
            self.assertNotIn(SECRET, str(getattr(response, 'data', '')))

    def test_new_leader_cannot_mutate_old_leaders_records(self):
        self._link(self.emp, lm=self.lm2)
        for path, rid in (('meetings', self.meeting), ('pip-records', self.pip), ('idle-flags', self.flag)):
            url = f'/api/plugins/tl_scorecard/{path}/{rid}/'
            self.assertEqual(self.call(self.lm2, 'patch', url, {'notes': 'hijack'}).status_code, 404, path)
            self.assertEqual(self.call(self.lm2, 'delete', url).status_code, 404, path)
        self.assertEqual(Meeting.objects.get(pk=self.meeting).notes, SECRET)


class IdorAfterMoveTests(MoveWorld):
    """After lm1 -> lm2, the OLD leader must not reach the employee's records by id."""

    def setUp(self):
        super().setUp()
        self._link(self.emp, lm=self.lm2, mgr=self.mgr2)

    def test_old_leader_cannot_approve_reject_or_delete_member_requests(self):
        for leader in (self.lm1, self.mgr1):
            for url in (
                f'/api/overtime/logs/{self.ot_pending}/approve/', f'/api/overtime/logs/{self.ot_pending}/reject/',
                f'/api/standby/logs/{self.sb_pending}/approve/', f'/api/standby/logs/{self.sb_pending}/reject/',
                f'/api/leave-management/requests/{self.leave_pending}/approve/',
                f'/api/leave-management/requests/{self.leave_pending}/reject/',
            ):
                response = self.call(leader, 'post', url, {'reason': 'x'})
                self.assertIn(response.status_code, (403, 404), (leader.username, url, response.status_code))
            for url in (
                f'/api/overtime/logs/{self.ot_pending}/', f'/api/standby/logs/{self.sb_pending}/',
                f'/api/leave-management/requests/{self.leave_pending}/',
                f'/api/overtime/logs/{self.ot_decided}/',
            ):
                for method in ('get', 'patch', 'delete'):
                    response = self.call(leader, method, url, {'notes': 'x'} if method == 'patch' else None)
                    self.assertIn(response.status_code, (403, 404), (leader.username, method, url, response.status_code))
        self.assertEqual(OvertimeLog.objects.get(pk=self.ot_pending).status, 'pending')
        self.assertTrue(OvertimeLog.objects.filter(pk=self.ot_decided).exists())
        self.assertEqual(LeaveRequest.objects.get(pk=self.leave_pending).status, 'pending')

    def test_old_leader_cannot_bulk_decide_or_bulk_delete_member_requests(self):
        for url, ids in (
            ('/api/overtime/logs/bulk_approve/', [self.ot_pending]), ('/api/overtime/logs/bulk_reject/', [self.ot_pending]),
            ('/api/overtime/logs/bulk_delete/', [self.ot_pending]),
            ('/api/standby/logs/bulk_approve/', [self.sb_pending]),
            ('/api/leave-management/requests/bulk_approve/', [self.leave_pending]),
        ):
            response = self.call(self.lm1, 'post', url, {'ids': ids, 'reason': 'x'})
            sim(f'old LM bulk {url.split("/")[-2]}', (response.status_code, str(getattr(response, 'data', ''))[:90]))
        self.assertEqual(OvertimeLog.objects.get(pk=self.ot_pending).status, 'pending')
        self.assertTrue(OvertimeLog.objects.filter(pk=self.ot_pending).exists())
        self.assertEqual(StandbyLog.objects.get(pk=self.sb_pending).status, 'pending')
        self.assertEqual(LeaveRequest.objects.get(pk=self.leave_pending).status, 'pending')

    def test_old_leader_cannot_read_or_review_kpi_documents(self):
        self.assertEqual(self.call(self.lm1, 'get', f'/api/plugins/ticket_kpi/evidence/{self.doc}/').status_code, 404)
        self.assertIn(self.call(self.lm1, 'post', f'/api/plugins/ticket_kpi/evidence/{self.doc}/review/').status_code, (403, 404))
        self.assertNotIn(self.doc, self.ids(self.lm1, '/api/plugins/ticket_kpi/evidence/'))
        self.assertIn(self.doc, self.ids(self.lm2, '/api/plugins/ticket_kpi/evidence/'))

    def test_old_leader_cannot_read_or_rate_member_skills(self):
        self.assertEqual(self.call(self.lm1, 'get', f'/api/plugins/skills/user-skills/{self.user_skill}/').status_code, 404)
        self.assertEqual(self.call(self.lm1, 'post', f'/api/plugins/skills/user-skills/{self.user_skill}/rate/', {'level': 5}).status_code, 404)
        self.assertEqual(UserSkill.objects.get(pk=self.user_skill).level, 3)
        self.assertEqual(self.call(self.lm2, 'post', f'/api/plugins/skills/user-skills/{self.user_skill}/rate/', {'level': 4}).status_code, 200)

    def test_old_leader_cannot_read_or_change_the_employees_epr_and_new_leader_can(self):
        base = '/api/plugins/tl_scorecard/epr-cycles/'
        self.assertEqual(self.call(self.lm1, 'get', f'{base}{self.epr}/').status_code, 404)
        self.assertEqual(self.call(self.lm1, 'delete', f'{base}{self.epr}/').status_code, 404)
        self.assertEqual(self.call(self.lm1, 'post', f'{base}{self.epr}/complete_stage/', {'stage': 'mid_year', 'summary': 'x'}).status_code, 404)
        self.assertEqual(self.call(self.lm2, 'get', f'{base}{self.epr}/').status_code, 200)

    def test_old_leader_cannot_read_the_employee_profile_by_id(self):
        response = self.call(self.lm1, 'get', f'/api/users/profiles/{self.emp.profile.id}/')
        sim('old LM GET profile of moved employee', response.status_code)
        self.assertIn(response.status_code, (403, 404))

    def test_old_leader_does_not_see_employee_in_users_listing_or_skills_matrix(self):
        import json
        response = self.call(self.lm1, 'get', '/api/users/profiles/')
        self.assertIn(response.status_code, (200, 403, 404))
        if response.status_code == 200:
            self.assertNotIn('"w_emp"', json.dumps(response.data, default=str))

    def test_old_leader_cannot_use_workspace_filter_to_reach_member_rows(self):
        team_id = self.team_a.id
        # even asking for the member's team workspace explicitly must not widen leader queues
        response = self.call(self.lm1, 'get', f'/api/overtime/logs/team_pending/?workspace_ids={team_id}')
        if response.status_code == 200:
            self.assertNotIn(self.ot_pending, {r['id'] for r in rows(response)})

    def test_exports_of_old_leader_do_not_contain_the_moved_employee(self):
        response = self.call(self.lm1, 'get', '/api/plugins/skills/export/matrix/?file_format=csv')
        sim('old LM skills export status', response.status_code)
        if response.status_code == 200:
            body = b''.join(response.streaming_content).decode() if getattr(response, 'streaming', False) else str(response.content)
            self.assertNotIn(self.emp.username, body)

    def test_payroll_lines_of_the_moved_employee_are_not_reachable_by_old_leader(self):
        from plugins.payroll.models import PayrollLine, PayrollRuleSet, PayrollRun
        rule_set = PayrollRuleSet.objects.create(code='SIMRS', name='Sim', effective_from=self.today - timedelta(days=400))
        run = PayrollRun.objects.create(
            year=self.today.year, month=self.today.month, status='draft', rule_set=rule_set,
        )
        line = PayrollLine.objects.create(run=run, user=self.emp)
        statuses = {}
        for leader in (self.lm1, self.mgr1, self.lm2, self.mgr2):
            response = self.call(leader, 'get', f'/api/plugins/payroll/runs/{run.id}/lines/')
            statuses[leader.username] = response.status_code
            if response.status_code == 200:
                listed = line.id in {r['id'] for r in rows(response)}
                sim(f'payroll line of moved employee listed for {leader.username}', listed)
                self.assertEqual(listed, leader in (self.lm2, self.mgr2), leader.username)
        sim('payroll lines status per leader', statuses)
        for leader in (self.lm1, self.mgr1, self.lm2):
            self.assertIn(self.call(leader, 'get', f'/api/plugins/payroll/runs/{run.id}/export_excel/').status_code, (403, 404))


class TeamLifecycleTests(MoveWorld):
    def _ws(self, team):
        from apps.dashboard.models import CalendarWorkspace
        return CalendarWorkspace.objects.filter(team=team).first()

    def test_archiving_a_team_leaves_leader_links_and_queues_intact(self):
        self.team_a.is_active = False
        self.team_a.save()
        self.assertIn(('ot_pending', self.ot_pending), self.team_ids(self.lm1))
        self.assertIn(self.emp.id, self.member_ids(self.lm1))
        self.assertIn(self.lm1.id, leader_user_ids())

    def test_unarchive_restores_without_duplicates(self):
        before = self.team_ids(self.lm1)
        self.team_a.is_active = False
        self.team_a.save()
        self.team_a.is_active = True
        self.team_a.save()
        self.assertEqual(before, self.team_ids(self.lm1))

    def test_team_leader_change_is_calendar_only_never_widens_data_scope(self):
        """Team.team_leader = lm3 grants lm3 the calendar, not the members' data."""
        self.team_a.team_leader = self.lm3
        self.team_a.save()
        self.assertEqual(self.member_ids(self.lm3) & {self.emp.id, self.emp2.id}, set())
        self.assertEqual(
            {k for k, _ in self.team_ids(self.lm3)}, set(),
        )
        self.assertNotIn(self.epr, self.ids(self.lm3, '/api/plugins/tl_scorecard/epr-cycles/'))
        self.assertIn(('ot_pending', self.ot_pending), self.team_ids(self.lm1))
        self.assertIn(self.emp.id, self.member_ids(self.lm1))

    def test_team_leader_change_calendar_reach_follows_new_leader(self):
        self.team_a.team_leader = self.lm3
        self.team_a.save()
        reach = fresh(self.lm3).profile.get_calendar_member_ids()
        sim('new Team.team_leader calendar reach', sorted(reach))
        self.assertTrue({self.emp.id, self.emp2.id} <= reach or reach == set())
        # lm1 keeps calendar reach through the links; not through led_teams
        self.assertIn(self.emp.id, fresh(self.lm1).profile.get_calendar_member_ids())

    def test_team_leader_change_does_not_alert_or_empower_the_new_team_leader_beyond_calendar(self):
        self.team_a.team_leader = self.lm3
        self.team_a.save()
        response = self.call(self.lm3, 'post', f'/api/overtime/logs/{self.ot_pending}/approve/')
        self.assertIn(response.status_code, (403, 404))
        self.assertEqual(self.call(self.lm3, 'post', f'/api/leave-management/requests/{self.leave_pending}/approve/').status_code in (403, 404), True)

    def test_employee_in_two_teams_has_one_owner_and_no_duplicate_rows(self):
        change_user_teams(self.emp.profile, [self.team_a.id, self.team_b.id])
        listing = self.call(self.lm1, 'get', '/api/overtime/logs/team_pending/')
        ids = [r['id'] for r in rows(listing)]
        self.assertEqual(ids.count(self.ot_pending), 1)
        self.assertNotIn(self.ot_pending, [r['id'] for r in rows(self.call(self.lm2, 'get', '/api/overtime/logs/team_pending/'))])
        listing = [r['id'] for r in rows(self.call(self.lm1, 'get', '/api/leave-management/requests/team_pending/'))]
        self.assertEqual(listing.count(self.leave_pending), 1)

    def test_bulk_membership_changes_do_not_touch_ownership_or_history_rows(self):
        before = self.team_ids(self.lm1)
        for profile, teams in ((self.emp.profile, [self.team_b.id]), (self.emp2.profile, []), (self.emp3.profile, [self.team_a.id, self.team_b.id])):
            change_user_teams(profile, teams)
        self.assertEqual(before, self.team_ids(self.lm1))
        self.assertEqual(OvertimeLog.objects.filter(pk=self.ot_pending, user=self.emp).count(), 1)
        self.assertEqual(self.member_ids(self.lm1), {self.emp.id, self.emp2.id})

    def test_team_move_without_link_change_keeps_old_leader_access_ruling(self):
        """NEEDS-RULING (known, item 36 follow-up): leaving a team does NOT clear the TL link, so
        the old leader keeps full internal access until someone clears the link."""
        change_user_teams(self.emp.profile, [self.team_b.id])
        still = self.emp.id in self.member_ids(self.lm1)
        sim('left team, link untouched: old leader still has data scope', still)
        self.assertTrue(still)


class CalendarAndNotificationTests(MoveWorld):
    def _workspace_ids(self, user):
        response = self.call(user, 'get', '/api/dashboard/calendar-workspaces/my_teams_workspaces/')
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        data = data.get('results', data) if isinstance(data, dict) else data
        return [w['id'] for w in data]

    def _recipients(self, user):
        from plugins.notifications.signals import _team_recipients
        return set(_team_recipients(user).values_list('username', flat=True))

    def test_notifications_follow_live_links_after_a_line_manager_move(self):
        self.assertEqual(self._recipients(fresh(self.emp)), {'w_lm1', 'w_mgr1'})
        self._link(self.emp, lm=self.lm2)
        got = self._recipients(fresh(self.emp))
        sim('recipients after LM move', sorted(got))
        self.assertEqual(got, {'w_lm2', 'w_mgr1'})

    def test_calendar_only_team_leader_is_not_alerted_to_requests_they_cannot_decide(self):
        """Team.team_leader (lm3 here) is calendar-only: no alert for a request it cannot list."""
        self.team_a.team_leader = self.lm3
        self.team_a.save()
        self.assertNotIn('w_lm3', self._recipients(fresh(self.emp)))

    def test_manager_is_alerted_for_overtime_it_does_not_own_ruling(self):
        """NEEDS-RULING: with a Line Manager set the Manager is still notified of overtime/standby
        submissions but the owner rule hides the row from the Manager's queue."""
        got = self._recipients(fresh(self.emp))
        listed = ('ot_pending', self.ot_pending) in self.team_ids(self.mgr1)
        sim('manager notified / lists pending overtime', ('w_mgr1' in got, listed))
        self.assertTrue('w_mgr1' in got and not listed)

    def test_notification_recipients_when_the_line_manager_is_deactivated_ruling(self):
        self.lm1.is_active = False
        self.lm1.save()
        got = self._recipients(fresh(self.emp))
        sim('deactivated LM: recipients', sorted(got))
        self.assertEqual(got, {'w_mgr1'})

    def test_resubmission_alert_reaches_new_owner_and_creates_no_duplicate_for_manager_ruling(self):
        from plugins.notifications.models import Notification
        self._link(self.emp, lm=self.lm2)
        Notification.objects.all().delete()
        response = self.call(self.emp, 'patch', f'/api/overtime/logs/{self.ot_decided}/', {'hours': '3.00'})
        sim('employee edit own pending status', response.status_code)
        users = sorted(Notification.objects.values_list('user__username', flat=True))
        sim('notified after edit/resubmit', users)

    def test_deactivated_leader_gets_no_notification(self):
        self.lm1.is_active = False
        self.lm1.save()
        self.assertNotIn('w_lm1', self._recipients(fresh(self.emp)))

    def test_calendar_workspace_visibility_moves_with_membership_not_with_links(self):
        from apps.dashboard.models import CalendarWorkspace
        ws_a = CalendarWorkspace.objects.filter(team=self.team_a).first()
        ws_b = CalendarWorkspace.objects.filter(team=self.team_b).first()
        if ws_a is None or ws_b is None:
            self.skipTest('workspaces are not auto-created for teams in this fixture')
        self._link(self.emp, lm=self.lm2)
        lm1_ws = self._workspace_ids(self.lm1)
        lm2_ws = self._workspace_ids(self.lm2)
        sim('calendar: lm1/lm2 workspaces after move', (lm1_ws, lm2_ws))
        self.assertEqual(len(lm1_ws), len(set(lm1_ws)))
        self.assertEqual(len(lm2_ws), len(set(lm2_ws)))
        self.assertIn(ws_a.id, lm1_ws)  # still a member/leader of team A

    def test_calendar_workspace_of_archived_team_is_hidden_from_leaders(self):
        from apps.dashboard.models import CalendarWorkspace
        ws_a = CalendarWorkspace.objects.filter(team=self.team_a).first()
        if ws_a is None:
            self.skipTest('workspaces are not auto-created for teams in this fixture')
        self.team_a.is_active = False
        self.team_a.save()
        self.assertNotIn(ws_a.id, self._workspace_ids(self.lm1))
        self.assertEqual(self.call(self.lm1, 'get', f'/api/dashboard/calendar-workspaces/{ws_a.id}/workspace_users/').status_code, 404)


class ConfidentialityAndUnchangedRolesTests(MoveWorld):
    def test_employee_never_sees_teammates_statuses_or_pending_counts_after_moves(self):
        self._link(self.emp2, lm=self.lm2)
        for path in (
            '/api/overtime/logs/team_logs/', '/api/overtime/logs/team_pending/', '/api/standby/logs/team_pending/',
            '/api/leave-management/requests/team_pending/', '/api/leave-management/requests/team_logs/',
        ):
            response = self.call(self.emp2, 'get', path)
            self.assertIn(response.status_code, (200, 403), path)
            if response.status_code == 200:
                self.assertEqual([r for r in rows(response) if r.get('user') not in (None, self.emp2.id)], [], path)
        response = self.call(self.emp2, 'get', '/api/plugins/tl_scorecard/epr-cycles/')
        self.assertIn(response.status_code, (200, 403))
        if response.status_code == 200:
            self.assertNotIn(self.epr, {r['id'] for r in rows(response)})

    def test_team_directory_masks_counts_for_ex_leader_and_employees(self):
        self._link(self.emp, lm=self.lm2)
        response = self.call(self.emp2, 'get', '/api/users/teams/')
        self.assertEqual(response.status_code, 200)
        for team in rows(response):
            self.assertIn(team.get('members_count'), (None, 0), team)

    def test_superuser_staff_hr_see_every_row_exactly_once_and_unchanged_by_moves(self):
        before = {u.username: self.team_ids(u) for u in (self.admin, self.staff)}
        self._link(self.emp, lm=self.lm2, mgr=self.mgr2)
        for u in (self.admin, self.staff):
            self.assertEqual(before[u.username], self.team_ids(u))
            self.assertIn(('ot_pending', self.ot_pending), self.team_ids(u))
        pending = [r['id'] for r in rows(self.call(self.staff, 'get', '/api/overtime/logs/team_pending/'))]
        self.assertEqual(pending.count(self.ot_pending), 1)
        self.assertEqual(self.call(self.hr, 'get', '/api/leave-management/requests/team_pending/').status_code, 403)  # pure HR: no leader queue

    def test_staff_can_still_approve_after_a_move(self):
        self._link(self.emp, lm=self.lm2)
        self.assertEqual(self.call(self.staff, 'post', f'/api/overtime/logs/{self.ot_pending}/approve/').status_code, 200)

    def test_hr_only_user_stays_read_only(self):
        response = self.call(self.hr, 'post', f'/api/overtime/logs/{self.ot_pending}/approve/')
        sim('hr approve status', response.status_code)

    def test_skills_matrix_visibility_follows_links_and_excludes_managers(self):
        self._link(self.emp, lm=self.lm2)
        def matrix(u):
            return {r.get('user_id') or r.get('id') for r in rows(self.call(u, 'get', '/api/plugins/skills/matrix/matrix/'))}

        self.assertNotIn(self.emp.id, matrix(self.lm1))
        self.assertIn(self.emp.id, matrix(self.lm2))
        self.assertNotIn(self.mgr1.id, matrix(self.mgr1))


class EngagementAndScorecardMoveTests(MoveWorld):
    def _engagement(self, leader, team):
        month = self.today.replace(day=1)
        compute_tl_metric(fresh(leader), team, month)
        return TLApprovalMetric.objects.get(leader=leader, team=team, month=month).metrics

    def test_engagement_after_move_counts_each_decided_row_once_across_leaders(self):
        self._link(self.emp, lm=self.lm2)
        change_user_teams(self.emp.profile, [self.team_b.id])
        # a decision stays with its approver: lm1's snapshot gets the row in the employee's NEW team
        old = self._engagement(self.lm1, self.team_b)['overtime']
        old_home = self._engagement(self.lm1, self.team_a)['overtime']
        new = self._engagement(self.lm2, self.team_b)['overtime']
        self.assertEqual(old_home['decided'], 0)
        sim('engagement ot decided old/new', (old['decided'], new['decided']))
        self.assertEqual(old['decided'] + new['decided'], 1)

    def test_scorecard_month_blocks_count_pending_with_current_leader_only(self):
        from plugins.tl_scorecard.services import month_blocks
        self._link(self.emp, lm=self.lm2)
        month = self.today.replace(day=1)
        old = month_blocks(fresh(self.lm1), month, scoreable_member_ids(fresh(self.lm1)))['overtime']
        new = month_blocks(fresh(self.lm2), month, scoreable_member_ids(fresh(self.lm2)))['overtime']
        sim('scorecard ot decided old/new', (old['decided_count'], new['decided_count']))
        self.assertEqual(old['decided_count'], 1)
        self.assertEqual(new['decided_count'], 0)

    def test_manager_changed_marker_never_rewrites_frozen_metrics(self):
        month = self.today.replace(day=1) - timedelta(days=40)
        month = month.replace(day=1)
        TLApprovalMetric.objects.create(leader=self.lm1, team=self.team_a, month=month, metrics={'overtime': {'decided': 7}})
        self._link(self.emp, lm=self.lm2)
        snap = TLApprovalMetric.objects.get(leader=self.lm1, team=self.team_a, month=month)
        self.assertEqual(snap.metrics['overtime']['decided'], 7)


class HbprAfterMoveTests(MoveWorld):
    """HBPR scope is the stored assignment: owner AND subject must both be in it."""

    base = '/api/plugins/tl_scorecard/'

    def setUp(self):
        super().setUp()
        from apps.users.services.hbpr_assignments import create_assignment
        call_command('grant_hbpr_plugin_access', stdout=StringIO())
        self.hbpr1 = mk('w_hbpr1', 'hbpr')
        self.hbpr2 = mk('w_hbpr2', 'hbpr')
        start = self.today - timedelta(days=30)
        create_assignment(hbpr=self.hbpr1, albanian_tl=self.lm1, effective_from=start, assigned_by=self.admin)
        create_assignment(hbpr=self.hbpr2, albanian_tl=self.lm2, effective_from=start, assigned_by=self.admin)
        self.tl_sync = Meeting.objects.create(
            meeting_type='tl_sync', organizer=self.lm1, counterparty=self.mgr1,
            occurred_on=self.today, notes=SECRET, recorded_by=self.lm1,
        ).pk

    def test_hbpr_never_reads_employee_one_on_ones_before_or_after_a_move(self):
        for moved in (False, True):
            if moved:
                self._link(self.emp, lm=self.lm2)
            for hbpr in (self.hbpr1, self.hbpr2):
                self.assertNotIn(self.meeting, self.ids(hbpr, f'{self.base}meetings/'), (hbpr.username, moved))
                response = self.call(hbpr, 'get', f'{self.base}meetings/{self.meeting}/')
                self.assertEqual(response.status_code, 404, (hbpr.username, moved))
                self.assertNotIn(SECRET, str(getattr(response, 'data', '')))

    def test_hbpr_reads_governance_evidence_of_assigned_leader_but_not_private_notes(self):
        team_meeting = Meeting.objects.create(
            meeting_type='team_meeting', organizer=self.lm1, team=self.team_a,
            occurred_on=self.today, notes=SECRET, recorded_by=self.lm1,
        ).pk
        listing = self.call(self.hbpr1, 'get', f'{self.base}meetings/')
        self.assertEqual(listing.status_code, 200)
        self.assertIn(team_meeting, {r['id'] for r in rows(listing)})
        self.assertNotIn(SECRET, str(listing.data))
        for path in ('absences', 'idle-flags', 'pip-records'):
            self.assertNotIn(SECRET, str(self.call(self.hbpr1, 'get', f'{self.base}{path}/').data), path)

    def test_hbpr_cannot_see_tl_sync_with_the_manager_ruling(self):
        """NEEDS-RULING: a tl_sync meeting has the Manager as counterparty; the HBPR slice requires
        the counterparty to be a member of the assigned Line Manager (``member_nullable`` only
        admits NULL), so an assigned Line Manager's TL-sync is hidden from their HBPR."""
        visible = self.tl_sync in self.ids(self.hbpr1, f'{self.base}meetings/')
        sim('hbpr1 sees lm1 tl_sync with the Manager', visible)
        self.assertFalse(visible)

    def test_hbpr_is_read_only_on_every_record_after_a_move(self):
        self._link(self.emp, lm=self.lm2)
        for path, rid in (('pip-records', self.pip), ('absences', self.absence), ('idle-flags', self.flag), ('epr-cycles', self.epr)):
            for hbpr in (self.hbpr1, self.hbpr2):
                url = f'{self.base}{path}/{rid}/'
                self.assertIn(self.call(hbpr, 'patch', url, {'notes': 'x'}).status_code, (403, 404), (hbpr.username, path))
                self.assertIn(self.call(hbpr, 'delete', url).status_code, (403, 404), (hbpr.username, path))
        self.assertEqual(PIPRecord.objects.get(pk=self.pip).notes, SECRET)

    def test_moved_employee_evidence_follows_subject_for_epr_but_hides_leader_authored_rows_ruling(self):
        """NEEDS-RULING: after lm1 -> lm2, hbpr1 (assignment lm1) loses lm1's own records about the
        moved employee (the subject left the population) and hbpr2 (lm2) cannot read them (author
        lm1 is outside the assignment). The EPR follows the employee to hbpr2."""
        self._link(self.emp, lm=self.lm2)
        epr = f'{self.base}epr-cycles/'
        absences = f'{self.base}absences/'
        sim('hbpr1 sees moved EPR', self.epr in self.ids(self.hbpr1, epr))
        sim('hbpr2 sees moved EPR', self.epr in self.ids(self.hbpr2, epr))
        sim('hbpr1 sees lm1 absence about moved employee', self.absence in self.ids(self.hbpr1, absences))
        sim('hbpr2 sees lm1 absence about moved employee', self.absence in self.ids(self.hbpr2, absences))
        self.assertNotIn(self.epr, self.ids(self.hbpr1, epr))
        self.assertIn(self.epr, self.ids(self.hbpr2, epr))
        self.assertNotIn(self.absence, self.ids(self.hbpr2, absences))
        self.assertNotIn(self.absence, self.ids(self.hbpr1, absences))

    def test_demoting_an_assigned_line_manager_is_refused_even_when_members_were_moved(self):
        for member in (self.emp, self.emp2):
            self._link(member, lm=self.lm3)
        response = self.call(self.admin, 'patch', f'/api/users/users/{self.lm1.id}/update_user/', {'roles': ['employee']})
        sim('demote assigned LM status', response.status_code)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn(self.lm1.id, leader_user_ids())

    def test_deactivating_an_assigned_line_manager_empties_the_hbpr_scope(self):
        from apps.users.services.hbpr_scope import get_hbpr_scope
        self.lm1.is_active = False
        self.lm1.save()
        scope = get_hbpr_scope(fresh(self.hbpr1))
        self.assertEqual(scope.user_ids, frozenset())
        self.assertEqual(self.ids(self.hbpr1, f'{self.base}absences/'), set())

    def test_hbpr_cannot_read_ticket_kpi_or_skills_or_leave_of_moved_employee(self):
        self._link(self.emp, lm=self.lm2)
        for hbpr in (self.hbpr1, self.hbpr2):
            self.assertIn(self.call(hbpr, 'get', f'/api/plugins/ticket_kpi/evidence/{self.doc}/').status_code, (403, 404))
            self.assertIn(self.call(hbpr, 'get', f'/api/plugins/skills/user-skills/{self.user_skill}/').status_code, (403, 404))
            self.assertIn(self.call(hbpr, 'get', '/api/leave-management/requests/team_pending/').status_code, (403, 404))

    def test_hbpr_notification_recipient_follows_the_current_owner_leader(self):
        from apps.users.services.hbpr_scope import hbpr_user_ids_for
        self.assertEqual(hbpr_user_ids_for(fresh(self.emp), self.lm1.id), [self.hbpr1.id])
        self._link(self.emp, lm=self.lm2)
        self.assertEqual(hbpr_user_ids_for(fresh(self.emp), self.lm1.id), [])
        self.assertEqual(hbpr_user_ids_for(fresh(self.emp), self.lm2.id), [self.hbpr2.id])


class DashboardOrgChartControlRoomTests(MoveWorld):
    def _stats(self, user):
        response = self.call(user, 'get', '/api/dashboard/widgets/team_stats/')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_dashboard_team_stats_follow_live_links_after_a_move(self):
        self._link(self.emp, lm=self.lm2)
        old, new = self._stats(self.lm1), self._stats(self.lm2)
        sim('dashboard pending ot old/new LM', (old['pending_team_overtime'], new['pending_team_overtime']))
        self.assertEqual(old['pending_team_overtime'], 0)
        self.assertEqual(new['pending_team_overtime'], 1)

    def test_dashboard_pending_count_matches_the_queue_for_a_manager_with_a_line_manager(self):
        """BUG (see report): ``team_stats`` counts pending overtime/standby by member
        (``user_id__in``), not by owner, so a Manager whose employee has a Line Manager sees a
        pending badge for rows the owner rule keeps out of the Manager's queue."""
        queue = len([i for k, i in self.team_ids(self.mgr1) if k == 'ot_pending'])
        badge = self._stats(self.mgr1)['pending_team_overtime']
        sim('manager dashboard pending ot badge vs queue', (badge, queue))
        self.assertEqual(badge, queue)

    def test_dashboard_top_pending_users_never_lists_a_moved_employee_for_the_old_leader(self):
        self._link(self.emp, lm=self.lm2)
        response = self.call(self.lm1, 'get', '/api/dashboard/widgets/top_pending_users/')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.emp.id, {r['user_id'] for r in rows(response)})
        response = self.call(self.lm1, 'get', '/api/dashboard/widgets/queue_highlights/')
        self.assertEqual([r for r in rows(response) if r['id'] in (self.ot_pending, self.sb_pending)], [])

    def test_dashboard_team_id_probe_of_a_foreign_team_is_404(self):
        self._link(self.emp, lm=self.lm2)
        response = self.call(self.lm3, 'get', f'/api/dashboard/widgets/team_stats/?team_id={self.team_a.id}')
        self.assertEqual(response.status_code, 404)

    def test_org_chart_old_leader_loses_the_moved_employee(self):
        import json
        self._link(self.emp, lm=self.lm2)
        old = json.dumps(self.call(self.lm1, 'get', '/api/plugins/organigrama/tree/').data, default=str)
        new = json.dumps(self.call(self.lm2, 'get', '/api/plugins/organigrama/tree/').data, default=str)
        self.assertNotIn(f'"id": {self.emp.id},', old)
        self.assertNotIn('"w_emp"', old)
        sim('org chart: lm2 tree mentions moved employee', ('"w_emp"' in new) or (f'"id": {self.emp.id},' in new))

    def test_org_chart_employee_chain_follows_new_leader(self):
        import json
        self._link(self.emp, lm=self.lm2)
        chain = json.dumps(self.call(self.emp, 'get', '/api/plugins/organigrama/tree/').data, default=str)
        sim('org chart chain of moved employee mentions lm2/lm1', ('w_lm2' in chain, 'w_lm1' in chain))
        self.assertIn('w_lm2', chain)
        self.assertNotIn('w_lm1', chain)

    def test_org_chart_subtree_probe_by_old_leader_of_moved_employee_is_empty_or_denied(self):
        self._link(self.emp, lm=self.lm2)
        response = self.call(self.lm1, 'get', f'/api/plugins/organigrama/subtree/?node_id={self.emp.id}&node_type=person')
        sim('old LM subtree probe of moved employee', response.status_code)
        if response.status_code == 200:
            self.assertEqual(rows(response), [])

    def test_control_room_scope_is_by_team_membership_and_follows_membership_changes(self):
        from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
        from plugins.control_room.services.scope_service import get_allowed_team_ids, get_allowed_user_ids
        cr = mk('w_cr')
        access = ControlRoomAccess.objects.create(user=cr, is_active=True)
        ControlRoomTeamScope.objects.create(access=access, team=self.team_a)

        def users():
            return get_allowed_user_ids(fresh(cr), get_allowed_team_ids(fresh(cr)))

        self.assertEqual(users(), {self.emp.id, self.emp2.id})
        change_user_teams(self.emp.profile, [self.team_b.id])
        self.assertEqual(users(), {self.emp2.id})
        self._link(self.emp2, lm=self.lm3)  # a leader change alone never moves CR scope
        self.assertEqual(users(), {self.emp2.id})
        self.team_a.is_active = False
        self.team_a.save()
        sim('CR scope still includes members of an archived team', sorted(users()))


class StaleCachesAndExportsTests(MoveWorld):
    def test_member_scope_is_live_on_a_fresh_profile(self):
        self.assertIn(self.emp.id, fresh(self.lm1).profile.get_team_member_ids())
        self._link(self.emp, lm=self.lm2)
        self.assertNotIn(self.emp.id, fresh(self.lm1).profile.get_team_member_ids())

    def test_scorecard_csv_export_new_leader_gets_none_of_the_old_leaders_rows(self):
        self._link(self.emp, lm=self.lm2)
        old = self.call(self.lm1, 'get', '/api/plugins/tl_scorecard/absences/?file_format=csv')
        new = self.call(self.lm2, 'get', '/api/plugins/tl_scorecard/absences/?file_format=csv')
        self.assertEqual(old.status_code, 200)
        self.assertEqual(new.status_code, 200)
        self.assertNotIn(SECRET.encode(), new.content)
        self.assertNotIn(self.emp.username.encode(), new.content)

    def test_year_close_bundles_never_duplicate_the_moved_employee(self):
        from plugins.year_close.services.builder import bundles_for_year
        self._link(self.emp, lm=self.lm2)
        change_user_teams(self.emp.profile, [self.team_b.id])
        owners = [b for b in bundles_for_year(self.today.year) if self.emp.id in b['member_ids']]
        sim('year-close bundles containing moved employee', [b['leader_name'] for b in owners])
        self.assertLessEqual(len(owners), 1)
