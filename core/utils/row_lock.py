"""One lock per person for "check, then write" requests (audit 2026-11-16 M6).

Overlap and balance checks read rows and then insert. Two requests for the same person running at
once can both pass the check. Taking this lock FIRST, inside the transaction that writes, makes the
second request wait and then see the first one's row. SQLite ignores row locks (single writer), so
the concurrency tests for this run on PostgreSQL only.
"""


def lock_person(user_id) -> None:
    """Lock the person's profile row until the surrounding transaction ends.

    ``no_key`` (FOR NO KEY UPDATE) does not block other tables inserting rows that reference the user,
    so notifications and audit rows written meanwhile never wait on it. Must be called inside
    ``transaction.atomic()``.
    """
    from apps.users.models import UserProfile

    UserProfile.objects.select_for_update(no_key=True).filter(user_id=user_id).first()
