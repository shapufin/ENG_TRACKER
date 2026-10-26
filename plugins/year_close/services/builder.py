"""Build a frozen evidence set for one year (plan Y3).

The set is one ZIP per (IT TL, team) pair plus one company ZIP, described by
``{year}/MANIFEST.json`` and ``{year}/MANIFEST.sha256``. Bundles are **disjoint
by user**, so "every row of the year is in exactly one bundle" is a real check
and not a hope.

Nothing here writes ``ClosedYear``: only ``close_year`` does, and only once
every file in the set is ready.
"""
from __future__ import annotations

import hashlib
import json
import logging
import zipfile
from datetime import date
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.overtime.models import OvertimeLog
from apps.standby.models import StandbyLog
from core.utils.sheet_titles import safe_sheet_title

from .readiness import apply_year_end_rollover, check_year_readiness, pending_counts

logger = logging.getLogger(__name__)

UNASSIGNED_LABEL = 'Unassigned'


def snapshot_root() -> Path:
    return Path(settings.SNAPSHOT_ROOT)


def _safe_component(text: str) -> str:
    """A filename component that is safe on every filesystem."""
    cleaned = ''.join(
        char if char.isalnum() or char in '-_.' else '_' for char in str(text or '').strip()
    )
    return cleaned.strip('._') or 'unknown'


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _year_window(year: int) -> tuple[date, date]:
    return date(year, 1, 1), date(year, 12, 31)


# --------------------------------------------------------------------- pairs


def managed_member_ids_bulk(leader_ids) -> dict[int, set[int]]:
    """``{leader_id: member_ids}`` in a fixed number of queries.

    Same three sources as ``UserProfile.get_team_member_ids()`` (direct
    italian/albanian FK, shared team membership, led teams), batched so a year
    with 30 pairs does not cost 90 queries. ``test_managed_members_match_core``
    pins the parity.
    """
    from apps.users.models import TeamMembership, UserProfile

    leader_ids = set(leader_ids)
    result: dict[int, set[int]] = {leader_id: set() for leader_id in leader_ids}
    if not leader_ids:
        return result

    for field in ('italian_tl_id', 'albanian_tl_id'):
        for leader_id, user_id in UserProfile.objects.filter(
            **{f'{field}__in': leader_ids}
        ).values_list(field, 'user_id'):
            result[leader_id].add(user_id)

    # Teams the leader belongs to (shared calendar/team M2M) and teams they lead.
    leader_teams: dict[int, set[int]] = {leader_id: set() for leader_id in leader_ids}
    for leader_id, team_id in TeamMembership.objects.filter(
        is_deleted=False, user_profile__user_id__in=leader_ids
    ).values_list('user_profile__user_id', 'team_id'):
        leader_teams[leader_id].add(team_id)
    from apps.users.models import Team

    for leader_id, team_id in Team.objects.filter(
        is_deleted=False, team_leader_id__in=leader_ids
    ).values_list('team_leader_id', 'id'):
        leader_teams[leader_id].add(team_id)

    all_team_ids = set().union(*leader_teams.values()) if leader_teams else set()
    team_members: dict[int, set[int]] = {}
    if all_team_ids:
        for user_id, team_id in TeamMembership.objects.filter(
            is_deleted=False, team_id__in=all_team_ids
        ).values_list('user_profile__user_id', 'team_id'):
            team_members.setdefault(team_id, set()).add(user_id)
    for leader_id, teams in leader_teams.items():
        for team_id in teams:
            result[leader_id] |= team_members.get(team_id, set())
    return result


def candidate_pairs() -> list[tuple[int, int]]:
    """Deterministic ``(leader_id, team_id)`` pairs: teams led, plus teams of
    managed members, for active leaders and for deactivated team leaders."""
    from apps.users.models import Team, TeamMembership, UserProfile

    profiles = list(UserProfile.objects.filter(user__is_active=True))

    # Role codes are a denormalised JSON column, so this stays one query: never
    # call the ``is_team_leader`` property in a loop (up to 3 queries each).
    leader_ids: set[int] = {
        profile.user_id for profile in profiles
        if profile.italian_tl_id or profile.albanian_tl_id
        or {'italian_tl', 'albanian_tl'} & set(profile.role_codes or [])
    }

    led = {}
    for team_id, leader_id in Team.objects.filter(is_deleted=False).exclude(
        team_leader__isnull=True
    ).values_list('id', 'team_leader_id'):
        led.setdefault(leader_id, set()).add(team_id)
        leader_ids.add(leader_id)  # deactivated leaders keep their evidence

    member_teams: dict[int, set[int]] = {}
    for user_id, team_id in TeamMembership.objects.filter(is_deleted=False).values_list(
        'user_profile__user_id', 'team_id'
    ):
        member_teams.setdefault(user_id, set()).add(team_id)

    managed = managed_member_ids_bulk(leader_ids)

    pairs: set[tuple[int, int]] = set()
    for leader_id in leader_ids:
        for team_id in led.get(leader_id, set()):
            pairs.add((leader_id, team_id))
        for member_id in managed.get(leader_id, set()):
            for team_id in member_teams.get(member_id, set()):
                pairs.add((leader_id, team_id))
    return sorted(pairs)


def _pair_members(pairs: list[tuple[int, int]]) -> dict[tuple[int, int], set[int]]:
    """Members of each pair: the team's members plus the leader's managed users."""
    from apps.users.models import TeamMembership

    members: dict[tuple[int, int], set[int]] = {pair: set() for pair in pairs}
    team_ids = {team_id for _, team_id in pairs}
    by_team: dict[int, set[int]] = {}
    for user_id, team_id in TeamMembership.objects.filter(
        is_deleted=False, team_id__in=team_ids
    ).values_list('user_profile__user_id', 'team_id'):
        by_team.setdefault(team_id, set()).add(user_id)

    managed = managed_member_ids_bulk({leader_id for leader_id, _ in pairs})
    for pair in pairs:
        leader_id, team_id = pair
        members[pair] |= by_team.get(team_id, set())
        members[pair] |= managed.get(leader_id, set())
        members[pair].add(leader_id)
    return members


def users_with_rows(year: int) -> set[int]:
    """Every user with overtime, standby or leave touching ``year``."""
    from apps.leave_management.models import LeaveRequest

    first_day, last_day = _year_window(year)
    ids = set(
        OvertimeLog.objects.filter(date__gte=first_day, date__lte=last_day, is_deleted=False)
        .values_list('user_id', flat=True)
    )
    ids |= set(
        StandbyLog.objects.filter(date__gte=first_day, date__lte=last_day, is_deleted=False)
        .values_list('user_id', flat=True)
    )
    ids |= set(
        LeaveRequest.objects.filter(
            start_date__lte=last_day, end_date__gte=first_day, is_deleted=False,
        ).values_list('user_id', flat=True)
    )
    return ids


def bundles_for_year(year: int) -> list[dict]:
    """Disjoint bundles: one per (leader, team) pair that owns rows, plus Unassigned."""
    from django.contrib.auth.models import User
    from apps.users.models import Team

    pairs = candidate_pairs()
    members = _pair_members(pairs)
    needing = users_with_rows(year)

    owners: dict[int, tuple[int, int]] = {}
    for pair in pairs:  # deterministic: sorted (leader, team)
        for user_id in sorted(members[pair]):
            if user_id in needing:
                owners.setdefault(user_id, pair)

    leaders = {u.id: u for u in User.objects.filter(id__in={p[0] for p in pairs})}
    teams = {t.id: t for t in Team.objects.filter(id__in={p[1] for p in pairs})}

    bundles: list[dict] = []
    for pair in pairs:
        assigned = sorted(uid for uid, owner in owners.items() if owner == pair)
        if not assigned:
            continue
        leader = leaders.get(pair[0])
        team = teams.get(pair[1])
        bundles.append({
            'kind': 'team',
            'leader_id': pair[0],
            'team_id': pair[1],
            'leader_name': getattr(leader, 'username', '') or f'leader-{pair[0]}',
            'team_name': getattr(team, 'code', '') or f'team-{pair[1]}',
            'member_ids': assigned,
        })

    orphans = sorted(needing - set(owners))
    if orphans:
        bundles.append({
            'kind': 'unassigned',
            'leader_id': None,
            'team_id': None,
            'leader_name': UNASSIGNED_LABEL,
            'team_name': '',
            'member_ids': orphans,
        })
    return bundles


def completeness_gap(year: int, bundles: list[dict]) -> set[int]:
    """Users with rows in ``year`` that no bundle covers (empty = complete)."""
    covered: set[int] = set()
    for bundle in bundles:
        covered |= set(bundle['member_ids'])
    return users_with_rows(year) - covered


def bundle_filename(bundle: dict) -> str:
    if bundle['kind'] == 'unassigned':
        return f'{UNASSIGNED_LABEL}.zip'
    return f"{_safe_component(bundle['leader_name'])}__{_safe_component(bundle['team_name'])}.zip"


# ------------------------------------------------------------------ builders


def _querysets_for(year: int, member_ids: list[int]):
    from apps.leave_management.models import LeaveRequest

    first_day, last_day = _year_window(year)
    ot = OvertimeLog.objects.filter(
        date__gte=first_day, date__lte=last_day, user_id__in=member_ids, is_deleted=False,
    ).order_by('user__username', 'date', 'start_time')
    sb = StandbyLog.objects.filter(
        date__gte=first_day, date__lte=last_day, user_id__in=member_ids, is_deleted=False,
    ).order_by('user__username', 'date', 'start_time')
    # Overlap, not containment: a leave running 31 Dec -> 2 Jan belongs to both years.
    leave = LeaveRequest.objects.filter(
        start_date__lte=last_day, end_date__gte=first_day, user_id__in=member_ids,
        is_deleted=False,
    ).order_by('user__username', 'start_date')
    return ot, sb, leave


def _finalized_lines(year: int, member_ids: list[int]):
    """Distinct finalized payroll lines of these members in ``year``."""
    try:
        from plugins.payroll.models import PayrollRunEntry
    except Exception:  # noqa: BLE001
        return []
    entries = PayrollRunEntry.objects.filter(
        run__year=year, run__status='finalized', user_id__in=member_ids, status='finalized',
    ).select_related('line').distinct()
    seen, lines = set(), []
    for entry in entries:
        if entry.line_id not in seen:
            seen.add(entry.line_id)
            lines.append(entry.line)
    return lines


def _write_zip(target: Path, members: dict[str, bytes]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(target.suffix + '.part')
    with zipfile.ZipFile(part, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, payload in members.items():
            archive.writestr(name, payload)
    part.replace(target)


def _manifest_payload(year: int, files: dict[str, bytes], warnings: list[str], extra: dict) -> bytes:
    manifest = {
        'year': year,
        'generated_at': timezone.now().isoformat(),
        'filters': {
            'overtime': 'date within the year, not deleted',
            'standby': 'date within the year, not deleted',
            'leave': 'start_date <= 31 Dec and end_date >= 1 Jan (overlap)',
        },
        'warnings': warnings,
        **extra,
        'files': {
            name: {'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
            for name, payload in files.items()
        },
    }
    return json.dumps(manifest, indent=2, sort_keys=True).encode('utf-8')


def build_bundle(year: int, bundle: dict, warnings: list[str]) -> tuple[Path, dict]:
    """Write one bundle ZIP. Returns ``(path, counts)``."""
    from apps.reports.services.export_service import ExportService

    ot, sb, leave = _querysets_for(year, bundle['member_ids'])
    counts = {'overtime': ot.count(), 'standby': sb.count(), 'leave': leave.count()}

    files: dict[str, bytes] = {}
    exporter = ExportService()  # a fresh instance: the singleton keeps per-TL caches
    if counts['overtime'] or counts['standby']:
        files['overtime_standby.xlsx'] = exporter.export_ot_standby_to_excel(
            ot, sb, include_carryover=True,
        )
        exporter.clear_cache()
    if counts['leave']:
        files['leave.xlsx'] = exporter.export_leave_to_excel(leave)
        exporter.clear_cache()

    payslips = 0
    try:
        from plugins.payroll.services.export_service import generate_payslip_pdf
    except Exception:  # noqa: BLE001 - payroll disabled
        generate_payslip_pdf = None
    if generate_payslip_pdf is not None:
        for line in _finalized_lines(year, bundle['member_ids']):
            stream = generate_payslip_pdf(line)
            name = f"payslips/{_safe_component(getattr(line, 'user_id', line.pk))}.pdf"
            files[name] = stream.read() if hasattr(stream, 'read') else bytes(stream)
            payslips += 1
    counts['payslips'] = payslips

    files['MANIFEST.json'] = _manifest_payload(
        year, files, warnings,
        {
            'bundle': {
                'kind': bundle['kind'],
                'leader': bundle['leader_name'],
                'team': bundle['team_name'],
                'users': len(bundle['member_ids']),
            },
            'counts': counts,
        },
    )

    target = snapshot_root() / str(year) / bundle_filename(bundle)
    _write_zip(target, files)
    return target, counts


def build_company(year: int, warnings: list[str]) -> tuple[Path, dict]:
    """Write the company ZIP: every finalized payroll run of the year, by month."""
    files: dict[str, bytes] = {}
    months = 0
    try:
        from plugins.payroll.models import PayrollRun
        from plugins.payroll.services.export_service import (
            generate_payroll_excel,
            generate_payroll_pdf,
        )
    except Exception:  # noqa: BLE001 - payroll disabled: the company ZIP is still valid
        PayrollRun = None

    if PayrollRun is not None:
        for run in PayrollRun.objects.filter(year=year, status='finalized').order_by('month'):
            files[f'payroll/{run.month:02d}_payroll.xlsx'] = generate_payroll_excel(run).read()
            files[f'payroll/{run.month:02d}_payroll.pdf'] = generate_payroll_pdf(run).read()
            months += 1

    files['year_summary.xlsx'] = _year_summary(year)
    files['MANIFEST.json'] = _manifest_payload(
        year, files, warnings,
        {'bundle': {'kind': 'company'}, 'counts': {'payroll_months': months}},
    )
    target = snapshot_root() / str(year) / f'company_{year}.zip'
    _write_zip(target, files)
    return target, {'payroll_months': months}


def _year_summary(year: int) -> bytes:
    """One small workbook: the year's row counts, so the set is self-describing."""
    from io import BytesIO

    from openpyxl import Workbook

    counts = pending_counts(year)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = safe_sheet_title(f'Summary {year}')
    sheet.append(['Metric', 'Value'])
    sheet.append(['Year', year])
    for label, value in counts.items():
        sheet.append([label.replace('_', ' ').title(), value])
    sheet.append(['Generated at', timezone.now().isoformat(timespec='seconds')])
    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def write_set_manifest(year: int, files: list[dict], warnings: list[str], counts: dict) -> tuple[Path, str]:
    """``{year}/MANIFEST.json`` + ``.sha256`` covering every file in the set."""
    payload = json.dumps(
        {
            'year': year,
            'generated_at': timezone.now().isoformat(),
            'warnings': warnings,
            'counts': counts,
            'files': files,
        },
        indent=2,
        sort_keys=True,
    ).encode('utf-8')
    directory = snapshot_root() / str(year)
    directory.mkdir(parents=True, exist_ok=True)
    manifest = directory / 'MANIFEST.json'
    manifest.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    (directory / 'MANIFEST.sha256').write_text(f'{digest}  MANIFEST.json\n', encoding='utf-8')
    return manifest, digest
