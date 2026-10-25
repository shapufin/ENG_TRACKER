"""Eager-loading recipe for ``UserProfileSerializer`` list endpoints (PERF-02/03).

One place decides what the serializer reads per row, so the profile list,
``italian_team_members``, ``my_team_members`` and ``TeamViewSet.members`` all
stay at a constant query count as the page grows. The serializer paths this
covers (and the prefetch each one needs):

* ``albanian_tl_name`` / ``italian_tl_name``  -> ``select_related`` of both TL users
* ``team*`` / ``teams`` / ``teams_detail``    -> ``team_memberships__team`` + ``teams``
* ``techs`` / ``techs_detail``                -> ``techs`` + ``tech_assignments__tech|level``
* ``clients`` / ``clients_detail`` / ``client_ids`` -> ``clients``
* ``groups``                                  -> ``user__user_groups__group``
* ``is_cr_admin``                             -> ``user__user_roles__role``
* ``has_control_room_access``                 -> ``user__control_room_access`` (to_attr, see serializer)
* TL role fallbacks (``is_team_leader`` ...)  -> ``user__led_teams`` and the two
  ``*_team_members`` reverse relations
"""
from django.db.models import Count, Exists, OuterRef, Prefetch

from apps.users.models import Team, UserMFA, UserProfile


def _tl_reports(related_fk):
    """Existence-only prefetch of the profiles a TL leads (id + FK only)."""
    return Prefetch(
        f'user__{related_fk}',
        queryset=UserProfile.objects.only('id', 'user_id', 'italian_tl_id', 'albanian_tl_id'),
    )


def with_profile_list_loading(queryset):
    """Apply the shared select_related/prefetch set to a ``UserProfile`` queryset."""
    return (
        queryset
        .select_related('user', 'albanian_tl', 'italian_tl')
        # Admin-only ``mfa_enabled``: one EXISTS in the page query, not one query per row.
        .annotate(mfa_enabled=Exists(UserMFA.objects.filter(user_id=OuterRef('user_id'), is_enabled=True)))
        .prefetch_related(
            'techs',
            'clients',
            'tech_assignments__tech',
            'tech_assignments__level',
            'team_memberships__team',
            Prefetch(
                'teams',
                queryset=Team.objects.select_related('team_leader__profile', 'parent_team').annotate(
                    sub_teams_count_annotated=Count('sub_teams', distinct=True),
                    members_count_annotated=Count('members', distinct=True),
                ),
            ),
            'teams__team_leader__profile__tech_assignments__tech',
            'teams__team_leader__profile__tech_assignments__level',
            'user__user_groups__group',
            'user__user_roles__role',
            Prefetch('user__control_room_access', to_attr='prefetched_cr_access'),
            'user__led_teams',
            _tl_reports('italian_team_members'),
            _tl_reports('albanian_team_members'),
        )
    )
