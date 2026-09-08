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
    category: str = 'own'  # 'own' or 'team' — used by viewset drift test
    link: Optional[str] = None
    notification_type: str = 'info'  # default; override or define as method

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if cls.event_type:
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
                link=self.link,
                event_type=self.event_type,
                dedupe_key=self.dedupe_key(context, user),
            )


def get_all_types() -> dict[str, type[NotificationType]]:
    return dict(REGISTRY)


def get_event_type_choices() -> list[tuple[str, str]]:
    """Return (event_type, label) pairs sorted by event_type."""
    return sorted(
        (cls.event_type, cls.label)
        for cls in REGISTRY.values()
    )
