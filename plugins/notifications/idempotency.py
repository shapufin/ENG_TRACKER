import hashlib
import json
from contextlib import contextmanager
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import OfflineSubmissionIdempotency


class IdempotencyReplay(Exception):
    def __init__(self, response):
        self.response = response


def _request_hash(request):
    body = request.data if hasattr(request, "data") else {}
    encoded = json.dumps(body, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class _Scope:
    def __init__(self, record):
        self.record = record

    def complete(self, response):
        self.record.status_code = response.status_code
        self.record.response_body = response.data
        self.record.completed_at = timezone.now()
        self.record.save(update_fields=["status_code", "response_body", "completed_at"])


@contextmanager
def idempotency_scope(request, endpoint):
    key = request.headers.get("Idempotency-Key")
    if not key:
        yield None
        return
    if len(key) > 100 or not key.strip():
        raise ValidationError({"Idempotency-Key": "A non-empty key up to 100 characters is required."})

    request_hash = _request_hash(request)
    with transaction.atomic():
        record, created = OfflineSubmissionIdempotency.objects.select_for_update().get_or_create(
            user=request.user,
            endpoint=endpoint,
            key=key,
            defaults={"request_hash": request_hash},
        )
        if not created:
            if record.request_hash != request_hash:
                raise ValidationError({"Idempotency-Key": "The key was reused with a different request."})
            if record.completed_at and record.response_body is not None:
                raise IdempotencyReplay(Response(record.response_body, status=record.status_code))
        scope = _Scope(record)
        yield scope


class IdempotentCreateMixin:
    idempotency_endpoint = None

    def create(self, request, *args, **kwargs):
        try:
            with idempotency_scope(request, self.idempotency_endpoint) as scope:
                response = super().create(request, *args, **kwargs)
                if scope is not None and 200 <= response.status_code < 300:
                    scope.complete(response)
                return response
        except IdempotencyReplay as replay:
            return replay.response


def purge_old_idempotency_records(days=30):
    cutoff = timezone.now() - timedelta(days=days)
    return OfflineSubmissionIdempotency.objects.filter(created_at__lt=cutoff).delete()
