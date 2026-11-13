"""An archived team confers no Control Room visibility (audit 2026-11-13)."""
from django.contrib.auth.models import User
from django.test import TestCase

from apps.users.models import Team, TeamMembership
from plugins.control_room.models import ControlRoomAccess, ControlRoomTeamScope
from plugins.control_room.services.scope_service import get_allowed_team_ids, get_allowed_user_ids


class ArchivedTeamScopeTests(TestCase):
    def setUp(self):
        self.viewer = User.objects.create_user(username='cr_view', password='x')
        self.member = User.objects.create_user(username='cr_member', password='x')
        self.live = Team.objects.create(name='CR Live', code='CRL')
        self.old = Team.objects.create(name='CR Old', code='CRO')
        for team in (self.live, self.old):
            TeamMembership.objects.create(user_profile=self.member.profile, team=team)
        access = ControlRoomAccess.objects.create(user=self.viewer, is_active=True)
        for team in (self.live, self.old):
            ControlRoomTeamScope.objects.create(access=access, team=team)

    def test_archived_team_is_dropped_from_scope_and_members(self):
        Team.objects.filter(pk=self.old.pk).update(is_active=False)
        team_ids = get_allowed_team_ids(self.viewer)
        self.assertEqual(team_ids, {self.live.id})
        self.assertEqual(get_allowed_user_ids(self.viewer, team_ids), {self.member.id})

    def test_a_member_only_in_an_archived_team_is_not_observable(self):
        TeamMembership.objects.filter(user_profile=self.member.profile, team=self.live).delete()
        Team.objects.filter(pk=self.old.pk).update(is_active=False)
        team_ids = get_allowed_team_ids(self.viewer)
        self.assertEqual(get_allowed_user_ids(self.viewer, team_ids), set())
        self.assertNotIn(self.member.id, get_allowed_user_ids(self.viewer))  # global path too
