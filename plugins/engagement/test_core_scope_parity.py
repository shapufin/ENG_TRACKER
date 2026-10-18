"""Engagement keeps its own bulk scope query (fixed query count); it must agree
with core's ``UserProfile.get_team_member_ids()`` for live memberships.

Intended differences: the leader is excluded and inactive users are dropped.
"""

from django.contrib.auth.models import User
from django.test import TestCase

from apps.users.models import Team
from plugins.engagement.services import _managed_map


class ManagedMapParityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        def user(name, **kw):
            return User.objects.create_user(username=name, password='x', **kw)

        cls.fk_leader = user('par_fk_leader')
        cls.team_leader = user('par_team_leader')
        cls.shared_member_leader = user('par_member_leader')
        cls.direct = user('par_direct')
        cls.led = user('par_led')
        cls.shared_peer = user('par_peer')
        cls.inactive = user('par_inactive', is_active=False)
        cls.stranger = user('par_stranger')

        cls.direct.profile.italian_tl = cls.fk_leader
        cls.direct.profile.save(update_fields=['italian_tl'])

        led_team = Team.objects.create(name='Led', code='LED', team_leader=cls.team_leader)
        led_team.members.add(cls.led.profile, cls.inactive.profile)

        shared = Team.objects.create(name='Shared', code='SHR', team_leader=cls.stranger)
        shared.members.add(cls.shared_member_leader.profile, cls.shared_peer.profile)

    def test_scope_matches_core_resolution(self):
        leaders = [self.fk_leader, self.team_leader, self.shared_member_leader]
        managed = _managed_map([u.id for u in leaders])
        for leader in leaders:
            core_ids = set(leader.profile.get_team_member_ids()) - {leader.id}
            core_active = set(
                User.objects.filter(id__in=core_ids, is_active=True).values_list('id', flat=True)
            )
            self.assertEqual(managed[leader.id], core_active, leader.username)
