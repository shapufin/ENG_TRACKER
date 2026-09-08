"""
Signals for the Ticket KPI plugin.
Auto-computes MonthlyKPI when a TicketImportBatch is saved or deleted.
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import TicketImportBatch


@receiver(post_save, sender=TicketImportBatch)
def compute_kpi_on_import(sender, instance, created, **kwargs):
    """Recompute MonthlyKPI when a batch is saved or updated.

    Deferred to transaction.on_commit so that callers which bulk_create
    NormalizedTicket rows after the batch save (e.g. TicketUploadViewSet)
    have their tickets visible to compute_monthly_kpi. Without this, the
    signal would compute KPIs on zero tickets and the viewset would have
    to recompute manually.
    """
    from .analytics import compute_monthly_kpi

    def _compute():
        compute_monthly_kpi(instance.user, instance.month)

    # If we're inside a transaction, defer until commit so child rows exist.
    # If no transaction is open, on_commit runs the callback immediately.
    transaction.on_commit(_compute)


@receiver(post_delete, sender=TicketImportBatch)
def delete_kpi_on_batch_remove(sender, instance, **kwargs):
    """Delete MonthlyKPI when the last batch for a user/month is removed.

    Wrapped in ``transaction.atomic`` so two concurrent batch deletions for
    the same user/month cannot both pass the ``exists()`` check and race on
    the KPI delete (the delete itself is idempotent, but the atomic block
    prevents the redundant query).
    """
    from .models import MonthlyKPI, TicketImportBatch
    with transaction.atomic():
        has_other = TicketImportBatch.objects.filter(
            user=instance.user, month=instance.month
        ).exists()
        if not has_other:
            MonthlyKPI.objects.filter(
                user=instance.user, month=instance.month
            ).delete()


@receiver(post_save, sender=TicketImportBatch)
def auto_match_links_on_batch_import(sender, instance, created, **kwargs):
    """Suggest pending links after a newly imported batch commits."""
    if not created or instance.is_overridden:
        return

    def _match():
        from apps.overtime.models.core import OvertimeLog
        from .models import NormalizedTicket, TicketOvertimeLink
        from .utils.ticket_match import evidence_tokens, normalize_ticket_id

        month_start = instance.month
        month_end = (
            month_start.replace(day=28) + timedelta(days=4)
        ).replace(day=1) - timedelta(days=1)
        batch_client_ids = set(instance.clients.values_list('id', flat=True))
        tickets = NormalizedTicket.objects.filter(batch=instance).only(
            'id', 'ticket_id', 'batch_id'
        )
        candidates = OvertimeLog.objects.filter(
            user_id=instance.user_id,
            date__gte=month_start,
            date__lte=month_end,
        ).only(
            'id', 'client_id', 'evidence', 'ticket_references'
        )

        candidate_tokens = {}
        for overtime in candidates:
            structured = {
                normalize_ticket_id(reference)
                for reference in (overtime.ticket_references or [])
            }
            candidate_tokens[overtime.id] = (
                overtime,
                structured,
                set(evidence_tokens(overtime.evidence)),
            )
        for ticket in tickets:
            normalized_id = normalize_ticket_id(ticket.ticket_id)
            if not normalized_id:
                continue
            for overtime, structured_tokens, evidence_token_set in candidate_tokens.values():
                if batch_client_ids and overtime.client_id not in batch_client_ids:
                    continue
                tokens = structured_tokens or evidence_token_set
                if not tokens:
                    continue
                if normalized_id not in tokens:
                    continue
                try:
                    TicketOvertimeLink.objects.get_or_create(
                        overtime_log_id=overtime.id,
                        normalized_ticket_id=ticket.id,
                        defaults={
                            'linked_by_id': instance.user_id,
                            'link_method': 'auto',
                            'review_status': 'pending',
                        },
                    )
                except IntegrityError:
                    # A manual link or concurrent matcher won the race.
                    continue

    transaction.on_commit(_match)
