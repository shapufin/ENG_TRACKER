"""Cross-cutting HBPR privacy invariants.

Rather than testing known doors one by one, walk **every** route the plugin
registers as an HBPR and assert an employee one-on-one never surfaces. A new
related viewset that forgets its HBPR exclusion fails here without anyone having
to remember to write a test for it.
"""
import json

from django.utils import timezone
from rest_framework.test import force_authenticate

from .models import MeetingAttendee
from .test_tl_scorecard_hbpr import HbprScorecardBase
from .urls import router

MARKER = '1on1-PRIVATE-MARKER'


class HbprNeverSeesOneOnOnesOnAnyRoute(HbprScorecardBase):
    def setUp(self):
        super().setUp()
        self.one_on_one.notes = MARKER
        self.one_on_one.shared_summary = MARKER
        self.one_on_one.shared_at = timezone.now()
        self.one_on_one.save()
        self.attendee = MeetingAttendee.objects.create(
            meeting=self.one_on_one, user=self.staff, role='observer', notes=MARKER)

    def _model_viewsets(self):
        """(prefix, viewset) for every registered viewset that exposes list."""
        for prefix, viewset, _basename in router.registry:
            if hasattr(viewset, 'list') and hasattr(viewset, 'get_queryset'):
                yield prefix, viewset

    def test_registry_is_walked(self):
        # Guard against the walk silently matching nothing.
        prefixes = {prefix for prefix, _ in self._model_viewsets()}
        self.assertIn('meetings', prefixes)
        self.assertIn('meeting-attendees', prefixes)
        self.assertGreaterEqual(len(prefixes), 8)

    def test_no_list_route_leaks_a_one_on_one(self):
        for prefix, viewset in self._model_viewsets():
            with self.subTest(route=prefix):
                request = self.factory.get(f'/api/plugins/tl_scorecard/{prefix}/')
                force_authenticate(request, user=self.hbpr)
                response = viewset.as_view({'get': 'list'})(request)
                self.assertIn(response.status_code, (200, 403), prefix)
                self.assertNotIn(MARKER, json.dumps(response.data, default=str), prefix)

    def test_no_detail_route_resolves_a_one_on_one_by_guessed_id(self):
        ids = {
            'meetings': self.one_on_one.id,
            'meeting-attendees': self.attendee.id,
        }
        for prefix, viewset in self._model_viewsets():
            for guess_prefix, pk in ids.items():
                if guess_prefix != prefix:
                    continue
                with self.subTest(route=f'{prefix}/{pk}'):
                    request = self.factory.get(f'/api/plugins/tl_scorecard/{prefix}/{pk}/')
                    force_authenticate(request, user=self.hbpr)
                    response = viewset.as_view({'get': 'retrieve'})(request, pk=pk)
                    self.assertIn(response.status_code, (403, 404))

    def test_the_in_scope_governance_meeting_is_still_readable(self):
        # The exclusion must not be a blanket read failure.
        request = self.factory.get(f'/api/plugins/tl_scorecard/meetings/{self.meeting_in.id}/')
        force_authenticate(request, user=self.hbpr)
        from .viewsets import MeetingViewSet
        response = MeetingViewSet.as_view({'get': 'retrieve'})(request, pk=self.meeting_in.id)
        self.assertEqual(response.status_code, 200)


class HbprPolicyIsDeclaredOrTheClassCannotBeBuilt(HbprScorecardBase):
    """The mixin is fail-closed: an undeclared policy is a TypeError, not a leak."""

    def test_undeclared_policy_raises_at_class_creation(self):
        from core.mixins.viewer_scope import HbprScopedQuerysetMixin

        with self.assertRaises(TypeError):
            class Forgetful(HbprScopedQuerysetMixin):  # noqa: F841
                def base_queryset(self):
                    return None

    def test_declared_policy_or_explicit_no_access_is_accepted(self):
        from core.mixins.viewer_scope import HbprScopedQuerysetMixin

        class Scoped(HbprScopedQuerysetMixin):
            hbpr_leader_field = 'owner'

            def base_queryset(self):
                return None

        class Closed(HbprScopedQuerysetMixin):
            hbpr_no_access = True

            def base_queryset(self):
                return None

        self.assertTrue(Closed.hbpr_no_access)
        self.assertEqual(Scoped.hbpr_leader_field, 'owner')

    def test_every_hbpr_readable_scorecard_viewset_uses_the_declarative_base(self):
        from core.mixins.viewer_scope import HbprReadScopeMixin, HbprScopedQuerysetMixin

        legacy = [
            viewset.__name__ for _p, viewset, _b in router.registry
            if issubclass(viewset, HbprReadScopeMixin)
            and not issubclass(viewset, HbprScopedQuerysetMixin)
        ]
        self.assertEqual(legacy, [], 'hand-rolled HBPR scoping reintroduced')
