"""Queryset scoping that adds the HBPR population to a viewset's own-rows rule.

A viewset keeps its existing "own rows" filter (a TL sees what they own) and
passes it here as ``own_q``. For a viewer who is an HBPR the HBPR slice is OR-ed
in, so multi-role users (TL + HBPR) get the union on reads.

The slice only applies to *reads* (safe methods) and to the explicit
participation actions a viewset lists in ``hbpr_participation_actions``
(e.g. ``approve``, ``decide``). Every other write keeps the own-rows rule, so
HBPR scope never widens what someone can edit or delete.

A record is in the HBPR slice when its owning TL is in the Italian TL set AND
its subject is in the Italian population — owner and subject both, so a record
about an in-scope person written up by a TL outside the population stays hidden.
"""
from django.db.models import Q
from rest_framework.permissions import SAFE_METHODS

from apps.users.services.hbpr_scope import get_hbpr_scope


class HbprReadScopeMixin:
    hbpr_participation_actions = frozenset()

    def _hbpr_scope_for_request(self):
        request = self.request
        action = getattr(self, 'action', None)
        if request.method in SAFE_METHODS or action in self.hbpr_participation_actions:
            return get_hbpr_scope(request.user)
        return None

    def limit_to_viewer(
        self, qs, own_q, *, leader_field=None, member_field=None, member_nullable=False,
    ):
        """Own rows, plus the HBPR slice when the viewer is an HBPR.

        ``leader_field`` is the lookup to the owning TL, ``member_field`` the
        lookup to the subject employee; pass whichever the model has. Set
        ``member_nullable`` when the subject may be empty (a team meeting has
        no single counterparty): such a row is in scope on its owner alone.
        """
        scope = self._hbpr_scope_for_request()
        if scope is None:
            return qs.filter(own_q)
        hbpr_q = Q()
        if leader_field:
            hbpr_q &= Q(**{f'{leader_field}__in': scope.tl_ids})
        if member_field:
            member_q = Q(**{f'{member_field}__in': scope.user_ids})
            if member_nullable:
                member_q |= Q(**{f'{member_field}__isnull': True})
            hbpr_q &= member_q
        if not (leader_field or member_field):
            return qs.filter(own_q)
        return qs.filter(own_q | hbpr_q)
