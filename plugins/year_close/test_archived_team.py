"""Team lifecycle plan, Phase 7: archiving a team must not move its evidence to 'Unassigned'."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.test import RequestFactory
from django.utils import timezone

from apps.users.services import team_lifecycle
from plugins.year_close.services import builder
from plugins.year_close.test_year_close import YearCloseFixture


class ArchivedTeamYearCloseTests(YearCloseFixture):
    def setUp(self):
        super().setUp()
        # No italian_tl link: the team membership is this member's only path to the TL.
        self.member.profile.italian_tl = None
        self.member.profile.save(update_fields=['italian_tl'])
        self.add_overtime()

    def archive(self):
        request = RequestFactory().post('/x')
        request.user = self.tl
        team_lifecycle.archive_team(self.team, request)

    def test_before_the_archive_the_member_is_in_the_team_bundle(self):
        bundles = builder.bundles_for_year(self.year)
        self.assertEqual([(b['kind'], b['team_id']) for b in bundles], [('team', self.team.pk)])

    def test_after_the_archive_the_member_stays_in_the_teams_bundle(self):
        self.archive()
        bundles = builder.bundles_for_year(self.year)
        self.assertEqual([(b['kind'], b['team_id'], b['leader_id']) for b in bundles],
                         [('team', self.team.pk, self.tl.pk)])
        self.assertEqual(bundles[0]['member_ids'], [self.member.pk])
        self.assertEqual(builder.completeness_gap(self.year, bundles), set())

    def test_a_removal_just_after_midnight_tirane_stays_in_that_year(self):
        self.archive()
        from apps.users.models.core import TeamMembershipHistory
        # 00:30 on 1 January in Tirane is 23:30 on 31 December in UTC.
        TeamMembershipHistory.objects.filter(user=self.member).update(
            removed_at=datetime(self.year, 1, 1, 0, 30, tzinfo=ZoneInfo('Europe/Tirane')),
        )
        bundles = builder.bundles_for_year(self.year)
        self.assertEqual([(b['kind'], b['team_id']) for b in bundles], [('team', self.team.pk)])
        self.assertIn(self.member.pk, bundles[0]['member_ids'])

    def test_someone_who_left_before_the_year_started_does_not_follow_the_team(self):
        self.archive()
        from apps.users.models.core import TeamMembershipHistory
        TeamMembershipHistory.objects.filter(user=self.member).update(
            removed_at=timezone.now() - timedelta(days=800),
        )
        bundles = builder.bundles_for_year(self.year)
        self.assertEqual([b['kind'] for b in bundles], ['unassigned'])
        self.assertEqual(builder.completeness_gap(self.year, bundles), set())

    def test_someone_who_joined_after_the_year_is_not_attributed_to_it(self):
        self.archive()
        from apps.users.models.core import TeamMembershipHistory
        TeamMembershipHistory.objects.filter(user=self.member).update(
            joined_date=self.work_date.replace(year=self.year + 1),
        )
        self.assertEqual([b['kind'] for b in builder.bundles_for_year(self.year)], ['unassigned'])
