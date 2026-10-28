"""Row-ownership matrix (SR-07): walk every GET API route as each scoped role.

Past leaks (SEC-02/05/06/07) were all "new endpoint, forgot scoping". Instead of
reading every viewset, this walks the URL resolver, GETs every list-like route as
an employee, a team leader, an HBPR and a Control Room user, collects the owner
ids found in the rows and asserts each id is inside that role's allowed set.
HR, staff and superuser are company-wide by design and are not asserted.

A route whose rows carry no owner key must be listed in ``REFERENCE_ROUTES`` (or
``NOT_POPULATED_ROUTES``) with a justification, and a route intentionally wider
than the rule goes in ``WIDENED_ROUTES`` with the invariant that sanctions it, so
a new endpoint forces a decision.
"""
import importlib
import json
import re
from collections import namedtuple
from urllib.parse import urlsplit
from datetime import timedelta

from django.apps import apps as django_apps
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import Resolver404, URLResolver, clear_url_caches, get_resolver, path, resolve
from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.test import APIClient

from apps.dashboard.models.calendar import CalendarWorkspace
from apps.leave_management.models import LeaveBalance, LeaveRequest
from apps.overtime.models import Client, OvertimeLog
from apps.permissions.models import Role
from apps.permissions.services.role_service import assign_role
from apps.plugins.models import Plugin
from apps.reports.models import GeneratedReport
from apps.standby.models import StandbyLog
from apps.users.models import Team, TeamMembership, UserProfile
from apps.users.models.hbpr import HbprAlbanianTlAssignment
from apps.users.services.hbpr_scope import get_hbpr_scope
from core.utils.timezone_local import business_today
from plugins.notifications.models import Notification
from plugins.payroll.models import WageAssignment
from plugins.skills.models import Skill, SkillCategory, UserSkill
from plugins.tl_scorecard.models import (
    Absence, EngagementSurveyResponse, EPRCycle, EPRGoal, EPRStageRecord,
    HbprGovernanceEvidence, IdleFlag, IdleStatusUpdate, Meeting, MeetingAttendee,
    PIPRecord, PromotionFlag, ReviewDelivery)
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.services import scope_service

Route = namedtuple('Route', 'url cls')

# Keys that hold a user (id, nested {id} or username).
OWNER_KEYS = {
    'user', 'user_id', 'employee', 'employee_id', 'owner', 'owner_id',
    'team_leader', 'team_leader_id', 'leader', 'leader_id', 'organizer', 'organizer_id',
    'generated_by', 'generated_by_id', 'respondent', 'tl', 'tl_id', 'recorded_by',
    'flagged_by', 'nominated_by', 'albanian_tl', 'italian_tl', 'hbpr', 'created_by',
    'approved_by',
}
# Keys that name someone's team leader: an employee may see their own leader there.
LEADER_KEYS = {
    'team_leader', 'team_leader_id', 'leader', 'leader_id', 'albanian_tl', 'italian_tl',
    'tl', 'tl_id',
}
# Routes that expose the employee's own leader (profile, org chart), also by name.
OWN_LEADER_ROUTES = {
    '/api/users/profiles/', '/api/plugins/organigrama/tree/',
    '/api/plugins/organigrama/subtree/',
}
# Child rows that point at a parent whose owner is looked up.
PARENT_KEYS = {'cycle', 'flag'}
# Routes never walked: schema/docs and the unauthenticated token endpoints.
SKIPPED_PREFIXES = ('/api/schema/', '/api/docs/', '/api/redoc/', '/api/auth/')
# Nested team objects describe a team (reference data), not a row owner.
NESTED_REFERENCE_KEYS = {'team', 'teams', 'teams_detail', 'primary_team', 'led_teams'}
# Routes whose row ``id`` is itself a user id.
ID_IS_USER_ROUTES = {'/api/users/users/', '/api/users/users/me/'}

# Rows with no owner key: shared reference data, justified one by one.
REFERENCE_ROUTES = {
    '/api/users/teams/': (
        'names and TLs readable by all; counts masked for non-staff/HR/non-own-TL '
        '(apps/users/tests_app/test_team_directory_counts.py); member lists are scoped '
        'separately (SEC-06 test_child_list_scope)'),
    '/api/users/teams/root_teams/': 'same team directory (names and TLs; counts masked), filtered to root teams',
    '/api/users/teams/list_for_reports/': (
        'same team directory: names readable by all, counts masked for non-staff/HR/non-own-TL '
        '(apps/users/tests_app/test_child_list_scope.py::'
        'test_list_for_reports_exposes_no_more_than_the_team_list_already_does)'),
}
_SHARED = 'shared reference or configuration data, no per-user rows'
for _url in (
    '/api/dashboard/branding/', '/api/dashboard/branding/current/',
    '/api/dashboard/maintenance/',
    '/api/dashboard/holidays/', '/api/dashboard/widgets/',
    '/api/dashboard/calendar-workspaces/',
    '/api/dashboard/calendar-workspaces/list_for_reports/',
    '/api/dashboard/calendar-workspaces/my_teams_workspaces/',
    '/api/dashboard/calendar-workspaces/my_workspaces/',
    '/api/leave-management/settings/', '/api/overtime/clients/',
    '/api/overtime/clients/available/', '/api/standby/patterns/',
    '/api/users/techs/', '/api/users/tech-levels/', '/api/users/profiles/tech_facets/',
    '/api/users/teams/calendar_group_stats/', '/api/users/teams/calendar_groups/',
    '/api/plugins/ticket_kpi/profiles/', '/api/plugins/skills/categories/',
    '/api/plugins/skills/skills/', '/api/plugins/skills/level-labels/',
    '/api/plugins/management/active_metadata/', '/api/reports/templates/',
    '/api/plugins/notifications/notifications/vapid-public-key/',
    '/api/plugins/organigrama/charts/visible/',
):
    REFERENCE_ROUTES[_url] = _SHARED + (
        ' (workspace objects: the team-B marker scan proves no foreign calendar is named)'
        if 'calendar-workspaces' in _url else '')
# Intentionally wider than the owner rule, with the invariant that sanctions it.
WIDENED_ROUTES = {
    '/api/users/users/albanian_team_leaders/': (
        "a team leader's name is not confidential (register S-4 / M-2 ruling); the list is "
        'for staff, HR and TLs only (employees, HBPR-only and CR-only get 403); staff and HR '
        'get member counts, TLs names only. Employees learn TL names from the org chart and '
        '/users/teams/'),
    '/api/users/users/italian_team_leaders/': 'same TL name list (register M-2)',
    '/api/users/users/eligible_for_control_room/': (
        'CR admin picker returns minimum identity data by design; '
        'plugins/control_room/test_cr_admin_role.py and the action docstring'),
    '/api/plugins/tl_scorecard/partnership/': (
        'the AL TL sees the name of their own HBPR partner: '
        'docs/hbpr-and-scorecard.md (Evidence tab, HBPR partnership section)'),
    '/api/plugins/tl_scorecard/hbpr-evidence/year-end-pack/': (
        'the AL TL hands the pack, which names the HBPR partner, to their manager: '
        'docs/hbpr-and-scorecard.md (Year-end evidence pack)'),
    '/api/plugins/tl_scorecard/hbpr-evidence/': (
        'evidence is authored by the AL TL about their own HBPR partnership, so rows '
        'name the partner: docs/hbpr-and-scorecard.md (partnership log)'),
}
# Reference routes whose design is company-wide: exempt from the owner / team-B scan.
COMPANY_WIDE_REFERENCE = {
    '/api/users/teams/': 'the team directory lists every team and leader by name; counts are masked',
    '/api/users/teams/root_teams/': 'the team directory lists every team and leader by name; counts are masked',
    '/api/users/teams/list_for_reports/': 'the team directory lists every team and leader by name; counts are masked',
}
# Per-role exemptions of WIDENED_ROUTES: world attributes whose rows that role may
# read there. '*' means every user, 'team_b' that the response may name team B. Anything else still fails.
WIDENED_EXTRA = {
    '/api/users/users/albanian_team_leaders/': {'TL_A': ('tl_b',)},
    '/api/users/users/italian_team_leaders/': {'TL_A': ('tl_b',)},
    '/api/users/users/eligible_for_control_room/': {
        'CR': ('*', 'team_b')},
    '/api/plugins/tl_scorecard/partnership/': {'TL_A': ('hbpr',)},
    '/api/plugins/tl_scorecard/hbpr-evidence/year-end-pack/': {'TL_A': ('hbpr',)},
    '/api/plugins/tl_scorecard/hbpr-evidence/': {'TL_A': ('hbpr',)},
}
# Aggregates, exports and per-viewer payloads with no owner key or name: the walker
# cannot prove their scope, which the owning app's own tests cover.
AGGREGATE_ROUTES = {}
for _url in (
    '/api/dashboard/preferences/', '/api/plugins/management/user_permissions/',
    '/api/plugins/notifications/notifications/preferences/',
    '/api/plugins/notifications/notifications/subscriptions/',
    '/api/plugins/notifications/notifications/unread_count/',
    '/api/plugins/tl_scorecard/my-records/', '/api/overtime/logs/preview/',
):
    AGGREGATE_ROUTES[_url] = (
        "the viewer's own settings or records, queried by request.user, no owner key")
for _url in (
    '/api/dashboard/widgets/team_stats/', '/api/dashboard/widgets/pending_trend/',
    '/api/dashboard/widgets/monthly_comparison/',
):
    AGGREGATE_ROUTES[_url] = (
        'TL/HR/staff only (employees get 403, register M-1); team counts without owner keys, '
        'scope proven by apps/dashboard/tests/test_widget_team_scope.py')
for _url in (
    '/api/leave-management/requests/team_pending_months/',
    '/api/overtime/logs/summary/', '/api/overtime/logs/team_pending_months/',
    '/api/standby/logs/summary/', '/api/standby/logs/team_pending_months/',
    '/api/users/approval-periods/status/', '/api/users/users/stats/',
    '/api/plugins/control_room/dashboard/summary/',
    '/api/plugins/control_room/dashboard/trend/',
    '/api/plugins/skills/gap-report/gaps/', '/api/plugins/skills/matrix/coverage/',
    '/api/plugins/skills/export/export-xlsx/', '/api/overtime/logs/export/',
    '/api/standby/logs/export/', '/api/reports/summary/', '/api/reports/insights/',
    '/api/reports/top-team-leaders/', '/api/reports/export-excel/',
    '/api/reports/export-leave/', '/api/reports/export-ot-standby/',
    '/api/plugins/engagement/metrics/export/', '/api/plugins/ticket_kpi/reports/export_excel/',
    '/api/plugins/tl_scorecard/engagement-survey-responses/team-average/',
    '/api/plugins/tl_scorecard/epr-progress/', '/api/plugins/tl_scorecard/escalations/',
    '/api/plugins/tl_scorecard/export/', '/api/plugins/tl_scorecard/scorecard/',
    '/api/plugins/tl_scorecard/trend/', '/api/plugins/tl_scorecard/hbpr/records_summary/',
):
    AGGREGATE_ROUTES[_url] = (
        'aggregate, count or binary export without owner key or names; its scope is '
        'enforced in the queryset and is not provable by this walker')
# Row models too costly to populate in this world; the walker still checks the route
# returns no foreign owner ids.
NOT_POPULATED_ROUTES = {}
for _url in (
    '/api/plugins/onboarding/clients/', '/api/plugins/onboarding/documents/',
    '/api/plugins/onboarding/folders/', '/api/plugins/onboarding/folders/search/',
    '/api/plugins/ticket_kpi/evidence/', '/api/plugins/ticket_kpi/links/',
    '/api/plugins/ticket_kpi/links/overtime_links/',
    '/api/plugins/ticket_kpi/links/search_tickets/',
    '/api/plugins/ticket_kpi/upload/my_batches/', '/api/plugins/ticket_kpi/upload/team_batches/',
    '/api/plugins/ticket_kpi/dashboard/categories/', '/api/plugins/ticket_kpi/dashboard/tickets/',
    '/api/plugins/ticket_kpi/dashboard/trend/', '/api/plugins/ticket_kpi/dashboard/team_trend/',
    '/api/plugins/engagement/metrics/status/', '/api/plugins/engagement/metrics/summary/',
    '/api/plugins/engagement/metrics/trend/',
    '/api/reports/audit-logs/', '/api/reports/audit-logs/export/', '/api/reports/audit-logs/stats/',
    '/api/users/users/italian_team_members/',
):
    NOT_POPULATED_ROUTES[_url] = (
        'row model not populated in this world (file uploads, tickets, audit trail)')


def walk_routes():
    """Every GET-capable, parameterless route under /api/ (core + plugins)."""
    found = {}

    def recurse(patterns, prefix):
        for pattern in patterns:
            full = prefix + str(pattern.pattern)
            if isinstance(pattern, URLResolver):
                recurse(pattern.url_patterns, full)
                continue
            cls = getattr(pattern.callback, 'cls', None)
            if cls is None or '(?P' in full or '<' in full:
                continue
            actions = getattr(pattern.callback, 'actions', None)
            if actions is not None:
                if 'get' not in actions or pattern.name == 'api-root':
                    continue
            elif not hasattr(cls, 'get') or pattern.name == 'api-root':
                continue
            url = '/' + re.sub(r'[\^$]', '', full)
            if url.startswith('/api/') and not url.startswith(SKIPPED_PREFIXES):
                found[url] = Route(url, cls)

    recurse(get_resolver().url_patterns, '')
    return sorted(found.values())


def _parent_owner(key, value):
    """Owner of the parent a child row points at (``cycle`` -> EPR user, ...)."""
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    if key == 'cycle':
        return EPRCycle.objects.filter(pk=value).values_list('user_id', flat=True).first()
    if key == 'flag':
        return IdleFlag.objects.filter(pk=value).values_list('employee_id', flat=True).first()
    return None


def _user_id(value, usernames):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, dict):
        return _user_id(value.get('id'), usernames)
    if isinstance(value, str):
        return usernames.get(value)
    return None


def _merge(into, other):
    for owner, occurrences in other.items():
        into.setdefault(owner, []).extend(occurrences)


def collect_owner_hits(payload, usernames, path='$'):
    """``{owner id: [(json path, key), ...]}`` for every owner found in a payload."""
    hits = {}
    if isinstance(payload, list):
        for index, item in enumerate(payload):
            _merge(hits, collect_owner_hits(item, usernames, f'{path}[{index}]'))
    elif isinstance(payload, dict):
        for key, value in payload.items():
            if key in PARENT_KEYS:
                owner = _parent_owner(key, value)
                if owner is not None:
                    hits.setdefault(owner, []).append((f'{path}.{key} (parent owner)', key))
            if key in OWNER_KEYS:
                owner = _user_id(value, usernames)
                if owner is not None:
                    hits.setdefault(owner, []).append((f'{path}.{key}', key))
            if isinstance(value, (dict, list)) and key not in NESTED_REFERENCE_KEYS:
                _merge(hits, collect_owner_hits(value, usernames, f'{path}.{key}'))
    return hits


def rows_of(payload):
    """The row dicts of a list payload, paginated or not."""
    if isinstance(payload, dict) and isinstance(payload.get('results'), list):
        payload = payload['results']
    if isinstance(payload, dict):
        return [payload]
    return [row for row in payload if isinstance(row, dict)] if isinstance(payload, list) else []


def owner_hits(url, payload, text, usernames):
    """Owner ids of a route's payload; for identity routes a row's own ``id``.

    The body text is also scanned for any user's username (full names in the
    fixtures embed it), which covers exports and aggregates with no owner key."""
    hits = collect_owner_hits(payload, usernames)
    for username, user_id in usernames.items():
        if re.search(r'\b' + re.escape(username) + r'\b', text):
            hits.setdefault(user_id, []).append(('body text', None))
    if re.search(r'Matrix B|MXB', text):
        hits.setdefault(FOREIGN_TEAM, []).append(('body text names team B', None))
    if url in ID_IS_USER_ROUTES:
        for index, row in enumerate(rows_of(payload)):
            if isinstance(row.get('id'), int):
                hits.setdefault(row['id'], []).append((f'$[{index}].id', 'id'))
    return hits


def route_variants(cls, url):
    """Query-string variants for routes that need a target (own scope, then foreign)."""
    month = business_today().replace(day=1).isoformat()
    year = business_today().year
    leaders = [{'leader_id': cls.tl_a.id}, {'leader_id': cls.tl_b.id}]
    return {
        '/api/plugins/engagement/metrics/export/': [{'month': month}],
        '/api/plugins/ticket_kpi/dashboard/categories/': [{'month': month}],
        '/api/plugins/ticket_kpi/dashboard/monthly_summary/': [{'month': month}],
        '/api/plugins/ticket_kpi/dashboard/team_summary/': [{'month': month}],
        '/api/plugins/ticket_kpi/dashboard/team_yearly_summary/': [{'year': year}],
        '/api/plugins/ticket_kpi/dashboard/tickets/': [{'month': month}],
        '/api/plugins/ticket_kpi/links/overtime_links/': [
            {'overtime_log_id': cls.ot_logs[cls.a1.id]}, {'overtime_log_id': cls.ot_logs[cls.b1.id]}],
        '/api/plugins/organigrama/subtree/': [{'node_id': cls.tl_a.id}, {'node_id': cls.tl_b.id}],
        '/api/plugins/tl_scorecard/epr-progress/': leaders,
        '/api/plugins/tl_scorecard/escalations/': leaders,
        '/api/plugins/tl_scorecard/export/': leaders,
        '/api/plugins/tl_scorecard/partnership/': leaders,
        '/api/plugins/tl_scorecard/scorecard/': leaders,
        '/api/plugins/tl_scorecard/trend/': leaders,
        '/api/plugins/tl_scorecard/hbpr-evidence/year-end-pack/': [
            {'assignment': cls.assignment.id, 'year': year},
            {'assignment': cls.foreign_assignment.id, 'year': year}],
        '/api/plugins/tl_scorecard/hbpr/records/': [
            {'kind': kind} for kind in
            ('pips', 'promotions', 'idle', 'absences', 'meetings', 'reviews')],
        '/api/users/approval-periods/status/': [{'period': month}],
        '/api/users/users/italian_team_members/': [
            {'italian_tl_id': cls.tl_a.id}, {'italian_tl_id': cls.tl_b.id}],
    }.get(url, [{}])


def _get(client, url, params=None):
    response = client.get(url, params or {})
    content_type = response.get('Content-Type') or ''
    body = response.getvalue() if response.streaming else response.content
    payload, text = None, ''
    if 'json' in content_type:
        payload = json.loads(body)
    if 'json' in content_type or 'csv' in content_type or content_type.startswith('text/'):
        text = body.decode('utf-8', errors='replace')
    return response.status_code, payload, text


def fetch(user, url, params=None):
    """GET ``url`` as ``user``, following DRF ``next`` links and merging the pages."""
    client = APIClient(raise_request_exception=False)
    client.force_authenticate(user=user)
    status, payload, text = _get(
        client, url, {'page_size': 500, 'ignore_date_filter': 'true', **(params or {})})
    for _ in range(20):
        next_url = payload.get('next') if isinstance(payload, dict) else None
        if status != 200 or not next_url:
            break
        parts = urlsplit(next_url)
        status, page, page_text = _get(client, f'{parts.path}?{parts.query}')
        if status != 200 or not isinstance(page, dict):
            break
        payload = {**payload, 'results': payload['results'] + page['results'],
                   'next': page.get('next')}
        text += page_text
    return status, payload, text


def observe(user, url, variants=({},)):
    """``(status, hits)`` for ``user`` at ``url`` over every query variant."""
    usernames = {u.username: u.id for u in User.objects.all()}
    codes, hits = [], {}
    for params in variants:
        code, payload, text = fetch(user, url, params)
        codes.append(code)
        if code == 200:
            _merge(hits, {
                owner: [(f'{where} {params or ""}'.strip(), key) for where, key in found]
                for owner, found in owner_hits(url, payload, text, usernames).items()})
    status = max(codes) if max(codes) >= 500 else 200 if 200 in codes else codes[0]
    return status, hits


def find_foreign(hits, allowed_ids, url, role=None, leader_id=None, extra_ids=()):
    """``{owner id: first path}`` of hits outside the role's scope.

    An employee may see their own leader (``leader_id``) only under a leader
    reference key, or on a route that is meant to show their leader.
    """
    foreign = {}
    for owner, occurrences in hits.items():
        if owner in allowed_ids or owner in extra_ids:
            continue
        for where, key in occurrences:
            if (role in (None, 'A1') and owner == leader_id
                    and (key in LEADER_KEYS or url in OWN_LEADER_ROUTES)):
                continue
            foreign.setdefault(owner, where)
    return foreign


def find_leaks(user, url, allowed_ids, params=None, leader_id=None):
    """The one checker: owners ``user`` can read at ``url`` outside ``allowed_ids``."""
    status, hits = observe(user, url, (params or {},))
    if status != 200:
        return set()
    return set(find_foreign(hits, allowed_ids, url, leader_id=leader_id))


ROLES = ('A1', 'TL_A', 'HBPR', 'CR')
# Pseudo owner id for "the response names team B"; never inside any allowed set.
FOREIGN_TEAM = 0


def _make_user(username, role=None, **profile_flags):
    user = User.objects.create_user(
        username, f'{username}@example.com', 'pw-matrix-1', first_name=username, last_name='Matrix')
    profile, _ = UserProfile.objects.get_or_create(user=user)
    for name, value in profile_flags.items():
        setattr(profile, name, value)
    if profile_flags:
        profile.save()
    assign_role(user, 'employee')
    if role:
        assign_role(user, role)
    return user


def reload_plugin_urls():
    """Plugin routes are registered from the DB when ``apps.plugins.urls`` is first
    imported, which in a test run is before any plugin row exists."""
    import apps.plugins.urls
    importlib.reload(apps.plugins.urls)
    # The include() resolvers cache url_patterns, so the root conf is rebuilt too.
    importlib.reload(importlib.import_module(settings.ROOT_URLCONF))
    clear_url_caches()


def build_world(cls):
    """Team A (TL_A, A1, A2), team B (TL_B, B1) and one user per scoped role."""
    for code in ('employee', 'hbpr', 'italian_tl', 'albanian_tl', 'hr', 'admin', 'cr_admin'):
        Role.objects.get_or_create(code=code, defaults={'name': code})
    call_command('sync_plugins', verbosity=0)
    call_command('seed_plugin_permissions', verbosity=0)
    call_command('grant_hbpr_plugin_access', verbosity=0)
    Plugin.objects.update(is_enabled=True)
    reload_plugin_urls()
    cls.addClassCleanup(reload_plugin_urls)

    cls.tl_a = _make_user('m_tl_a', 'albanian_tl', is_albanian_tl_role=True)
    cls.tl_b = _make_user('m_tl_b', 'albanian_tl', is_albanian_tl_role=True)
    cls.a1 = _make_user('m_a1')
    cls.a2 = _make_user('m_a2')
    cls.b1 = _make_user('m_b1')
    cls.hr = _make_user('m_hr', 'hr', is_hr_user=True)
    cls.staff = _make_user('m_staff', 'admin')
    cls.staff.is_staff = True
    cls.staff.save()
    cls.superuser = _make_user('m_super')
    cls.superuser.is_staff = cls.superuser.is_superuser = True
    cls.superuser.save()
    cls.cr = _make_user('m_cr', 'cr_admin')
    cls.hbpr = _make_user('m_hbpr', 'hbpr')

    cls.team_a = Team.objects.create(name='Matrix A', code='MXA', team_leader=cls.tl_a)
    cls.team_b = Team.objects.create(name='Matrix B', code='MXB', team_leader=cls.tl_b)
    for member, team in ((cls.tl_a, cls.team_a), (cls.a1, cls.team_a), (cls.a2, cls.team_a),
                         (cls.tl_b, cls.team_b), (cls.b1, cls.team_b)):
        TeamMembership.objects.create(user_profile=member.profile, team=team)
    for member, lead in ((cls.a1, cls.tl_a), (cls.a2, cls.tl_a), (cls.b1, cls.tl_b)):
        member.profile.albanian_tl = lead
        member.profile.save()

    client = Client.objects.create(name='Matrix client', code='MXC')
    for member in (cls.tl_a, cls.tl_b, cls.a1, cls.a2, cls.b1):
        member.profile.clients.add(client)
    cls.client_obj = client

    start = business_today() - timedelta(days=400)
    cls.assignment = HbprAlbanianTlAssignment.objects.create(
        hbpr=cls.hbpr, albanian_tl=cls.tl_a, cadence='weekly', effective_from=start)
    # Someone else's assignment, so a foreign id exists for the HBPR to probe.
    cls.foreign_assignment = HbprAlbanianTlAssignment.objects.create(
        hbpr=_make_user('m_hbpr_other', 'hbpr'), albanian_tl=cls.tl_b,
        cadence='weekly', effective_from=start)
    access = ControlRoomAccess.objects.create(user=cls.cr, is_active=True)
    ControlRoomTeamScope.objects.create(access=access, team=cls.team_a)
    CalendarWorkspace.objects.create(name='Matrix A calendar', code='MXA_CAL', team=cls.team_a)
    CalendarWorkspace.objects.create(name='Matrix B calendar', code='MXB_CAL', team=cls.team_b)


def populate_rows(cls):
    """One owned row per person in every model that is cheap to build."""
    today = business_today()
    owners = (cls.tl_a, cls.tl_b, cls.a1, cls.a2, cls.b1)
    cls.ot_logs = {}
    # By label: the KPI coupling test forbids naming that plugin package in core files.
    monthly_kpi = django_apps.get_model('ticket_kpi', 'MonthlyKPI')
    category = SkillCategory.objects.create(name='Matrix', code='matrix')
    skill = Skill.objects.create(category=category, name='Matrix skill', code='matrix-skill')
    # Leave must include a business day, so on a weekend use the Friday before.
    leave_day = today - timedelta(days=max(0, today.weekday() - 4))
    for owner in owners:
        cls.ot_logs[owner.id] = OvertimeLog.objects.create(
            user=owner, client=cls.client_obj, date=today, hours=2,
            description=f'ot {owner.username}').id
        standby = StandbyLog.objects.create(
            user=owner, date=today, hours=4, description=f'sb {owner.username}')
        standby.clients.add(cls.client_obj)
        LeaveRequest.objects.create(
            user=owner, request_type='vacation', start_date=leave_day, end_date=leave_day,
            days_counted=1, reason=f'leave {owner.username}')
        GeneratedReport.objects.create(
            generated_by=owner, name=f'report {owner.username}',
            date_range_start=today, date_range_end=today)
        LeaveBalance.objects.create(
            user=owner, leave_type='vacation', year=today.year, total_days=22,
            accrual_start_date=today.replace(month=1, day=1))
        Notification.objects.create(
            user=owner, title=f'n {owner.username}', message='matrix')
        UserSkill.objects.create(user=owner, skill=skill, level=3)
        monthly_kpi.objects.create(user=owner, month=today.replace(day=1))
        WageAssignment.objects.create(
            user=owner, gross_monthly_wage=1000, effective_from=today.replace(day=1))
    period = today.strftime('%Y-%m')
    meetings = {
        lead.id: Meeting.objects.create(
            meeting_type='team_meeting', organizer=lead, team=None, occurred_on=today)
        for lead in (cls.tl_a, cls.tl_b)
    }
    for employee, lead in ((cls.a1, cls.tl_a), (cls.a2, cls.tl_a), (cls.b1, cls.tl_b)):
        PIPRecord.objects.create(employee=employee, tl=lead, start_date=today)
        PromotionFlag.objects.create(employee=employee, nominated_by=lead, nominated_on=today)
        Absence.objects.create(employee=employee, flagged_by=lead, absence_date=today)
        flag = IdleFlag.objects.create(employee=employee, flagged_by=lead, flagged_on=today)
        IdleStatusUpdate.objects.create(flag=flag, week_of=today)
        cycle = EPRCycle.objects.create(user=employee, year=today.year)
        EPRGoal.objects.create(cycle=cycle, description='goal')
        EPRStageRecord.objects.create(
            cycle=cycle, stage='goal_setting', summary='summary', recorded_by=lead)
        MeetingAttendee.objects.create(meeting=meetings[lead.id], user=employee, role='member')
        EngagementSurveyResponse.objects.create(respondent=employee, period=period, score=4)
    for lead, assignment in ((cls.tl_a, cls.assignment), (cls.tl_b, cls.foreign_assignment)):
        ReviewDelivery.objects.create(
            leader=lead, period=period, recipient='manager', delivered_on=today)
        HbprGovernanceEvidence.objects.create(
            assignment=assignment, kind='cadence_meeting', occurred_on=today, recorded_by=lead)


class _LeakySerializer(serializers.ModelSerializer):
    class Meta:
        model = OvertimeLog
        fields = ('id', 'user', 'hours')


class _LeakyOvertimeViewSet(viewsets.ReadOnlyModelViewSet):
    """Deliberately unscoped: every authenticated caller sees every row."""
    permission_classes = [IsAuthenticated]
    serializer_class = _LeakySerializer
    queryset = OvertimeLog.objects.all()


class _LeakyKeyView(APIView):
    """Emits only B1's id under the key named in ``?key=`` (no other owner field)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        victim = User.objects.get(username='meta_b1')
        return Response([{'id': 1, request.query_params['key']: victim.id}])


urlpatterns = [
    path('api/leaky/', _LeakyOvertimeViewSet.as_view({'get': 'list'})),
    path('api/leaky-keys/', _LeakyKeyView.as_view()),
]

# Keys added after review; each must be recognised as an owner reference.
REVIEWED_KEYS = (
    'respondent', 'tl', 'recorded_by', 'flagged_by', 'nominated_by', 'albanian_tl',
    'italian_tl', 'hbpr', 'created_by', 'approved_by',
)


@override_settings(ROOT_URLCONF=__name__)
class WalkerCatchesAnUnscopedRouteTests(TestCase):
    """The same ``find_leaks`` the matrix is built on, against a leaky urlconf."""

    @classmethod
    def setUpTestData(cls):
        cls.a1 = User.objects.create_user('meta_a1')
        cls.b1 = User.objects.create_user('meta_b1')
        client = Client.objects.create(name='Meta', code='META')
        for owner in (cls.a1, cls.b1):
            OvertimeLog.objects.create(user=owner, client=client, date=business_today(), hours=1)

    def test_unscoped_viewset_is_reported_as_a_leak_for_an_employee(self):
        routes = [r for r in walk_routes() if r.url == '/api/leaky/']
        self.assertEqual(len(routes), 1)
        self.assertEqual(find_leaks(self.a1, '/api/leaky/', {self.a1.id}), {self.b1.id})

    def test_an_id_under_each_reviewed_key_is_detected(self):
        for key in REVIEWED_KEYS:
            with self.subTest(key=key):
                self.assertIn(key, OWNER_KEYS)
                self.assertEqual(
                    find_leaks(self.a1, '/api/leaky-keys/', {self.a1.id}, {'key': key}),
                    {self.b1.id})

    def test_an_employee_may_see_their_leader_only_under_a_leader_key(self):
        url = '/api/leaky-keys/'
        for key in ('albanian_tl', 'italian_tl', 'team_leader', 'tl'):
            with self.subTest(key=key):
                self.assertEqual(find_leaks(
                    self.a1, url, {self.a1.id}, {'key': key}, leader_id=self.b1.id), set())
        for key in ('user', 'recorded_by', 'approved_by'):
            with self.subTest(key=key):
                self.assertEqual(find_leaks(
                    self.a1, url, {self.a1.id}, {'key': key}, leader_id=self.b1.id),
                    {self.b1.id})


class RowOwnershipMatrixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        build_world(cls)
        populate_rows(cls)
        cls.allowed = {
            'A1': {cls.a1.id},
            'TL_A': cls.tl_a.profile.get_team_member_ids() | {cls.tl_a.id},
            'HBPR': set(get_hbpr_scope(cls.hbpr).user_ids) | {cls.hbpr.id},
            'CR': scope_service.get_allowed_user_ids(
                cls.cr, scope_service.get_allowed_team_ids(cls.cr)) | {cls.cr.id},
        }
        cls.users = {'A1': cls.a1, 'TL_A': cls.tl_a, 'HBPR': cls.hbpr, 'CR': cls.cr}
        cache.clear()
        cls.routes = walk_routes()
        cls.observed = {
            (route.url, role): observe(user, route.url, route_variants(cls, route.url))
            for route in cls.routes for role, user in cls.users.items()}

    def _extra_ids(self, url, role):
        names = WIDENED_EXTRA.get(url, {}).get(role, ())
        if '*' in names:
            return set(User.objects.values_list('id', flat=True)) | {FOREIGN_TEAM}
        return {FOREIGN_TEAM if name == 'team_b' else getattr(self, name).id
                for name in names}

    def test_world_sanity(self):
        self.assertEqual(self.allowed['A1'], {self.a1.id})
        self.assertIn(self.a2.id, self.allowed['TL_A'])
        self.assertNotIn(self.b1.id, self.allowed['TL_A'])
        self.assertEqual(
            self.allowed['HBPR'], {self.hbpr.id, self.tl_a.id, self.a1.id, self.a2.id})
        self.assertGreater(len(self.routes), 100)

    def test_widened_extras_name_declared_widened_routes(self):
        self.assertEqual(sorted(set(WIDENED_EXTRA) - set(WIDENED_ROUTES)), [])

    def test_no_role_sees_rows_outside_its_scope(self):
        for route in self.routes:
            for role in ROLES:
                with self.subTest(route=route.url, role=role):
                    status, hits = self.observed[(route.url, role)]
                    self.assertLess(status, 500, f'{route.url} returned {status}')
                    if route.url in COMPANY_WIDE_REFERENCE:
                        continue
                    foreign = find_foreign(
                        hits, self.allowed[role], route.url, role=role,
                        leader_id=self.tl_a.id, extra_ids=self._extra_ids(route.url, role))
                    names = {str(User.objects.filter(id=owner).first() or 'team B'): where
                             for owner, where in foreign.items()}
                    self.assertEqual(names, {}, f'{role} read foreign rows at {route.url}')

    def test_every_route_is_accounted_for(self):
        declared = set(REFERENCE_ROUTES) | set(WIDENED_ROUTES) | set(
            NOT_POPULATED_ROUTES) | set(AGGREGATE_ROUTES)
        walked = {route.url for route in self.routes}
        self.assertEqual(sorted(declared - walked), [], 'declared routes that no longer exist')
        self.assertEqual(sorted(set(COMPANY_WIDE_REFERENCE) - set(REFERENCE_ROUTES)), [])
        for route in self.routes:
            if route.url in declared:
                continue
            with self.subTest(route=route.url):
                results = [self.observed[(route.url, role)] for role in ROLES]
                verified = any(status == 200 and hits for status, hits in results)
                denied = all(status in (401, 403, 404) for status, _ in results)
                self.assertTrue(
                    verified or denied,
                    f'{route.url} returned no owner ids to any role and is not denied: '
                    'populate the world, or list it in REFERENCE_ROUTES / AGGREGATE_ROUTES '
                    '/ NOT_POPULATED_ROUTES / WIDENED_ROUTES with a justification')

    def test_an_employee_never_reads_the_team_leaders_overtime(self):
        _, payload, _ = fetch(self.a1, '/api/overtime/logs/')
        ids = {row['id'] for row in rows_of(payload)}
        self.assertIn(self.ot_logs[self.a1.id], ids)
        self.assertNotIn(self.ot_logs[self.tl_a.id], ids)

    def test_a_foreign_row_cannot_be_fetched_by_id(self):
        declared = set(REFERENCE_ROUTES) | set(WIDENED_ROUTES)
        usernames = {u.username: u.id for u in User.objects.all()}
        # (owner of the probed row, roles that must be refused). B1 is out of scope for
        # everyone; TL_A's rows are in scope for TL_A, HBPR and CR but not for an employee.
        targets = ((self.b1, ROLES), (self.tl_a, ('A1',)))
        checked = {self.b1.id: 0, self.tl_a.id: 0}
        for route in self.routes:
            if route.url in declared:
                continue
            status, payload, _ = fetch(self.superuser, route.url)
            if status != 200:
                continue
            for owner, roles in targets:
                if owner is self.tl_a and route.url in OWN_LEADER_ROUTES:
                    continue
                rows = [row for row in rows_of(payload) if row.get('id') is not None
                        and owner.id in owner_hits(route.url, row, '', usernames)]
                if not rows:
                    continue
                detail = f"{route.url}{rows[0]['id']}/"
                try:
                    match = resolve(detail)
                except Resolver404:
                    continue
                if 'get' not in (getattr(match.func, 'actions', None) or {}):
                    continue
                checked[owner.id] += 1
                for role in roles:
                    with self.subTest(route=detail, role=role):
                        code, _, _ = fetch(self.users[role], detail)
                        self.assertIn(code, (403, 404), f'{role} read {owner} row {detail}')
        self.assertGreater(checked[self.b1.id], 5)
        self.assertGreater(checked[self.tl_a.id], 2)
