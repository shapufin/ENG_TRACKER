"""Archive removal notices, registered into the notifications registry.

Imported behind an ``ImportError`` guard (see ``apps.py`` and ``services.retention``),
so the year-close plugin works unchanged when the notifications plugin is absent.
The copy names no person and no record: only the year, the group and the date.
"""
from django.contrib.auth import get_user_model

from plugins.notifications.types.base import NotificationType

User = get_user_model()

GROUP_LABELS = {
    'standard': 'overtime, standby, leave, scorecard, EPR, engagement and HBPR evidence',
    'payroll': 'payroll',
}


class ArchiveRemovalNotice(NotificationType):
    """Archived data of a closed year is approaching its removal date."""
    event_type = 'archive_removal_notice'
    label = 'Archived data removal notice'
    description = (
        'Sent to superusers 90 and 30 days before archived data of a closed year may be removed.'
    )
    category = 'oversight'
    notification_type = 'warning'
    push_by_default = False
    link = '/admin/archives'

    def recipients(self, context):
        return User.objects.filter(is_superuser=True, is_active=True)

    def title(self, context):
        return 'Archived data will be removed'

    def message(self, context):
        what = GROUP_LABELS.get(context['group'], context['group'])
        return (
            f"The {context['year']} archive of {what} can be removed from "
            f"{context['remove_on']:%d %b %Y}. Download and verify it before then."
        )

    def dedupe_key(self, context, user):
        return (
            f"archive-removal:{context['year']}:{context['group']}:"
            f"{context['days']}:user:{user.id}"
        )


class YearCloseAttentionNotice(NotificationType):
    """A year that is due to close is blocked or failed (audit 2026-11-17 H4).

    Sent once per year and set of reasons: the scheduler retries hourly, so the
    dedupe key carries a hash of the reasons and a new reason is announced again.
    """
    event_type = 'year_close_attention'
    label = 'Year close needs attention'
    description = 'Sent to superusers when closing a year is blocked or a file failed to build.'
    category = 'oversight'
    notification_type = 'warning'
    push_by_default = False
    link = '/admin/archives'

    def recipients(self, context):
        return User.objects.filter(is_superuser=True, is_active=True)

    def title(self, context):
        return f"Closing {context['year']} needs attention"

    def message(self, context):
        reasons = context.get('reasons') or []
        first = reasons[0] if reasons else 'See the Archives page.'
        more = f' (+{len(reasons) - 1} more)' if len(reasons) > 1 else ''
        return f"{context['year']} is {context['status']}: {first}{more}"

    def dedupe_key(self, context, user):
        import hashlib

        digest = hashlib.sha256('|'.join(context.get('reasons') or []).encode()).hexdigest()[:16]
        return f"year-close:{context['year']}:{context['status']}:{digest}:user:{user.id}"
