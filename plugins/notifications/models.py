from django.db import models
from django.conf import settings


class Notification(models.Model):
    TYPES = (
        ('info', 'Information'),
        ('success', 'Success'),
        ('warning', 'Warning'),
        ('error', 'Error'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=TYPES, default='info')
    is_read = models.BooleanField(default=False)
    link = models.CharField(max_length=255, blank=True, null=True)
    dedupe_key = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'dedupe_key'],
                condition=models.Q(dedupe_key__isnull=False),
                name='notifications_user_dedupe_unique',
            ),
        ]

    def __str__(self):
        return f"{self.title} for {self.user.email}"


class PushSubscription(models.Model):
    """Browser push subscription endpoint for a user.

    One user can have multiple subscriptions (phone, desktop, tablet).
    When a Notification is created, push is sent to all active subscriptions.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='push_subscriptions'
    )
    endpoint = models.URLField(max_length=500)
    p256dh_key = models.CharField(max_length=200)
    auth_key = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'notifications'
        unique_together = ('user', 'endpoint')
        ordering = ['-created_at']

    def __str__(self):
        return f"Push subscription for {self.user.email}"


class IdempotencyRecord(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.CharField(max_length=100)
    endpoint = models.CharField(max_length=255)
    status_code = models.PositiveSmallIntegerField()
    response_body = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'notifications'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'key', 'endpoint'],
                name='notifications_idempotency_unique',
            )
        ]


class OfflineSubmissionIdempotency(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    endpoint = models.CharField(max_length=40)
    key = models.CharField(max_length=100)
    request_hash = models.CharField(max_length=64)
    status_code = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'notifications'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'endpoint', 'key'],
                name='notifications_offline_idempotency_unique',
            )
        ]
        indexes = [models.Index(fields=['created_at'])]


class NotificationPreference(models.Model):
    """Per-user delivery preferences for a notification event category.

    Missing rows intentionally mean enabled, preserving current behavior for
    existing users and making new event categories opt-in by default.
    """

    EVENT_TYPES = (
        ('own_leave_submitted', 'My leave submitted'),
        ('own_leave_updated', 'My leave approved or rejected'),
        ('own_leave_edited', 'My leave edited'),
        ('own_overtime_submitted', 'My overtime submitted'),
        ('own_overtime_updated', 'My overtime approved or rejected'),
        ('own_standby_submitted', 'My standby submitted'),
        ('own_standby_updated', 'My standby approved or rejected'),
        ('team_period_finalized', 'My team period finalized'),
        ('team_action_required', 'Team submissions needing action'),
        ('team_leave_deleted', 'Team leave requests deleted'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_preferences'
    )
    event_type = models.CharField(max_length=40, choices=EVENT_TYPES)
    in_app_enabled = models.BooleanField(default=True)
    push_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'notifications'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'event_type'],
                name='notifications_user_event_preference_unique',
            )
        ]
        ordering = ['event_type']

    def __str__(self):
        return f"{self.user.email}: {self.event_type}"
