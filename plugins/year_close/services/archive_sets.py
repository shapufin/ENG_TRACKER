"""Scorecard, EPR, engagement and evidence sets of a closed year (company ZIP).

Read-only views over rows that already exist: nothing is copied into a table, so
the archive adds files, not database size. Guarded like payroll: a missing or
disabled plugin simply contributes nothing. Private leader notes are not
exported (the same rule as the scorecard evidence export); only text the
platform already shares with staff is written. Every cell goes through
``xlsx_safe_row`` so review text cannot become a formula.
"""
import json
from datetime import date
from io import BytesIO

from openpyxl import Workbook

from core.utils.csv_safe import xlsx_safe_row
from core.utils.metrics_freeze import freeze_at
from core.utils.sheet_titles import safe_sheet_title

from .readiness import plugin_available

CELL_LIMIT = 32000  # Excel refuses a cell above 32767 characters


def scorecard_available() -> bool:
    return plugin_available('tl_scorecard', 'plugins.tl_scorecard.models')


def engagement_available() -> bool:
    return plugin_available('engagement', 'plugins.engagement.models')


def _name(user) -> str:
    if user is None:
        return ''
    return user.get_full_name() or user.username


def _workbook(sheets: dict[str, tuple[list[str], list[list]]]) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    for title, (header, rows) in sheets.items():
        sheet = workbook.create_sheet(safe_sheet_title(title))
        sheet.append(header)
        for row in rows:
            sheet.append(xlsx_safe_row(row))
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _stamp(value) -> str:
    return value.isoformat(timespec='seconds') if value else ''


def epr_workbook(year: int) -> tuple[bytes | None, dict]:
    """Every EPR cycle of ``year`` with its goals and stage evidence."""
    if not scorecard_available():
        return None, {}
    from plugins.tl_scorecard.models import EPRCycle

    cycles = list(
        EPRCycle.objects.filter(year=year, is_deleted=False)
        .select_related('user').prefetch_related('goals', 'stage_records__recorded_by')
        .order_by('user__username')
    )
    cycle_rows, record_rows, goal_rows = [], [], []
    for cycle in cycles:
        who = _name(cycle.user)
        cycle_rows.append([
            who, cycle.user.username, cycle.year, _stamp(cycle.goal_setting_completed_at),
            _stamp(cycle.mid_year_completed_at), _stamp(cycle.final_review_completed_at),
            len(cycle.goals.all()),
        ])
        for goal in cycle.goals.all():
            goal_rows.append([who, goal.description])
        for record in sorted(cycle.stage_records.all(), key=lambda r: r.id):
            record_rows.append([
                who, record.get_stage_display(), _name(record.recorded_by),
                'Yes' if record.hbpr_present else 'No',
                'Yes' if record.shared_with_employee else 'No',
                record.reference_url, record.summary[:CELL_LIMIT],
            ])
    data = _workbook({
        'EPR cycles': (
            ['Employee', 'Username', 'Year', 'Goal setting done', 'Mid-year done',
             'Final review done', 'Goals'], cycle_rows),
        'Stage records': (
            ['Employee', 'Stage', 'Recorded by', 'HBPR present', 'Shared with employee',
             'Reference', 'Summary'], record_rows),
        'Goals': (['Employee', 'Goal'], goal_rows),
    })
    return data, {'epr_cycles': len(cycles), 'epr_stage_records': len(record_rows)}


def _snapshot_rows(year: int) -> list[list]:
    from plugins.tl_scorecard.models import ScorecardMonthSnapshot

    rows = []
    for snap in (ScorecardMonthSnapshot.objects.filter(month__year=year)
                 .select_related('leader').order_by('leader__username', 'month')):
        rows.append([
            _name(snap.leader), snap.month.isoformat(), len(snap.member_ids or []),
            _stamp(snap.computed_at),
            json.dumps(snap.payload, sort_keys=True, default=str)[:CELL_LIMIT],
        ])
    return rows


def _engagement_rows(year: int) -> list[list]:
    if not engagement_available():
        return []
    from plugins.engagement.models import TLApprovalMetric

    rows = []
    for metric in (TLApprovalMetric.objects.filter(month__year=year)
                   .select_related('leader').order_by('leader__username', 'month')):
        rows.append([
            _name(metric.leader), metric.team_name, metric.team_code, metric.month.isoformat(),
            metric.team_size, metric.engagement_score, metric.approval_rate_pct,
            metric.score_speed, metric.score_approval_rate, metric.score_responsiveness,
            metric.score_consistency, 'Yes' if metric.closure_on_time else 'No',
            metric.late_closure_penalty, _stamp(metric.computed_at),
        ])
    return rows


def _evidence_rows(year: int) -> list[list]:
    from django.db.models import Q

    from plugins.tl_scorecard.models import HbprGovernanceEvidence
    from plugins.tl_scorecard.serializers import HbprGovernanceEvidenceSerializer

    serializer = HbprGovernanceEvidenceSerializer()  # one instance: it caches attendees
    queryset = (
        HbprGovernanceEvidence.objects.filter(is_deleted=False)
        .filter(Q(reporting_year=year) | Q(kind='cadence_meeting', occurred_on__year=year))
        .select_related('assignment__albanian_tl', 'assignment__hbpr', 'recorded_by')
        .order_by('assignment__albanian_tl__username', 'occurred_on', 'id')
    )
    rows = []
    for row in queryset:
        attended = ', '.join(e['name'] for e in serializer.get_attended_employees(row))
        rows.append([
            _name(row.assignment.albanian_tl), _name(row.assignment.hbpr), row.get_kind_display(),
            row.status, row.occurred_on.isoformat(), row.reporting_year or '',
            row.shared_summary[:CELL_LIMIT], row.action_items[:CELL_LIMIT], row.reference_url,
            _name(row.recorded_by), attended, row.cancel_reason,
        ])
    return rows


def _record_rows(year: int) -> list[list]:
    """Leader-authored records of the year. Private notes are never written."""
    from plugins.tl_scorecard.models import Absence, IdleFlag, Meeting, PIPRecord, PromotionFlag

    rows = []
    for obj in IdleFlag.objects.filter(flagged_on__year=year, is_deleted=False).select_related(
            'flagged_by', 'employee'):
        rows.append(['Idle flag', _name(obj.flagged_by), _name(obj.employee),
                     obj.flagged_on.isoformat(), obj.status, obj.productivity_task[:CELL_LIMIT]])
    for obj in Absence.objects.filter(absence_date__year=year, is_deleted=False).select_related(
            'flagged_by', 'employee'):
        rows.append(['Absence', _name(obj.flagged_by), _name(obj.employee),
                     obj.absence_date.isoformat(), '', obj.reason[:CELL_LIMIT]])
    for obj in PIPRecord.objects.filter(start_date__year=year, is_deleted=False).select_related(
            'tl', 'employee'):
        rows.append(['PIP', _name(obj.tl), _name(obj.employee), obj.start_date.isoformat(),
                     obj.status, obj.shared_notes[:CELL_LIMIT]])
    for obj in Meeting.objects.filter(occurred_on__year=year, is_deleted=False).select_related(
            'organizer', 'counterparty'):
        rows.append([f'Meeting ({obj.meeting_type})', _name(obj.organizer),
                     _name(obj.counterparty), obj.occurred_on.isoformat(), '',
                     obj.shared_summary[:CELL_LIMIT]])
    for obj in PromotionFlag.objects.filter(nominated_on__year=year, is_deleted=False).select_related(
            'nominated_by', 'employee'):
        rows.append(['Promotion nomination', _name(obj.nominated_by), _name(obj.employee),
                     obj.nominated_on.isoformat(), obj.status, obj.decision_note[:CELL_LIMIT]])
    return rows


def leaders_workbook(year: int) -> tuple[bytes | None, dict]:
    """Per-leader history of ``year``: frozen months, engagement, evidence, records."""
    if not scorecard_available():
        return None, {}
    snapshots, engagement = _snapshot_rows(year), _engagement_rows(year)
    evidence, records = _evidence_rows(year), _record_rows(year)
    data = _workbook({
        'Scorecard months': (
            ['Leader', 'Month', 'Team size', 'Frozen at', 'Metrics (JSON)'], snapshots),
        'Engagement months': (
            ['Leader', 'Team', 'Team code', 'Month', 'Team size', 'Engagement score',
             'Approval rate %', 'Speed', 'Approval', 'Responsiveness', 'Consistency',
             'Closed on time', 'Late closure penalty', 'Computed at'], engagement),
        'Governance evidence': (
            ['Line Manager', 'HBPR', 'Kind', 'Status', 'Occurred on', 'Reporting year',
             'Summary', 'Action items', 'Reference', 'Recorded by', 'HBPR attended',
             'Cancel reason'], evidence),
        'Leader records': (
            ['Type', 'Author', 'Employee', 'Date', 'Status', 'Shared text'], records),
    })
    return data, {
        'scorecard_months': len(snapshots), 'engagement_months': len(engagement),
        'governance_evidence': len(evidence), 'leader_records': len(records),
    }


def december_snapshot_blockers(year: int) -> list[str]:
    """A leader with frozen months in ``year`` needs the final December one too."""
    if not scorecard_available():
        return []
    from plugins.tl_scorecard.models import ScorecardMonthSnapshot

    december = date(year, 12, 1)
    leaders = set(
        ScorecardMonthSnapshot.objects.filter(month__year=year).values_list('leader_id', flat=True)
    )
    final = set(
        ScorecardMonthSnapshot.objects.filter(
            month=december, computed_at__gte=freeze_at(december),
        ).values_list('leader_id', flat=True)
    )
    missing = len(leaders - final)
    if not missing:
        return []
    return [
        f'{missing} leader(s) have no final December {year} scorecard snapshot; '
        f'run manage.py freeze_scorecard_months.'
    ]
