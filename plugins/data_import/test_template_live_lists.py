"""Template lists come from the live database, never a truncated slice of it."""
from django.contrib.auth.models import User
from django.test import TestCase

from apps.users.models.core import Team
from plugins.data_import.importers.teams import TeamImporter


class TeamTemplateListTests(TestCase):
    def test_leader_lists_include_every_active_user_not_the_first_few(self):
        for i in range(60):
            User.objects.create_user(username=f'u{i:03d}', password='x')
        importer = TeamImporter()
        usernames = {row['Username'] for row in importer.get_reference_data()['Available Leaders']}
        self.assertEqual(len(usernames), 60)
        self.assertIn('u059', usernames)
        self.assertIn('u059', importer.get_field_dropdowns()['team_leader_username'])

    def test_calendar_group_dropdown_lists_the_groups_in_use(self):
        Team.objects.create(code='A', name='A', calendar_group='Italy')
        Team.objects.create(code='B', name='B', calendar_group='Albania')
        Team.objects.create(code='C', name='C', calendar_group='Italy')
        groups = TeamImporter().get_field_dropdowns()['calendar_group']
        self.assertLessEqual({'Albania', 'Italy'}, set(groups))
        self.assertEqual(len(groups), len(set(groups)))
