"""ViewSets for the Skills Matrix plugin.

Permission design (see plan Gap 4 / Contract C6):
- ``view`` is public=True (all authenticated users, including legacy).
- ``UserSkillViewSet`` maps ALL actions to ``view`` via
  ``permission_action_map`` so self-service writes work under public view.
  Actual scoping (self/TL/HR) is enforced at the queryset + object level.
- ``SkillCategoryViewSet`` and ``SkillViewSet`` use default mapping
  (writes → ``manage``, HR-only) for catalog CRUD.
- Matrix/gap/export/history viewsets are read-only (GET → ``view``).
"""
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q

from core.mixins.permissions import PluginPermissionMixin

from .models import (
    SkillCategory,
    Skill,
    UserSkill,
    SkillRatingHistory,
)
from .serializers import (
    SkillCategorySerializer,
    SkillSerializer,
    UserSkillSerializer,
    UserSkillCreateSerializer,
    UserSkillUpdateSerializer,
    SkillRatingHistorySerializer,
    TeamMatrixRowSerializer,
    SkillCoverageSerializer,
)
from .services.team_query import (
    visible_user_ids,
    can_edit_user_skill,
    can_delete_user_skill,
)
from .services.matrix import (
    MatrixPagination,
    build_matrix_queryset,
    build_matrix_rows,
    build_coverage_stats,
)
from .services.gap_report import build_gap_report
from .services.export import export_matrix_csv


def _parse_top_n(request):
    """Parse the optional ``?top_n=N`` query param (S3 payload limit).

    Returns a positive int, or ``None`` if absent / non-positive.
    Raises ``ValidationError`` (400) if the value is present but not a
    valid integer.
    """
    raw = request.query_params.get('top_n')
    if not raw:
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        from rest_framework.exceptions import ValidationError
        raise ValidationError("top_n must be a positive integer.")
    return value if value > 0 else None


# ============================================================================
# CATALOG: SkillCategory + Skill (admin/HR write, all read)
# ============================================================================

class SkillCategoryViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Admin/HR CRUD for skill categories. All authenticated users can list."""
    queryset = SkillCategory.objects.all().order_by('name')
    serializer_class = SkillCategorySerializer
    plugin_name = 'skills'
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Annotate skill_count to avoid N+1 in the serializer.
        qs = qs.annotate(_skill_count=Count('skills'))
        if self.action == 'list':
            active_only = self.request.query_params.get('active')
            if active_only == 'true':
                qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        """Catch PROTECT violations and return a clean 400."""
        from django.db.models import ProtectedError
        from rest_framework.exceptions import ValidationError
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError(
                "Cannot delete this category because it has skills. "
                "Remove or reassign the skills first."
            )


class SkillViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Admin/HR CRUD for skills. All authenticated users can list/search."""
    queryset = Skill.objects.select_related('category').all().order_by(
        'category__name', 'name'
    )
    serializer_class = SkillSerializer
    plugin_name = 'skills'
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if self.action == 'list':
            category = params.get('category')
            search = params.get('search')
            active = params.get('active')
            if category:
                qs = qs.filter(category__code=category)
            if search:
                qs = qs.filter(
                    Q(name__icontains=search) | Q(code__icontains=search)
                )
            if active in ('true', 'false'):
                qs = qs.filter(is_active=(active == 'true'))
        return qs

    def perform_destroy(self, instance):
        """Reject deletion when active UserSkill ratings reference the skill.

        Deleting a Skill cascades to all UserSkill rows (CASCADE), which
        would erase every employee's rating for that skill. Admins should
        deactivate the skill (``is_active=False``) instead. A Skill with no
        ratings can be deleted normally. Matches the category PROTECT
        pattern (F2-v4).
        """
        from rest_framework.exceptions import ValidationError
        if UserSkill.objects.filter(skill=instance).exists():
            raise ValidationError(
                "Cannot delete a skill that has active ratings. "
                "Deactivate it (set is_active=false) instead."
            )
        instance.delete()


# ============================================================================
# USER SKILLS: self-service + TL re-rate
# ============================================================================

class UserSkillViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Self-service skill ratings for employees; TL re-rate via `rate` action.

    Permission mapping (Contract C6): ALL actions map to ``view`` (public)
    so employees can self-service and TLs can re-rate. Actual scoping is
    enforced at the queryset + object level:
    - ``perform_create``: self-only (or admin/HR for admin-created entries)
    - ``perform_destroy``: self/HR/admin only (TLs cannot add/remove)
    - ``perform_update``: self-only (level + notes)
    - ``rate`` action: self/TL/HR (level only, TL-scoped)
    """
    queryset = UserSkill.objects.select_related(
        'user', 'skill', 'skill__category', 'last_updated_by'
    ).all()
    plugin_name = 'skills'
    permission_classes = [permissions.IsAuthenticated]
    permission_action_map = {
        'create': 'view',
        'update': 'view',
        'partial_update': 'view',
        'destroy': 'view',
        'rate': 'view',
    }

    def get_serializer_class(self):
        if self.action == 'create':
            return UserSkillCreateSerializer
        if self.action in ('update', 'partial_update', 'rate'):
            return UserSkillUpdateSerializer
        return UserSkillSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        visible = visible_user_ids(user)
        qs = qs.filter(user_id__in=visible)

        params = self.request.query_params
        skill_id = params.get('skill_id')
        category = params.get('category')
        min_level = params.get('min_level')
        max_level = params.get('max_level')
        if skill_id:
            qs = qs.filter(skill_id=skill_id)
        if category:
            qs = qs.filter(skill__category__code=category)
        if min_level:
            qs = qs.filter(level__gte=int(min_level))
        if max_level:
            qs = qs.filter(level__lte=int(max_level))
        return qs

    def perform_create(self, serializer):
        """Self-only creation: ``user`` is always ``request.user``.

        The ``user`` field is read-only in ``UserSkillCreateSerializer``,
        so any client-supplied value is ignored. Cross-user admin creation
        is not supported via this endpoint (F1 Option A). Duplicate
        (user, skill) POSTs return a clean 400 (S2 invariant preserved).
        """
        from rest_framework.exceptions import ValidationError
        user = self.request.user
        skill = serializer.validated_data['skill']
        if UserSkill.objects.filter(user=user, skill=skill).exists():
            raise ValidationError("You already have this skill rated.")
        serializer.save(user=user, last_updated_by=user)

    def perform_update(self, serializer):
        """Self-only: employees update their own level + notes.

        TLs must use the ``rate`` action (level only). HR/admin can update
        via this action too (broad management access).
        """
        user = self.request.user
        instance = serializer.instance
        is_self = instance.user_id == user.id
        is_admin = user.is_superuser or user.is_staff
        profile = getattr(user, 'profile', None)
        is_hr = profile is not None and profile.is_hr
        if not (is_self or is_admin or is_hr):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "You can only edit your own skill ratings. "
                "Team leaders must use the rate action."
            )
        serializer.save(last_updated_by=user)

    def perform_destroy(self, instance):
        user = self.request.user
        if not can_delete_user_skill(user, instance):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "You can only remove skills from your own profile. "
                "Team leaders can re-rate but not add/remove skills."
            )
        instance.delete()

    @action(detail=True, methods=['post'])
    def rate(self, request, pk=None):
        """TL/HR/Admin re-rate a team member's skill level.

        Body: ``{"level": 1-5, "notes": "optional"}``
        Only ``level`` and ``notes`` are updated; ``user`` and ``skill``
        are read-only in ``UserSkillUpdateSerializer``.
        """
        instance = self.get_object()
        if not can_edit_user_skill(request.user, instance):
            return Response(
                {'error': 'You can only rate skills for your team members.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(last_updated_by=request.user)
        return Response(UserSkillSerializer(instance).data)


# ============================================================================
# MATRIX: TL/HR team view
# ============================================================================

class SkillMatrixViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
    """TL/HR team matrix view with paginated rows and coverage stats."""
    queryset = UserSkill.objects.all()
    plugin_name = 'skills'
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MatrixPagination

    @action(detail=False, methods=['get'])
    def matrix(self, request):
        """Paginated matrix: one row per user with their skills embedded."""
        visible = visible_user_ids(request.user)
        # The frontend joins multi-skill filters as ``skill_id=1,2,3`` (one
        # query param). Split on comma so __in receives a real int list;
        # ``getlist`` alone returns ["1,2,3"] which matches nothing (S1).
        raw_skill_ids = request.query_params.get('skill_id', '')
        skill_id_list = [
            s.strip() for s in raw_skill_ids.split(',') if s.strip()
        ] if raw_skill_ids else []
        filters = {
            'skill_id': skill_id_list,
            'category': request.query_params.get('category'),
            'min_level': request.query_params.get('min_level'),
            'max_level': request.query_params.get('max_level'),
            'search': request.query_params.get('search'),
        }
        # Clean up empty values
        filters = {k: v for k, v in filters.items() if v}
        category_code = filters.get('category')

        users_qs = build_matrix_queryset(visible, filters)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(users_qs, request)
        if page is not None:
            rows = build_matrix_rows(page, category_code)
            serializer = TeamMatrixRowSerializer(rows, many=True)
            return paginator.get_paginated_response(serializer.data)
        rows = build_matrix_rows(list(users_qs), category_code)
        serializer = TeamMatrixRowSerializer(rows, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def coverage(self, request):
        """Per-skill team coverage stats.

        Optional ``?top_n=N`` truncates the payload to the first N skills
        by display order (S3 payload limit). Non-integer → 400.
        """
        visible = visible_user_ids(request.user)
        category_code = request.query_params.get('category')
        top_n = _parse_top_n(request)
        stats = build_coverage_stats(visible, category_code, top_n=top_n)
        serializer = SkillCoverageSerializer(stats, many=True)
        return Response(serializer.data)


# ============================================================================
# GAP REPORT: TL/HR skill gap analysis
# ============================================================================

class SkillGapReportViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
    """TL/HR skill gap report."""
    queryset = UserSkill.objects.all()
    plugin_name = 'skills'
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'])
    def gaps(self, request):
        """Skills where team coverage is below target or threshold.

        Optional ``?top_n=N`` returns only the N worst gaps (lowest
        coverage_pct). Non-integer → 400 (S3 payload limit).
        """
        visible = visible_user_ids(request.user)
        category_code = request.query_params.get('category')
        threshold_str = request.query_params.get('threshold')
        threshold = None
        if threshold_str:
            try:
                threshold = float(threshold_str)
            except ValueError:
                from rest_framework.exceptions import ValidationError
                raise ValidationError("threshold must be a number between 0 and 100.")
        top_n = _parse_top_n(request)
        gaps = build_gap_report(visible, category_code, threshold, top_n=top_n)
        serializer = SkillCoverageSerializer(gaps, many=True)
        return Response(serializer.data)


# ============================================================================
# EXPORT: CSV download
# ============================================================================

class SkillExportViewSet(PluginPermissionMixin, viewsets.GenericViewSet):
    """TL/HR CSV export of team skill matrix."""
    queryset = UserSkill.objects.all()
    plugin_name = 'skills'
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'export'

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Stream the team skill matrix as a CSV download."""
        visible = visible_user_ids(request.user)
        category_code = request.query_params.get('category')
        search = request.query_params.get('search')
        return export_matrix_csv(visible, category_code, search=search)


# ============================================================================
# HISTORY: audit log
# ============================================================================

class SkillRatingHistoryViewSet(PluginPermissionMixin, viewsets.ReadOnlyModelViewSet):
    """Audit history for skill rating changes (self/TL/HR scoped)."""
    queryset = SkillRatingHistory.objects.select_related('user', 'skill', 'changed_by').all()
    serializer_class = SkillRatingHistorySerializer
    plugin_name = 'skills'
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        visible = visible_user_ids(self.request.user)
        qs = qs.filter(user_id__in=visible)

        params = self.request.query_params
        user_id = params.get('user_id')
        skill_id = params.get('skill_id')
        if user_id:
            qs = qs.filter(user_id=user_id)
        if skill_id:
            qs = qs.filter(skill_id=skill_id)
        date_from = params.get('date_from')
        date_to = params.get('date_to')
        if date_from:
            try:
                import datetime
                datetime.date.fromisoformat(date_from)
                qs = qs.filter(changed_at__date__gte=date_from)
            except (ValueError, TypeError):
                pass  # malformed date — silently ignore
        if date_to:
            try:
                import datetime
                datetime.date.fromisoformat(date_to)
                qs = qs.filter(changed_at__date__lte=date_to)
            except (ValueError, TypeError):
                pass
        return qs
