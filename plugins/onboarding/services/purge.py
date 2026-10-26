"""Rules and effect of purging an archived client's onboarding data (plan A4).

A purge removes folders, documents and their files. The client row and every
overtime/standby record stay, so it is the way to free the storage without
losing history. It is only allowed after a fresh, matching export.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.overtime.services.client_lifecycle import last_activity
from core.utils.timezone_local import business_today

from ..models import ClientExport, Document, Folder

EXPORT_FRESH_FOR = timedelta(hours=24)
QUIET_DAYS = 365  # "no activity in the last 12 months"


def current_counts(client):
    return Folder.objects.filter(client=client).count(), Document.objects.filter(client=client).count()


def latest_fresh_export(client):
    """Newest ready export of this client's own data that is still within 24 hours."""
    return (
        ClientExport.objects.filter(
            client=client, kind=ClientExport.KIND_CLIENT, status='ready',
            completed_at__gte=timezone.now() - EXPORT_FRESH_FOR,
        )
        .order_by('-completed_at')
        .first()
    )


def purge_blockers(client):
    """Human-readable reasons the purge is not allowed yet (empty list = allowed)."""
    blockers = []
    if client.is_active:
        blockers.append('Client must be archived before its onboarding data can be purged.')
    activity = last_activity(client)
    if activity and activity > business_today() - timedelta(days=QUIET_DAYS):
        blockers.append(f'Client had activity within the last 12 months (last: {activity.isoformat()}).')
    folders, documents = current_counts(client)
    if not folders and not documents:
        blockers.append('There is no onboarding data to purge.')
        return blockers
    export = latest_fresh_export(client)
    if export is None:
        blockers.append('No fresh export: download the ZIP first (it must be less than 24 hours old).')
    elif (export.folders, export.documents) != (folders, documents):
        blockers.append(
            f'Onboarding data changed after the last export ({export.documents} documents exported, '
            f'{documents} now): export it again.'
        )
    return blockers


def purge_onboarding(client):
    """Delete the client's documents and folders; returns ``(folders, documents)``.

    The files go once the transaction commits (see ``signals.delete_document_file``).
    """
    with transaction.atomic():
        folders, documents = current_counts(client)
        Document.objects.filter(client=client).delete()
        Folder.objects.filter(client=client).delete()
    return folders, documents
