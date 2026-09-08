"""
Reports app viewsets.
"""

import logging
from datetime import datetime, timedelta
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import BasePermission, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from drf_spectacular.openapi import OpenApiParameter
from drf_spectacular.types import OpenApiTypes
from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncMonth, TruncYear
from .models.core import ReportTemplate, GeneratedReport, AuditLog
from .serializers import ReportTemplateSerializer, GeneratedReportSerializer, AuditLogSerializer, InsightsSerializer, TopTeamLeaderSerializer
from core.mixins.permissions import (
    TeamLeaderFilterMixin,
    has_hr_role,
    has_team_leader_role,
    is_cr_admin,
)
from .filters import UnifiedReportFilter, apply_visibility_constraints
from .services.export_service import export_service, ExportConfig

logger = logging.getLogger(__name__)


class CanViewReports(BasePermission):
    """Allow report access to application users, excluding CR-only users."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser or is_cr_admin(user):
            return True
        if has_hr_role(user) or has_team_leader_role(user):
            return True
        try:
            from plugins.control_room.services.scope_service import get_access_for_user
            return get_access_for_user(user) is None
        except Exception:
            return True


class ReportTemplateViewSet(viewsets.ModelViewSet):
    queryset = ReportTemplate.objects.filter(is_active=True)
    serializer_class = ReportTemplateSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser or has_hr_role(user):
            return self.queryset
        return self.queryset.none()

    def get_permissions(self):
        """
        HR users can create/update their own templates.
        Admin users have full access.
        """
        from rest_framework.permissions import IsAdminUser
        user = self.request.user

        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            if user.is_staff or user.is_superuser:
                return [IsAuthenticated()]
            elif has_hr_role(user):
                return [IsAuthenticated()]
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        """
        Set the current user as the template owner when HR creates a template.
        """
        serializer.save()

    @action(detail=False, methods=['post'])
    def save_from_filters(self, request):
        """
        Save current filter state as a new report template.
        Payload: {name: string, description?: string, configuration: object}
        """
        user = request.user

        if not (user.is_staff or user.is_superuser or (has_hr_role(user))):
            return Response(
                {'error': 'Only HR users and admins can save report templates.'},
                status=status.HTTP_403_FORBIDDEN
            )

        name = request.data.get('name')
        if not name:
            return Response(
                {'error': 'Template name is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if len(str(name)) > 200:
            return Response(
                {'error': 'Template name must not exceed 200 characters.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        configuration = request.data.get('configuration', {})
        description = request.data.get('description', '')

        template = ReportTemplate.objects.create(
            name=name,
            description=description,
            configuration=configuration,
            report_type=configuration.get('report_type', 'combined'),
            is_active=True
        )

        serializer = self.get_serializer(template)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """
        Apply a saved template configuration.
        Returns the template's configuration for the frontend to load.
        """
        template = self.get_object()
        return Response({
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'configuration': template.configuration,
            'report_type': template.report_type
        })


class GeneratedReportViewSet(TeamLeaderFilterMixin, viewsets.ModelViewSet):
    queryset = GeneratedReport.objects.all()
    serializer_class = GeneratedReportSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'template']
    
    def filter_for_regular_user(self, queryset, user):
        return queryset.filter(generated_by=user)
    
    def perform_create(self, serializer):
        serializer.save(generated_by=self.request.user)
    
    def get_permissions(self):
        """
        Pure HR has view-only access (no delete).
        Staff/Admin and multi-role users (TL+HR) retain elevated access.
        """
        return super().get_permissions()

    def destroy(self, request, *args, **kwargs):
        """
        Override destroy to check HR permissions.
        Pure HR has view-only access and cannot delete reports.
        Multi-role HR (TL/staff/superuser) keep delete rights.
        """
        from core.mixins.permissions import is_hr_only
        from rest_framework.response import Response
        from rest_framework import status

        if is_hr_only(request.user):
            return Response(
                {'error': 'HR users have view-only access and cannot delete reports.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)


@extend_schema(
    summary="Summary Report",
    description="Aggregated totals for overtime, standby, and leave over a date range.",
    parameters=[
        OpenApiParameter(name='start_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='end_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='report_type', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='italian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='albanian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='workspace_ids', type=str, location=OpenApiParameter.QUERY),
    ],
    responses={200: dict},
)
class SummaryReportView(APIView):
    """Generate aggregated summary reports for overtime, standby, and leave."""
    permission_classes = [CanViewReports]
    
    def get(self, request):
        filterset = UnifiedReportFilter(request.query_params, user=request.user)
        if not filterset.is_valid():
            return Response(filterset.errors, status=status.HTTP_400_BAD_REQUEST)

        qs_map = filterset.get_filtered_querysets()
        overtime_qs = qs_map['overtime']
        standby_qs = qs_map['standby']
        leave_qs = qs_map['leave']
        report_type = filterset.data.get('report_type', 'combined')

        result = {}
        
        if report_type in ('overtime', 'combined'):
            result['overtime'] = {
                'total_hours': overtime_qs.aggregate(total=Sum('hours'))['total'] or 0,
                'total_entries': overtime_qs.count(),
                'approved_hours': overtime_qs.filter(status='approved').aggregate(total=Sum('hours'))['total'] or 0,
                'pending_count': overtime_qs.filter(status='pending').count(),
            }
        
        if report_type in ('standby', 'combined'):
            result['standby'] = {
                'total_hours': standby_qs.aggregate(total=Sum('hours'))['total'] or 0,
                'total_entries': standby_qs.count(),
                'approved_hours': standby_qs.filter(status='approved').aggregate(total=Sum('hours'))['total'] or 0,
                'pending_count': standby_qs.filter(status='pending').count(),
            }
        
        if report_type in ('leave', 'combined'):
            # Use business-day property (weekends excluded) — calendar span over-counts.
            total_days = sum(v.days_requested for v in leave_qs) if leave_qs.exists() else 0
            approved_qs = leave_qs.filter(status='approved')
            approved_days = sum(v.days_requested for v in approved_qs) if approved_qs.exists() else 0
            result['leave'] = {
                'total_requests': leave_qs.count(),
                'total_days': total_days,
                'approved_days': approved_days,
                'pending_count': leave_qs.filter(status='pending').count(),
            }
        
        return Response(result, status=status.HTTP_200_OK)


@extend_schema(
    summary="Detailed Report",
    description="Per-user or grouped detailed report for overtime, standby, and leave.",
    parameters=[
        OpenApiParameter(name='start_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='end_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='report_type', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='group_by', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='italian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='albanian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='workspace_ids', type=str, location=OpenApiParameter.QUERY),
    ],
    responses={200: dict},
)
class DetailedReportView(APIView):
    """Generate detailed per-user reports with monthly/yearly grouping."""
    permission_classes = [CanViewReports]
    
    def get(self, request):
        params = self._get_params(request)
        querysets = self._get_querysets(params, request.user)
        
        if params['group_by'] == 'user':
            data = self._build_user_report(querysets, params)
        elif params['group_by'] in ['month', 'year']:
            data = self._build_time_report(querysets, params)
        else:
            return Response({'error': 'Invalid group_by parameter'}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({'group_by': params['group_by'], **data}, status=status.HTTP_200_OK)

    def _get_params(self, request):
        from django.utils.dateparse import parse_date
        return {
            'start_date': parse_date(request.query_params.get('start_date', '')),
            'end_date': parse_date(request.query_params.get('end_date', '')),
            'report_type': request.query_params.get('report_type', 'combined'),
            'group_by': request.query_params.get('group_by', 'user'),
            'italian_tl_id': request.query_params.get('italian_tl_id'),
            'albanian_tl_id': request.query_params.get('albanian_tl_id'),
            'workspace_ids': request.query_params.get('workspace_ids'),
        }

    def _get_querysets(self, params, user):
        from .filters import UnifiedReportFilter
        filterset = UnifiedReportFilter(params, user=user)
        return filterset.get_filtered_querysets()

    def _build_user_report(self, querysets, params):
        from django.contrib.auth.models import User
        from django.db.models import Q, Sum, Count
        from apps.leave_management.models import LeaveBalance
        import datetime

        ot_qs = querysets['overtime']
        sb_qs = querysets['standby']
        leave_qs = querysets['leave']

        # Pre-compute aggregates
        ot_total = {r['user']: r for r in ot_qs.values('user').annotate(total_hours=Sum('hours'), entries=Count('id'))}
        ot_approved = {r['user']: r['approved_hours'] for r in ot_qs.filter(status='approved').values('user').annotate(approved_hours=Sum('hours'))}
        sb_total = {r['user']: r for r in sb_qs.values('user').annotate(total_hours=Sum('hours'), entries=Count('id'))}
        sb_approved = {r['user']: r['approved_hours'] for r in sb_qs.filter(status='approved').values('user').annotate(approved_hours=Sum('hours'))}
        
        from apps.leave_management.models import count_business_days

        leave_total = {}
        leave_approved = {}
        # Business days only — must match LeaveRequest.days_requested / validation.
        for v in leave_qs.values('user', 'start_date', 'end_date'):
            days = count_business_days(v['start_date'], v['end_date'])
            uid = v['user']
            if uid not in leave_total:
                leave_total[uid] = {'total_days': 0, 'entries': 0}
            leave_total[uid]['total_days'] += days
            leave_total[uid]['entries'] += 1

        for v in leave_qs.filter(status='approved').values('user', 'start_date', 'end_date'):
            days = count_business_days(v['start_date'], v['end_date'])
            uid = v['user']
            leave_approved[uid] = leave_approved.get(uid, 0) + days

        current_year = params['start_date'].year if params['start_date'] else datetime.date.today().year
        balances = {b.user_id: b.get_effective_available_days() for b in LeaveBalance.objects.filter(year=current_year, leave_type='vacation', is_carry_over=False)}

        users_qs = User.objects.filter(Q(id__in=ot_qs.values('user')) | Q(id__in=sb_qs.values('user')) | Q(id__in=leave_qs.values('user'))).distinct()

        report_data = []
        for u in users_qs.select_related('profile').prefetch_related('profile__teams', 'profile__team_memberships__team'):
            entry = {
                'user_id': u.id,
                'username': u.username,
                'full_name': f"{u.first_name} {u.last_name}".strip() or u.username,
                'team': u.profile.get_primary_team().name if hasattr(u, 'profile') and u.profile.get_primary_team() else None,
                'leave_balance': float(balances.get(u.id, 0)),
            }
            if params['report_type'] in ('overtime', 'combined'):
                ot = ot_total.get(u.id, {'total_hours': 0, 'entries': 0})
                entry['overtime'] = {'total_hours': ot['total_hours'] or 0, 'approved_hours': ot_approved.get(u.id, 0) or 0, 'entries': ot['entries']}
            if params['report_type'] in ('standby', 'combined'):
                sb = sb_total.get(u.id, {'total_hours': 0, 'entries': 0})
                entry['standby'] = {'total_hours': sb['total_hours'] or 0, 'approved_hours': sb_approved.get(u.id, 0) or 0, 'entries': sb['entries']}
            if params['report_type'] in ('leave', 'combined'):
                leave = leave_total.get(u.id, {'total_days': 0, 'entries': 0})
                entry['leave'] = {'total_days': leave['total_days'] or 0, 'approved_days': leave_approved.get(u.id, 0) or 0, 'entries': leave['entries']}
            report_data.append(entry)
            
        return {'users': report_data}

    def _build_time_report(self, querysets, params):
        group_by = params['group_by']
        trunc_func = TruncMonth if group_by == 'month' else TruncYear
        ot_qs = querysets['overtime']
        sb_qs = querysets['standby']
        leave_qs = querysets['leave']
        
        result = {}
        if params['report_type'] in ('overtime', 'combined'):
            result['overtime'] = list(ot_qs.annotate(time_unit=trunc_func('date')).values('time_unit').annotate(total_hours=Sum('hours'), entries=Count('id')).order_by('time_unit'))
        if params['report_type'] in ('standby', 'combined'):
            result['standby'] = list(sb_qs.annotate(time_unit=trunc_func('date')).values('time_unit').annotate(total_hours=Sum('hours'), entries=Count('id')).order_by('time_unit'))
        if params['report_type'] in ('leave', 'combined'):
            from apps.leave_management.models import count_business_days

            time_data = {}
            for v in leave_qs.values('start_date', 'end_date'):
                unit_key = v['start_date'].replace(day=1) if group_by == 'month' else v['start_date'].year
                days = count_business_days(v['start_date'], v['end_date'])
                if unit_key not in time_data:
                    time_data[unit_key] = {'total_days': 0, 'entries': 0}
                time_data[unit_key]['total_days'] += days
                time_data[unit_key]['entries'] += 1
            result['leave'] = [{'time_unit': k, **v} for k, v in sorted(time_data.items())]
            
        return result


@extend_schema(
    summary="Export Excel",
    description="Export detailed report data as an Excel (.xlsx) file.",
    parameters=[
        OpenApiParameter(name='start_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='end_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='report_type', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='italian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='albanian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='workspace_ids', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='group_by_tl', type=bool, location=OpenApiParameter.QUERY),
    ],
    responses={
        (200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): OpenApiTypes.BINARY
    },
)
class ExportExcelView(APIView):
    """Export detailed report as Excel (.xlsx) file."""
    permission_classes = [CanViewReports]

    def get(self, request):
        import logging
        from django.http import HttpResponse
        from django.contrib.auth.models import User
        from django.db.models import Sum, Count
        import openpyxl
        from openpyxl.styles import Font
        from .filters import UnifiedReportFilter

        logger = logging.getLogger(__name__)

        try:
            report_type = request.query_params.get('report_type', 'combined')
            group_by_tl = request.query_params.get('group_by_tl') == 'true'

            logger.info(f"[Excel Export] Starting export - report_type={report_type}, group_by_tl={group_by_tl}")

            filterset = UnifiedReportFilter(request.query_params, user=request.user)
            qs_map = filterset.get_filtered_querysets()
            overtime_qs = qs_map['overtime']
            standby_qs = qs_map['standby']
            leave_qs = qs_map['leave']

            logger.info(f"[Excel Export] Querysets retrieved - OT: {overtime_qs.count()}, SB: {standby_qs.count()}, Leave: {leave_qs.count()}")

            # Pre-compute aggregates for Excel export
            ot_total = {rec['user']: rec for rec in overtime_qs.values('user').annotate(total_hours=Sum('hours'), entries=Count('id'))}
            ot_approved = {rec['user']: rec['approved_hours'] for rec in overtime_qs.filter(status='approved').values('user').annotate(approved_hours=Sum('hours'))}
            sb_total = {rec['user']: rec for rec in standby_qs.values('user').annotate(total_hours=Sum('hours'), entries=Count('id'))}
            sb_approved = {rec['user']: rec['approved_hours'] for rec in standby_qs.filter(status='approved').values('user').annotate(approved_hours=Sum('hours'))}

            from apps.leave_management.models import count_business_days

            leave_total = {}
            leave_approved = {}
            # Business days only — must match LeaveRequest.days_requested / validation.
            for v in leave_qs.values('user', 'start_date', 'end_date'):
                days = count_business_days(v['start_date'], v['end_date'])
                user_id = v['user']
                if user_id not in leave_total:
                    leave_total[user_id] = {'total_days': 0, 'entries': 0}
                leave_total[user_id]['total_days'] += days
                leave_total[user_id]['entries'] += 1
            for v in leave_qs.filter(status='approved').values('user', 'start_date', 'end_date'):
                days = count_business_days(v['start_date'], v['end_date'])
                user_id = v['user']
                if user_id not in leave_approved:
                    leave_approved[user_id] = 0
                leave_approved[user_id] += days

            logger.info(f"[Excel Export] Aggregates computed - OT users: {len(ot_total)}, SB users: {len(sb_total)}, Leave users: {len(leave_total)}")

            users_qs = User.objects.filter(
                Q(id__in=overtime_qs.values('user')) |
                Q(id__in=standby_qs.values('user')) |
                Q(id__in=leave_qs.values('user'))
            ).filter(
                profile__isnull=False
            ).distinct().select_related(
                'profile', 'profile__italian_tl', 'profile__albanian_tl'
            ).prefetch_related(
                'profile__teams', 'profile__team_memberships__team'
            )

            logger.info(f"[Excel Export] Users queryset created - count: {users_qs.count()}")

            wb = openpyxl.Workbook()

            if group_by_tl:
                # Create sheets per Italian TL
                # Filter out None values to avoid in_bulk error
                ital_tl_ids = [id for id in users_qs.values_list('profile__italian_tl', flat=True).distinct() if id is not None]
                tl_users_map = User.objects.in_bulk(ital_tl_ids) if ital_tl_ids else {}
                
                # Check if users without Italian TL exist
                users_without_tl = users_qs.filter(profile__italian_tl__isnull=True)
                
                first = True
                
                # Process users with Italian TL
                for tl_id in ital_tl_ids:
                    tl_user = tl_users_map.get(tl_id)
                    tl_name = f"{tl_user.first_name} {tl_user.last_name}" if tl_user else "Unknown TL"

                    if first:
                        ws = wb.active
                        ws.title = tl_name[:31]
                        first = False
                    else:
                        ws = wb.create_sheet(title=tl_name[:31])

                    headers = ['User ID', 'Username', 'Full Name', 'Team', 'Albanian TL']
                    headers.extend(['OT Total', 'OT Appr.', 'OT Ent.'])
                    headers.extend(['SB Total', 'SB Appr.', 'SB Ent.'])
                    headers.extend(['Leave Total', 'Leave Appr.', 'Leave Ent.'])
                    ws.append(headers)
                    for cell in ws[1]:
                        cell.font = Font(bold=True)

                    tl_users = users_qs.filter(profile__italian_tl=tl_id).prefetch_related('profile__teams', 'profile__team_memberships__team')
                    for u in tl_users:
                        alb_tl = u.profile.albanian_tl
                        alb_tl_name = f"{alb_tl.first_name} {alb_tl.last_name}" if alb_tl else ""

                        row = [u.id, u.username, f"{u.first_name} {u.last_name}".strip() or u.username,
                               u.profile.get_primary_team().name if u.profile.get_primary_team() else '', alb_tl_name]

                        ot = ot_total.get(u.id, {'total_hours': 0, 'entries': 0})
                        row.extend([ot['total_hours'] or 0, ot_approved.get(u.id, 0) or 0, ot['entries']])
                        sb = sb_total.get(u.id, {'total_hours': 0, 'entries': 0})
                        row.extend([sb['total_hours'] or 0, sb_approved.get(u.id, 0) or 0, sb['entries']])
                        leave = leave_total.get(u.id, {'total_days': 0, 'entries': 0})
                        row.extend([leave['total_days'] or 0, leave_approved.get(u.id, 0) or 0, leave['entries']])
                        ws.append(row)
                
                # Create sheet for users without Italian TL if any exist
                if users_without_tl.exists():
                    ws = wb.create_sheet(title="No Italian TL")
                    headers = ['User ID', 'Username', 'Full Name', 'Team', 'Albanian TL']
                    headers.extend(['OT Total', 'OT Appr.', 'OT Ent.'])
                    headers.extend(['SB Total', 'SB Appr.', 'SB Ent.'])
                    headers.extend(['Leave Total', 'Leave Appr.', 'Leave Ent.'])
                    ws.append(headers)
                    for cell in ws[1]:
                        cell.font = Font(bold=True)

                    for u in users_without_tl.prefetch_related('profile__teams', 'profile__team_memberships__team'):
                        alb_tl = u.profile.albanian_tl
                        alb_tl_name = f"{alb_tl.first_name} {alb_tl.last_name}" if alb_tl else ""

                        row = [u.id, u.username, f"{u.first_name} {u.last_name}".strip() or u.username,
                               u.profile.get_primary_team().name if u.profile.get_primary_team() else '', alb_tl_name]

                        ot = ot_total.get(u.id, {'total_hours': 0, 'entries': 0})
                        row.extend([ot['total_hours'] or 0, ot_approved.get(u.id, 0) or 0, ot['entries']])
                        sb = sb_total.get(u.id, {'total_hours': 0, 'entries': 0})
                        row.extend([sb['total_hours'] or 0, sb_approved.get(u.id, 0) or 0, sb['entries']])
                        leave = leave_total.get(u.id, {'total_days': 0, 'entries': 0})
                        row.extend([leave['total_days'] or 0, leave_approved.get(u.id, 0) or 0, leave['entries']])
                        ws.append(row)
            else:
                # Single sheet for specific report type
                ws = wb.active
                ws.title = report_type.capitalize()
                headers = ['User ID', 'Username', 'Full Name', 'Team', 'Italian TL', 'Albanian TL']
                if report_type == 'overtime':
                    headers.extend(['OT Total Hours', 'OT Approved', 'OT Entries'])
                elif report_type == 'standby':
                    headers.extend(['SB Total Hours', 'SB Approved', 'SB Entries'])
                elif report_type == 'leave':
                    headers.extend(['Leave Total Days', 'Leave Approved', 'Leave Entries'])
                ws.append(headers)
                for cell in ws[1]:
                    cell.font = Font(bold=True)

                for u in users_qs.prefetch_related('profile__teams', 'profile__team_memberships__team'):
                    ital_tl = u.profile.italian_tl
                    ital_name = f"{ital_tl.first_name} {ital_tl.last_name}" if ital_tl else ""
                    alb_tl = u.profile.albanian_tl
                    alb_name = f"{alb_tl.first_name} {alb_tl.last_name}" if alb_tl else ""

                    row = [u.id, u.username, f"{u.first_name} {u.last_name}".strip() or u.username,
                           u.profile.get_primary_team().name if u.profile.get_primary_team() else '', ital_name, alb_name]

                    if report_type == 'overtime':
                        ot = ot_total.get(u.id, {'total_hours': 0, 'entries': 0})
                        row.extend([ot['total_hours'] or 0, ot_approved.get(u.id, 0) or 0, ot['entries']])
                    elif report_type == 'standby':
                        sb = sb_total.get(u.id, {'total_hours': 0, 'entries': 0})
                        row.extend([sb['total_hours'] or 0, sb_approved.get(u.id, 0) or 0, sb['entries']])
                    elif report_type == 'leave':
                        leave = leave_total.get(u.id, {'total_days': 0, 'entries': 0})
                        row.extend([leave['total_days'] or 0, leave_approved.get(u.id, 0) or 0, leave['entries']])
                    ws.append(row)

            # Monthly sheet
            ws2 = wb.create_sheet(title='Monthly')
            ws2.append(['Type', 'Month', 'Total', 'Entries'])
            for cell in ws2[1]:
                cell.font = Font(bold=True)

            if report_type in ('overtime', 'combined'):
                for rec in overtime_qs.annotate(month=TruncMonth('date')).values('month').annotate(total=Sum('hours'), entries=Count('id')).order_by('month'):
                    ws2.append(['Overtime', str(rec['month']), rec['total'] or 0, rec['entries']])
            if report_type in ('standby', 'combined'):
                for rec in standby_qs.annotate(month=TruncMonth('date')).values('month').annotate(total=Sum('hours'), entries=Count('id')).order_by('month'):
                    ws2.append(['Standby', str(rec['month']), rec['total'] or 0, rec['entries']])
            if report_type in ('leave', 'combined'):
                # Aggregate by month using business days (match LeaveRequest.days_requested).
                month_data = {}
                for v in leave_qs.values('start_date', 'end_date', 'id'):
                    month_key = v['start_date'].replace(day=1)
                    days = count_business_days(v['start_date'], v['end_date'])
                    if month_key not in month_data:
                        month_data[month_key] = {'total_days': 0, 'entries': 0}
                    month_data[month_key]['total_days'] += days
                    month_data[month_key]['entries'] += 1
                for month, data in sorted(month_data.items()):
                    ws2.append(['Leave', str(month), data['total_days'], data['entries']])

            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date')
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename="report_{start_date or "all"}_{end_date or "all"}.xlsx"'
            wb.save(response)
            logger.info("[Excel Export] Excel file generated successfully")
            return response

        except Exception as e:
            logger.error(f"[Excel Export] Error: {str(e)}", exc_info=True)
            from rest_framework.response import Response
            return Response(
                {'error': f'Failed to generate Excel export: {str(e)}'},
                status=500
            )


@extend_schema(
    summary="Export Overtime and Standby Records",
    description="Export detailed OT and Standby records with per-Italian TL sheet separation. Defaults to approved entries; pass status=pending to export pending records instead.",
    parameters=[
        OpenApiParameter(name='start_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='end_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='italian_tl_ids', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='albanian_tl_ids', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='workspace_ids', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='status', type=str, location=OpenApiParameter.QUERY,
                         description='Filter by status: "approved" (default) or "pending".'),
    ],
    responses={
        (200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): OpenApiTypes.BINARY
    },
)
class ExportOTStandbyView(APIView):
    """Export detailed Overtime and Standby records as Excel (.xlsx) file with per-Italian TL sheets."""
    permission_classes = [CanViewReports]

    def get(self, request):
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog

        try:
            # Parse query parameters
            start_date = parse_date(request.query_params.get('start_date', ''))
            end_date = parse_date(request.query_params.get('end_date', ''))
            italian_tl_ids = request.query_params.get('italian_tl_ids', '')
            albanian_tl_ids = request.query_params.get('albanian_tl_ids', '')
            workspace_ids = request.query_params.get('workspace_ids', '')
            # status: 'approved' (default) or 'pending'
            status_filter = request.query_params.get('status', 'approved')
            if status_filter not in ('approved', 'pending'):
                status_filter = 'approved'
            # date_mode: 'work_date' (default, current behavior) or 'processing_period'
            # (payroll-aligned: filter OT/standby by requested_processing_period)
            date_mode = request.query_params.get('date_mode', 'work_date')
            if date_mode not in ('work_date', 'processing_period'):
                date_mode = 'work_date'
            processing_period_mode = date_mode == 'processing_period'

            # Parse comma-separated IDs (skip 'none' string - treat as no filter)
            italian_tl_id_list = None
            if italian_tl_ids and italian_tl_ids != 'none':
                italian_tl_id_list = [int(id) for id in italian_tl_ids.split(',') if id]

            albanian_tl_id_list = None
            if albanian_tl_ids and albanian_tl_ids != 'none':
                albanian_tl_id_list = [int(id) for id in albanian_tl_ids.split(',') if id]

            workspace_id_list = None
            if workspace_ids and workspace_ids != 'none':
                workspace_id_list = [int(id) for id in workspace_ids.split(',') if id]

            logger.info(f"[OT/Standby Export] Starting export - date range: {start_date} to {end_date}, italian_tls: {italian_tl_id_list}, status: {status_filter}, date_mode: {date_mode}")

            # Filter OvertimeLog by status (approved by default, pending when requested)
            ot_qs = OvertimeLog.objects.filter(status=status_filter)
            if processing_period_mode:
                if start_date:
                    ot_qs = ot_qs.filter(requested_processing_period__gte=start_date)
                if end_date:
                    ot_qs = ot_qs.filter(requested_processing_period__lte=end_date)
            else:
                if start_date:
                    ot_qs = ot_qs.filter(date__gte=start_date)
                if end_date:
                    ot_qs = ot_qs.filter(date__lte=end_date)
            if italian_tl_id_list:
                ot_qs = ot_qs.filter(user__profile__italian_tl__in=italian_tl_id_list)
            if albanian_tl_id_list:
                ot_qs = ot_qs.filter(user__profile__albanian_tl__in=albanian_tl_id_list)
            if workspace_id_list:
                from apps.dashboard.models import CalendarWorkspace
                workspace_users = CalendarWorkspace.objects.filter(id__in=workspace_id_list).values_list('allowed_users__id', flat=True)
                ot_qs = ot_qs.filter(user_id__in=workspace_users)
            # Apply role-based visibility (prevents TL/employee from exporting
            # records outside their scope — matches UnifiedReportFilter).
            ot_qs = apply_visibility_constraints(ot_qs, request.user)

            # Filter StandbyLog by status (approved by default, pending when requested)
            sb_qs = StandbyLog.objects.filter(status=status_filter)
            if processing_period_mode:
                if start_date:
                    sb_qs = sb_qs.filter(requested_processing_period__gte=start_date)
                if end_date:
                    sb_qs = sb_qs.filter(requested_processing_period__lte=end_date)
            else:
                if start_date:
                    sb_qs = sb_qs.filter(date__gte=start_date)
                if end_date:
                    sb_qs = sb_qs.filter(date__lte=end_date)
            if italian_tl_id_list:
                sb_qs = sb_qs.filter(user__profile__italian_tl__in=italian_tl_id_list)
            if albanian_tl_id_list:
                sb_qs = sb_qs.filter(user__profile__albanian_tl__in=albanian_tl_id_list)
            if workspace_id_list:
                from apps.dashboard.models import CalendarWorkspace
                workspace_users = CalendarWorkspace.objects.filter(id__in=workspace_id_list).values_list('allowed_users__id', flat=True)
                sb_qs = sb_qs.filter(user_id__in=workspace_users)
            # Apply role-based visibility (same as ot_qs above).
            sb_qs = apply_visibility_constraints(sb_qs, request.user)

            logger.info(f"[OT/Standby Export] Querysets - OT: {ot_qs.count()}, SB: {sb_qs.count()}, status: {status_filter}, date_mode: {date_mode}")

            # Use enterprise export service with optimizations
            export_service.clear_cache()
            config = ExportConfig(format='excel', include_summary=True)
            excel_bytes = export_service.export_ot_standby_to_excel(
                ot_qs, sb_qs, config, include_carryover=True,
            )

            # Generate response
            status_suffix = '_pending' if status_filter == 'pending' else ''
            mode_suffix = '_payroll' if processing_period_mode else ''
            filename = f"ot_standby{status_suffix}{mode_suffix}_export_{timezone.now().strftime('%Y%m%d')}.xlsx"
            response = HttpResponse(
                excel_bytes,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'

            logger.info(f"[OT/Standby Export] Excel file generated successfully: {filename}")
            return response

        except Exception as e:
            logger.error(f"[OT/Standby Export] Error: {str(e)}", exc_info=True)
            from rest_framework.response import Response
            return Response(
                {'error': f'Failed to generate OT/Standby export: {str(e)}'},
                status=500
            )


@extend_schema(
    summary="Export Leave Records",
    description="Export detailed Leave records with per-Italian TL sheet separation. Only approved entries included.",
    parameters=[
        OpenApiParameter(name='start_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='end_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='italian_tl_ids', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='albanian_tl_ids', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='workspace_ids', type=str, location=OpenApiParameter.QUERY),
    ],
    responses={
        (200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): OpenApiTypes.BINARY
    },
)
class ExportLeaveView(APIView):
    """Export detailed Leave records as Excel (.xlsx) file with per-Italian TL sheets."""
    permission_classes = [CanViewReports]

    def get(self, request):
        from apps.leave_management.models import LeaveRequest

        try:
            # Parse query parameters
            start_date = parse_date(request.query_params.get('start_date', ''))
            end_date = parse_date(request.query_params.get('end_date', ''))
            italian_tl_ids = request.query_params.get('italian_tl_ids', '')
            albanian_tl_ids = request.query_params.get('albanian_tl_ids', '')
            workspace_ids = request.query_params.get('workspace_ids', '')

            # Parse comma-separated IDs (skip 'none' string - treat as no filter)
            italian_tl_id_list = None
            if italian_tl_ids and italian_tl_ids != 'none':
                italian_tl_id_list = [int(id) for id in italian_tl_ids.split(',') if id]
            
            albanian_tl_id_list = None
            if albanian_tl_ids and albanian_tl_ids != 'none':
                albanian_tl_id_list = [int(id) for id in albanian_tl_ids.split(',') if id]
            
            workspace_id_list = None
            if workspace_ids and workspace_ids != 'none':
                workspace_id_list = [int(id) for id in workspace_ids.split(',') if id]

            logger.info(f"[Leave Export] Starting export - date range: {start_date} to {end_date}, italian_tls: {italian_tl_id_list}")

            # Filter LeaveRequest - only approved
            leave_qs = LeaveRequest.objects.filter(status='approved')
            if start_date:
                leave_qs = leave_qs.filter(start_date__gte=start_date)
            if end_date:
                leave_qs = leave_qs.filter(end_date__lte=end_date)
            if italian_tl_id_list:
                leave_qs = leave_qs.filter(user__profile__italian_tl__in=italian_tl_id_list)
            if albanian_tl_id_list:
                leave_qs = leave_qs.filter(user__profile__albanian_tl__in=albanian_tl_id_list)
            if workspace_id_list:
                from apps.dashboard.models import CalendarWorkspace
                workspace_users = CalendarWorkspace.objects.filter(id__in=workspace_id_list).values_list('allowed_users__id', flat=True)
                leave_qs = leave_qs.filter(user_id__in=workspace_users)
            # Apply role-based visibility (prevents TL/employee from exporting
            # records outside their scope — matches UnifiedReportFilter).
            leave_qs = apply_visibility_constraints(leave_qs, request.user)

            logger.info(f"[Leave Export] Queryset - Leave: {leave_qs.count()}")

            # Use enterprise export service with optimizations
            export_service.clear_cache()
            config = ExportConfig(format='excel', include_summary=True)
            excel_bytes = export_service.export_leave_to_excel(leave_qs, config)

            # Generate response
            filename = f"leave_export_{timezone.now().strftime('%Y%m%d')}.xlsx"
            response = HttpResponse(
                excel_bytes,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'

            logger.info(f"[Leave Export] Excel file generated successfully: {filename}")
            return response

        except Exception as e:
            logger.error(f"[Leave Export] Error: {str(e)}", exc_info=True)
            from rest_framework.response import Response
            return Response(
                {'error': f'Failed to generate Leave export: {str(e)}'},
                status=500
            )


@extend_schema(
    summary="Executive Summary Insights",
    description="Calculate key metrics: overtime increase %, leave utilization %, standby coverage %",
    parameters=[
        OpenApiParameter(name='start_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='end_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='italian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='albanian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='workspace_ids', type=str, location=OpenApiParameter.QUERY),
    ],
    responses={200: InsightsSerializer},
)
class InsightsView(APIView):
    """Calculate executive summary insights for HR dashboard."""
    permission_classes = [CanViewReports]

    def get(self, request):
        filterset = UnifiedReportFilter(request.query_params, user=request.user)
        if not filterset.is_valid():
            return Response(filterset.errors, status=status.HTTP_400_BAD_REQUEST)

        qs_map = filterset.get_filtered_querysets()
        overtime_qs = qs_map['overtime']
        standby_qs = qs_map['standby']
        leave_qs = qs_map['leave']

        # Calculate overtime increase % (compare current period vs previous period of same length)
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        overtime_increase = 0.0
        if start_date_str and end_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                period_days = (end_date - start_date).days + 1

                # Previous period
                prev_start = start_date - timedelta(days=period_days)
                prev_end = start_date - timedelta(days=1)

                current_hours = overtime_qs.aggregate(total=Sum('hours'))['total'] or 0
                prev_hours = overtime_qs.filter(
                    date__gte=prev_start,
                    date__lte=prev_end
                ).aggregate(total=Sum('hours'))['total'] or 0

                if prev_hours > 0:
                    overtime_increase = ((current_hours - prev_hours) / prev_hours) * 100
            except (ValueError, TypeError):
                overtime_increase = 0.0

        # Calculate leave utilization % (approved business days / total allocated days)
        # Assuming 20 days per year as standard allocation
        leave_utilization = 0.0
        approved_qs = leave_qs.filter(status='approved')
        if approved_qs.exists():
            # Business days only — must match LeaveRequest.days_requested / validation.
            approved_days = sum(v.days_requested for v in approved_qs)
            # Estimate total allocated (20 days * number of users with leave requests)
            unique_users = leave_qs.values('user').distinct().count()
            total_allocated = unique_users * 20
            if total_allocated > 0:
                leave_utilization = (approved_days / total_allocated) * 100

        # Calculate standby coverage % (approved standby hours / total required hours)
        # Assuming 40 hours/week * 4 weeks = 160 hours per month as baseline
        standby_coverage = 0.0
        approved_standby = standby_qs.filter(status='approved').aggregate(total=Sum('hours'))['total'] or 0
        if approved_standby > 0:
            # Estimate required hours based on period length
            if start_date_str and end_date_str:
                try:
                    start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                    end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                    period_weeks = ((end_date - start_date).days + 1) / 7
                    unique_users = standby_qs.values('user').distinct().count()
                    required_hours = unique_users * 40 * period_weeks
                    if required_hours > 0:
                        standby_coverage = (approved_standby / required_hours) * 100
                except (ValueError, TypeError):
                    standby_coverage = 0.0

        return Response({
            'overtime_increase': round(overtime_increase, 1),
            'leave_utilization': round(leave_utilization, 1),
            'standby_coverage': round(standby_coverage, 1),
        }, status=status.HTTP_200_OK)


@extend_schema(
    summary="Top Team Leaders",
    description="Rank team leaders by total approved hours (OT + Standby)",
    parameters=[
        OpenApiParameter(name='start_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='end_date', type=str, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='italian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='albanian_tl_id', type=int, location=OpenApiParameter.QUERY),
        OpenApiParameter(name='workspace_ids', type=str, location=OpenApiParameter.QUERY),
    ],
    responses={200: TopTeamLeaderSerializer(many=True)},
)
class TopTeamLeadersView(APIView):
    """Rank team leaders by total approved hours."""
    permission_classes = [CanViewReports]

    def get(self, request):
        from django.contrib.auth.models import User

        filterset = UnifiedReportFilter(request.query_params, user=request.user)
        if not filterset.is_valid():
            return Response(filterset.errors, status=status.HTTP_400_BAD_REQUEST)

        qs_map = filterset.get_filtered_querysets()
        overtime_qs = qs_map['overtime'].filter(status='approved')
        standby_qs = qs_map['standby'].filter(status='approved')

        # Aggregate by Italian Team Leader
        tl_stats = {}
        for user_id, hours in overtime_qs.values_list('user__profile__italian_tl').annotate(
            total=Sum('hours')
        ):
            if user_id:
                tl_stats[user_id] = tl_stats.get(user_id, 0) + (hours or 0)

        for user_id, hours in standby_qs.values_list('user__profile__italian_tl').annotate(
            total=Sum('hours')
        ):
            if user_id:
                tl_stats[user_id] = tl_stats.get(user_id, 0) + (hours or 0)

        # Get user details for ranked TLs
        ranked_tls = sorted(tl_stats.items(), key=lambda x: x[1], reverse=True)[:10]
        tl_ids = [tl_id for tl_id, _ in ranked_tls]

        users = User.objects.filter(id__in=tl_ids).select_related('profile').prefetch_related(
            'profile__team_memberships__team'
        )
        users_by_id = {user.id: user for user in users}

        result = []
        for rank, (tl_id, total_hours) in enumerate(ranked_tls, 1):
            user = users_by_id.get(tl_id)
            if user:
                primary_team = user.profile.get_primary_team()
                team_name = primary_team.name if primary_team else None
                result.append({
                    'id': user.id,
                    'name': f"{user.first_name} {user.last_name}".strip() or user.username,
                    'rank': rank,
                    'total_hours': round(total_hours, 1),
                    'team_name': team_name,
                })

        return Response(result, status=status.HTTP_200_OK)


class AuditLogViewSet(TeamLeaderFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for AuditLog - read-only, with filtering.
    """
    queryset = AuditLog.objects.all().select_related('user')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'object_repr', 'changes_summary']
    filterset_fields = ['action', 'model_name', 'user']

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Export audit logs as streaming CSV, respecting active filters.

        Uses ``StreamingHttpResponse`` + ``queryset.iterator()`` so the CSV
        is streamed to the client in chunks instead of buffered in server
        memory. Column shape is frozen and must match the frontend
        ``AuditLogsEnhancedPage`` export contract.
        """
        import csv
        import io
        from django.http import StreamingHttpResponse

        queryset = self.filter_queryset(self.get_queryset())

        def csv_generator():
            # UTF-8 BOM for Excel compatibility (non-ASCII usernames).
            yield '\ufeff'
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow([
                'User', 'Action', 'Model', 'Object ID', 'Object',
                'Changes Summary', 'IP Address', 'Timestamp',
            ])
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate()
            for log in queryset.iterator(chunk_size=1000):
                writer.writerow([
                    log.user.username if log.user else '',
                    log.get_action_display(),
                    log.get_model_name_display(),
                    log.object_id or '',
                    log.object_repr or '',
                    log.changes_summary,
                    log.ip_address or '',
                    log.timestamp.isoformat() if log.timestamp else '',
                ])
                yield buffer.getvalue()
                buffer.seek(0)
                buffer.truncate()

        response = StreamingHttpResponse(csv_generator(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_logs.csv"'
        return response

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Aggregate audit log statistics over the full filtered queryset.

        Returns counts (total/today/week/month), unique users, failed
        actions (DELETE + REJECT), and success rate. All aggregations run
        server-side over the full filtered set — not the page-limited
        ``results`` array the list endpoint returns.

        ``changes_summary`` is a Python ``@property`` on ``AuditLog`` and
        cannot be used in ORM aggregates; this endpoint uses only real DB
        columns (``action``, ``timestamp``, ``user_id``).

        Date boundaries use the server timezone (``timezone.now()``).
        ``logs_today`` uses ``timestamp__date`` for a calendar-day match.
        """
        from datetime import timedelta

        queryset = self.filter_queryset(self.get_queryset())
        now = timezone.now()
        today = now.date()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        total_logs = queryset.count()
        logs_today = queryset.filter(timestamp__date=today).count()
        logs_this_week = queryset.filter(timestamp__gte=week_ago).count()
        logs_this_month = queryset.filter(timestamp__gte=month_ago).count()
        unique_users = queryset.aggregate(n=Count('user', distinct=True))['n'] or 0
        failed_actions = queryset.filter(action__in=['DELETE', 'REJECT', 'BULK_REJECT']).count()
        if total_logs > 0:
            success_rate = round((total_logs - failed_actions) / total_logs * 1000) / 10
        else:
            success_rate = 100

        return Response({
            'total_logs': total_logs,
            'logs_today': logs_today,
            'logs_this_week': logs_this_week,
            'logs_this_month': logs_this_month,
            'unique_users': unique_users,
            'failed_actions': failed_actions,
            'success_rate': success_rate,
        })
