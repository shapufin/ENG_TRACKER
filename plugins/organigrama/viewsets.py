"""
ViewSets for the Organigrama plugin.

GET /api/plugins/organigrama/tree/      — live scoped company org tree
GET /api/plugins/organigrama/subtree/   — lazy-load subtree

GET/POST /api/plugins/organigrama/charts/               — admin chart directory
GET/PATCH/DELETE /api/plugins/organigrama/charts/<id>/
GET/PUT  /api/plugins/organigrama/charts/<id>/draft/
POST     /api/plugins/organigrama/charts/<id>/publish/
POST     /api/plugins/organigrama/charts/<id>/unpublish/
GET      /api/plugins/organigrama/charts/<id>/preview/  — admin draft preview
GET      /api/plugins/organigrama/charts/<id>/revisions/
GET      /api/plugins/organigrama/charts/<id>/published/ — public payload
GET      /api/plugins/organigrama/charts/visible/        — public directory
GET      /api/plugins/organigrama/charts/audiences/roles/
GET      /api/plugins/organigrama/charts/audiences/groups/
"""
import logging

from django.db.models import Count
from django.contrib.auth.models import User
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters

from apps.permissions.models import Group, Role
from apps.users.models.core import Tech, UserProfile
from core.mixins.cache import CacheInvalidationMixin
from core.mixins.permissions import PluginPermissionMixin, SuperuserPermissionMixin
from core.pagination import StandardResultsPagination

from .models import OrgChart, ROLE_CODES
from .serializers import (
    OrgChartSerializer,
    OrgChartWriteSerializer,
    OrgChartDraftSaveSerializer,
    OrgChartDraftReadSerializer,
    OrgChartRevisionSerializer,
    PublishedOrgChartSerializer,
    RoleMiniSerializer,
    GroupMiniSerializer,
    OrgChartPublishSerializer,
)
from .services.audience_service import user_can_view_chart, list_visible_chart_ids
from .services.draft_service import (
    get_draft,
    save_draft,
    GraphValidationError,
    DraftConflictError,
)
from .services.publish_service import (
    publish_chart,
    unpublish_chart,
    PublishValidationError,
)
from .services.tree_builder import build_scoped_tree, _person_node, role_badge

logger = logging.getLogger(__name__)

VALID_NODE_TYPES = {"person", "tech"}


def _log_chart_action(user, action, chart, description=""):
    """Record an auditable chart mutation without logging the full payload."""
    try:
        from plugins.audit_log.signals import log_action
        log_action(
            user,
            action,
            description=description,
            obj=chart,
            new_values={
                "chart_id": str(chart.pk),
                "slug": chart.slug,
                "status": chart.status,
                "audience_mode": chart.audience_mode,
            },
        )
    except Exception:
        logger.exception("Failed to write audit log for %s", action)


class IsStaffOrSuperuser(BasePermission):
    """Admin directory/builder access is restricted to staff and superusers."""

    def has_permission(self, request, view):
        return bool(request.user and (request.user.is_staff or request.user.is_superuser))


class OrganigramaViewSet(PluginPermissionMixin, APIView):
    """Read-only live org tree endpoint (Phase A/B — unchanged)."""

    plugin_name = "organigrama"
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination

    @property
    def paginator(self):
        if not hasattr(self, "_paginator"):
            self._paginator = self.pagination_class()
        return self._paginator

    def check_permissions(self, request):
        APIView.check_permissions(self, request)
        if request.user.is_superuser or request.user.is_staff:
            return
        try:
            from apps.plugins.models import PluginPermission
            perm = PluginPermission.objects.get(
                plugin_name=self.plugin_name, action="view"
            )
            if not perm.has_access(request.user):
                raise PermissionDenied("You do not have access to this plugin.")
        except PluginPermission.DoesNotExist:
            pass

    def get(self, request):
        path = request.path.rstrip("/")
        if path.endswith("/subtree"):
            return self._subtree(request)
        return self._tree(request)

    def _tree(self, request):
        result = build_scoped_tree(request.user)
        return Response(result)

    def _visible_user_ids(self, request):
        user = request.user
        if user.is_superuser or user.is_staff:
            return None
        profile = getattr(user, "profile", None)
        if profile is None:
            return {user.id}
        if profile.is_hr:
            return None
        if profile.is_italian_tl or profile.is_albanian_tl:
            ids = profile.get_team_member_ids()
            ids.add(user.id)
            return ids
        ids = {user.id}
        al_tl = profile.albanian_tl
        if al_tl and hasattr(al_tl, "profile"):
            ids.add(al_tl.id)
            it_tl = al_tl.profile.italian_tl
            if it_tl:
                ids.add(it_tl.id)
        it_tl = profile.italian_tl
        if it_tl:
            ids.add(it_tl.id)
        return ids

    def _subtree(self, request):
        node_id = request.query_params.get("node_id")
        node_type = request.query_params.get("node_type", "person")
        if not node_id:
            return Response({"detail": "node_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            node_id_int = int(node_id)
        except (TypeError, ValueError):
            return Response({"detail": "node_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        if node_type not in VALID_NODE_TYPES:
            return Response({"detail": f"node_type must be one of {sorted(VALID_NODE_TYPES)}."}, status=status.HTTP_400_BAD_REQUEST)
        visible_ids = self._visible_user_ids(request)
        if node_type == "person":
            children = self._person_children(node_id_int, visible_ids)
        else:
            children = self._tech_children(node_id_int, visible_ids)
        page = self.paginator.paginate_queryset(children, request, view=self)
        return self.paginator.get_paginated_response(page)

    def _person_children(self, node_id, visible_ids):
        try:
            node_user = User.objects.select_related("profile").get(pk=node_id, is_active=True)
        except User.DoesNotExist:
            raise NotFound("Node not found.")
        profile = getattr(node_user, "profile", None)
        # Delegate TL classification to the shared ``role_badge`` helper so
        # the Italian/Albanian detection logic cannot drift from the tree
        # builder. A profile without a UserProfile is treated as a leaf.
        badge = role_badge(profile) if profile is not None else "employee"
        if visible_ids is not None and node_user.id not in visible_ids:
            raise PermissionDenied("You do not have access to this node.")
        children = []
        if badge == "italian_tl":
            albanian_tls = list(
                User.objects.filter(profile__italian_tl=node_user, is_active=True)
                .select_related("profile", "profile__italian_tl")
                .distinct()
                .order_by("username")
            )
            for al in albanian_tls:
                if visible_ids is not None and al.id not in visible_ids:
                    continue
                children.append(_person_node(al, al.profile))
        elif badge == "albanian_tl":
            managed_ids = profile.get_team_member_ids()
            employees = list(
                UserProfile.objects.filter(user_id__in=managed_ids, user__is_active=True)
                .exclude(user=node_user)
                .select_related("user", "albanian_tl", "italian_tl")
                .distinct()
                .order_by("user__username")
            )
            for emp_profile in employees:
                if visible_ids is not None and emp_profile.user_id not in visible_ids:
                    continue
                children.append(_person_node(emp_profile.user, emp_profile))
        return children

    def _tech_children(self, node_id, visible_ids):
        try:
            tech = Tech.objects.get(pk=node_id, is_active=True)
        except Tech.DoesNotExist:
            raise NotFound("Node not found.")
        profiles = list(
            UserProfile.objects.filter(techs=tech, user__is_active=True)
            .select_related("user", "albanian_tl", "italian_tl")
            .order_by("user__username")
        )
        member_user_ids = {profile.user_id for profile in profiles}
        if visible_ids is not None and not (member_user_ids & visible_ids):
            raise PermissionDenied("You do not have access to this node.")
        return [
            _person_node(profile.user, profile)
            for profile in profiles
            if visible_ids is None or profile.user_id in visible_ids
        ]


class OrgChartViewSet(
    CacheInvalidationMixin,
    SuperuserPermissionMixin,
    PluginPermissionMixin,
    viewsets.ModelViewSet,
):
    """
    Admin API for custom charts plus public published-chart endpoints.

    Write/admin actions require staff/superuser plus the ``organigrama.manage``
    plugin permission. The ``published`` and ``visible_charts`` actions are
    public to authenticated users and enforce the chart's audience.
    """

    plugin_name = "organigrama"
    permission_classes = [IsAuthenticated, IsStaffOrSuperuser]
    permission_action_map = {
        "list": "manage",
        "create": "manage",
        "retrieve": "manage",
        "update": "manage",
        "partial_update": "manage",
        "destroy": "manage",
        "draft": "manage",
        "save_draft": "manage",
        "validate": "manage",
        "roles": "manage",
        "groups": "manage",
        "publish": "manage",
        "unpublish": "manage",
        "preview": "manage",
        "revisions": "manage",
        "published": "view",
        "visible_charts": "view",
    }
    queryset = OrgChart.objects.annotate(node_count=Count("nodes")).order_by("-updated_at")
    serializer_class = OrgChartSerializer
    pagination_class = StandardResultsPagination
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["name", "slug", "description"]
    filterset_fields = ["status", "source_mode", "audience_mode"]

    def get_permissions(self):
        # Public viewer actions are open to any authenticated user; the
        # audience is enforced in the action body. All other actions require
        # staff/superuser, with the usual superuser short-circuit.
        if self.action in ("published", "visible_charts"):
            return [IsAuthenticated()]
        if self.request.user.is_superuser:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsStaffOrSuperuser()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return OrgChartWriteSerializer
        if self.action == "revisions":
            return OrgChartRevisionSerializer
        if self.action == "visible_charts":
            return PublishedOrgChartSerializer
        if self.action == "published":
            return None  # raw payload below
        return OrgChartSerializer

    def get_queryset(self):
        return (
            OrgChart.objects.annotate(node_count=Count("nodes"))
            .order_by("-updated_at")
            .prefetch_related("audience_roles", "audience_groups", "published_revision")
        )

    def perform_create(self, serializer):
        chart = serializer.save()
        _log_chart_action(self.request.user, "organigrama:chart_created", chart)

    def perform_update(self, serializer):
        chart = serializer.save()
        _log_chart_action(self.request.user, "organigrama:chart_updated", chart)

    def perform_destroy(self, instance):
        _log_chart_action(self.request.user, "organigrama:chart_deleted", instance)
        super().perform_destroy(instance)

    @action(detail=False, methods=["get"], url_path="audiences/roles")
    def roles(self, request):
        qs = Role.objects.filter(code__in=ROLE_CODES).order_by("code")
        serializer = RoleMiniSerializer(qs, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="audiences/groups")
    def groups(self, request):
        qs = Group.objects.order_by("name")
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(code__icontains=search)
            qs = qs.distinct().order_by("name")
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = GroupMiniSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)
        serializer = GroupMiniSerializer(qs, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=["get", "put"], url_path="draft")
    def draft(self, request, pk=None):
        chart = self.get_object()
        if request.method == "GET":
            payload = get_draft(chart)
            return Response(OrgChartDraftReadSerializer(payload).data)

        serializer = OrgChartDraftSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            save_draft(
                chart,
                serializer.validated_data["nodes"],
                serializer.validated_data["edges"],
                expected_revision_number=serializer.validated_data["revision_number"],
                updated_by=request.user,
            )
        except GraphValidationError as exc:
            result = exc.result
            return Response(
                {
                    "detail": "Graph validation failed.",
                    "errors": [
                        {
                            "node_uuid": e.node_uuid,
                            "edge_uuid": e.edge_uuid,
                            "field": e.field,
                            "message": e.message,
                            "type": e.type,
                        }
                        for e in result.errors
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except DraftConflictError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        _log_chart_action(request.user, "organigrama:chart_draft_saved", chart)
        return Response(OrgChartDraftReadSerializer(get_draft(chart)).data)

    @action(detail=True, methods=["post"], url_path="validate")
    def validate(self, request, pk=None):
        self.get_object()  # ensure chart exists and is managed by this user
        serializer = OrgChartDraftSaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from .services.graph_validation import validate_graph
        result = validate_graph(serializer.validated_data["nodes"], serializer.validated_data["edges"])
        return Response(
            {
                "is_valid": result.is_valid,
                "errors": [
                    {
                        "node_uuid": e.node_uuid,
                        "edge_uuid": e.edge_uuid,
                        "field": e.field,
                        "message": e.message,
                        "type": e.type,
                    }
                    for e in result.errors
                ],
            }
        )

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        chart = self.get_object()
        # Serializer-first validation for the optional change_summary field.
        # The ViewSet remains responsible for request orchestration and
        # mapping publish-service errors to structured 400 responses.
        publish_serializer = OrgChartPublishSerializer(data=request.data)
        publish_serializer.is_valid(raise_exception=True)
        change_summary = publish_serializer.validated_data.get("change_summary", "")
        try:
            revision = publish_chart(chart, published_by=request.user, change_summary=change_summary)
        except PublishValidationError as exc:
            return Response(
                {
                    "detail": "Chart cannot be published because the draft is invalid.",
                    "errors": [
                        {
                            "node_uuid": e.node_uuid,
                            "edge_uuid": e.edge_uuid,
                            "field": e.field,
                            "message": e.message,
                            "type": e.type,
                        }
                        for e in exc.result.errors
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.invalidate_related_cache()
        _log_chart_action(request.user, "organigrama:chart_published", chart)
        return Response(OrgChartRevisionSerializer(revision).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, pk=None):
        chart = self.get_object()
        unpublish_chart(chart)
        self.invalidate_related_cache()
        _log_chart_action(request.user, "organigrama:chart_unpublished", chart)
        return Response({"detail": "Chart unpublished."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        chart = self.get_object()
        if not user_can_view_chart(request.user, chart, as_staff=True):
            raise PermissionDenied("You do not have access to preview this chart.")
        payload = get_draft(chart)
        return Response(OrgChartDraftReadSerializer(payload).data)

    @action(detail=True, methods=["get"], url_path="revisions")
    def revisions(self, request, pk=None):
        chart = self.get_object()
        qs = chart.revisions.order_by("-version")
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = OrgChartRevisionSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)
        serializer = OrgChartRevisionSerializer(qs, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="published")
    def published(self, request, pk=None):
        chart = self.get_object()
        if chart.status != "published" or chart.published_revision is None:
            raise NotFound("This chart has no published revision.")
        if not user_can_view_chart(request.user, chart):
            raise PermissionDenied("You do not have access to this chart.")
        return Response(chart.published_revision.payload)

    @action(detail=False, methods=["get"], url_path="visible")
    def visible_charts(self, request):
        visible_ids = list_visible_chart_ids(request.user)
        qs = (
            OrgChart.objects.filter(id__in=visible_ids)
            .annotate(node_count=Count("nodes"))
            .order_by("-is_featured", "-updated_at")
            .prefetch_related("published_revision")
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = PublishedOrgChartSerializer(page, many=True, context=self.get_serializer_context())
            return self.get_paginated_response(serializer.data)
        serializer = PublishedOrgChartSerializer(qs, many=True, context=self.get_serializer_context())
        return Response(serializer.data)
