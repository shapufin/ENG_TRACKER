"""
Ticket KPI Analytics Engine — Dynamic Schema Edition.

Pre-computes monthly KPIs and generates end-of-year reports.
Works with any uploaded schema: metrics are computed from whatever
fields are present, and field_breakdowns captures every categorical field.
"""

from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional

from django.db.models import Avg, Count, Max, Min, Sum
from django.contrib.auth.models import User

from .models import NormalizedTicket, TicketImportBatch, MonthlyKPI

# Maximum number of distinct values for a field to be considered categorical
# and included in field_breakdowns. Fields with more distinct values (e.g.
# free-text fields) are excluded to keep breakdown payloads bounded.
FIELD_BREAKDOWN_MAX_DISTINCT = 50


def _build_field_breakdowns(tickets) -> Dict[str, Dict[str, int]]:
    """
    Build dynamic breakdowns for all fields found in raw_data + standard fields.
    Only includes fields with <= FIELD_BREAKDOWN_MAX_DISTINCT distinct values (categorical).
    """
    field_values = {}

    for ticket in tickets:
        # Standard fields
        for field in ['status', 'priority', 'category', 'assignee']:
            val = getattr(ticket, field, None)
            if val:
                if field not in field_values:
                    field_values[field] = []
                field_values[field].append(val)

        # Raw data fields
        for key, val in ticket.raw_data.items():
            if not val:
                continue
            k = str(key)
            # Skip fields that look like IDs or long text
            if k.lower() in {
                'ticket_id', 'title', 'id', 'number', 'sys_id',
                'description', 'short description', 'detailed description',
                'comments', 'notes', 'resolution_notes', 'work notes',
                'details', 'additional comments', 'activity',
            }:
                continue
            if k not in field_values:
                field_values[k] = []
            field_values[k].append(str(val))

    field_breakdowns = {}
    for field_name, values in field_values.items():
        unique_count = len(set(values))
        if unique_count <= FIELD_BREAKDOWN_MAX_DISTINCT and len(values) > 0:
            counter = Counter(values)
            field_breakdowns[field_name] = dict(counter)

    return field_breakdowns


def compute_monthly_kpi(user: User, month: datetime.date) -> Optional[MonthlyKPI]:
    """
    Compute or update MonthlyKPI for a user/month.
    Called automatically by signals when a TicketImportBatch is saved.
    """
    batches = TicketImportBatch.objects.filter(
        user=user,
        month=month,
        is_overridden=False
    ).prefetch_related('tickets')

    if not batches.exists():
        MonthlyKPI.objects.filter(user=user, month=month).delete()
        return None

    tickets = NormalizedTicket.objects.filter(batch__in=batches)
    total = tickets.count()

    if total == 0:
        MonthlyKPI.objects.filter(user=user, month=month).delete()
        return None

    # Status counts (from standard field, now always populated at import time)
    closed_count = tickets.filter(status='closed').count()
    open_count = tickets.filter(status='open').count()

    # Resolution time stats
    resolved_tickets = tickets.filter(time_to_resolution_hours__isnull=False)
    avg_resolution = None
    min_resolution = None
    max_resolution = None
    p50_resolution = None
    p75_resolution = None
    p90_resolution = None
    if resolved_tickets.exists():
        stats = resolved_tickets.aggregate(
            avg=Avg('time_to_resolution_hours'),
            min_val=Min('time_to_resolution_hours'),
            max_val=Max('time_to_resolution_hours')
        )
        avg_resolution = round(stats['avg'] or 0, 2)
        min_resolution = round(stats['min_val'] or 0, 2)
        max_resolution = round(stats['max_val'] or 0, 2)

        # Percentiles: fetch sorted values and pick by index.
        # P_p = x[floor(n * p)]  (nearest-rank method)
        resolution_values = sorted(
            resolved_tickets.values_list('time_to_resolution_hours', flat=True)
        )
        n = len(resolution_values)
        p50_resolution = round(resolution_values[int(n * 0.50)], 2)
        p75_resolution = round(resolution_values[int(n * 0.75)], 2)
        p90_resolution = round(resolution_values[min(int(n * 0.90), n - 1)], 2)

    # SLA stats
    sla_known = tickets.filter(sla_breached__isnull=False)
    sla_compliance = None
    sla_breached_count = 0
    if sla_known.exists():
        breached = sla_known.filter(sla_breached=True).count()
        sla_breached_count = breached
        sla_compliance = round(((sla_known.count() - breached) / sla_known.count()) * 100, 1)

    # Legacy breakdowns (for backward compatibility)
    categories = {}
    for cat in tickets.values('category').annotate(cnt=Count('id')):
        cat_name = cat['category'] or 'Uncategorized'
        if cat_name:
            categories[cat_name] = cat['cnt']

    priorities = {}
    for pri in tickets.values('priority').annotate(cnt=Count('id')):
        pri_name = pri['priority'] or 'Unspecified'
        if pri_name:
            priorities[pri_name] = pri['cnt']

    statuses = {}
    for st in tickets.values('status').annotate(cnt=Count('id')):
        if st['status']:
            statuses[st['status']] = st['cnt']

    # Dynamic field breakdowns (new canonical source)
    field_breakdowns = _build_field_breakdowns(tickets)

    # Upsert MonthlyKPI
    kpi, created = MonthlyKPI.objects.update_or_create(
        user=user,
        month=month,
        defaults={
            'total_tickets': total,
            'closed_tickets': closed_count,
            'open_tickets': open_count,
            'avg_resolution_hours': avg_resolution,
            'min_resolution_hours': min_resolution,
            'max_resolution_hours': max_resolution,
            'p50_resolution_hours': p50_resolution,
            'p75_resolution_hours': p75_resolution,
            'p90_resolution_hours': p90_resolution,
            'sla_compliance_pct': sla_compliance,
            'sla_breached_count': sla_breached_count,
            'by_category': categories,
            'by_priority': priorities,
            'by_status': statuses,
            'field_breakdowns': field_breakdowns,
        }
    )

    return kpi


def get_user_monthly_summary(user: User, months: int = 12) -> List[Dict[str, Any]]:
    """
    Get monthly KPI summary for a user (last N months).
    Returns list of dicts for dashboard trend charts.

    Zero-fills months that have no MonthlyKPI record so the trend chart
    shows a continuous 12-month axis instead of gaps.
    """
    from datetime import date as _date
    from django.utils import timezone

    kpis = MonthlyKPI.objects.filter(user=user).order_by('-month')[:months]
    kpi_map = {kpi.month: kpi for kpi in kpis}

    # Build the full month range (oldest → newest) for the last N months,
    # ending on the first day of the current month. Use timezone.now().date()
    # so the boundary respects Django's TIME_ZONE setting in USE_TZ apps.
    today = timezone.now().date()
    month_start = _date(today.year, today.month, 1)
    result: List[Dict[str, Any]] = []
    for i in range(months - 1, -1, -1):
        y = month_start.year
        m = month_start.month - i
        while m <= 0:
            m += 12
            y -= 1
        month_date = _date(y, m, 1)
        kpi = kpi_map.get(month_date)
        if kpi:
            result.append({
                'month': month_date.strftime('%Y-%m'),
                'total_tickets': kpi.total_tickets,
                'closed_tickets': kpi.closed_tickets,
                'open_tickets': kpi.open_tickets,
                'avg_resolution_hours': kpi.avg_resolution_hours,
                'p50_resolution_hours': kpi.p50_resolution_hours,
                'p75_resolution_hours': kpi.p75_resolution_hours,
                'p90_resolution_hours': kpi.p90_resolution_hours,
                'sla_compliance_pct': kpi.sla_compliance_pct,
                'by_category': kpi.by_category,
                'by_priority': kpi.by_priority,
                'by_status': kpi.by_status,
                'field_breakdowns': kpi.field_breakdowns,
            })
        else:
            result.append({
                'month': month_date.strftime('%Y-%m'),
                'total_tickets': 0,
                'closed_tickets': 0,
                'open_tickets': 0,
                'avg_resolution_hours': 0,
                'sla_compliance_pct': 0,
                'by_category': {},
                'by_priority': {},
                'by_status': {},
                'field_breakdowns': {},
            })

    return result


def get_team_monthly_summary(
    team_members: List[User],
    month: datetime.date,
    client_ids: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Aggregate KPIs across team members for a specific month.
    Used by Team Leaders. Optionally filter by client IDs.
    """
    if client_ids:
        # Dynamic computation when filtering by client
        batches = TicketImportBatch.objects.filter(
            user__in=team_members,
            month=month,
            is_overridden=False,
            clients__id__in=client_ids
        ).distinct()
        tickets = NormalizedTicket.objects.filter(batch__in=batches)
        total = tickets.count()

        if total == 0:
            return {
                'month': month.strftime('%Y-%m'),
                'members_with_data': 0,
                'total_tickets': 0,
                'avg_tickets_per_member': 0,
                'avg_resolution_hours': None,
                'sla_compliance_pct': None,
                'field_breakdowns': {},
            }

        resolved = tickets.filter(time_to_resolution_hours__isnull=False)
        avg_res = resolved.aggregate(avg=Avg('time_to_resolution_hours'))['avg']
        sla_known = tickets.filter(sla_breached__isnull=False)
        avg_sla = None
        if sla_known.exists():
            breached = sla_known.filter(sla_breached=True).count()
            avg_sla = round(((sla_known.count() - breached) / sla_known.count()) * 100, 1)

        return {
            'month': month.strftime('%Y-%m'),
            'members_with_data': batches.values('user').distinct().count(),
            'total_tickets': total,
            'avg_tickets_per_member': round(total / len(team_members), 1) if team_members else 0,
            'avg_resolution_hours': round(avg_res, 2) if avg_res else None,
            'sla_compliance_pct': avg_sla,
            'field_breakdowns': _build_field_breakdowns(tickets),
        }

    # Pre-computed path (no client filter)
    kpis = MonthlyKPI.objects.filter(
        user__in=team_members,
        month=month
    )

    if not kpis.exists():
        return {
            'month': month.strftime('%Y-%m'),
            'members_with_data': 0,
            'total_tickets': 0,
            'avg_tickets_per_member': 0,
            'avg_resolution_hours': None,
            'sla_compliance_pct': None,
            'field_breakdowns': {},
        }

    totals = kpis.aggregate(
        total=Sum('total_tickets'),
        avg_res=Avg('avg_resolution_hours'),
        avg_sla=Avg('sla_compliance_pct'),
    )

    # Merge field_breakdowns across all team members
    merged_breakdowns = {}
    for kpi in kpis:
        for field, values in (kpi.field_breakdowns or {}).items():
            if field not in merged_breakdowns:
                merged_breakdowns[field] = {}
            for val, count in values.items():
                merged_breakdowns[field][val] = merged_breakdowns[field].get(val, 0) + count

    return {
        'month': month.strftime('%Y-%m'),
        'members_with_data': kpis.count(),
        'total_tickets': totals['total'] or 0,
        'avg_tickets_per_member': round((totals['total'] or 0) / len(team_members), 1) if team_members else 0,
        'avg_resolution_hours': round(totals['avg_res'], 2) if totals['avg_res'] else None,
        'sla_compliance_pct': round(totals['avg_sla'], 1) if totals['avg_sla'] else None,
        'field_breakdowns': merged_breakdowns,
    }


def compute_yearly_summary(
    year: int,
    user_ids: Optional[List[int]] = None,
    client_ids: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Compute yearly summary for selected users.
    Returns data structure ready for Excel/CSV export.
    """
    from django.contrib.auth.models import User

    if client_ids:
        # Dynamic path: compute from tickets filtered by client
        batches = TicketImportBatch.objects.filter(
            month__year=year,
            is_overridden=False,
            clients__id__in=client_ids
        ).distinct()
        if user_ids:
            batches = batches.filter(user_id__in=user_ids)

        tickets = NormalizedTicket.objects.filter(batch__in=batches)
        total = tickets.count()

        if total == 0:
            return {
                'year': year,
                'users_with_data': 0,
                'total_tickets': 0,
                'monthly_breakdown': [],
                'per_user_summary': [],
                'field_breakdowns': {},
            }

        resolved = tickets.filter(time_to_resolution_hours__isnull=False)
        avg_res = resolved.aggregate(avg=Avg('time_to_resolution_hours'))['avg']
        sla_known = tickets.filter(sla_breached__isnull=False)
        avg_sla = None
        if sla_known.exists():
            breached = sla_known.filter(sla_breached=True).count()
            avg_sla = round(((sla_known.count() - breached) / sla_known.count()) * 100, 1)

        # Monthly breakdown from batches
        monthly = []
        for batch in batches.order_by('month').values('month').annotate(
            total=Count('tickets')
        ):
            month_tickets = tickets.filter(batch__month=batch['month'])
            month_res = month_tickets.filter(time_to_resolution_hours__isnull=False).aggregate(
                avg=Avg('time_to_resolution_hours')
            )['avg']
            monthly.append({
                'month': batch['month'].strftime('%Y-%m'),
                'total_tickets': batch['total'],
                'avg_resolution_hours': round(month_res, 2) if month_res else None,
            })

        # Per-user summary
        per_user = []
        for user in User.objects.filter(id__in=batches.values_list('user', flat=True).distinct()):
            user_tickets = tickets.filter(batch__user=user)
            user_res = user_tickets.filter(time_to_resolution_hours__isnull=False).aggregate(
                avg=Avg('time_to_resolution_hours')
            )['avg']
            per_user.append({
                'user_id': user.id,
                'username': user.username,
                'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username,
                'total_tickets': user_tickets.count(),
                'avg_resolution_hours': round(user_res, 2) if user_res else None,
            })

        return {
            'year': year,
            'users_with_data': len(per_user),
            'total_tickets': total,
            'avg_resolution_hours': round(avg_res, 2) if avg_res else None,
            'sla_compliance_pct': avg_sla,
            'monthly_breakdown': monthly,
            'per_user_summary': per_user,
            'field_breakdowns': _build_field_breakdowns(tickets),
        }

    # Pre-computed path
    queryset = MonthlyKPI.objects.filter(month__year=year)
    if user_ids:
        queryset = queryset.filter(user_id__in=user_ids)

    if not queryset.exists():
        return {
            'year': year,
            'users_with_data': 0,
            'total_tickets': 0,
            'monthly_breakdown': [],
            'per_user_summary': [],
            'field_breakdowns': {},
        }

    totals = queryset.aggregate(
        total=Sum('total_tickets'),
        avg_res=Avg('avg_resolution_hours'),
        avg_sla=Avg('sla_compliance_pct'),
    )

    monthly = []
    for month_kpis in queryset.values('month').annotate(
        total=Sum('total_tickets'),
        avg_res=Avg('avg_resolution_hours'),
        avg_sla=Avg('sla_compliance_pct'),
    ).order_by('month'):
        monthly.append({
            'month': month_kpis['month'].strftime('%Y-%m'),
            'total_tickets': month_kpis['total'] or 0,
            'avg_resolution_hours': round(month_kpis['avg_res'], 2) if month_kpis['avg_res'] else None,
            'sla_compliance_pct': round(month_kpis['avg_sla'], 1) if month_kpis['avg_sla'] else None,
        })

    per_user = []
    for user_kpis in queryset.values(
        'user__id', 'user__username', 'user__first_name', 'user__last_name'
    ).annotate(
        total=Sum('total_tickets'),
        avg_res=Avg('avg_resolution_hours'),
        avg_sla=Avg('sla_compliance_pct'),
    ).order_by('-total'):
        full_name = f"{user_kpis['user__first_name'] or ''} {user_kpis['user__last_name'] or ''}".strip()
        per_user.append({
            'user_id': user_kpis['user__id'],
            'username': user_kpis['user__username'],
            'name': full_name or user_kpis['user__username'],
            'total_tickets': user_kpis['total'] or 0,
            'avg_resolution_hours': round(user_kpis['avg_res'], 2) if user_kpis['avg_res'] else None,
            'sla_compliance_pct': round(user_kpis['avg_sla'], 1) if user_kpis['avg_sla'] else None,
        })

    return {
        'year': year,
        'users_with_data': len(per_user),
        'total_tickets': totals['total'] or 0,
        'avg_resolution_hours': round(totals['avg_res'], 2) if totals['avg_res'] else None,
        'sla_compliance_pct': round(totals['avg_sla'], 1) if totals['avg_sla'] else None,
        'monthly_breakdown': monthly,
        'per_user_summary': per_user,
        'field_breakdowns': {},
    }
