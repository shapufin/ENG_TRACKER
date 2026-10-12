"""Who may write wage assignments.

Team leaders may read the wage of their own scoreable team (TL scorecard) and
may hold the payroll ``manage`` grant for team-scoped run actions, but only HR and
administrators may create, change or delete a wage. The viewset and the wage
importer both call this, so the rule lives in one place.
"""


def can_write_wages(user) -> bool:
    if user is None:
        return False
    if user.is_staff or user.is_superuser:
        return True
    profile = getattr(user, 'profile', None)
    return bool(profile and profile.is_hr)
