"""Queryset scoping that adds the HBPR population to a viewset's own-rows rule.

A viewset keeps its existing "own rows" filter (a TL sees what they own) and
passes it here as ``own_q``. For a viewer who is an HBPR the HBPR slice is OR-ed
in, so multi-role users (TL + HBPR) get the union on reads.

**HBPR is strictly read-only.** The slice applies to safe methods only — there
is no participation-action allowlist any more (HBPR never approves a PIP or
decides a promotion; HR/staff do). Every write keeps the own-rows rule, so HBPR
scope never widens what someone can edit, delete or action.

A record is in the HBPR slice when its owning TL is one of the viewer's assigned
Albanian TLs AND its subject is in that assignment's population — owner and
subject both, so a record about an in-scope person written up by a TL outside
the assignment stays hidden.

Employee one-on-one meetings are **never** in the HBPR slice (pass
``hbpr_exclude=~Q(meeting_type='one_on_one')``): an HBPR sees governance
meetings, not the private employee 1:1.
"""
from django.db.models import Q
from rest_framework.permissions import SAFE_METHODS

from apps.users.services.hbpr_scope import get_hbpr_scope
from core.mixins.permissions import is_staff_user


class HbprReadScopeMixin:
    def _hbpr_scope_for_request(self):
        if self.request.method not in SAFE_METHODS:
            return None
        return get_hbpr_scope(self.request.user)

    def limit_to_viewer(
        self, qs, own_q, *, leader_field=None, member_field=None,
        member_nullable=False, hbpr_exclude=None,
    ):
        """Own rows, plus the HBPR slice on reads when the viewer is an HBPR.

        ``leader_field`` is the lookup to the owning TL, ``member_field`` the
        lookup to the subject employee; pass whichever the model has. Set
        ``member_nullable`` when the subject may be empty (a team meeting has
        no single counterparty): such a row is in scope on its owner alone.
        ``hbpr_exclude`` is an extra Q AND-ed into the HBPR slice only (never
        into ``own_q``), e.g. to drop employee one-on-one meetings.
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
        if hbpr_exclude is not None:
            hbpr_q &= hbpr_exclude
        return qs.filter(own_q | hbpr_q)


class HbprScopedQuerysetMixin(HbprReadScopeMixin):
    """Declarative, fail-closed ``get_queryset`` for HBPR-readable resources.

    A concrete viewset implements ``base_queryset()`` and ``own_q(user)`` and
    must DECLARE its HBPR policy as class attributes:

    - ``hbpr_leader_field`` / ``hbpr_member_field`` (and ``hbpr_member_nullable``,
      ``hbpr_exclude``) as for ``limit_to_viewer``; or
    - ``hbpr_no_access = True`` when an HBPR must never read the resource.

    Forgetting to declare raises ``TypeError`` when the class is created, so a
    new related viewset cannot silently inherit "no HBPR exclusion" (the bug
    class that once leaked employee one-on-one attendee rows).
    """

    hbpr_leader_field = None
    hbpr_member_field = None
    hbpr_member_nullable = False
    hbpr_exclude = None
    hbpr_no_access = False

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if 'base_queryset' not in vars(cls):
            return  # abstract intermediate class
        declared = (
            'hbpr_leader_field' in vars(cls)
            or 'hbpr_member_field' in vars(cls)
            or vars(cls).get('hbpr_no_access') is True
        )
        if not declared:
            raise TypeError(
                f'{cls.__name__} must declare its HBPR policy: set hbpr_leader_field/'
                'hbpr_member_field, or hbpr_no_access = True.'
            )

    def base_queryset(self):
        raise NotImplementedError

    def own_q(self, user):
        raise NotImplementedError

    def get_queryset(self):
        qs = self.base_queryset()
        user = self.request.user
        if is_staff_user(user):
            return qs
        if self.hbpr_no_access:
            return qs.filter(self.own_q(user))
        return self.limit_to_viewer(
            qs, self.own_q(user),
            leader_field=self.hbpr_leader_field, member_field=self.hbpr_member_field,
            member_nullable=self.hbpr_member_nullable, hbpr_exclude=self.hbpr_exclude,
        )
