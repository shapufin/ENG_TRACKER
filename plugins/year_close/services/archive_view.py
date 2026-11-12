"""Read-only data behind the Archives area (superuser only): what a closed year holds,
whether its files are intact, and the per-leader history. Nothing here writes."""
import json
from collections import defaultdict

from django.db.models import Count

from .. import retention
from ..models import YearSnapshot
from ..serializers import YearSnapshotFileSerializer
from . import builder
from .archive_sets import _evidence_queryset, engagement_available, scorecard_available


def _set_counts(year: int) -> dict:
    path = builder.snapshot_root() / str(year) / 'MANIFEST.json'
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding='utf-8')).get('counts', {})


def archive_entries() -> list[dict]:
    """One entry per year with a ready set: category counts, removal dates, files."""
    from . import retention as retention_service

    entries = []
    seen = set()
    for snapshot in YearSnapshot.objects.filter(status='ready').order_by('-year', '-version'):
        if snapshot.year in seen:
            continue
        seen.add(snapshot.year)
        counts = _set_counts(snapshot.year)
        categories = []
        for key, label, count_key, location, long_kept in retention.CATEGORIES:
            years = retention.payroll_years() if long_kept else retention.standard_years()
            categories.append({
                'key': key, 'label': label, 'count': counts.get(count_key),
                'location': location, 'retention_years': years,
                'remove_on': retention.removal_on(snapshot.year, years).isoformat(),
                **retention_service.category_state(snapshot.year, key),
            })
        files = snapshot.files.all().order_by('kind', 'leader_name', 'team_name')
        entries.append({
            'year': snapshot.year, 'snapshot_id': snapshot.pk, 'version': snapshot.version,
            'completed_at': snapshot.completed_at, 'total_bytes': snapshot.total_bytes,
            'categories': categories,
            'files': YearSnapshotFileSerializer(files, many=True).data,
        })
    return entries


def verify_file(row) -> str:
    """``ok`` / ``mismatch`` / ``missing``: the file on disk against its stored sha256."""
    path = builder.snapshot_root() / row.relative_path
    if not path.exists():
        return 'missing'
    return 'ok' if builder.sha256_file(path) == row.sha256 else 'mismatch'


def leader_summary(year: int) -> list[dict]:
    """Every leader with scorecard, engagement, evidence or authored records in ``year``."""
    if not scorecard_available():
        return []
    from django.contrib.auth.models import User

    from plugins.tl_scorecard.models import (
        Absence, IdleFlag, Meeting, PIPRecord, PromotionFlag, ScorecardMonthSnapshot,
    )

    tally = defaultdict(lambda: defaultdict(int))

    def add(queryset, field, key):
        for row in queryset.values(field).annotate(n=Count('id')):
            if row[field]:
                tally[row[field]][key] += row['n']

    add(ScorecardMonthSnapshot.objects.filter(month__year=year), 'leader_id', 'scorecard_months')
    if engagement_available():
        from plugins.engagement.models import TLApprovalMetric

        add(TLApprovalMetric.objects.filter(month__year=year), 'leader_id', 'engagement_months')
    add(_evidence_queryset(year), 'assignment__albanian_tl_id', 'governance_evidence')
    for queryset, field in (
        (IdleFlag.objects.filter(flagged_on__year=year, is_deleted=False), 'flagged_by_id'),
        (Absence.objects.filter(absence_date__year=year, is_deleted=False), 'flagged_by_id'),
        (PIPRecord.objects.filter(start_date__year=year, is_deleted=False), 'tl_id'),
        (Meeting.objects.filter(occurred_on__year=year, is_deleted=False), 'organizer_id'),
        (PromotionFlag.objects.filter(nominated_on__year=year, is_deleted=False), 'nominated_by_id'),
    ):
        add(queryset, field, 'leader_records')

    users = User.objects.filter(id__in=tally).select_related('profile').order_by('username')
    rows = []
    for user in users:
        profile = getattr(user, 'profile', None)
        rows.append({
            'leader_id': user.pk, 'username': user.username,
            'name': user.get_full_name() or user.username,
            'is_current': bool(user.is_active and profile and profile.is_team_leader),
            'scorecard_months': tally[user.pk]['scorecard_months'],
            'engagement_months': tally[user.pk]['engagement_months'],
            'governance_evidence': tally[user.pk]['governance_evidence'],
            'leader_records': tally[user.pk]['leader_records'],
        })
    return rows
