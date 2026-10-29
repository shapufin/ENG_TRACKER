"""A team code is typed by an admin in a dialog; 10 characters was too tight."""
from django.test import TestCase

from apps.users.models import Team
from apps.users.serializers import TeamSerializer


class TeamCodeLengthTests(TestCase):
    def test_team_code_accepts_fifty_characters(self):
        serializer = TeamSerializer(data={'name': 'Long', 'code': 'A' * 50})
        serializer.is_valid()
        self.assertNotIn('code', serializer.errors)

    def test_team_code_rejects_more_than_fifty(self):
        serializer = TeamSerializer(data={'name': 'Long', 'code': 'A' * 51})
        self.assertFalse(serializer.is_valid())
        self.assertIn('code', serializer.errors)

    def test_stored_copies_of_the_code_are_as_wide_as_the_code(self):
        """History/metric rows copy the code; a narrower copy would fail on delete/archive."""
        from apps.users.models import ApprovalPeriodCloseMember, TeamMembershipHistory
        from plugins.engagement.models import TLApprovalMetric

        width = Team._meta.get_field('code').max_length
        copies = [
            TeamMembershipHistory._meta.get_field('team_code'),
            ApprovalPeriodCloseMember._meta.get_field('source_team_code'),
            TLApprovalMetric._meta.get_field('team_code'),
        ]
        for field in copies:
            self.assertEqual(field.max_length, width, field)
