"""
ViewSets for the Ticket KPI plugin.

Endpoints:
- Admin: /api/ticket_kpi/profiles/ (CRUD + test mapping)
- User: /api/ticket_kpi/upload/ (analyze, preview, import, list)
- Dashboard: /api/ticket_kpi/dashboard/ (KPIs, trends)
- Reports: /api/ticket_kpi/reports/ (yearly export)
"""

from datetime import datetime
from pathlib import Path
import logging
import mimetypes

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.db import transaction, IntegrityError
from django.db.models import Q

from apps.users.models import Team, UserProfile
from django.utils import timezone
from rest_framework import viewsets, status, permissions, serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.http import FileResponse

from core.mixins.permissions import PluginPermissionMixin

from .models import (
    ExportProfile,
    TicketImportBatch,
    NormalizedTicket,
    MonthlyKPI,
    KPIEvidence,
    TicketOvertimeLink,
)
from .serializers import (
    ExportProfileSerializer,
    ExportProfileListSerializer,
    TicketImportBatchSerializer,
    NormalizedTicketSerializer,
    MonthlyKPISerializer,
    KPIEvidenceSerializer,
    TicketOvertimeLinkSerializer,
)
from .mapping_engine import ColumnMapper
from .email_parser import parse_email_evidence
from .upload_validation import (
    UploadValidationError,
    enforce_table_dimensions,
    policy_for,
    validate_upload,
)
from .analytics import (
    compute_monthly_kpi,
    get_user_monthly_summary,
    get_team_monthly_summary,
    compute_yearly_summary,
)

logger = logging.getLogger(__name__)


def _audit_link_action(user, action, link):
    """Best-effort audit logging without a hard audit_log dependency."""
    try:
        from plugins.audit_log.signals import log_action
    except ImportError:
        return
    log_action(
        user,
        action,
        description=(
            f"Ticket-overtime link {action}: "
            f"OT#{link.overtime_log_id} ↔ Ticket#{link.normalized_ticket_id}"
        ),
        obj=link,
    )


# Maximum number of parse errors to include in preview/import responses.
MAX_PREVIEW_ERRORS = 10


def _upload_error_response(exc: UploadValidationError):
    """Convert an UploadValidationError into a stable 400 response."""
    return Response(
        {"error": exc.detail, "code": exc.code},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _resolve_evidence_max_mb(user) -> int:
    """Resolve the per-user evidence size limit (MB).

    Order of precedence: user profile override → plugin config → default 10.
    """
    profile_max = getattr(getattr(user, "profile", None), "max_file_size_mb", None)
    if profile_max and profile_max > 0:
        return profile_max
    from apps.plugins.models import Plugin
    plugin = Plugin.objects.filter(name="ticket_kpi").first()
    if plugin:
        try:
            return int(plugin.config.get("max_file_size_mb", 10))
        except (TypeError, ValueError):
            pass
    return 10


def _error_response(message: str, status_code: int, detail: str | None = None) -> Response:
    """Return a standardized error response.

    All error responses use `{'error': message}` as the primary structure.
    An optional `detail` key provides supplementary context.
    """
    payload: dict = {'error': message}
    if detail:
        payload['detail'] = detail
    return Response(payload, status=status_code)


# ============================================================================
# ADMIN: Export Profile Management
# ============================================================================

class ExportProfileViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    Admin-only CRUD for ticket export mapping profiles.
    """
    queryset = ExportProfile.objects.all()
    serializer_class = ExportProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    plugin_name = 'ticket_kpi'
    permission_action_map = {
        'create': 'configure',
        'update': 'configure',
        'partial_update': 'configure',
        'destroy': 'configure',
        'test_mapping': 'configure',
        'auto_detect': 'configure',
    }

    def get_serializer_class(self):
        if self.action == 'list':
            return ExportProfileListSerializer
        return ExportProfileSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        # Only the creator or an admin may modify a profile.
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if serializer.instance.created_by_id != self.request.user.id:
                raise PermissionDenied("You can only modify profiles you created.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Soft delete: set is_active=False instead of hard delete.

        Only the creator or an admin may deactivate a profile.
        """
        instance = self.get_object()
        if not (request.user.is_staff or request.user.is_superuser):
            if instance.created_by_id != request.user.id:
                return Response(
                    {'error': 'You can only delete profiles you created.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def test_mapping(self, request, pk=None):
        """
        Test a mapping profile against an uploaded file.
        Returns preview of how the file would be normalized.
        """
        profile = self.get_object()
        file_obj = request.FILES.get('file')

        if not file_obj:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_upload(file_obj, "mapping_test")
            mapper = ColumnMapper(profile=profile)
            df = mapper.read_file(file_obj.read(), filename=file_obj.name)
            enforce_table_dimensions(
                df,
                max_rows=policy_for("mapping_test")["max_rows"],
                max_columns=policy_for("mapping_test")["max_columns"],
            )
            records, errors = mapper.apply_mapping(
                df,
                profile.field_mapping,
                profile.value_transforms,
                compute_resolution=profile.compute_resolution_time,
                compute_sla=profile.compute_sla
            )

            preview = mapper.validate_preview(records)
            preview['errors'] = errors[:MAX_PREVIEW_ERRORS]  # Limit errors

            return Response(preview, status=status.HTTP_200_OK)

        except UploadValidationError as exc:
            return _upload_error_response(exc)
        except Exception as e:
            return Response(
                {'error': f'Failed to parse file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def auto_detect(self, request):
        """
        Upload a file and get auto-detected column mapping suggestions.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_upload(file_obj, "mapping_test")
            mapper = ColumnMapper()
            df = mapper.read_file(file_obj.read(), filename=file_obj.name)
            enforce_table_dimensions(
                df,
                max_rows=policy_for("mapping_test")["max_rows"],
                max_columns=policy_for("mapping_test")["max_columns"],
            )
            detected = mapper.auto_detect_columns(list(df.columns))

            return Response({
                'detected_columns': list(df.columns),
                'suggested_mapping': detected,
            }, status=status.HTTP_200_OK)

        except UploadValidationError as exc:
            return _upload_error_response(exc)
        except Exception as e:
            return Response(
                {'error': f'Failed to parse file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )


# ============================================================================
# USER: Upload Flow
# ============================================================================

class TicketUploadViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
    """
    User-facing upload endpoints.
    """
    queryset = TicketImportBatch.objects.all()
    serializer_class = TicketImportBatchSerializer
    permission_classes = [permissions.IsAuthenticated]
    plugin_name = 'ticket_kpi'
    parser_classes = [MultiPartParser, FormParser]
    # Throttle file-parsing endpoints to prevent resource exhaustion.
    throttle_scope = 'upload'
    permission_action_map = {
        'analyze': 'manage',
        'preview': 'manage',
        'import_batch': 'manage',
        'delete_batch': 'manage',
    }

    @action(detail=False, methods=['post'])
    def analyze(self, request):
        """
        Step 1: Upload file, detect columns, suggest profile.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'error': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_upload(file_obj, "ticket_import")
            mapper = ColumnMapper()
            file_bytes = file_obj.read()
            df = mapper.read_file(file_bytes, filename=file_obj.name)
            enforce_table_dimensions(
                df,
                max_rows=policy_for("ticket_import")["max_rows"],
                max_columns=policy_for("ticket_import")["max_columns"],
            )
            detected = mapper.auto_detect_columns(list(df.columns))

            # Suggest best-matching active profile
            profiles = list(ExportProfile.objects.filter(is_active=True).order_by('-created_at'))
            best_profile = None
            best_score = 0
            normalized_columns = [str(c).strip().lower() for c in df.columns]

            for profile in profiles:
                score = sum(
                    1 for their_col in profile.field_mapping.values()
                    if str(their_col).strip().lower() in normalized_columns
                )
                if score > best_score:
                    best_score = score
                    best_profile = profile

            # Fallback: if nothing matched, suggest the most recently created active profile
            # so the user can still select/override it manually.
            if not best_profile and profiles:
                best_profile = profiles[0]
                best_score = 0

            response_data = {
                'detected_columns': list(df.columns),
                'suggested_mapping': detected,
                'total_rows': len(df),
            }

            if best_profile:
                response_data['suggested_profile'] = {
                    'id': best_profile.id,
                    'name': best_profile.name,
                    'match_score': best_score,
                }

            return Response(response_data, status=status.HTTP_200_OK)

        except UploadValidationError as exc:
            return _upload_error_response(exc)
        except Exception as e:
            return Response(
                {'error': f'Failed to analyze file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'])
    def preview(self, request):
        """
        Step 2: Preview normalized data before committing.
        """
        file_obj = request.FILES.get('file')
        profile_id = request.data.get('profile_id')
        month_str = request.data.get('month')

        if not file_obj:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        if not profile_id:
            return Response({'error': 'No profile_id provided'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            profile_id = int(profile_id)
        except (TypeError, ValueError):
            return Response({'error': 'profile_id must be a valid integer'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            profile = ExportProfile.objects.get(id=profile_id, is_active=True)
        except ExportProfile.DoesNotExist:
            return Response(
                {'error': 'Profile not found or inactive'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            validate_upload(file_obj, "ticket_import")
            mapper = ColumnMapper(profile=profile)
            file_bytes = file_obj.read()
            df = mapper.read_file(file_bytes, filename=file_obj.name)
            enforce_table_dimensions(
                df,
                max_rows=policy_for("ticket_import")["max_rows"],
                max_columns=policy_for("ticket_import")["max_columns"],
            )
            records, errors = mapper.apply_mapping(
                df,
                profile.field_mapping,
                profile.value_transforms,
                compute_resolution=profile.compute_resolution_time,
                compute_sla=profile.compute_sla
            )

            # Check for existing upload (months stored as first-of-month only)
            month = None
            if month_str:
                month, err = _parse_month_param(month_str)
                if err:
                    return err
            existing = None
            if month:
                existing = TicketImportBatch.objects.filter(
                    user=request.user, month=month
                ).first()

            preview = mapper.validate_preview(records)
            preview['errors'] = errors[:MAX_PREVIEW_ERRORS]
            preview['has_existing_upload'] = existing is not None
            preview['existing_record_count'] = existing.record_count if existing else 0

            return Response(preview, status=status.HTTP_200_OK)

        except UploadValidationError as exc:
            return _upload_error_response(exc)
        except Exception as e:
            return Response(
                {'error': f'Failed to preview: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'])
    def import_batch(self, request):
        """
        Step 3: Commit the import.
        """
        file_obj = request.FILES.get('file')
        profile_id = request.data.get('profile_id')
        month_str = request.data.get('month')
        override = request.data.get('override', 'false').lower() == 'true'

        # Parse client_ids
        raw_client_ids = request.data.get('client_ids', [])
        if isinstance(raw_client_ids, str):
            try:
                client_ids = [int(x) for x in raw_client_ids.split(',') if x.strip()]
            except ValueError:
                client_ids = []
        else:
            try:
                client_ids = [int(x) for x in raw_client_ids if x is not None]
            except (TypeError, ValueError):
                return Response(
                    {'error': 'client_ids must contain only integers'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not all([file_obj, profile_id, month_str]):
            return Response(
                {'error': 'file, profile_id, and month are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            profile_id = int(profile_id)
        except (TypeError, ValueError):
            return Response(
                {'error': 'profile_id must be a valid integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            profile = ExportProfile.objects.get(id=profile_id, is_active=True)
        except ExportProfile.DoesNotExist:
            return Response(
                {'error': 'Profile not found or inactive'},
                status=status.HTTP_404_NOT_FOUND
            )

        month, err = _parse_month_param(month_str)
        if err:
            return err

        # Validate profile-to-client assignment
        profile_client_ids = set(profile.assigned_clients.values_list('id', flat=True))
        if profile_client_ids:
            if client_ids:
                selected_ids = set(client_ids)
                if not selected_ids <= profile_client_ids:
                    return _error_response(
                        'Profile/client mismatch',
                        status.HTTP_400_BAD_REQUEST,
                        detail=f'This profile is scoped to clients: {list(profile_client_ids)}. '
                               f'Selected clients must be a subset; you sent: {list(selected_ids)}.',
                    )
            else:
                # Auto-assign profile's clients when none selected
                client_ids = list(profile_client_ids)

        # Defense-in-depth: validate user is actually assigned to the selected
        # clients. Admins bypass this check (they manage all clients).
        is_admin_user = request.user.is_staff or request.user.is_superuser
        if not is_admin_user and client_ids:
            user_client_ids = set()
            if hasattr(request.user, 'profile'):
                user_client_ids = set(
                    request.user.profile.clients.values_list('id', flat=True)
                )
            if user_client_ids:
                invalid = set(client_ids) - user_client_ids
                if invalid:
                    return _error_response(
                        'Client access denied',
                        status.HTTP_403_FORBIDDEN,
                        detail=f'You are not assigned to clients: {list(invalid)}.',
                    )

        # Parse the file first (CPU-bound, no DB work) so we don't hold a
        # database transaction open during file I/O.
        try:
            validate_upload(file_obj, "ticket_import")
            mapper = ColumnMapper(profile=profile)
            file_bytes = file_obj.read()
            df = mapper.read_file(file_bytes, filename=file_obj.name)
            enforce_table_dimensions(
                df,
                max_rows=policy_for("ticket_import")["max_rows"],
                max_columns=policy_for("ticket_import")["max_columns"],
            )
            records, errors = mapper.apply_mapping(
                df,
                profile.field_mapping,
                profile.value_transforms,
                compute_resolution=profile.compute_resolution_time,
                compute_sla=profile.compute_sla
            )

            if not records:
                return Response(
                    {'error': 'No valid records found in file', 'parse_errors': errors},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except UploadValidationError as exc:
            return _upload_error_response(exc)
        except Exception as e:
            return Response(
                {'error': f'Import failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        is_admin = request.user.is_staff or request.user.is_superuser

        # Atomic check-and-create: lock the existing-batch row (if any) so two
        # concurrent uploads for the same user/month cannot both pass the
        # existing-check and race on the unique constraint.
        try:
            with transaction.atomic():
                existing = TicketImportBatch.objects.select_for_update().filter(
                    user=request.user, month=month
                ).first()

                if existing:
                    if not is_admin:
                        return Response(
                            {
                                'error': 'Upload already exists for this month. Contact an administrator to override.',
                                'existing_id': existing.id,
                                'existing_count': existing.record_count,
                            },
                            status=status.HTTP_403_FORBIDDEN
                        )
                    if not override:
                        return Response(
                            {
                                'error': 'Upload already exists for this month',
                                'existing_id': existing.id,
                                'existing_count': existing.record_count,
                                'message': 'Set override=true to replace',
                            },
                            status=status.HTTP_409_CONFLICT
                        )
                    # Admin override: mark existing as overridden
                    existing.is_overridden = True
                    existing.overridden_by = request.user
                    existing.overridden_at = timezone.now()
                    existing.save()

                # Create batch (rewind bytes so the saved file is not empty)
                batch = TicketImportBatch.objects.create(
                    user=request.user,
                    month=month,
                    profile=profile,
                    raw_file=ContentFile(file_bytes, name=file_obj.name),
                    record_count=len(records),
                )
                if client_ids:
                    batch.clients.set(client_ids)

                # Bulk create normalized tickets
                NormalizedTicket.objects.bulk_create([
                    NormalizedTicket(batch=batch, **record)
                    for record in records
                ])

                # Recompute monthly KPI now that the parsed tickets exist (the post_save
                # signal fires before bulk_create, so it cannot see the tickets yet).
                compute_monthly_kpi(batch.user, batch.month)
        except IntegrityError:
            # Concurrent upload won the race despite select_for_update fallback
            return Response(
                {'error': 'Upload already exists for this month (concurrent conflict)'},
                status=status.HTTP_409_CONFLICT
            )

        logger.info(
            "User %s imported batch %d (month=%s, records=%d, profile=%s)",
            request.user.username, batch.id, month.strftime('%Y-%m'),
            batch.record_count, batch.profile.name,
        )

        return Response({
            'batch_id': batch.id,
            'record_count': batch.record_count,
            'month': month.strftime('%Y-%m'),
            'parse_errors': errors[:MAX_PREVIEW_ERRORS],
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def my_batches(self, request):
        """List current user's upload history (paginated)."""
        batches = TicketImportBatch.objects.filter(
            user=request.user
        ).select_related('profile').order_by('-month')

        page = self.paginate_queryset(batches)
        if page is not None:
            serializer = TicketImportBatchSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = TicketImportBatchSerializer(batches, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'])
    def delete_batch(self, request, pk=None):
        """
        Delete a batch.

        Rules:
        - Admin can delete any batch.
        - Team leader can delete any batch belonging to a managed user.
        - Owner can delete their own batch until it has been reviewed.
        """
        try:
            batch = TicketImportBatch.objects.get(pk=pk)
        except TicketImportBatch.DoesNotExist:
            return Response(
                {'error': 'Batch not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        is_admin = request.user.is_staff or request.user.is_superuser
        is_tl = _is_tl_for_user(request.user, batch.user)
        is_owner = batch.user == request.user
        can_delete = (
            is_admin or is_tl or (is_owner and not batch.reviewed_by)
        )

        if not can_delete:
            return Response(
                {
                    'error': (
                        'Only administrators, team leaders, or the owner of an '
                        'unreviewed upload can delete this batch.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN
            )

        logger.info(
            "User %s deleted batch %d (user=%s, month=%s, records=%d)",
            request.user.username, batch.id, batch.user.username,
            batch.month, batch.record_count,
        )
        batch.delete()
        return Response({'message': 'Upload deleted'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def team_batches(self, request):
        """List upload batches for team members (TL only, paginated)."""
        team_members = _get_tl_team_members(request.user)
        if not team_members:
            return Response(
                {'error': 'You are not assigned as a team leader'},
                status=status.HTTP_403_FORBIDDEN
            )

        month_str = request.query_params.get('month')
        queryset = TicketImportBatch.objects.filter(
            user__in=team_members,
            is_overridden=False
        ).select_related('profile', 'user').order_by('-month', 'user__username')

        if month_str:
            month, err = _parse_month_param(month_str)
            if err:
                return err
            queryset = queryset.filter(month=month)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = TicketImportBatchSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = TicketImportBatchSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'])
    def delete_team_batch(self, request, pk=None):
        """Allow a team leader to delete a team member's batch."""
        team_members = _get_tl_team_members(request.user)
        if not team_members:
            return Response(
                {'error': 'You are not assigned as a team leader'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            batch = TicketImportBatch.objects.get(pk=pk, user__in=team_members)
        except TicketImportBatch.DoesNotExist:
            return Response(
                {'error': 'Batch not found or not in your team'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Reviewed batches can only be deleted by admins (matches delete_batch policy).
        if batch.reviewed_by and not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': 'Reviewed batches cannot be deleted without admin rights'},
                status=status.HTTP_403_FORBIDDEN
            )

        logger.info(
            "TL %s deleted team batch %d (user=%s, month=%s, records=%d)",
            request.user.username, batch.id, batch.user.username,
            batch.month, batch.record_count,
        )
        batch.delete()
        return Response({'message': 'Upload deleted'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def review_batch(self, request, pk=None):
        """Mark a batch as reviewed (TL/Admin only)."""
        try:
            batch = TicketImportBatch.objects.get(pk=pk)
        except TicketImportBatch.DoesNotExist:
            return Response(
                {'error': 'Batch not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        is_admin = request.user.is_staff or request.user.is_superuser
        if not is_admin and not _is_tl_for_user(request.user, batch.user):
            return Response(
                {'error': 'Only administrators or the user\'s team leader can review uploads'},
                status=status.HTTP_403_FORBIDDEN
            )

        batch.reviewed_by = request.user
        batch.reviewed_at = timezone.now()
        batch.save(update_fields=['reviewed_by', 'reviewed_at'])

        logger.info(
            "User %s reviewed batch %d (user=%s, month=%s)",
            request.user.username, batch.id, batch.user.username, batch.month,
        )

        return Response(
            {
                'message': 'Upload reviewed',
                'reviewed_at': batch.reviewed_at,
                'reviewed_by': request.user.username,
            },
            status=status.HTTP_200_OK
        )


# ============================================================================
# DASHBOARD: KPI Queries
# ============================================================================

class TicketKPIDashboardViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
    """
    Dashboard data for users, team leaders, and HR.
    """
    serializer_class = MonthlyKPISerializer
    permission_classes = [permissions.IsAuthenticated]
    plugin_name = 'ticket_kpi'
    permission_action_map = {
        'team_summary': 'view',
        'team_trend': 'view',
        'team_yearly_summary': 'view',
    }

    @action(detail=False, methods=['get'])
    def monthly_summary(self, request):
        """Get KPI summary for a specific month.

        Optional `compare_month=YYYY-MM-DD` returns the comparison month's
        KPI plus deltas (current - previous) for the headline metrics, so the
        frontend can render delta badges without a second round-trip.
        """
        month_str = request.query_params.get('month')
        compare_month_str = request.query_params.get('compare_month')
        target_user_id = request.query_params.get('user_id')

        if not month_str:
            return Response(
                {'error': 'month parameter required (YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        month, err = _parse_month_param(month_str, 'month')
        if err:
            return err

        compare_month = None
        if compare_month_str:
            compare_month, err = _parse_month_param(compare_month_str, 'compare_month')
            if err:
                return err

        # Determine target user
        target_user = request.user
        if target_user_id:
            target_user_id, err = _safe_int(target_user_id, 'user_id')
            if err:
                return err
            target_user, err = _check_cross_user_access(request, target_user_id)
            if err:
                return err

        kpi = None
        try:
            kpi = MonthlyKPI.objects.get(user=target_user, month=month)
            serializer = MonthlyKPISerializer(kpi)
            data = serializer.data
            data['has_data'] = True
        except MonthlyKPI.DoesNotExist:
            data = {
                'has_data': False,
                'month': month.strftime('%Y-%m-%d'),
                'total_tickets': 0,
                'closed_tickets': 0,
                'open_tickets': 0,
                'avg_resolution_hours': None,
                'min_resolution_hours': None,
                'max_resolution_hours': None,
                'p50_resolution_hours': None,
                'p75_resolution_hours': None,
                'p90_resolution_hours': None,
                'sla_compliance_pct': None,
                'sla_breached_count': 0,
                'by_category': {},
                'by_priority': {},
                'by_status': {},
                'field_breakdowns': {},
            }

        # Period-over-period comparison
        if compare_month is not None:
            data['comparison'] = self._build_comparison(kpi, target_user, compare_month)
        else:
            data['comparison'] = None

        return Response(data)

    @staticmethod
    def _build_comparison(current_kpi, target_user, compare_month):
        """Build the comparison payload: previous month values + deltas."""
        try:
            prev = MonthlyKPI.objects.get(user=target_user, month=compare_month)
        except MonthlyKPI.DoesNotExist:
            return {
                'month': compare_month.strftime('%Y-%m-%d'),
                'has_data': False,
            }

        def _delta(cur, prv):
            if cur is None or prv is None:
                return None
            return round(cur - prv, 2)

        return {
            'month': compare_month.strftime('%Y-%m-%d'),
            'has_data': True,
            'total_tickets': prev.total_tickets,
            'closed_tickets': prev.closed_tickets,
            'avg_resolution_hours': prev.avg_resolution_hours,
            'p50_resolution_hours': prev.p50_resolution_hours,
            'p90_resolution_hours': prev.p90_resolution_hours,
            'sla_compliance_pct': prev.sla_compliance_pct,
            'total_tickets_delta': (
                current_kpi.total_tickets - prev.total_tickets
                if current_kpi else None
            ),
            'closed_tickets_delta': (
                current_kpi.closed_tickets - prev.closed_tickets
                if current_kpi else None
            ),
            'avg_resolution_delta': (
                _delta(current_kpi.avg_resolution_hours, prev.avg_resolution_hours)
                if current_kpi else None
            ),
            'p50_resolution_delta': (
                _delta(current_kpi.p50_resolution_hours, prev.p50_resolution_hours)
                if current_kpi else None
            ),
            'p90_resolution_delta': (
                _delta(current_kpi.p90_resolution_hours, prev.p90_resolution_hours)
                if current_kpi else None
            ),
            'sla_compliance_delta': (
                _delta(current_kpi.sla_compliance_pct, prev.sla_compliance_pct)
                if current_kpi else None
            ),
        }

    @action(detail=False, methods=['get'])
    def trend(self, request):
        """Get trend data for last N months."""
        months, err = _safe_int(request.query_params.get('months', 6), 'months')
        if err:
            return err
        target_user_id = request.query_params.get('user_id')

        target_user = request.user
        if target_user_id:
            target_user_id, err = _safe_int(target_user_id, 'user_id')
            if err:
                return err
            target_user, err = _check_cross_user_access(request, target_user_id)
            if err:
                return err

        data = get_user_monthly_summary(target_user, months=months)
        return Response(data)

    @action(detail=False, methods=['get'])
    def categories(self, request):
        """Get category breakdown for a month. Supports user_id for TL/HR/Admin drill-down."""
        month_str = request.query_params.get('month')
        target_user_id = request.query_params.get('user_id')

        if not month_str:
            return Response(
                {'error': 'month parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        month, err = _parse_month_param(month_str)
        if err:
            return err

        # Determine target user
        target_user = request.user
        if target_user_id:
            target_user_id, err = _safe_int(target_user_id, 'user_id')
            if err:
                return err
            target_user, err = _check_cross_user_access(request, target_user_id)
            if err:
                return err

        month_out = month.strftime('%Y-%m-%d')
        try:
            kpi = MonthlyKPI.objects.get(user=target_user, month=month)
            return Response({
                'has_data': True,
                'month': month_out,
                'by_category': kpi.by_category,
                'by_priority': kpi.by_priority,
            })
        except MonthlyKPI.DoesNotExist:
            return Response({
                'has_data': False,
                'month': month_out,
                'by_category': {},
                'by_priority': {},
            })

    @action(detail=False, methods=['get'])
    def team_summary(self, request):
        """Get aggregated KPI summary for the team leader's team."""
        month_str = request.query_params.get('month')
        if not month_str:
            return Response(
                {'error': 'month parameter required (YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST
            )

        month, err = _parse_month_param(month_str)
        if err:
            return err

        # Get team members for this TL
        team_members = _get_tl_team_members(request.user)
        if not team_members:
            return Response(
                {'error': 'You are not assigned as a team leader'},
                status=status.HTTP_403_FORBIDDEN
            )

        data = get_team_monthly_summary(team_members, month)

        # Batch-fetch all MonthlyKPIs for team members + month (avoids N+1).
        team_member_ids = list(team_members.values_list('id', flat=True))
        kpi_map = {
            kpi.user_id: kpi
            for kpi in MonthlyKPI.objects.filter(
                user_id__in=team_member_ids, month=month
            )
        }

        # Build per-member breakdown from the prefetched map.
        member_kpis = []
        for member in team_members:
            kpi = kpi_map.get(member.id)
            name = f"{member.first_name} {member.last_name}".strip() or member.username
            if kpi:
                member_kpis.append({
                    'user_id': member.id,
                    'username': member.username,
                    'name': name,
                    'total_tickets': kpi.total_tickets,
                    'closed_tickets': kpi.closed_tickets,
                    'open_tickets': kpi.open_tickets,
                    'avg_resolution_hours': kpi.avg_resolution_hours,
                    'sla_compliance_pct': kpi.sla_compliance_pct,
                    'sla_breached_count': kpi.sla_breached_count,
                    'fields_populated': _fields_populated(kpi),
                    'field_breakdowns': kpi.field_breakdowns or {},
                })
            else:
                member_kpis.append({
                    'user_id': member.id,
                    'username': member.username,
                    'name': name,
                    'total_tickets': 0,
                    'closed_tickets': 0,
                    'open_tickets': 0,
                    'avg_resolution_hours': None,
                    'sla_compliance_pct': None,
                    'sla_breached_count': 0,
                    'fields_populated': [],
                    'field_breakdowns': {},
                })

        data['members'] = member_kpis
        return Response(data)

    @action(detail=False, methods=['get'])
    def team_trend(self, request):
        """Get 6-month trend for the team leader's team. Supports month anchor."""
        months, err = _safe_int(request.query_params.get('months', 6), 'months')
        if err:
            return err
        month_str = request.query_params.get('month')

        team_members = _get_tl_team_members(request.user)
        if not team_members:
            return Response(
                {'error': 'You are not assigned as a team leader'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Anchor trend window to provided month or current month (first-of-month)
        if month_str:
            month, err = _parse_month_param(month_str)
            if err:
                return err
            anchor = datetime(month.year, month.month, 1)
        else:
            now = timezone.now()
            anchor = datetime(now.year, now.month, 1)

        from django.db.models import Sum, Avg
        from .models import MonthlyKPI

        team_data = []
        for i in range(months - 1, -1, -1):
            # Subtract i months from the anchor using correct arithmetic.
            # (anchor.month - 1 - i) handles the 0-based month index, then
            # modulo 12 gives the correct month, and the year adjusts for
            # any underflow. This works for any i, not just i <= 12.
            total_months = anchor.year * 12 + (anchor.month - 1) - i
            month_date = datetime(total_months // 12, total_months % 12 + 1, 1)

            kpis = MonthlyKPI.objects.filter(
                user__in=team_members,
                month=month_date
            )

            if kpis.exists():
                totals = kpis.aggregate(
                    total=Sum('total_tickets'),
                    avg_res=Avg('avg_resolution_hours'),
                    avg_sla=Avg('sla_compliance_pct'),
                )
                team_data.append({
                    'month': month_date.strftime('%Y-%m'),
                    'total_tickets': totals['total'] or 0,
                    'avg_resolution_hours': round(totals['avg_res'], 2) if totals['avg_res'] else None,
                    'sla_compliance_pct': round(totals['avg_sla'], 1) if totals['avg_sla'] else None,
                })
            else:
                team_data.append({
                    'month': month_date.strftime('%Y-%m'),
                    'total_tickets': 0,
                    'avg_resolution_hours': None,
                    'sla_compliance_pct': None,
                })

        return Response(team_data)

    @action(detail=False, methods=['get'])
    def team_yearly_summary(self, request):
        """Get full-year KPI summary for the team leader's team.

        Returns yearly totals per member plus a monthly breakdown so the TL
        can review the whole year on one page without navigating per-month.
        """
        year_str = request.query_params.get('year')
        if not year_str:
            return Response(
                {'error': 'year parameter required (YYYY)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            year = int(year_str)
        except ValueError:
            return Response(
                {'error': 'Invalid year format. Use YYYY'},
                status=status.HTTP_400_BAD_REQUEST
            )

        team_members = _get_tl_team_members(request.user)
        if not team_members:
            return Response(
                {'error': 'You are not assigned as a team leader'},
                status=status.HTTP_403_FORBIDDEN
            )

        team_user_ids = list(team_members.values_list('id', flat=True))
        summary = compute_yearly_summary(year, user_ids=team_user_ids)

        # Batch-fetch all MonthlyKPIs for team members + year (avoids N+1).
        all_kpis = MonthlyKPI.objects.filter(
            user_id__in=team_user_ids, month__year=year
        )
        kpis_by_user: dict[int, list] = {}
        for kpi in all_kpis:
            kpis_by_user.setdefault(kpi.user_id, []).append(kpi)

        # Enrich per_user_summary with fields_populated + sla for the TL view
        per_user = []
        for row in summary.get('per_user_summary', []):
            user_id = row['user_id']
            member_kpis = kpis_by_user.get(user_id, [])
            sla_vals = [k.sla_compliance_pct for k in member_kpis if k.sla_compliance_pct is not None]
            avg_sla = round(sum(sla_vals) / len(sla_vals), 1) if sla_vals else None
            # Aggregate fields populated across the year
            all_fields = set()
            for k in member_kpis:
                all_fields.update(_fields_populated(k))
            per_user.append({
                **row,
                'sla_compliance_pct': avg_sla,
                'fields_populated': sorted(all_fields),
                'months_with_data': len(member_kpis),
            })

        summary['per_user_summary'] = per_user
        return Response(summary)

    @action(detail=False, methods=['get'])
    def tickets(self, request):
        """List individual normalized ticket rows for a user + month OR year.

        Returns the raw uploaded rows (with every dynamically discovered
        column from ``raw_data``), server-side filtered and paginated, plus
        the union of available fields and distinct filter values so the
        frontend can render dynamic columns and filter dropdowns.

        Query params (one of month/year is required):
            month (YYYY-MM-DD) — single month
            year (YYYY) — all 12 months of the given year
            user_id (optional, defaults to request.user; TL/HR/Admin drill-down)
            status, priority, category, assignee, requester (optional exact filters)
            search (optional, icontains across ticket_id/title/assignee/requester)
            sla_breached (optional, 'true'/'false')
            field_<name> (optional, dynamic raw_data field exact filter)
            page, page_size (optional, default 25, max 100)
        """
        month_str = request.query_params.get('month')
        year_str = request.query_params.get('year')

        if not month_str and not year_str:
            return Response(
                {'error': 'month (YYYY-MM-DD) or year (YYYY) parameter required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build the base queryset filter for the time range
        if month_str:
            month, err = _parse_month_param(month_str)
            if err:
                return err
            time_filter = {'batch__month': month}
        else:
            try:
                year = int(year_str)
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Invalid year format. Use YYYY'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            time_filter = {'batch__month__year': year}

        target_user_id = request.query_params.get('user_id')
        target_user = request.user
        if target_user_id:
            target_user_id, err = _safe_int(target_user_id, 'user_id')
            if err:
                return err
            target_user, err = _check_cross_user_access(request, target_user_id)
            if err:
                return err

        base_qs = NormalizedTicket.objects.filter(
            batch__user=target_user,
            batch__is_overridden=False,
            **time_filter,
        ).order_by('-created_at', '-id')

        # ---- Dynamic field discovery + filter options (from unfiltered set) ----
        standard_fields = [
            'ticket_id', 'title', 'status', 'created_at', 'resolved_at',
            'assignee', 'requester', 'priority', 'category',
            'time_to_resolution_hours', 'sla_breached',
        ]
        standard_set = set(standard_fields)
        extra_fields: set = set()
        # Collect distinct values for every filterable field (standard + dynamic)
        field_values: dict = {}
        for t in base_qs.only('status', 'priority', 'category', 'assignee', 'requester', 'raw_data'):
            for fname in ('status', 'priority', 'category', 'assignee', 'requester'):
                val = getattr(t, fname, None)
                if val:
                    field_values.setdefault(fname, set()).add(str(val))
            if t.raw_data:
                for key, val in t.raw_data.items():
                    if key not in standard_set:
                        extra_fields.add(key)
                        # Only collect string-like values for filter dropdowns
                        if val is not None and not isinstance(val, (dict, list)):
                            field_values.setdefault(key, set()).add(str(val))

        available_fields = standard_fields + sorted(extra_fields)
        # Build filter_options: standard fields + dynamic fields, all with distinct values
        filter_options = {}
        for fname in ('status', 'priority', 'category', 'assignee', 'requester'):
            filter_options[fname] = sorted(field_values.get(fname, set()))
        for fname in sorted(extra_fields):
            filter_options[fname] = sorted(field_values.get(fname, set()))

        # ---- Apply filters ----
        qs = base_qs
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        priority_filter = request.query_params.get('priority')
        if priority_filter:
            qs = qs.filter(priority=priority_filter)
        category_filter = request.query_params.get('category')
        if category_filter:
            qs = qs.filter(category=category_filter)
        assignee_filter = request.query_params.get('assignee')
        if assignee_filter:
            qs = qs.filter(assignee=assignee_filter)
        requester_filter = request.query_params.get('requester')
        if requester_filter:
            qs = qs.filter(requester=requester_filter)
        sla_filter = request.query_params.get('sla_breached')
        if sla_filter is not None and sla_filter != '':
            qs = qs.filter(sla_breached=(sla_filter.lower() == 'true'))
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(ticket_id__icontains=search)
                | Q(title__icontains=search)
                | Q(assignee__icontains=search)
                | Q(requester__icontains=search)
            )

        # Dynamic field filters: any query param starting with "field_" is
        # treated as a raw_data JSON key filter (e.g. field_operatore=John).
        for key in request.query_params:
            if key.startswith('field_'):
                field_name = key[len('field_'):]
                field_val = request.query_params.get(key)
                if field_val and field_name:
                    qs = qs.filter(**{f'raw_data__{field_name}': field_val})

        total_count = qs.count()

        # ---- Pagination ----
        page_size, err = _safe_int(request.query_params.get('page_size', 25), 'page_size')
        if err:
            return err
        page_size = max(1, min(page_size, 100))
        page, err = _safe_int(request.query_params.get('page', 1), 'page')
        if err:
            return err
        page = max(1, page)
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        page = min(page, total_pages)
        offset = (page - 1) * page_size
        page_qs = qs[offset:offset + page_size]

        results = NormalizedTicketSerializer(page_qs, many=True).data

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'results': results,
            'available_fields': available_fields,
            'filter_options': filter_options,
        })


def _fields_populated(kpi):
    """Return a list of human-readable field names that have data in this KPI.

    Used by the TL team page to show which breakdowns are available per member
    so the TL knows what they can drill into without opening the full dashboard.
    """
    fields = []
    if kpi.total_tickets > 0:
        fields.append('tickets')
    if kpi.avg_resolution_hours is not None:
        fields.append('resolution_time')
    if kpi.sla_compliance_pct is not None:
        fields.append('sla')
    if kpi.by_category:
        fields.append('category')
    if kpi.by_priority:
        fields.append('priority')
    if kpi.by_status:
        fields.append('status')
    # Dynamic field breakdowns (any custom categorical fields)
    if kpi.field_breakdowns:
        for key in kpi.field_breakdowns:
            # Skip the standard ones already covered above
            if key.lower() not in {'status', 'priority', 'category'}:
                fields.append(key)
    return fields


def _tl_member_q(user):
    """Return Q object matching Users managed by `user` as a team leader."""
    q = Q(id=user.id)
    # is_albanian_tl / is_italian_tl properties already check role_codes,
    # legacy flags, and team members — no need for redundant flag checks.
    if user.profile.is_albanian_tl:
        q |= Q(profile__albanian_tl=user)
    if user.profile.is_italian_tl:
        q |= Q(profile__italian_tl=user)
    if user.led_teams.exists():
        q |= Q(profile__teams__team_leader=user)
    return q


def _get_tl_team_members(user):
    """Return a queryset of Users managed by this team leader.

    Includes users assigned via direct italian_tl/albanian_tl FKs and members
    of any Team where this user is the team_leader. Also includes the TL
    themselves so their own data appears in team dashboards/reports.
    """
    if not hasattr(user, 'profile') or not user.profile.is_team_leader:
        return User.objects.none()
    return User.objects.filter(_tl_member_q(user)).select_related('profile').distinct().order_by('username')


def _is_tl_for_user(tl_user, target_user):
    """Return True if tl_user is a team leader for target_user (not themselves)."""
    if tl_user == target_user:
        return False
    if not hasattr(tl_user, 'profile') or not tl_user.profile.is_team_leader:
        return False
    return UserProfile.objects.filter(
        user=target_user
    ).filter(
        Q(italian_tl=tl_user) | Q(albanian_tl=tl_user) | Q(teams__team_leader=tl_user)
    ).exists()


def _check_cross_user_access(request, target_user_id):
    """Validate that `request.user` may access `target_user_id`'s data.

    Returns (target_user, None) on success, or (None, Response) on denial.
    Enforces:
      - Self access always allowed
      - Admin/superuser allowed
      - HR allowed (intentional broad access for HR reporting)
      - TL allowed ONLY for users in their team
    """
    if target_user_id == request.user.id:
        return request.user, None

    is_admin = request.user.is_staff or request.user.is_superuser
    is_hr = hasattr(request.user, 'profile') and request.user.profile.is_hr
    is_tl = hasattr(request.user, 'profile') and request.user.profile.is_team_leader

    if not (is_admin or is_hr or is_tl):
        return None, Response(
            {'error': 'Permission denied'},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        target_user = User.objects.get(id=target_user_id)
    except User.DoesNotExist:
        return None, Response(
            {'error': 'User not found'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # TLs are scoped to their own team members.
    if is_tl and not (is_admin or is_hr) and not _is_tl_for_user(request.user, target_user):
        return None, Response(
            {'error': "You can only view your team members' data"},
            status=status.HTTP_403_FORBIDDEN,
        )

    return target_user, None


def _safe_int(value, field_name='parameter'):
    """Convert `value` to int, returning (int, None) or (None, Response 400)."""
    try:
        return int(value), None
    except (ValueError, TypeError):
        return None, Response(
            {'error': f'Invalid {field_name} format'},
            status=status.HTTP_400_BAD_REQUEST,
        )


def _parse_month_param(value, field_name='month'):
    """Parse YYYY-MM-DD and normalize to the first day of that month.

    MonthlyKPI / TicketImportBatch store months as first-of-month only.
    Accepting mid-month dates without normalization silently returns has_data=False.
    """
    try:
        parsed = datetime.strptime(value, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None, Response(
            {'error': f'Invalid {field_name} format. Use YYYY-MM-DD'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return parsed.replace(day=1), None


def _parse_user_ids(value):
    """Parse a comma-separated user ID query parameter safely."""
    if not isinstance(value, str) or not value.strip():
        return None, Response(
            {'error': 'user_ids must be a comma-separated list of integers'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        values = [int(part.strip()) for part in value.split(',')]
    except (TypeError, ValueError):
        return None, Response(
            {'error': 'user_ids must be a comma-separated list of integers'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if any(user_id <= 0 for user_id in values):
        return None, Response(
            {'error': 'user_ids must contain positive integers'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return set(values), None


# ============================================================================
# REPORTS: Yearly Export
# ============================================================================

class TicketKPIReportViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
    """
    Yearly report generation for admin/TL/HR.
    """
    serializer_class = MonthlyKPISerializer
    permission_classes = [permissions.IsAuthenticated]
    plugin_name = 'ticket_kpi'
    throttle_scope = 'export'
    permission_action_map = {
        'yearly_summary': 'view',
        'export_excel': 'view',
        'export_csv': 'view',
        'purge_media': 'manage',
    }

    def _resolve_export_user_ids(self, request, team_id=None):
        """Resolve and authorize requested export user IDs."""
        user = request.user
        is_admin = user.is_staff or user.is_superuser
        is_hr = hasattr(user, 'profile') and user.profile.is_hr
        is_tl = hasattr(user, 'profile') and user.profile.is_team_leader

        if team_id is not None:
            try:
                team = Team.objects.get(id=team_id)
            except (Team.DoesNotExist, ValueError, TypeError):
                return None, Response(
                    {'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND
                )
            if not (is_admin or is_hr) and team.team_leader != user:
                return None, Response(
                    {'error': 'You can only view your own team'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            requested_ids = set(team.members.values_list('user__id', flat=True))
        else:
            raw_user_ids = request.query_params.get('user_ids')
            if raw_user_ids is None:
                if is_tl and not (is_admin or is_hr):
                    requested_ids = set(_get_tl_team_members(user).values_list('id', flat=True))
                elif not (is_admin or is_hr):
                    requested_ids = {user.id}
                else:
                    requested_ids = None
            else:
                requested_ids, error = _parse_user_ids(raw_user_ids)
                if error:
                    return None, error

        if requested_ids is None:
            return None, None

        if is_admin or is_hr:
            return sorted(requested_ids), None

        allowed_ids = {user.id}
        if is_tl:
            allowed_ids.update(_get_tl_team_members(user).values_list('id', flat=True))
        unauthorized_ids = requested_ids - allowed_ids
        if unauthorized_ids:
            return None, Response(
                {'error': 'Requested users are outside your permitted scope'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return sorted(requested_ids), None

    @action(detail=False, methods=['get'])
    def yearly_summary(self, request):
        """Get aggregated yearly summary."""
        raw_year = request.query_params.get('year', str(timezone.now().year))
        try:
            year = int(raw_year)
        except (TypeError, ValueError):
            return Response(
                {'error': 'year must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if year < 2000 or year > 2100:
            return Response(
                {'error': 'year must be between 2000 and 2100'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_team_id = request.query_params.get('team_id')
        if raw_team_id is not None:
            try:
                team_id = int(raw_team_id)
            except (TypeError, ValueError):
                return Response(
                    {'error': 'team_id must be an integer'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            team_id = None

        user_ids, error = self._resolve_export_user_ids(request, team_id=team_id)
        if error:
            return error
        if user_ids is None and not (
            request.user.is_staff
            or request.user.is_superuser
            or getattr(getattr(request.user, 'profile', None), 'is_hr', False)
        ):
            user_ids = [request.user.id]

        data = compute_yearly_summary(year, user_ids=user_ids)
        return Response(data)

    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Generate and download yearly Excel report."""
        from django.http import HttpResponse
        from openpyxl import Workbook

        raw_year = request.query_params.get('year', str(timezone.now().year))
        try:
            year = int(raw_year)
        except (TypeError, ValueError):
            return Response(
                {'error': 'year must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if year < 2000 or year > 2100:
            return Response(
                {'error': 'year must be between 2000 and 2100'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user_ids, error = self._resolve_export_user_ids(request)
        if error:
            return error

        data = compute_yearly_summary(year, user_ids=user_ids)

        wb = Workbook()

        # Sheet 1: Summary
        ws1 = wb.active
        ws1.title = "Summary"
        ws1.append(['Metric', 'Value'])
        ws1.append(['Year', year])
        ws1.append(['Users with Data', data['users_with_data']])
        ws1.append(['Total Tickets', data['total_tickets']])
        ws1.append(['Avg Resolution (h)', data.get('avg_resolution_hours', 'N/A')])
        ws1.append(['SLA Compliance (%)', data.get('sla_compliance_pct', 'N/A')])

        # Sheet 2: Monthly Breakdown
        ws2 = wb.create_sheet("Monthly Breakdown")
        ws2.append(['Month', 'Total Tickets', 'Avg Resolution (h)', 'SLA Compliance (%)'])
        for m in data['monthly_breakdown']:
            ws2.append([
                m['month'],
                m['total_tickets'],
                m.get('avg_resolution_hours', 'N/A'),
                m.get('sla_compliance_pct', 'N/A'),
            ])

        # Sheet 3: Per-User Summary
        ws3 = wb.create_sheet("Per-User Summary")
        ws3.append(['User', 'Name', 'Total Tickets', 'Avg Resolution (h)', 'SLA Compliance (%)'])
        for u in data['per_user_summary']:
            ws3.append([
                u['username'],
                u['name'],
                u['total_tickets'],
                u.get('avg_resolution_hours', 'N/A'),
                u.get('sla_compliance_pct', 'N/A'),
            ])

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="ticket_kpi_report_{year}.xlsx"'
        wb.save(response)
        return response

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        """Generate and download yearly CSV report."""
        import csv
        from django.http import HttpResponse

        raw_year = request.query_params.get('year', str(timezone.now().year))
        try:
            year = int(raw_year)
        except (TypeError, ValueError):
            return Response(
                {'error': 'year must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if year < 2000 or year > 2100:
            return Response(
                {'error': 'year must be between 2000 and 2100'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user_ids, error = self._resolve_export_user_ids(request)
        if error:
            return error

        data = compute_yearly_summary(year, user_ids=user_ids)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="ticket_kpi_report_{year}.csv"'

        writer = csv.writer(response)
        writer.writerow(['Year', 'User', 'Name', 'Total Tickets', 'Avg Resolution (h)', 'SLA Compliance (%)'])

        for u in data['per_user_summary']:
            writer.writerow([
                year,
                u['username'],
                u['name'],
                u['total_tickets'],
                u.get('avg_resolution_hours', ''),
                u.get('sla_compliance_pct', ''),
            ])

        return response

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def purge_media(self, request):
        """Delete all uploaded ticket import files from media storage."""
        import shutil
        from django.conf import settings

        media_dir = Path(settings.MEDIA_ROOT) / 'ticket_imports'
        deleted_count = 0
        deleted_bytes = 0

        if media_dir.exists():
            for item in media_dir.rglob('*'):
                if item.is_file():
                    deleted_bytes += item.stat().st_size
                    deleted_count += 1
            shutil.rmtree(media_dir)

        return Response({
            'status': 'success',
            'message': f'Purged {deleted_count} uploaded files ({deleted_bytes / (1024*1024):.1f} MB)',
            'files_deleted': deleted_count,
            'bytes_deleted': deleted_bytes,
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAdminUser])
    def stats(self, request):
        """Get plugin statistics for admin dashboard."""
        from .models import TicketImportBatch, NormalizedTicket, MonthlyKPI, ExportProfile

        total_uploads = TicketImportBatch.objects.count()
        total_tickets = NormalizedTicket.objects.count()
        total_profiles = ExportProfile.objects.filter(is_active=True).count()
        months_with_data = MonthlyKPI.objects.values('month').distinct().count()

        # Disk usage
        from django.conf import settings
        media_dir = Path(settings.MEDIA_ROOT) / 'ticket_imports'
        disk_bytes = 0
        if media_dir.exists():
            for item in media_dir.rglob('*'):
                if item.is_file():
                    disk_bytes += item.stat().st_size

        return Response({
            'total_uploads': total_uploads,
            'total_tickets': total_tickets,
            'active_profiles': total_profiles,
            'months_with_data': months_with_data,
            'disk_usage_mb': round(disk_bytes / (1024 * 1024), 2),
        })


# ============================================================================
# EVIDENCE: KPI evidence uploads and review
# ============================================================================

class KPIEvidenceViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """
    Evidence uploads (PDFs, images, email threads) linked to users, months, and clients.
    """
    queryset = KPIEvidence.objects.all().order_by('-created_at')
    serializer_class = KPIEvidenceSerializer
    permission_classes = [permissions.IsAuthenticated]
    plugin_name = 'ticket_kpi'
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = 'evidence_upload'

    def get_queryset(self):
        user = self.request.user
        is_admin = user.is_staff or user.is_superuser
        is_hr = hasattr(user, 'profile') and user.profile.is_hr
        is_tl = hasattr(user, 'profile') and user.profile.is_team_leader

        qs = KPIEvidence.objects.all().select_related('user', 'reviewed_by').prefetch_related('clients')

        if not (is_admin or is_hr or is_tl):
            qs = qs.filter(user=user)
        else:
            target_user_id = self.request.query_params.get('user_id')
            target_id = None
            if target_user_id:
                try:
                    target_id = int(target_user_id)
                except (ValueError, TypeError):
                    return KPIEvidence.objects.none()
            if target_id and not (is_admin or is_hr):
                # TLs can only view users they manage
                if not _get_tl_team_members(user).filter(id=target_id).exists():
                    return KPIEvidence.objects.none()
            if target_id:
                qs = qs.filter(user_id=target_id)

        month = self.request.query_params.get('month')
        if month:
            # Accept YYYY-MM-DD or YYYY-MM; always store/filter as first-of-month.
            month_date = None
            for fmt in ('%Y-%m-%d', '%Y-%m'):
                try:
                    month_date = datetime.strptime(month, fmt).date().replace(day=1)
                    break
                except ValueError:
                    continue
            if month_date is None:
                return KPIEvidence.objects.none()
            qs = qs.filter(month=month_date)

        client_id = self.request.query_params.get('client_id')
        if client_id:
            qs = qs.filter(clients__id=client_id)

        status = self.request.query_params.get('status')
        if status:
            qs = qs.filter(status=status)

        return qs.distinct().order_by('-created_at')

    def _validate_client_ids(self, user, client_ids):
        """Ensure selected clients belong to the user (or any client if unassigned)."""
        if not client_ids:
            return client_ids
        user_client_ids = set()
        if hasattr(user, 'profile'):
            user_client_ids = set(user.profile.clients.values_list('id', flat=True))
        if not user_client_ids:
            # Unassigned users may use any active client
            from apps.overtime.models.core import Client
            return [cid for cid in client_ids if Client.objects.filter(id=cid, is_active=True).exists()]
        selected = set(client_ids)
        invalid = selected - user_client_ids
        if invalid:
            raise serializers.ValidationError(
                f"Invalid client selection: {list(invalid)}. You can only use your assigned clients."
            )
        return client_ids

    def _check_evidence_permission(self, evidence):
        user = self.request.user
        is_admin = user.is_staff or user.is_superuser
        if is_admin:
            return
        if evidence.user == user:
            return
        if _is_tl_for_user(user, evidence.user):
            return
        if hasattr(user, 'profile') and user.profile.is_hr:
            return
        raise PermissionDenied("You do not have permission to access this evidence.")

    def get_object(self):
        obj = super().get_object()
        self._check_evidence_permission(obj)
        return obj

    def perform_create(self, serializer):
        user = self.request.user
        client_ids = serializer.validated_data.pop('client_ids', [])
        client_ids = self._validate_client_ids(user, client_ids)

        file_obj = serializer.validated_data.get('file')
        if file_obj:
            max_mb = _resolve_evidence_max_mb(user)
            try:
                validate_upload(file_obj, "evidence", max_bytes_override_mb=max_mb)
            except UploadValidationError as exc:
                raise serializers.ValidationError({"file": exc.detail})

        evidence = serializer.save(user=user)
        if client_ids:
            evidence.clients.set(client_ids)

        # Parse email threads after the file is saved
        if evidence.evidence_type == 'email_thread' or evidence.file.name.lower().endswith(('.eml', '.msg')):
            evidence.parsed_email = parse_email_evidence(evidence)
            if evidence.parsed_email:
                evidence.save(update_fields=['parsed_email'])

    def perform_update(self, serializer):
        user = self.request.user
        evidence = serializer.instance
        self._check_evidence_permission(evidence)

        is_admin = user.is_staff or user.is_superuser
        is_owner = evidence.user == user
        is_tl = _is_tl_for_user(user, evidence.user)

        if not is_owner and not is_admin and not is_tl:
            raise PermissionDenied("You can only update your own or your team members' evidence.")

        # Owners cannot edit evidence once it has been reviewed; TL/Admin can update as needed
        if is_owner and evidence.status != 'pending' and not is_admin:
            raise PermissionDenied("Reviewed evidence cannot be edited by the owner.")

        client_ids = serializer.validated_data.pop('client_ids', None)
        if client_ids is not None:
            target_user = evidence.user
            client_ids = self._validate_client_ids(target_user, client_ids)

        evidence = serializer.save()
        if client_ids is not None:
            evidence.clients.set(client_ids)

    def perform_destroy(self, instance):
        self._check_evidence_permission(instance)
        # Owners can delete their own pending evidence; TL/Admin can delete any
        user = self.request.user
        if instance.user != user and not (user.is_staff or user.is_superuser) and not _is_tl_for_user(user, instance.user):
            raise PermissionDenied("Only the owner or a team leader/admin can delete this evidence.")
        if instance.user == user and instance.reviewed_by and not (user.is_staff or user.is_superuser):
            raise PermissionDenied("Reviewed evidence cannot be deleted by the owner.")
        logger.info(
            "User %s deleted evidence %d (user=%s, month=%s, type=%s)",
            user.username, instance.id, instance.user.username,
            instance.month, instance.evidence_type,
        )
        instance.delete()

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """Approve or reject evidence (TL/Admin only)."""
        evidence = self.get_object()
        new_status = request.data.get('status')
        if new_status not in ('approved', 'rejected'):
            return Response(
                {'error': "status must be 'approved' or 'rejected'"},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user
        if not (user.is_staff or user.is_superuser or _is_tl_for_user(user, evidence.user)):
            raise PermissionDenied("Only administrators or the user's team leader can review evidence.")

        evidence.status = new_status
        evidence.reviewed_by = user
        evidence.reviewed_at = timezone.now()
        evidence.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        logger.info(
            "User %s %s evidence %d (user=%s, month=%s)",
            user.username, new_status, evidence.id,
            evidence.user.username, evidence.month,
        )

        serializer = self.get_serializer(evidence)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def unreview(self, request, pk=None):
        """Reset evidence to pending (Admin/TL only)."""
        evidence = self.get_object()
        user = request.user
        if not (user.is_staff or user.is_superuser or _is_tl_for_user(user, evidence.user)):
            raise PermissionDenied("Only administrators or the user's team leader can unreview evidence.")

        evidence.status = 'pending'
        evidence.reviewed_by = None
        evidence.reviewed_at = None
        evidence.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        serializer = self.get_serializer(evidence)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def email_preview(self, request, pk=None):
        """Return the parsed email preview for an evidence item."""
        evidence = self.get_object()
        if evidence.evidence_type != 'email_thread' and not evidence.file.name.lower().endswith(('.eml', '.msg')):
            return Response(
                {'error': 'This evidence is not an email thread'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not evidence.parsed_email:
            evidence.parsed_email = parse_email_evidence(evidence)
            if evidence.parsed_email:
                evidence.save(update_fields=['parsed_email'])
        return Response(evidence.parsed_email or {})

    # File extensions that browsers can render inline (open in a tab).
    BROWSER_VIEWABLE_EXTENSIONS = {
        'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp',
        'txt', 'html', 'htm', 'csv',
    }

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Serve the evidence file with appropriate Content-Disposition.

        Browser-viewable types (images, PDF, HTML, text, CSV) are served
        ``inline`` so they open in a new tab. Office documents (doc/xls/etc.)
        and email files are served ``attachment`` to trigger a download.
        Permission is enforced via ``get_object`` → ``_check_evidence_permission``.
        """
        evidence = self.get_object()
        if not evidence.file:
            return Response(
                {'error': 'No file attached to this evidence'},
                status=status.HTTP_404_NOT_FOUND,
            )

        file_path = evidence.file.path
        file_name = Path(file_path).name
        ext = file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else ''
        is_browser_viewable = ext in self.BROWSER_VIEWABLE_EXTENSIONS

        # Guess content type; fall back to octet-stream for unknown types.
        content_type, _ = mimetypes.guess_type(file_name)
        if content_type is None:
            content_type = 'application/octet-stream'

        disposition = 'inline' if is_browser_viewable else 'attachment'
        response = FileResponse(
            open(file_path, 'rb'),
            content_type=content_type,
        )
        # Force attachment for HTML/SVG to prevent execution in the app origin.
        # These types can carry scripts; only images/PDF/text remain inline.
        if ext in {"html", "htm", "svg"}:
            disposition = "attachment"
            response["Content-Type"] = "application/octet-stream"
        # Safe filename quoting per RFC 6266 — strip quotes/backslashes that
        # could break header parsing or inject additional parameters.
        safe_name = file_name.replace('"', "").replace("\\", "").replace("\r", "").replace("\n", "")
        response['Content-Disposition'] = f'{disposition}; filename="{safe_name}"'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class TicketOvertimeLinkViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """CRUD and search endpoints for manual KPI/overtime links."""
    plugin_name = 'ticket_kpi'
    permission_classes = [permissions.IsAuthenticated]
    permission_action_map = {
        'create': 'manage',
        'update': 'manage',
        'partial_update': 'manage',
        'destroy': 'manage',
        'review': 'manage',
        'list': 'view',
        'retrieve': 'view',
        'search_tickets': 'view',
        'overtime_links': 'view',
    }
    serializer_class = TicketOvertimeLinkSerializer
    queryset = TicketOvertimeLink.objects.select_related(
        'overtime_log', 'overtime_log__user', 'overtime_log__client',
        'normalized_ticket', 'normalized_ticket__batch',
        'linked_by', 'reviewed_by',
    )

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        is_hr = hasattr(user, 'profile') and user.profile.is_hr
        if not (user.is_staff or user.is_superuser or is_hr):
            team_member_ids = set(
                _get_tl_team_members(user).values_list('id', flat=True)
            )
            qs = qs.filter(
                Q(overtime_log__user=user) |
                Q(overtime_log__user_id__in=team_member_ids)
            )
        review_status = self.request.query_params.get('review_status')
        if review_status in {'pending', 'confirmed', 'rejected'}:
            qs = qs.filter(review_status=review_status)
        return qs

    def _check_link_mutation_permission(self, overtime_user):
        user = self.request.user
        if user.is_staff or user.is_superuser or user == overtime_user:
            return
        if _is_tl_for_user(user, overtime_user):
            return
        raise PermissionDenied(
            "Only the overtime owner, their team leader, or an administrator "
            "can modify ticket-overtime links."
        )

    def _validate_link_target(self, overtime_log, ticket):
        self._check_link_mutation_permission(overtime_log.user)
        if ticket.batch.is_overridden:
            raise serializers.ValidationError(
                'Cannot link a ticket from an overridden batch.'
            )
        if ticket.batch.user_id != overtime_log.user_id:
            raise serializers.ValidationError(
                'The KPI batch owner must match the overtime entry owner.'
            )

    def perform_create(self, serializer):
        overtime_log = serializer.validated_data['overtime_log']
        ticket = serializer.validated_data['normalized_ticket']
        self._validate_link_target(overtime_log, ticket)
        instance = serializer.save(
            linked_by=self.request.user,
            link_method='manual',
            review_status='confirmed',
        )
        _audit_link_action(self.request.user, 'create', instance)

    def perform_update(self, serializer):
        overtime_log = serializer.validated_data.get(
            'overtime_log', serializer.instance.overtime_log
        )
        ticket = serializer.validated_data.get(
            'normalized_ticket', serializer.instance.normalized_ticket
        )
        self._validate_link_target(overtime_log, ticket)
        instance = serializer.save()
        _audit_link_action(self.request.user, 'update', instance)

    def perform_destroy(self, instance):
        self._check_link_mutation_permission(instance.overtime_log.user)
        _audit_link_action(self.request.user, 'delete', instance)
        instance.delete()

    @action(detail=False, methods=['get'])
    def search_tickets(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response({'results': []})
        user = request.user
        is_hr = hasattr(user, 'profile') and user.profile.is_hr
        if user.is_staff or user.is_superuser or is_hr:
            accessible_batch_ids = set(
                TicketImportBatch.objects.filter(
                    is_overridden=False
                ).values_list('id', flat=True)
            )
        else:
            accessible_batch_ids = set(
                TicketImportBatch.objects.filter(
                    user=user, is_overridden=False
                ).values_list('id', flat=True)
            )
            team_member_ids = set(
                _get_tl_team_members(user).values_list('id', flat=True)
            )
            if team_member_ids:
                accessible_batch_ids |= set(
                    TicketImportBatch.objects.filter(
                        user_id__in=team_member_ids,
                        is_overridden=False,
                    ).values_list('id', flat=True)
                )
        tickets = NormalizedTicket.objects.filter(
            ticket_id__icontains=q,
            batch_id__in=accessible_batch_ids,
        ).select_related('batch')[:20]
        return Response({'results': [
            {
                'id': ticket.id,
                'ticket_id': ticket.ticket_id,
                'title': ticket.title[:100],
                'status': ticket.status,
                'batch_month': ticket.batch.month.isoformat(),
            }
            for ticket in tickets
        ]})

    @action(detail=False, methods=['get'])
    def overtime_links(self, request):
        ot_id, err = _safe_int(
            request.query_params.get('overtime_log_id'),
            'overtime_log_id',
        )
        if err:
            return err
        links = self.get_queryset().filter(overtime_log_id=ot_id)
        return Response({'results': self.get_serializer(links, many=True).data})

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        link = self.get_object()
        decision = request.data.get('decision')
        if decision not in ('confirmed', 'rejected'):
            return Response(
                {'error': 'decision must be confirmed or rejected'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        if not (
            user.is_staff
            or user.is_superuser
            or _is_tl_for_user(user, link.overtime_log.user)
        ):
            raise PermissionDenied(
                "Only an administrator or the overtime owner's team leader "
                "can review an auto-matched link."
            )
        link.review_status = decision
        link.reviewed_by = request.user
        link.reviewed_at = timezone.now()
        link.save(update_fields=['review_status', 'reviewed_by', 'reviewed_at'])
        _audit_link_action(request.user, f'review_{decision}', link)
        return Response(self.get_serializer(link).data)
