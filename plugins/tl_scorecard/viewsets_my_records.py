"""The employee's own, read-only view of records about them.

Deliberately not built on the record serializers: the response is a fixed
whitelist, so a field added to a model later can never reach the employee by
accident. Promotions, idle flags, absences and every TL-private note are absent.
Open to any authenticated user (it only ever returns their own rows), so it does
not depend on a plugin permission grant, which employees do not hold.
"""
from rest_framework import permissions, viewsets
from rest_framework.response import Response

from core.mixins.permissions import HbprBlockedMixin, HrOnlyBlockedMixin, PluginEnabledMixin

from .models import EPRCycle, Meeting, OneOnOnePlan, PIPRecord
from .one_on_one import cadence_label, next_slot


def _name(user):
    return (user.get_full_name() or user.username) if user else ''


def _one_on_ones(user):
    meetings = (
        Meeting.objects.filter(
            meeting_type='one_on_one', counterparty=user, shared_at__isnull=False,
        ).select_related('organizer').order_by('-occurred_on', '-id')
    )
    return [
        {
            'id': m.id,
            'occurred_on': m.occurred_on,
            'with_name': _name(m.organizer),
            'summary': m.shared_summary,
        }
        for m in meetings
    ]


def _next_one_on_one(user):
    """The date of the employee's next recurring 1-on-1 with their CURRENT leader.

    A whitelist of three fields: no status, no skip reasons, no overdue wording. A plan
    from a former leader is not shown.
    """
    profile = getattr(user, 'profile', None)
    if profile is None:
        return None
    leader_ids = [i for i in (profile.albanian_tl_id, profile.italian_tl_id) if i]
    plans = {
        p.leader_id: p
        for p in OneOnOnePlan.objects.filter(employee=user, leader_id__in=leader_ids).select_related('leader')
    }
    plan = next((plans[i] for i in leader_ids if i in plans), None)
    if plan is None:
        return None
    return {
        'with_name': _name(plan.leader),
        'next_due_on': next_slot(plan).due_on,
        'cadence_display': cadence_label(plan),
    }


def _pips(user):
    # Shown from approval onward; a draft, or a plan returned before approval, is
    # the TL's proposal under review and is not the employee's to see.
    plans = PIPRecord.objects.filter(employee=user, approved_at__isnull=False).order_by('-start_date', '-id')
    return [
        {
            'id': p.id,
            'status': p.status,
            'start_date': p.start_date,
            'closed_on': p.closed_on,
            'shared_notes': p.shared_notes,
        }
        for p in plans
    ]


def _epr_cycles(user):
    cycles = EPRCycle.objects.filter(user=user).prefetch_related(
        'goals', 'stage_records').order_by('-year')
    return [
        {
            'id': c.id,
            'year': c.year,
            'goal_setting_completed_at': c.goal_setting_completed_at,
            'mid_year_completed_at': c.mid_year_completed_at,
            'final_review_completed_at': c.final_review_completed_at,
            'goals': [{'id': g.id, 'description': g.description} for g in c.goals.all()],
            'stage_summaries': [
                {'stage': r.stage, 'summary': r.summary}
                for r in c.stage_records.all() if r.shared_with_employee
            ],
        }
        for c in cycles
    ]


class MyRecordsViewSet(HrOnlyBlockedMixin, HbprBlockedMixin, PluginEnabledMixin, viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def list(self, request):
        user = request.user
        return Response({
            'one_on_ones': _one_on_ones(user),
            'next_one_on_one': _next_one_on_one(user),
            'pips': _pips(user),
            'epr_cycles': _epr_cycles(user),
        })
