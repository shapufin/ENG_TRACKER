from django.db.models import ProtectedError

from .services.client_lifecycle import protected_record_counts


def block_client_delete_with_kept_records(sender, instance, **kwargs):
    """Refuse any Client delete (model, queryset, shell) while standby, KPI or
    other M2M links still point at it. ``on_delete=PROTECT`` already covers the
    overtime logs, but Django cannot protect a many-to-many through table."""
    counts = protected_record_counts(instance)
    if counts:
        raise ProtectedError(
            'Client still has records that must be kept: '
            + ', '.join(f'{name}={count}' for name, count in sorted(counts.items())),
            [instance],
        )
