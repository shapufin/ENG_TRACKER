"""NotificationType base class and auto-registration registry.

Each notification type is a self-contained class that owns its audience
rule, message template, event_type, link, and dedupe_key. Subclasses are
auto-registered via __init_subclass__ when their module is imported by
``types/__init__.py``.
"""
from __future__ import annotations

from typing import Iterable, Optional

REGISTRY: dict[str, type['NotificationType']] = {}


class NotificationType:
    """Base class for self-contained notification type definitions.

    Subclasses are auto-registered via ``__init_subclass__``. Each subclass
    owns: ``event_type``, ``label``, ``category``, audience rule, message
    template, link, dedupe_key.

    ``notification_type`` may be a string class attribute OR a method
    ``(self, context) -> str``. The ``dispatch()`` method resolves it.
    """

    event_type: str = ''
    label: str = ''
    # Admin-facing explanation of exactly who gets this notification and
    # when. Shown in the Django admin and the custom admin GUI.
    description: str = ''
    # 'own' (anyone), 'team' (TLs/HR/staff) or 'oversight' (HBPR/HR/staff).
    category: str = 'own'
    link: Optional[str] = None
    # Sensitive types are push-off until the recipient opts in; in-app is unaffected.
    push_by_default: bool = True
    notification_type: str = 'info'  # default; override or define as method

    # Optional user-facing grouping. Several event types can share one
    # preference key so the Settings page shows a small number of meaningful
    # groups instead of one row per event (the HBPR governance groups use
    # this). Empty means "the event type is its own preference key".
    preference_group: str = ''
    preference_group_label: str = ''
    # When False the type never appears in the preferences endpoint — the
    # notification is always delivered in-app (push still follows
    # ``push_by_default``) and a stored preference row cannot suppress it.
    user_configurable: bool = True
    # Resolved in __init_subclass__ so it is readable on the CLASS as well as an
    # instance — `REGISTRY[...]` holds classes, and a `property` would return
    # the property object when read off the class.
    preference_key: str = ''

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if cls.event_type:
            if not cls.preference_key:
                cls.preference_key = cls.preference_group or cls.event_type
            REGISTRY[cls.event_type] = cls

    # --- API to override ---
    def recipients(self, context) -> Iterable:
        raise NotImplementedError

    def message(self, context) -> str:
        raise NotImplementedError

    def title(self, context) -> str:
        raise NotImplementedError

    def dedupe_key(self, context, user) -> Optional[str]:
        return None

    def link_for(self, context, user) -> Optional[str]:
        """In-app path for ``user``; override when it depends on the recipient."""
        return self.link

    # --- Shared delivery (do not override) ---
    def _resolve_notification_type(self, context) -> str:
        nt = self.notification_type
        if callable(nt):
            return nt(context)
        return nt

    def dispatch(self, context):
        # Absolute import — relative .signals would resolve to
        # plugins.notifications.types.signals which doesn't exist.
        from plugins.notifications.signals import _create_notification
        nt = self._resolve_notification_type(context)
        for user in self.recipients(context):
            _create_notification(
                user=user,
                title=self.title(context),
                message=self.message(context),
                notification_type=nt,
                link=self.link_for(context, user),
                event_type=self.event_type,
                preference_key=self.preference_key,
                dedupe_key=self.dedupe_key(context, user),
            )


def get_all_types() -> dict[str, type[NotificationType]]:
    return dict(REGISTRY)


def get_preference_groups() -> dict[str, str]:
    """``group_key -> label`` for every registered type that declares one."""
    groups: dict[str, str] = {}
    for cls in REGISTRY.values():
        if cls.preference_group:
            groups.setdefault(cls.preference_group, cls.preference_group_label)
    return groups


def get_event_type_choices() -> list[tuple[str, str]]:
    """Return (event_type, label) pairs sorted by event_type."""
    return sorted(
        (cls.event_type, cls.label)
        for cls in REGISTRY.values()
    )
