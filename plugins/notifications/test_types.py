"""Unit tests for the NotificationType class registry."""
import datetime
from unittest.mock import patch

from django.test import TestCase
from django.contrib.auth import get_user_model

from plugins.notifications.models import Notification, NotificationPreference
from plugins.notifications.types.base import (
    get_all_types,
    get_event_type_choices,
)
from plugins.notifications.types.own import (
    LeaveEditedNotification,
    LeaveSubmittedNotification,
    LeaveUpdatedNotification,
    OvertimeSubmittedNotification,
    OvertimeUpdatedNotification,
    StandbySubmittedNotification,
    StandbyUpdatedNotification,
)
from plugins.notifications.types.team import (
    TeamActionRequiredNotification,
    TeamLeaveDeletedNotification,
)
from plugins.notifications.types.period_finalized import (
    PeriodFinalizedNotification,
    _next_period,
)

User = get_user_model()


# ============================================================================
# Registry consistency tests
# ============================================================================

class RegistryConsistencyTest(TestCase):
    def test_registry_contains_all_event_types(self):
        """Registry keys must match NotificationPreference.EVENT_TYPES exactly."""
        registry_keys = set(get_all_types().keys())
        preference_keys = {et for et, _label in NotificationPreference.EVENT_TYPES}
        self.assertEqual(registry_keys, preference_keys)

    def test_registry_labels_match_preference_choices(self):
        """Registry labels must match NotificationPreference.EVENT_TYPES labels."""
        registry_choices = dict(get_event_type_choices())
        for event_type, label in NotificationPreference.EVENT_TYPES:
            self.assertEqual(
                registry_choices.get(event_type),
                label,
                f'Label mismatch for {event_type}',
            )

    def test_viewset_own_team_split_matches_registry(self):
        """Each type's category must match the viewset OWN/TEAM split."""
        from plugins.notifications.viewsets import OWN_EVENT_TYPES, TEAM_EVENT_TYPES
        for event_type, type_cls in get_all_types().items():
            if type_cls.category == 'own':
                self.assertIn(
                    event_type, OWN_EVENT_TYPES,
                    f'{event_type} declared own but not in OWN_EVENT_TYPES',
                )
                self.assertNotIn(event_type, TEAM_EVENT_TYPES)
            elif type_cls.category == 'team':
                self.assertIn(
                    event_type, TEAM_EVENT_TYPES,
                    f'{event_type} declared team but not in TEAM_EVENT_TYPES',
                )
                self.assertNotIn(event_type, OWN_EVENT_TYPES)
            else:
                self.fail(f'{event_type} has invalid category: {type_cls.category}')

    def test_registry_has_10_types(self):
        self.assertEqual(len(get_all_types()), 10)


# ============================================================================
# _create_notification requires event_type (no silent fallback)
# ============================================================================

class CreateNotificationRequiresEventTypeTest(TestCase):
    def test_create_notification_requires_event_type(self):
        """_create_notification must raise TypeError without event_type."""
        from plugins.notifications.signals import _create_notification
        user = User.objects.create_user(
            username='reqet', email='reqet@test.com', password='testpass123'
        )
        with self.assertRaises(TypeError):
            _create_notification(
                user=user,
                title='Test',
                message='Test',
            )


# ============================================================================
# Per-type unit tests — recipients, title, message, dedupe_key
# ============================================================================

class OwnLeaveSubmittedTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='ls', email='ls@test.com', password='testpass123'
        )

    def _context(self):
        class FakeLeave:
            def __init__(self, user, start_date):
                self.user = user
                self.start_date = start_date
        return {'instance': FakeLeave(self.user, datetime.date(2026, 8, 11))}

    def test_recipients(self):
        self.assertEqual(
            list(LeaveSubmittedNotification().recipients(self._context())),
            [self.user],
        )

    def test_title(self):
        self.assertEqual(
            LeaveSubmittedNotification().title(self._context()),
            'New Leave Request',
        )

    def test_message(self):
        self.assertEqual(
            LeaveSubmittedNotification().message(self._context()),
            'Your leave request for 2026-08-11 has been submitted.',
        )

    def test_dedupe_key_is_none(self):
        self.assertIsNone(
            LeaveSubmittedNotification().dedupe_key(self._context(), self.user)
        )


class OwnLeaveUpdatedTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='lu', email='lu@test.com', password='testpass123'
        )

    def _context(self, status='approved'):
        class FakeLeave:
            def __init__(self, user, start_date, status):
                self.user = user
                self.start_date = start_date
                self.status = status
        return {'instance': FakeLeave(self.user, datetime.date(2026, 8, 11), status)}

    def test_title(self):
        self.assertEqual(
            LeaveUpdatedNotification().title(self._context()),
            'Leave Request Updated',
        )

    def test_message(self):
        self.assertEqual(
            LeaveUpdatedNotification().message(self._context(status='rejected')),
            'Your leave request for 2026-08-11 is now rejected.',
        )

    def test_notification_type_approved_is_success(self):
        nt = LeaveUpdatedNotification()
        self.assertEqual(
            nt._resolve_notification_type(self._context(status='approved')),
            'success',
        )

    def test_notification_type_rejected_is_warning(self):
        nt = LeaveUpdatedNotification()
        self.assertEqual(
            nt._resolve_notification_type(self._context(status='rejected')),
            'warning',
        )


class OwnLeaveEditedTest(TestCase):
    def test_message(self):
        class FakeLeave:
            def __init__(self, user):
                self.user = user
        user = User.objects.create_user(
            username='le', email='le@test.com', password='testpass123'
        )
        ctx = {
            'instance': FakeLeave(user),
            'changed_fields': ['start_date', 'end_date'],
        }
        self.assertEqual(
            LeaveEditedNotification().message(ctx),
            'Your leave request was edited. Changed: start_date, end_date',
        )


class OwnOvertimeSubmittedTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='os', email='os@test.com', password='testpass123'
        )

    def _context(self):
        class FakeOT:
            def __init__(self, user, date, hours):
                self.user = user
                self.date = date
                self.hours = hours
        return {'instance': FakeOT(self.user, datetime.date(2026, 8, 11), 2.0)}

    def test_title(self):
        self.assertEqual(
            OvertimeSubmittedNotification().title(self._context()),
            'New Overtime Log',
        )

    def test_message(self):
        self.assertEqual(
            OvertimeSubmittedNotification().message(self._context()),
            'Your overtime log for 2026-08-11 (2.0h) has been submitted.',
        )


class OwnOvertimeUpdatedTest(TestCase):
    def test_notification_type_approved_is_success(self):
        class FakeOT:
            def __init__(self, status):
                self.status = status
                self.user = None
                self.date = datetime.date(2026, 8, 11)
        nt = OvertimeUpdatedNotification()
        ctx = {'instance': FakeOT('approved')}
        self.assertEqual(nt._resolve_notification_type(ctx), 'success')

    def test_notification_type_rejected_is_warning(self):
        class FakeOT:
            def __init__(self, status):
                self.status = status
                self.user = None
                self.date = datetime.date(2026, 8, 11)
        nt = OvertimeUpdatedNotification()
        ctx = {'instance': FakeOT('rejected')}
        self.assertEqual(nt._resolve_notification_type(ctx), 'warning')


class OwnStandbySubmittedTest(TestCase):
    def test_message(self):
        class FakeSB:
            def __init__(self, user, date):
                self.user = user
                self.date = date
        user = User.objects.create_user(
            username='ss', email='ss@test.com', password='testpass123'
        )
        ctx = {'instance': FakeSB(user, datetime.date(2026, 8, 11))}
        self.assertEqual(
            StandbySubmittedNotification().message(ctx),
            'Your standby log for 2026-08-11 has been submitted.',
        )


class OwnStandbyUpdatedTest(TestCase):
    def test_notification_type_approved_is_success(self):
        class FakeSB:
            def __init__(self, status):
                self.status = status
                self.user = None
                self.date = datetime.date(2026, 8, 11)
        nt = StandbyUpdatedNotification()
        ctx = {'instance': FakeSB('approved')}
        self.assertEqual(nt._resolve_notification_type(ctx), 'success')


# ============================================================================
# TeamActionRequired — entity branching tests
# ============================================================================

class TeamActionRequiredBranchingTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='ta', email='ta@test.com', password='testpass123'
        )
        self.user.first_name = 'Test'
        self.user.last_name = 'User'
        self.user.save()

    def _context(self, entity_type, instance):
        return {'instance': instance, 'entity_type': entity_type}

    def test_title_leave(self):
        class FakeLeave:
            user = self.user
            start_date = datetime.date(2026, 8, 11)
        self.assertEqual(
            TeamActionRequiredNotification().title(
                self._context('leave', FakeLeave())
            ),
            'Action Required: New Leave Request',
        )

    def test_title_overtime(self):
        class FakeOT:
            user = self.user
            date = datetime.date(2026, 8, 11)
            hours = 2.0
        self.assertEqual(
            TeamActionRequiredNotification().title(
                self._context('overtime', FakeOT())
            ),
            'Action Required: New Overtime Log',
        )

    def test_title_standby(self):
        class FakeSB:
            user = self.user
            date = datetime.date(2026, 8, 11)
        self.assertEqual(
            TeamActionRequiredNotification().title(
                self._context('standby', FakeSB())
            ),
            'Action Required: New Standby Log',
        )

    def test_message_leave(self):
        class FakeLeave:
            user = self.user
            start_date = datetime.date(2026, 8, 11)
        self.assertEqual(
            TeamActionRequiredNotification().message(
                self._context('leave', FakeLeave())
            ),
            'Test User submitted a leave request for 2026-08-11.',
        )

    def test_message_overtime(self):
        class FakeOT:
            user = self.user
            date = datetime.date(2026, 8, 11)
            hours = 2.0
        self.assertEqual(
            TeamActionRequiredNotification().message(
                self._context('overtime', FakeOT())
            ),
            'Test User submitted overtime for 2026-08-11 (2.0h).',
        )

    def test_message_standby(self):
        class FakeSB:
            user = self.user
            date = datetime.date(2026, 8, 11)
        self.assertEqual(
            TeamActionRequiredNotification().message(
                self._context('standby', FakeSB())
            ),
            'Test User submitted standby for 2026-08-11.',
        )

    def test_message_unknown_entity_raises(self):
        class Fake:
            user = self.user
        with self.assertRaises(ValueError):
            TeamActionRequiredNotification().message(
                self._context('unknown', Fake())
            )


class TeamLeaveDeletedTest(TestCase):
    def test_message(self):
        user = User.objects.create_user(
            username='tld', email='tld@test.com', password='testpass123',
            first_name='Jane', last_name='Doe',
        )

        class FakeLeave:
            def __init__(self, user, start_date):
                self.user = user
                self.start_date = start_date

        self.assertEqual(
            TeamLeaveDeletedNotification().message({
                'instance': FakeLeave(user, datetime.date(2026, 8, 11)),
            }),
            'Jane Doe deleted their leave request for 2026-08-11.',
        )


# ============================================================================
# Period finalized — recipients, CR exclusion, closer exclusion
# ============================================================================

class NextPeriodTest(TestCase):
    def test_january_after_december(self):
        self.assertEqual(
            _next_period(datetime.date(2026, 12, 1)),
            datetime.date(2027, 1, 1),
        )

    def test_mid_year(self):
        self.assertEqual(
            _next_period(datetime.date(2026, 6, 1)),
            datetime.date(2026, 7, 1),
        )


class PeriodFinalizedRecipientsTest(TestCase):
    def setUp(self):
        from apps.users.models import (
            ApprovalPeriodBoundary, ApprovalPeriodClose, ApprovalPeriodCloseMember,
        )
        self.closer = User.objects.create_user(
            username='closer', email='closer@test.com', password='testpass123'
        )
        self.member1 = User.objects.create_user(
            username='m1', email='m1@test.com', password='testpass123'
        )
        self.member2 = User.objects.create_user(
            username='m2', email='m2@test.com', password='testpass123'
        )
        self.boundary = ApprovalPeriodBoundary.objects.create(
            period=datetime.date(2026, 8, 1)
        )
        self.close = ApprovalPeriodClose.objects.create(
            boundary=self.boundary,
            closed_at=datetime.datetime(2026, 8, 11, 14, 30),
            closed_by=self.closer,
        )
        ApprovalPeriodCloseMember.objects.create(close=self.close, user=self.member1)
        ApprovalPeriodCloseMember.objects.create(close=self.close, user=self.member2)
        ApprovalPeriodCloseMember.objects.create(close=self.close, user=self.closer)

    def _context(self):
        # Refresh with prefetch like the real deliver() does
        from apps.users.models import ApprovalPeriodClose
        close = (
            ApprovalPeriodClose.objects
            .prefetch_related('members__user')
            .get(pk=self.close.pk)
        )
        return {'close': close}

    def test_excludes_closed_by(self):
        recipients = list(PeriodFinalizedNotification().recipients(self._context()))
        recipient_ids = {u.id for u in recipients}
        self.assertNotIn(self.closer.id, recipient_ids)
        self.assertIn(self.member1.id, recipient_ids)
        self.assertIn(self.member2.id, recipient_ids)

    @patch('plugins.notifications.types.period_finalized.get_calendar_excluded_user_ids',
           create=True)
    def test_excludes_cr_only_users(self, _mock):
        # Patch the import site: control_room.services.scope_service
        import sys
        import types as pytypes
        fake_module = pytypes.ModuleType(
            'plugins.control_room.services.scope_service'
        )
        fake_module.get_calendar_excluded_user_ids = lambda: {self.member1.id}
        # Inject into sys.modules so the import inside recipients() finds it
        original = sys.modules.get('plugins.control_room.services.scope_service')
        sys.modules['plugins.control_room.services.scope_service'] = fake_module
        try:
            # Also ensure plugins.control_room.services is importable
            if 'plugins.control_room.services' not in sys.modules:
                sys.modules['plugins.control_room.services'] = pytypes.ModuleType(
                    'plugins.control_room.services'
                )
            recipients = list(
                PeriodFinalizedNotification().recipients(self._context())
            )
            recipient_ids = {u.id for u in recipients}
            self.assertNotIn(self.member1.id, recipient_ids)
            self.assertIn(self.member2.id, recipient_ids)
        finally:
            if original is not None:
                sys.modules['plugins.control_room.services.scope_service'] = original
            else:
                sys.modules.pop('plugins.control_room.services.scope_service', None)

    def test_dedupe_key(self):
        ctx = self._context()
        key = PeriodFinalizedNotification().dedupe_key(ctx, self.member1)
        self.assertEqual(key, f'period-close:{self.close.pk}:user:{self.member1.id}')

    def test_title(self):
        self.assertEqual(
            PeriodFinalizedNotification().title(self._context()),
            'August 2026 overtime and standby period finalized',
        )

    def test_message(self):
        msg = PeriodFinalizedNotification().message(self._context())
        self.assertIn('Your TL finalized August 2026', msg)
        self.assertIn('11/08/2026 at 14:30', msg)
        self.assertIn('September 2026 payroll', msg)


# ============================================================================
# Dispatch behavior tests
# ============================================================================

class DispatchBehaviorTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='dp', email='dp@test.com', password='testpass123'
        )

    @patch('plugins.notifications.signals._preference_enabled')
    def test_dispatch_respects_preference_disabled(self, mock_pref):
        mock_pref.return_value = False
        class FakeLeave:
            user = self.user
            start_date = datetime.date(2026, 8, 11)
        ctx = {'instance': FakeLeave()}
        LeaveSubmittedNotification().dispatch(ctx)
        self.assertFalse(
            Notification.objects.filter(user=self.user).exists()
        )

    def test_dispatch_with_dedupe_key_is_idempotent(self):
        from apps.users.models import (
            ApprovalPeriodBoundary, ApprovalPeriodClose, ApprovalPeriodCloseMember,
        )
        closer = User.objects.create_user(
            username='dp_closer', email='dpc@test.com', password='testpass123'
        )
        boundary = ApprovalPeriodBoundary.objects.create(
            period=datetime.date(2026, 8, 1)
        )
        close = ApprovalPeriodClose.objects.create(
            boundary=boundary,
            closed_at=datetime.datetime(2026, 8, 11, 14, 30),
            closed_by=closer,
        )
        ApprovalPeriodCloseMember.objects.create(close=close, user=self.user)
        ctx = {'close': close}
        PeriodFinalizedNotification().dispatch(ctx)
        PeriodFinalizedNotification().dispatch(ctx)
        self.assertEqual(
            Notification.objects.filter(
                user=self.user,
                dedupe_key=f'period-close:{close.pk}:user:{self.user.id}',
            ).count(),
            1,
        )

    def test_notification_type_method_resolution(self):
        """Verify callable notification_type resolves correctly."""
        class FakeOT:
            user = self.user
            date = datetime.date(2026, 8, 11)
            status = 'approved'
        nt = OvertimeUpdatedNotification()
        self.assertEqual(
            nt._resolve_notification_type({'instance': FakeOT()}),
            'success',
        )


# ============================================================================
# Base class default notification_type
# ============================================================================

class BaseClassDefaultTest(TestCase):
    def test_base_class_has_notification_type_default(self):
        """Base class must default notification_type to 'info' so future
        subclasses that forget to define it don't raise AttributeError."""
        from plugins.notifications.types.base import NotificationType, REGISTRY

        class TestType(NotificationType):
            event_type = '_test_default_nt'
            label = 'Test'
            def recipients(self, context):
                return []
            def title(self, context):
                return 'Test'
            def message(self, context):
                return 'Test'

        try:
            self.assertEqual(
                TestType()._resolve_notification_type({}),
                'info',
            )
        finally:
            # Clean up registry to avoid polluting other tests
            REGISTRY.pop('_test_default_nt', None)


# ============================================================================
# Leave-edited signal path — locks in the bug fix from the refactor
# ============================================================================

class LeaveEditedSignalTest(TestCase):
    """Verify that editing a leave request's fields WITHOUT changing status
    fires the 'own_leave_edited' notification.

    The original code had this branch nested inside the status-change block,
    making it dead code (the condition old_status == instance.status inside
    a block requiring old_status != instance.status is always False). The
    refactor moved it outside, fixing the bug. This test locks in the fix.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='le', email='le@test.com', password='testpass123'
        )

    @patch('plugins.notifications.signals.send_push_notification')
    def test_field_edit_without_status_change_fires_edited_notification(self, mock_push):
        from apps.leave_management.models import LeaveRequest
        leave = LeaveRequest.objects.create(
            user=self.user,
            request_type='vacation',
            start_date='2026-08-10',
            end_date='2026-08-12',
            reason='Test vacation',
        )
        # Clear creation notifications
        Notification.objects.all().delete()

        # Edit start_date without changing status
        leave.start_date = '2026-08-11'
        leave.save()

        notifs = Notification.objects.filter(user=self.user)
        self.assertTrue(notifs.exists())
        self.assertEqual(notifs.first().title, 'Leave Request Edited')
