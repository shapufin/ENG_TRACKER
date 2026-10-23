from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from rest_framework import viewsets, permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from .models import (
    Notification,
    NotificationEventTypeConfig,
    NotificationPreference,
    PushSubscription,
)
from core.mixins.permissions import PluginEnabledMixin, is_hbpr_only
from .types.base import REGISTRY, get_all_types
from .vapid_utils import get_public_key


OWN_EVENT_TYPES = {
    'own_leave_submitted', 'own_leave_updated', 'own_leave_edited',
    'own_overtime_submitted', 'own_overtime_updated',
    'own_standby_submitted', 'own_standby_updated', 'team_period_finalized',
}
TEAM_EVENT_TYPES = {'team_action_required', 'team_leave_deleted'}


def _types_in_category(category):
    """Core types of a category plus any a plugin registered under it."""
    core = {'own': OWN_EVENT_TYPES, 'team': TEAM_EVENT_TYPES}.get(category, set())
    return set(core) | {
        event_type for event_type, cls in REGISTRY.items() if cls.category == category
    }


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source='get_event_type_display', read_only=True)
    available = serializers.SerializerMethodField()

    class Meta:
        model = NotificationPreference
        fields = [
            'event_type', 'label', 'in_app_enabled', 'push_enabled',
            'available', 'updated_at',
        ]
        read_only_fields = ['label', 'available', 'updated_at']

    def get_available(self, obj):
        return self.context.get('available_event_types', set()).__contains__(obj.event_type)


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ['id', 'endpoint', 'p256dh_key', 'auth_key', 'is_active', 'created_at']
        read_only_fields = ['id', 'is_active', 'created_at']


class NotificationPagination(PageNumberPagination):
    """Newest 100 by default; the client frontend reads ``results`` (normalizeList)."""
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 200


class NotificationViewSet(PluginEnabledMixin, viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = NotificationPagination

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({'status': 'marked as read'})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({'status': 'all marked as read'})

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'count': count})

    def _available_preference_pairs(self, user):
        """``(key, label, push_default)`` rows the user may configure.

        A *key* is a preference key: usually the event type itself, but several
        event types may share one group key (the HBPR governance groups), so
        Settings shows one row per group rather than one per event.
        """
        # Mirrors delivery, not role breadth: team types reach team leaders only
        # (signals._team_recipients) and oversight types reach assigned HBPRs only.
        profile = getattr(user, 'profile', None)
        is_oversight_recipient = bool(getattr(profile, 'is_hbpr', False))
        is_team_recipient = bool(getattr(profile, 'is_team_leader', False))
        event_types = _types_in_category('own')
        if is_team_recipient:
            event_types |= _types_in_category('team')
        if is_oversight_recipient:
            event_types |= _types_in_category('oversight')
        if is_hbpr_only(user):
            # An HBPR-only user has no leave/overtime/standby of their own
            # (those surfaces are denied), so the employee categories are
            # meaningless — only the governance groups apply.
            event_types = _types_in_category('oversight')

        core_labels = dict(NotificationPreference.EVENT_TYPES)
        labels: dict[str, str] = {}
        push_defaults: dict[str, bool] = {}
        # Admin kill-switch: globally disabled types vanish from the
        # preferences list (and PATCH) so user frontends stop showing them.
        disabled = NotificationEventTypeConfig.disabled_event_types()
        for event_type in event_types:
            if event_type in disabled:
                continue
            registered = REGISTRY.get(event_type)
            if registered is not None and not registered.user_configurable:
                # Always-on types are hidden from Settings and cannot be
                # disabled — a preference row can never be created for them.
                continue
            if registered is None:
                key = event_type
                label = core_labels.get(event_type, event_type)
                push_default = True
            else:
                key = registered.preference_key
                label = registered.preference_group_label or registered.label or event_type
                push_default = registered.push_by_default
            labels.setdefault(key, label)
            # A group is push-off by default if ANY member type is
            # (conservative for HR matters).
            push_defaults[key] = push_defaults.get(key, True) and push_default
        return [
            (key, labels[key], push_defaults.get(key, True)) for key in sorted(labels)
        ]

    def _available_event_types(self, user):
        return {key for key, _label, _push in self._available_preference_pairs(user)}

    @action(detail=False, methods=['get', 'patch'])
    def preferences(self, request):
        """Read or update the current user's notification preferences."""
        pairs = self._available_preference_pairs(request.user)
        available = {key for key, _label, _push in pairs}

        if request.method == 'PATCH':
            event_type = request.data.get('event_type')
            if not isinstance(event_type, str) or event_type not in available:
                return Response(
                    {'error': 'This notification category is not available for your role.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            preference, _ = NotificationPreference.objects.get_or_create(
                user=request.user,
                event_type=event_type,
            )
            for field in ('in_app_enabled', 'push_enabled'):
                if field in request.data:
                    value = request.data[field]
                    if not isinstance(value, bool):
                        return Response(
                            {'error': f'{field} must be a boolean.'},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    setattr(preference, field, value)
            preference.save()

        existing = {
            item.event_type: item
            for item in NotificationPreference.objects.filter(
                user=request.user,
                event_type__in=available,
            )
        }
        rows = [
            existing.get(key) or NotificationPreference(
                user=request.user,
                event_type=key,
                push_enabled=push_default,
            )
            for key, _label, push_default in pairs
        ]
        serializer = NotificationPreferenceSerializer(
            rows,
            many=True,
            context={'available_event_types': available},
        )
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='vapid-public-key')
    def vapid_public_key(self, request):
        """Return the VAPID public key for browser push subscription."""
        try:
            return Response({'public_key': get_public_key()})
        except ImproperlyConfigured:
            return Response(
                {'detail': 'Web Push is not configured on this server.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    @action(detail=False, methods=['post'])
    def subscribe(self, request):
        """Register a browser push subscription for the current user."""
        endpoint = request.data.get('endpoint')
        p256dh_key = request.data.get('keys', {}).get('p256dh')
        auth_key = request.data.get('keys', {}).get('auth')

        if not endpoint or not p256dh_key or not auth_key:
            return Response(
                {'error': 'endpoint, keys.p256dh, and keys.auth are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Upsert — if this endpoint already exists for this user, update keys
        subscription, created = PushSubscription.objects.update_or_create(
            user=request.user,
            endpoint=endpoint,
            defaults={
                'p256dh_key': p256dh_key,
                'auth_key': auth_key,
                'is_active': True,
            }
        )

        return Response(
            PushSubscriptionSerializer(subscription).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @action(detail=False, methods=['post'])
    def unsubscribe(self, request):
        """Deactivate a push subscription (soft delete)."""
        endpoint = request.data.get('endpoint')
        if not endpoint:
            return Response(
                {'error': 'endpoint is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        updated = PushSubscription.objects.filter(
            user=request.user,
            endpoint=endpoint
        ).update(is_active=False)

        return Response({'deactivated': updated})

    @action(detail=False, methods=['get'])
    def subscriptions(self, request):
        """List the current user's push subscriptions."""
        subs = PushSubscription.objects.filter(user=request.user)
        return Response(PushSubscriptionSerializer(subs, many=True).data)


def _members_by_key():
    """``preference_key -> [type classes]``: a bare type, or a group of several."""
    groups: dict[str, list] = {}
    for cls in sorted(get_all_types().values(), key=lambda c: c.event_type):
        groups.setdefault(cls.preference_key, []).append(cls)
    return groups


def _event_type_catalogue():
    """One row per preference key, the same granularity Settings shows.

    ``audience`` is the registered ``category`` and mirrors the recipient
    rules in ``NotificationViewSet._available_preference_pairs``: 'own' for
    everyone, 'team' for team leaders, 'oversight' for assigned HBPRs.
    ``enabled`` is True only when every member event type is on;
    ``partially_enabled`` marks a mixed group (legacy rows from Django admin).
    """
    disabled = NotificationEventTypeConfig.disabled_event_types()
    rows = []
    for key, members in sorted(_members_by_key().items()):
        event_types = [cls.event_type for cls in members]
        enabled_count = sum(1 for event_type in event_types if event_type not in disabled)
        if len(members) == 1:
            description = members[0].description
        else:
            description = ', '.join(dict.fromkeys(cls.label for cls in members))
        rows.append({
            'key': key,
            'label': next(
                (cls.preference_group_label for cls in members if cls.preference_group_label),
                '',
            ) or members[0].label or key,
            'description': description,
            'audience': members[0].category,
            'user_configurable': any(cls.user_configurable for cls in members),
            'event_types': event_types,
            'enabled': enabled_count == len(event_types),
            'partially_enabled': 0 < enabled_count < len(event_types),
        })
    return rows


class NotificationEventTypeConfigViewSet(PluginEnabledMixin, viewsets.ViewSet):
    """Staff kill-switch per notification type (edits NotificationEventTypeConfig)."""

    permission_classes = [permissions.IsAdminUser]

    def list(self, request):
        return Response(_event_type_catalogue())

    def partial_update(self, request, pk=None):
        members = _members_by_key().get(pk)
        if not members:
            raise NotFound('Unknown notification type.')
        enabled = request.data.get('enabled')
        if not isinstance(enabled, bool):
            return Response(
                {'error': 'enabled must be a boolean.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Group keys never get rows of their own: every member type is written.
        with transaction.atomic():
            for cls in members:
                NotificationEventTypeConfig.objects.update_or_create(
                    event_type=cls.event_type,
                    defaults={'is_enabled': enabled},
                )
        row = next(row for row in _event_type_catalogue() if row['key'] == pk)
        return Response(row)
