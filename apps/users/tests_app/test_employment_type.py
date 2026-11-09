"""UserProfile.employment_type: full_time is the only type for now (40 h/week)."""
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.users.serializers import UserProfileSerializer


class EmploymentTypeTests(TestCase):
    def setUp(self):
        self.profile = get_user_model().objects.create_user(username='et-user', password='x').profile

    def test_every_profile_is_full_time_with_a_40_hour_contract(self):
        self.assertEqual(self.profile.employment_type, 'full_time')
        self.assertEqual(self.profile.weekly_contract_hours, 40)

    def test_only_full_time_is_a_valid_choice(self):
        self.profile.employment_type = 'half_time'
        with self.assertRaises(ValidationError):
            self.profile.full_clean(exclude=['user', 'code'])

    def test_serializer_exposes_the_type_and_hours(self):
        data = UserProfileSerializer(self.profile).data
        self.assertEqual(data['employment_type'], 'full_time')
        self.assertEqual(data['weekly_contract_hours'], 40)

    def test_serializer_ignores_attempts_to_change_it(self):
        serializer = UserProfileSerializer(
            self.profile, data={'employment_type': 'half_time'}, partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.employment_type, 'full_time')
