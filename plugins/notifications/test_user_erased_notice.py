"""Every active superuser hears about an erase, the actor included (item 83)."""
from django.contrib.auth.models import User
from django.test import TestCase

from apps.users.services.user_deletion import user_erased
from plugins.notifications import account_signals
from plugins.notifications.models import Notification


class UserErasedNoticeTests(TestCase):
    def setUp(self):
        account_signals.connect()
        self.root = User.objects.create_user(username='uen-root', password='x', is_superuser=True)
        self.other = User.objects.create_user(username='uen-other', password='x', is_superuser=True)
        self.staff = User.objects.create_user(username='uen-staff', password='x', is_staff=True)
        self.gone = User.objects.create_user(
            username='uen-gone', password='x', is_superuser=True, is_active=False)

    def test_active_superusers_are_told_who_erased_whom_and_why(self):
        user_erased.send(
            sender=User, user_id=999, username='left-employee', actor_id=self.root.id,
            reason='Duplicate account', rows=4,
        )
        notices = Notification.objects.filter(dedupe_key__startswith='user-erased:')
        self.assertEqual(
            set(notices.values_list('user__username', flat=True)), {'uen-root', 'uen-other'})
        message = notices.first().message
        self.assertIn('uen-root', message)
        self.assertIn('left-employee', message)
        self.assertIn('Duplicate account', message)

    def test_the_notice_cannot_be_switched_off(self):
        from plugins.notifications.types.base import REGISTRY

        self.assertFalse(REGISTRY['user_erased'].user_configurable)
