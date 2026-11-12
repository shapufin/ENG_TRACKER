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
