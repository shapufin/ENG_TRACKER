"""Settings visibility matches delivery: a type is listed only when the user can receive it."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.permissions.services.role_service import assign_role
from plugins.notifications.types.base import REGISTRY
from plugins.notifications.viewsets import NotificationViewSet, OWN_EVENT_TYPES

User = get_user_model()

PREFERENCES_PATH = '/api/plugins/notifications/notifications/preferences/'


def _category_keys(category):
    return {cls.preference_key for cls in REGISTRY.values() if cls.category == category}


class PreferenceVisibilityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.factory = APIRequestFactory()

    def _keys(self, user):
        request = self.factory.get(PREFERENCES_PATH)
        force_authenticate(request, user=user)
        response = NotificationViewSet.as_view({'get': 'preferences'})(request)
        self.assertEqual(response.status_code, 200)
        return {item['event_type'] for item in response.data}

    def _user(self, username, roles=(), **flags):
        user = User.objects.create_user(username=username, email=f'{username}@test.com', password='x')
        for key, value in flags.items():
            setattr(user, key, value)
        user.save()
        for code in roles:
            assign_role(user, code)
        return user

    def test_hr_only_user_sees_own_types_only(self):
        hr = self._user('hr_only', roles=['hr'])
        keys = self._keys(hr)
        self.assertTrue(set(OWN_EVENT_TYPES) <= keys)
        self.assertFalse(keys & {'team_action_required', 'team_leave_deleted'})
        self.assertFalse(keys & _category_keys('team'))
        self.assertFalse(keys & _category_keys('oversight'))

    def test_team_leader_and_hr_does_not_see_hbpr_groups(self):
        user = self._user('tl_hr', roles=['albanian_tl', 'hr'])
        keys = self._keys(user)
        self.assertIn('team_action_required', keys)
        self.assertFalse({key for key in keys if key.startswith('hbpr_')})
        self.assertFalse(keys & _category_keys('oversight'))

    def test_team_leader_sees_team_types(self):
        tl = self._user('tl_only', roles=['albanian_tl'])
        keys = self._keys(tl)
        self.assertIn('team_action_required', keys)
        self.assertIn('team_leave_deleted', keys)

    def test_staff_only_user_sees_own_types_only(self):
        staff = self._user('staff_only', is_staff=True)
        keys = self._keys(staff)
        self.assertTrue(set(OWN_EVENT_TYPES) <= keys)
        self.assertFalse(keys & {'team_action_required', 'team_leave_deleted'})
        self.assertFalse(keys & _category_keys('oversight'))

    def test_hbpr_user_sees_governance_groups(self):
        hbpr = self._user('hbpr_only', roles=['hbpr'])
        keys = self._keys(hbpr)
        self.assertTrue(keys & _category_keys('oversight'))
        self.assertFalse(keys & {'own_leave_submitted', 'team_action_required'})

    def test_hbpr_who_is_also_team_leader_sees_both(self):
        user = self._user('hbpr_tl', roles=['hbpr', 'albanian_tl'])
        keys = self._keys(user)
        self.assertIn('team_action_required', keys)
        self.assertTrue(keys & _category_keys('oversight'))

    def test_staff_patch_of_team_preference_is_rejected(self):
        staff = self._user('staff_patch', is_staff=True)
        request = self.factory.patch(
            PREFERENCES_PATH,
            {'event_type': 'team_action_required', 'in_app_enabled': False},
            format='json',
        )
        force_authenticate(request, user=staff)
        response = NotificationViewSet.as_view({'get': 'preferences', 'patch': 'preferences'})(request)
        self.assertEqual(response.status_code, 400)
