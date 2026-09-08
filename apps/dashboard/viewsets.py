"""
Dashboard app viewsets.
"""

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.contrib.auth import get_user_model
from django.db import models, transaction
from core.mixins.cache import CacheInvalidationMixin
from core.mixins.permissions import IsHR, has_hr_role, has_team_leader_role
from django.db.models import Q, Count
from .models import DashboardWidget, UserDashboardPreference
from .models.calendar import CalendarWorkspace, UserCalendarPreference, PublicHoliday
from .serializers import (
    DashboardWidgetSerializer,
    UserDashboardPreferenceSerializer,
    CalendarWorkspaceSerializer,
    UserCalendarPreferenceSerializer,
    PublicHolidaySerializer,
    WorkspaceUserSerializer,
)

User = get_user_model()


class DashboardWidgetViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DashboardWidget.objects.filter(is_active=True)
    serializer_class = DashboardWidgetSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['widget_type']

    def _get_team_and_members(self, request):
        """
        Get team and team member IDs for dashboard actions.
        Returns: (team, team_member_ids, error_code)
        error_code can be: 'no_profile', 'team_not_found', 'no_team', or None
        """
        import logging
        from apps.users.models import Team, UserProfile

        logger = logging.getLogger(__name__)
        team_id = request.query_params.get('team_id')
        user = request.user

        if not hasattr(user, 'profile'):
            return None, None, 'no_profile'

        if team_id:
            team = Team.objects.filter(id=team_id).first()
            if not team:
                return None, None, 'team_not_found'
        else:
            team = user.profile.teams.first()

        logger.debug(f"[TL Dashboard] user={user.id}, team_id_param={team_id}, team_from_profile={team.id if team else None}")

        # Get members from direct TL assignments
        albanian_member_ids = set(UserProfile.objects.filter(albanian_tl=user).values_list('user_id', flat=True))
        italian_member_ids = set(UserProfile.objects.filter(italian_tl=user).values_list('user_id', flat=True))
        direct_member_ids = albanian_member_ids.union(italian_member_ids)

        logger.debug(f"[TL Dashboard] direct_tl_members={direct_member_ids}")

        if not team and not direct_member_ids:
            return None, None, 'no_team'

        # Get team members via teams M2M relationship
        team_member_ids = set()
        if team:
            team_member_ids = set(UserProfile.objects.filter(teams=team).values_list('user_id', flat=True))
            logger.debug(f"[TL Dashboard] team_m2m_members={team_member_ids}")

        # Combine both sources
        team_member_ids.update(direct_member_ids)

        # Always include the current user so TL can see their own data alongside team members
        team_member_ids.add(user.id)

        logger.debug(f"[TL Dashboard] final_member_ids={team_member_ids}")

        return team, list(team_member_ids), None

    @action(detail=False, methods=['get'], permission_classes=[IsHR])
    def global_stats(self, request):
        """
        Get global statistics for HR/Admin dashboard.
        Returns: total_users, total_overtime_hours, total_standby_hours, pending_overtime, pending_standby, pending_leaves
        """
        from django.db.models import Sum
        from django.db.models.functions import Coalesce
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog
        from apps.leave_management.models import LeaveRequest

        # Total users count
        total_users = User.objects.count()

        # Overtime stats
        overtime_stats = OvertimeLog.objects.aggregate(
            total_hours=Coalesce(Sum('hours', filter=Q(status='approved')), 0.0, output_field=models.FloatField()),
            pending_count=Count('id', filter=Q(status='pending')),
            approved_count=Count('id', filter=Q(status='approved')),
            rejected_count=Count('id', filter=Q(status='rejected')),
        )

        # Standby stats
        standby_stats = StandbyLog.objects.aggregate(
            total_hours=Coalesce(Sum('hours', filter=Q(status='approved')), 0.0, output_field=models.FloatField()),
            pending_count=Count('id', filter=Q(status='pending')),
            approved_count=Count('id', filter=Q(status='approved')),
            rejected_count=Count('id', filter=Q(status='rejected')),
        )

        # Leave stats
        leave_stats = LeaveRequest.objects.aggregate(
            pending_count=Count('id', filter=Q(status='pending')),
            approved_count=Count('id', filter=Q(status='approved')),
            rejected_count=Count('id', filter=Q(status='rejected')),
        )

        # Active teams
        from apps.users.models import Team
        active_teams_count = Team.objects.count()

        # Average overtime per employee
        avg_overtime_hours = (
            overtime_stats['total_hours'] / total_users
            if total_users > 0 else 0.0
        )

        return Response({
            'total_users': total_users,
            'total_overtime_hours': overtime_stats['total_hours'],
            'total_standby_hours': standby_stats['total_hours'],
            'pending_overtime': overtime_stats['pending_count'],
            'approved_overtime': overtime_stats['approved_count'],
            'rejected_overtime': overtime_stats['rejected_count'],
            'pending_standby': standby_stats['pending_count'],
            'approved_standby': standby_stats['approved_count'],
            'rejected_standby': standby_stats['rejected_count'],
            'pending_leaves': leave_stats['pending_count'],
            'approved_leaves': leave_stats['approved_count'],
            'rejected_leaves': leave_stats['rejected_count'],
            'avg_overtime_hours': avg_overtime_hours,
            'active_teams_count': active_teams_count,
        })

    @action(detail=False, methods=['get'])
    def team_stats(self, request):
        """
        Get team statistics for dashboard.
        Query param: team_id (optional)
        Returns: pending_team_overtime, pending_team_standby, pending_team_leaves, team_size, approved_count, rejected_count, total_count
        """
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog
        from apps.leave_management.models import LeaveRequest

        team, team_member_ids, error = self._get_team_and_members(request)

        if error == 'no_profile' or error == 'no_team':
            return Response({
                'pending_team_overtime': 0,
                'pending_team_standby': 0,
                'pending_team_leaves': 0,
                'team_size': 0,
                'approved_count': 0,
                'rejected_count': 0,
                'total_count': 0,
            })
        if error == 'team_not_found':
            return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

        # 3 aggregate queries instead of 9 sequential COUNT queries
        ot_stats = OvertimeLog.objects.filter(user_id__in=team_member_ids).aggregate(
            pending=Count('id', filter=Q(status='pending')),
            approved=Count('id', filter=Q(status='approved')),
            rejected=Count('id', filter=Q(status='rejected')),
        )
        sb_stats = StandbyLog.objects.filter(user_id__in=team_member_ids).aggregate(
            pending=Count('id', filter=Q(status='pending')),
            approved=Count('id', filter=Q(status='approved')),
            rejected=Count('id', filter=Q(status='rejected')),
        )
        lv_stats = LeaveRequest.objects.filter(user_id__in=team_member_ids).aggregate(
            pending=Count('id', filter=Q(status='pending')),
            approved=Count('id', filter=Q(status='approved')),
            rejected=Count('id', filter=Q(status='rejected')),
        )

        pending_overtime = ot_stats['pending']
        pending_standby = sb_stats['pending']
        pending_leaves = lv_stats['pending']
        team_size = len(team_member_ids)

        approved_count = ot_stats['approved'] + sb_stats['approved'] + lv_stats['approved']
        rejected_count = ot_stats['rejected'] + sb_stats['rejected'] + lv_stats['rejected']
        total_count = pending_overtime + pending_standby + pending_leaves + approved_count + rejected_count

        return Response({
            'pending_team_overtime': pending_overtime,
            'pending_team_standby': pending_standby,
            'pending_team_leaves': pending_leaves,
            'team_size': team_size,
            'approved_count': approved_count,
            'rejected_count': rejected_count,
            'total_count': total_count,
        })

    @action(detail=False, methods=['get'])
    def pending_trend(self, request):
        """
        Get pending trend for last 14 days.
        Query param: team_id (optional)
        Returns: Array of {date, count} for each day
        """
        from datetime import timedelta, date as date_type
        from django.utils import timezone
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog
        from apps.leave_management.models import LeaveRequest

        team, team_member_ids, error = self._get_team_and_members(request)

        if error == 'no_profile' or error == 'no_team':
            return Response([])
        if error == 'team_not_found':
            return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()
        window_start = today - timedelta(days=13)

        # 3 bulk queries instead of 42 (14 days Ã— 3 models)
        ot_by_date = {
            row['date']: row['cnt']
            for row in OvertimeLog.objects.filter(
                user_id__in=team_member_ids,
                status='pending',
                date__gte=window_start,
                date__lte=today,
            ).values('date').annotate(cnt=Count('id'))
        }
        sb_by_date = {
            row['date']: row['cnt']
            for row in StandbyLog.objects.filter(
                user_id__in=team_member_ids,
                status='pending',
                date__gte=window_start,
                date__lte=today,
            ).values('date').annotate(cnt=Count('id'))
        }
        # Leave requests span multiple days; expand each request across the window
        leave_by_date: dict[date_type, int] = {}
        for lr in LeaveRequest.objects.filter(
            user_id__in=team_member_ids,
            status='pending',
            start_date__lte=today,
            end_date__gte=window_start,
        ).values('start_date', 'end_date'):
            cur = max(lr['start_date'], window_start)
            end = min(lr['end_date'], today)
            while cur <= end:
                leave_by_date[cur] = leave_by_date.get(cur, 0) + 1
                cur += timedelta(days=1)

        trend_data = []
        for i in range(13, -1, -1):
            day = today - timedelta(days=i)
            trend_data.append({
                'date': day.isoformat(),
                'count': ot_by_date.get(day, 0) + sb_by_date.get(day, 0) + leave_by_date.get(day, 0),
            })

        return Response(trend_data)

    @action(detail=False, methods=['get'])
    def monthly_comparison(self, request):
        """
        Get month-over-month comparison data for pending approvals.
        Returns current month and previous month totals with percentage change.
        """
        from datetime import date as date_cls
        from django.utils import timezone
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog
        from apps.leave_management.models import LeaveRequest
        from calendar import monthrange

        team, team_member_ids, error = self._get_team_and_members(request)

        if error == 'no_profile' or error == 'no_team':
            return Response({})
        if error == 'team_not_found':
            return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()
        current_month = today.month
        current_year = today.year

        # Calculate previous month
        if current_month == 1:
            prev_month = 12
            prev_year = current_year - 1
        else:
            prev_month = current_month - 1
            prev_year = current_year

        # Get days in each month for normalization
        prev_month_days = monthrange(prev_year, prev_month)[1]
        days_elapsed_current = today.day

        # Helper to get monthly counts
        def get_monthly_counts(year, month, member_ids):
            overtime_count = OvertimeLog.objects.filter(
                user_id__in=member_ids,
                status='pending',
                date__year=year,
                date__month=month
            ).count()

            standby_count = StandbyLog.objects.filter(
                user_id__in=member_ids,
                status='pending',
                date__year=year,
                date__month=month
            ).count()

            # Count leave requests that overlap with this month
            month_start = date_cls(year, month, 1)
            month_end = date_cls(year, month, monthrange(year, month)[1])
            leave_count = LeaveRequest.objects.filter(
                user_id__in=member_ids,
                status='pending',
                start_date__lte=month_end,
                end_date__gte=month_start,
            ).count()

            return {
                'overtime': overtime_count,
                'standby': standby_count,
                'leave': leave_count,
                'total': overtime_count + standby_count + leave_count
            }

        # Get current month data
        current_data = get_monthly_counts(current_year, current_month, team_member_ids)

        # Get previous month data
        prev_data = get_monthly_counts(prev_year, prev_month, team_member_ids)

        # Calculate percentage change
        if prev_data['total'] > 0:
            percent_change = ((current_data['total'] - prev_data['total']) / prev_data['total']) * 100
        else:
            percent_change = 0 if current_data['total'] == 0 else 100

        # Normalize to daily averages for fair comparison
        current_daily_avg = current_data['total'] / days_elapsed_current if days_elapsed_current > 0 else 0
        prev_daily_avg = prev_data['total'] / prev_month_days if prev_month_days > 0 else 0

        return Response({
            'current_month': {
                'month': current_month,
                'year': current_year,
                'month_name': today.strftime('%b'),
                'data': current_data,
                'daily_average': round(current_daily_avg, 2)
            },
            'previous_month': {
                'month': prev_month,
                'year': prev_year,
                'month_name': date_cls(prev_year, prev_month, 1).strftime('%b'),
                'data': prev_data,
                'daily_average': round(prev_daily_avg, 2)
            },
            'comparison': {
                'percent_change': round(percent_change, 1),
                'is_positive': percent_change >= 0,
                'trend': 'increasing' if percent_change > 0 else 'decreasing' if percent_change < 0 else 'stable'
            }
        })

    @action(detail=False, methods=['get'])
    def top_pending_users(self, request):
        """
        Get top 5 users with most pending items.
        Query param: team_id (optional), limit (default: 5)
        Returns: Array of {user_id, user_name, pending_count}
        """
        from django.db.models import Count
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog
        from apps.leave_management.models import LeaveRequest

        team, team_member_ids, error = self._get_team_and_members(request)
        limit = int(request.query_params.get('limit', 5))

        if error == 'no_profile' or error == 'no_team':
            return Response([])
        if error == 'team_not_found':
            return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

        # Count pending items per user across all three types
        user_pending_counts = {}

        for model in [OvertimeLog, StandbyLog, LeaveRequest]:
            counts = model.objects.filter(
                user_id__in=team_member_ids,
                status='pending'
            ).values('user_id').annotate(count=Count('id'))

            for item in counts:
                user_pending_counts[item['user_id']] = user_pending_counts.get(item['user_id'], 0) + item['count']

        # Fetch all users in a single query instead of N+1 lookups
        user_map = {u.id: u for u in User.objects.filter(id__in=list(user_pending_counts.keys()))}

        # Build response data
        users_data = []
        for user_id, count in user_pending_counts.items():
            user_obj = user_map.get(user_id)
            if user_obj:
                users_data.append({
                    'user_id': user_id,
                    'user_name': f"{user_obj.first_name} {user_obj.last_name}",
                    'pending_count': count
                })

        # Sort by pending count descending and limit
        users_data.sort(key=lambda x: x['pending_count'], reverse=True)
        users_data = users_data[:limit]

        return Response(users_data)

    @action(detail=False, methods=['get'])
    def queue_highlights(self, request):
        """
        Get most recent pending items.
        Query param: team_id (optional), limit (default: 4)
        Returns: Array of pending items with user details
        """
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog
        from apps.leave_management.models import LeaveRequest

        team, team_member_ids, error = self._get_team_and_members(request)
        limit = int(request.query_params.get('limit', 4))

        if error == 'no_profile' or error == 'no_team':
            return Response([])
        if error == 'team_not_found':
            return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

        # Get recent pending items from all three types with select_related('user')
        # to avoid N+1 queries when accessing user details
        highlights = []

        # Overtime
        for item in OvertimeLog.objects.select_related('user').filter(
            user_id__in=team_member_ids,
            status='pending'
        ).order_by('-date')[:limit]:
            highlights.append({
                'id': item.id,
                'type': 'overtime',
                'user_name': f"{item.user.first_name} {item.user.last_name}",
                'date': item.date.isoformat(),
                'details': f"{item.hours}h - {item.description or 'No description'}",
                'status': item.status
            })

        # Standby
        for item in StandbyLog.objects.select_related('user').filter(
            user_id__in=team_member_ids,
            status='pending'
        ).order_by('-date')[:limit]:
            highlights.append({
                'id': item.id,
                'type': 'standby',
                'user_name': f"{item.user.first_name} {item.user.last_name}",
                'date': item.date.isoformat(),
                'details': f"{item.hours}h - {item.description or 'No description'}",
                'status': item.status
            })

        # Leave
        for item in LeaveRequest.objects.select_related('user').filter(
            user_id__in=team_member_ids,
            status='pending'
        ).order_by('-start_date')[:limit]:
            highlights.append({
                'id': item.id,
                'type': 'leave',
                'user_name': f"{item.user.first_name} {item.user.last_name}",
                'date': item.start_date.isoformat(),
                'details': f"{item.days_requested}d {item.request_type} - {item.reason or 'No reason'}",
                'status': item.status
            })

        # Sort by date descending and limit
        highlights.sort(key=lambda x: x['date'], reverse=True)
        highlights = highlights[:limit]

        return Response(highlights)


class UserDashboardPreferenceViewSet(CacheInvalidationMixin, viewsets.ModelViewSet):
    queryset = UserDashboardPreference.objects.all()
    serializer_class = UserDashboardPreferenceSerializer

    def get_queryset(self):
        # Superusers and staff can see all dashboard preferences
        if self.request.user.is_superuser or self.request.user.is_staff:
            return super().get_queryset()
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        # Use get_or_create to handle existing preferences gracefully
        dashboard_type = serializer.validated_data.get('dashboard_type')
        user = self.request.user

        existing = UserDashboardPreference.objects.filter(
            user=user,
            dashboard_type=dashboard_type
        ).first()

        if existing:
            # Update existing preference instead of creating new one
            serializer.update(existing, serializer.validated_data)
        else:
            serializer.save(user=self.request.user)
        self.invalidate_related_cache()

    def perform_update(self, serializer):
        serializer.save()
        self.invalidate_related_cache()

    def perform_destroy(self, instance):
        instance.delete()
        self.invalidate_related_cache()


class CalendarWorkspaceViewSet(CacheInvalidationMixin, viewsets.ModelViewSet):
    queryset = CalendarWorkspace.objects.all()
    serializer_class = CalendarWorkspaceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['is_public', 'team']

    def get_queryset(self):
        user = self.request.user
        return CalendarWorkspace.get_accessible_for_user(user).select_related('team').prefetch_related('team__team_leader')

    def _ensure_admin(self):
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            raise PermissionDenied("Only staff users can modify calendar workspaces.")

    def perform_create(self, serializer):
        self._ensure_admin()
        serializer.save()
        self.invalidate_related_cache()

    def perform_update(self, serializer):
        self._ensure_admin()
        serializer.save()
        self.invalidate_related_cache()

    def perform_destroy(self, instance):
        self._ensure_admin()
        instance.delete()
        self.invalidate_related_cache()

    @action(detail=False, methods=['get'])
    def my_workspaces(self, request):
        """
        Get workspaces the current user has added to their preferences.
        """
        prefs = UserCalendarPreference.objects.filter(
            user=request.user
        ).select_related('calendar')
        serializer = UserCalendarPreferenceSerializer(prefs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_teams_workspaces(self, request):
        """
        Get workspaces for the current user's teams.
        Returns workspaces linked to teams the user belongs to, plus workspaces from teams
        with the same calendar_group.
        For TLs: also includes workspaces for users assigned via albanian_tl/italian_tl.
        Falls back to workspaces where user is explicitly allowed if no team memberships.
        Team workspaces are returned first to ensure users see their own team's workspace.
        Note: Staff users are filtered to their team/calendar_group workspaces, not all workspaces.
        """
        user = request.user
        if not hasattr(user, 'profile'):
            return Response([])

        queryset = CalendarWorkspace.objects.all().select_related('team')
        team_workspaces = []

        # Get team memberships
        team_ids = list(user.profile.teams.values_list('id', flat=True))

        # Get team-linked workspaces if user has teams
        if team_ids:
            team_workspaces = list(queryset.filter(team_id__in=team_ids))

            # Also include workspaces from teams with same calendar_group
            calendar_groups = [
                group for group in user.profile.teams.values_list('calendar_group', flat=True)
                if group
            ]
            if calendar_groups:
                calendar_group_workspaces = list(queryset.filter(
                    team__calendar_group__in=calendar_groups
                ).exclude(team_id__in=team_ids))
                # Combine in Python, avoiding UNION
                team_workspaces.extend(calendar_group_workspaces)

        # For TLs: add workspaces for teams their managed members belong to.
        # Uses get_team_member_ids() — the canonical membership source that
        # combines FK assignments (albanian_tl/italian_tl), shared team M2M,
        # and led_teams (Team.team_leader). This keeps calendar workspace
        # visibility consistent with overtime/standby/leave viewsets and
        # satisfies CONTEXT.md critical rule #9 (no FK-only TL checks).
        if has_team_leader_role(user):
            from apps.users.models import UserProfile
            assigned_member_ids = user.profile.get_team_member_ids()

            if assigned_member_ids:
                # Get teams of assigned members
                member_teams = list(
                    UserProfile.objects.filter(user_id__in=assigned_member_ids)
                    .values_list('teams', flat=True)
                )
                member_teams = [t for t in member_teams if t]  # Filter nulls

                if member_teams:
                    member_workspaces = list(queryset.filter(team__in=member_teams))
                    team_workspaces.extend(member_workspaces)

        # Fallback: get workspaces where user is explicitly allowed
        if not team_workspaces:
            team_workspaces = list(queryset.filter(Q(allowed_users=user)))

        # Remove duplicates by ID
        seen_ids = set()
        unique_workspaces = []
        for ws in team_workspaces:
            if ws.id not in seen_ids:
                seen_ids.add(ws.id)
                unique_workspaces.append(ws)

        # Order by name
        unique_workspaces.sort(key=lambda x: x.name)
        serializer = self.get_serializer(unique_workspaces, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def list_for_reports(self, request):
        """
        Return simplified workspace list for HR report filters.
        Includes id, name, and user count.
        HR users see all workspaces, other users see accessible workspaces.
        """
        user = request.user
        if has_hr_role(user) and not user.is_staff:
            queryset = CalendarWorkspace.objects.all()
        else:
            queryset = CalendarWorkspace.get_accessible_for_user(user)

        queryset = queryset.annotate(
            user_count=Count('team__members', distinct=True)
        ).order_by('name')

        data = [
            {
                'id': ws.id,
                'name': ws.name,
                'user_count': ws.user_count or 0
            }
            for ws in queryset
        ]
        return Response(data)

    @action(detail=True, methods=['get'])
    def workspace_users(self, request, pk=None):
        """
        Get users for a specific workspace.
        Returns users from the workspace's team.
        If workspace has no team, returns all users with access to the workspace.
        """
        workspace = self.get_object()
        # Verify user has access to this workspace
        if not self.get_queryset().filter(id=workspace.id).exists():
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

        # Get all workspace users (without select_related to avoid conflict)
        users = workspace.get_users_for_workspace()

        users_list = list(users)
        serializer = WorkspaceUserSerializer(users_list, many=True, context={'workspace': workspace})
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def add_workspace(self, request):
        """
        Add a workspace to user's preferences.
        Payload: {calendar_id: number}
        """
        calendar_id = request.data.get('calendar_id')
        if not calendar_id:
            return Response({'error': 'calendar_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            calendar_id = int(calendar_id)
        except (TypeError, ValueError):
            return Response({'error': 'calendar_id must be a valid integer'}, status=status.HTTP_400_BAD_REQUEST)

        workspace = CalendarWorkspace.objects.filter(id=calendar_id).first()
        if not workspace:
            return Response({'error': 'Workspace not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check if user can access this workspace
        if not workspace.is_public and not workspace.allowed_users.filter(id=request.user.id).exists():
            if not CalendarWorkspace.get_accessible_for_user(request.user).filter(id=workspace.id).exists():
                return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

        pref, created = UserCalendarPreference.objects.get_or_create(
            user=request.user,
            calendar=workspace,
            defaults={'is_active': True}
        )
        if not created:
            pref.is_active = True
            pref.save()

        serializer = UserCalendarPreferenceSerializer(pref)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def set_active_workspace(self, request):
        """
        Set a workspace as the active/default workspace for the user.
        Payload: {preference_id: number}
        """
        pref_id = request.data.get('preference_id')
        if not pref_id:
            return Response({'error': 'preference_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            pref_id = int(pref_id)
        except (TypeError, ValueError):
            return Response({'error': 'preference_id must be a valid integer'}, status=status.HTTP_400_BAD_REQUEST)

        pref = UserCalendarPreference.objects.filter(id=pref_id, user=request.user).first()
        if not pref:
            return Response({'error': 'Preference not found'}, status=status.HTTP_404_NOT_FOUND)

        # Set all other preferences to inactive, then activate this one.
        # Wrapped in a transaction so a concurrent request can't leave two
        # preferences active simultaneously.
        with transaction.atomic():
            UserCalendarPreference.objects.filter(user=request.user).update(is_active=False)
            pref.is_active = True
            pref.save()

        serializer = UserCalendarPreferenceSerializer(pref)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_allowed_user(self, request, pk=None):
        self._ensure_admin()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return Response({'error': 'user_id must be a valid integer'}, status=status.HTTP_400_BAD_REQUEST)
        from django.contrib.auth import get_user_model
        target_user = get_user_model().objects.filter(id=user_id).first()
        if not target_user:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        workspace = self.get_object()
        workspace.allowed_users.add(target_user)
        return Response({'status': 'user added'})

    @action(detail=True, methods=['post'])
    def remove_allowed_user(self, request, pk=None):
        self._ensure_admin()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return Response({'error': 'user_id must be a valid integer'}, status=status.HTTP_400_BAD_REQUEST)
        workspace = self.get_object()
        workspace.allowed_users.remove(user_id)
        return Response({'status': 'user removed'})


class PublicHolidayViewSet(CacheInvalidationMixin, viewsets.ModelViewSet):
    queryset = PublicHoliday.objects.all().select_related('calendar')
    serializer_class = PublicHolidaySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['calendar', 'country_code', 'is_global', 'date']
    search_fields = ['name', 'country_code']

    def get_queryset(self):
        queryset = super().get_queryset()
        calendar_id = self.request.query_params.get('calendar')
        if calendar_id:
            queryset = queryset.filter(calendar_id=calendar_id)
        return queryset

    def _ensure_admin(self):
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            raise PermissionDenied("Only staff users can modify holidays.")

    def perform_create(self, serializer):
        self._ensure_admin()
        serializer.save()
        self.invalidate_related_cache()

    def perform_update(self, serializer):
        self._ensure_admin()
        serializer.save()
        self.invalidate_related_cache()

    def perform_destroy(self, instance):
        self._ensure_admin()
        instance.delete()
        self.invalidate_related_cache()
