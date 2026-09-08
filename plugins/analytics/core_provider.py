from typing import List, Dict, Any
from django.utils import timezone
from django.db.models import Sum, Avg, F, ExpressionWrapper, fields
from datetime import timedelta
from .providers import AnalyticsProvider, analytics_registry
from apps.leave_management.models import LeaveRequest
from apps.overtime.models import OvertimeLog
from django.contrib.auth.models import User
import logging

logger = logging.getLogger(__name__)

class CoreAnalyticsProvider(AnalyticsProvider):
    @property
    def provider_name(self) -> str:
        return "core_analytics"

    def get_metrics(self, period: str = 'month', **kwargs) -> List[Dict[str, Any]]:
        now = timezone.now()
        if period == 'week':
            start_date = now - timedelta(days=7)
        elif period == 'year':
            start_date = now - timedelta(days=365)
        else:
            start_date = now - timedelta(days=30)

        metrics = []
        
        # 1. MTTA (Mean Time to Approval) for Leave
        mtta_leave = self._calculate_mtta(LeaveRequest, start_date)
        metrics.append({
            'name': 'MTTA (Leave)',
            'value': round(mtta_leave, 1),
            'unit': 'hours',
            'trend': 'stable', # Placeholder
            'change': 0,
            'metadata': {'description': 'Mean Time to Approval for leave requests'}
        })

        # 2. MTTA for Overtime
        mtta_overtime = self._calculate_mtta(OvertimeLog, start_date)
        metrics.append({
            'name': 'MTTA (Overtime)',
            'value': round(mtta_overtime, 1),
            'unit': 'hours',
            'trend': 'stable',
            'change': 0,
            'metadata': {'description': 'Mean Time to Approval for overtime logs'}
        })

        # 3. Utilization Rate (Active Users / Total Users)
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        utilization = (active_users / total_users * 100) if total_users > 0 else 0
        metrics.append({
            'name': 'System Utilization',
            'value': round(utilization, 1),
            'unit': '%',
            'trend': 'up' if utilization > 80 else 'stable',
            'change': 0,
            'metadata': {'active': active_users, 'total': total_users}
        })

        return metrics

    def get_charts(self, period: str = 'month', **kwargs) -> List[Dict[str, Any]]:
        # Placeholder for advanced charts (Heatmaps, Multi-series)
        return []

    def _calculate_mtta(self, model, start_date) -> float:
        """Calculates average hours between creation and approval."""
        approved_items = model.objects.filter(
            status='approved',
            created_at__gte=start_date,
            approved_at__isnull=False
        ).annotate(
            approval_duration=ExpressionWrapper(
                F('approved_at') - F('created_at'),
                output_field=fields.DurationField()
            )
        )
        
        avg_duration = approved_items.aggregate(Avg('approval_duration'))['approval_duration__avg']
        if avg_duration:
            return avg_duration.total_seconds() / 3600
        return 0

    def get_hotspots(self, start_date) -> List[Dict[str, Any]]:
        """Identifies teams with overtime exceeding 1.5 standard deviations."""
        
        team_stats = OvertimeLog.objects.filter(
            created_at__gte=start_date,
            status='approved'
        ).values('user__profile__teams__name').annotate(
            total_hours=Sum('hours')
        )
        
        if not team_stats:
            return []
            
        avg_hours = sum(t['total_hours'] for t in team_stats) / len(team_stats)
        # Simple hotspot detection (teams > 20% above average for now)
        hotspots = [
            {
                'team': t['user__profile__teams__name'],
                'hours': float(t['total_hours']),
                'severity': 'high' if t['total_hours'] > avg_hours * 1.5 else 'medium'
            }
            for t in team_stats if t['total_hours'] > avg_hours * 1.2
        ]
        return hotspots

# Register the provider
analytics_registry.register(CoreAnalyticsProvider())
