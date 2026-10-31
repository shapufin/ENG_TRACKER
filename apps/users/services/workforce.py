"""Who counts as the workforce in org-wide figures.

Active people who are neither Django staff nor superusers. ``Queryset.exclude(is_staff=True,
is_superuser=True)`` is NOT this rule: it drops only users that are BOTH, so a staff-only
admin stayed in the totals. Positive filter kwargs have no such trap.
"""


def workforce_filter(prefix=''):
    """Filter kwargs for ``User`` rows, optionally reached through ``prefix`` (e.g. ``'user__'``)."""
    return {
        f'{prefix}is_active': True,
        f'{prefix}is_staff': False,
        f'{prefix}is_superuser': False,
    }
