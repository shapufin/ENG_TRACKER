from rest_framework import viewsets, permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Notification, NotificationPreference, PushSubscription
from .vapid_utils import get_public_key


OWN_EVENT_TYPES = {
    'own_leave_submitted', 'own_leave_updated', 'own_leave_edited',
    'own_overtime_submitted', 'own_overtime_updated',
    'own_standby_submitted', 'own_standby_updated', 'team_period_finalized',
}
TEAM_EVENT_TYPES = {'team_action_required', 'team_leave_deleted'}


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source='get_event_type_display', read_only=True)
    available = serializers.SerializerMethodField()

    class Meta:
        model = NotificationPreference
        fields = ['event_type', 'label', 'in_app_enabled', 'push_enabled', 'available', 'updated_at']
        read_only_fields = ['label', 'available', 'updated_at']

    def get_available(self, obj):
        return self.context.get('available_event_types', set()).__contains__(obj.event_type)


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ['id', 'endpoint', 'p256dh_key', 'auth_key', 'is_active', 'created_at']
        read_only_fields = ['id', 'is_active', 'created_at']


class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

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

    def _available_event_types(self, user):
        profile = getattr(user, 'profile', None)
        is_team_recipient = bool(
            user.is_staff or user.is_superuser or
            getattr(profile, 'is_hr', False) or
            getattr(profile, 'is_team_leader', False) or
            (hasattr(user, 'led_teams') and user.led_teams.exists())
        )
        available = set(OWN_EVENT_TYPES)
        if is_team_recipient:
            available.update(TEAM_EVENT_TYPES)
        return available

    @action(detail=False, methods=['get', 'patch'])
    def preferences(self, request):
        """Read or update the current user's notification preferences."""
        available = self._available_event_types(request.user)

        if request.method == 'PATCH':
            event_type = request.data.get('event_type')
            if event_type not in available:
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
        rows = []
        for event_type, _label in NotificationPreference.EVENT_TYPES:
            if event_type in available:
                rows.append(existing.get(event_type) or NotificationPreference(
                    user=request.user,
                    event_type=event_type,
                ))
        serializer = NotificationPreferenceSerializer(
            rows,
            many=True,
            context={'available_event_types': available},
        )
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='vapid-public-key')
    def vapid_public_key(self, request):
        """Return the VAPID public key for browser push subscription."""
        return Response({'public_key': get_public_key()})

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
