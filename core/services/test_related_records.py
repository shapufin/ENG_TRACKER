from unittest.mock import patch

from django.contrib.auth.models import User
from django.db.models import CASCADE, SET_NULL
from django.test import TestCase, RequestFactory

from apps.reports.models import AuditLog
from apps.users.models import Team, UserProfile
from core.services.lifecycle import record_lifecycle_event
from core.services.related_records import relation_counts


class RelationCountsTests(TestCase):
    def setUp(self):
        self.leader = User.objects.create_user('l', password='x')
        UserProfile.objects.get_or_create(user=self.leader)
        self.team = Team.objects.create(name='T', code='T1', team_leader=self.leader)

    def test_predicate_selects_relations_and_zero_counts_are_omitted(self):
        member = User.objects.create_user('m', password='x')
        profile, _ = UserProfile.objects.get_or_create(user=member)
        profile.teams.add(self.team)
        cascades = relation_counts(self.team, lambda rel: rel.one_to_many and rel.on_delete is CASCADE)
        self.assertEqual(cascades.get('user_memberships'), 1)
        self.assertNotIn('sub_teams', cascades)
        set_null = relation_counts(self.team, lambda rel: rel.one_to_many and rel.on_delete is SET_NULL)
        self.assertNotIn('user_memberships', set_null)

    def test_nothing_matches_gives_empty_dict(self):
        self.assertEqual(relation_counts(self.team, lambda rel: False), {})


class LifecycleEventTests(TestCase):
    def test_writes_an_audit_row_with_operation_and_extra(self):
        user = User.objects.create_user('a', password='x')
        team = Team.objects.create(name='T', code='T1')
        request = RequestFactory().post('/x', HTTP_USER_AGENT='ua')
        request.user = user
        record_lifecycle_event(
            request, team, 'team', 'UPDATE', 'archive',
            old={'is_active': True}, new={'is_active': False}, extra={'members': 2},
        )
        row = AuditLog.objects.get(model_name='team', object_id=str(team.pk))
        self.assertEqual(row.extra_data, {'operation': 'archive', 'members': 2})
        self.assertEqual(row.user, user)
        self.assertEqual(row.old_values, {'is_active': True})

    def test_audit_failure_is_logged_not_raised(self):
        team = Team.objects.create(name='T', code='T1')
        request = RequestFactory().post('/x')
        request.user = User.objects.create_user('b', password='x')
        with patch.object(AuditLog.objects, 'create', side_effect=RuntimeError('db down')),                 self.assertLogs('core.services.lifecycle', level='WARNING'):
            record_lifecycle_event(request, team, 'team', 'UPDATE', 'archive')
