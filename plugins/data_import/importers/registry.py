"""
Registry for concrete importer implementations.
"""

from typing import Dict, List, Optional
from .base import BaseImporter

_REGISTRY: Dict[str, BaseImporter] = {}


def register(importer_cls):
    """Class decorator that registers a concrete importer class.

    Raises ValueError on a duplicate ``target_key`` so a copy-paste mistake
    fails loudly at import time instead of silently shadowing a target.
    """
    instance = importer_cls()
    existing = _REGISTRY.get(instance.target_key)
    if existing is not None and type(existing) is not importer_cls:
        raise ValueError(
            f"Duplicate importer target_key '{instance.target_key}': "
            f"{type(existing).__name__} is already registered."
        )
    _REGISTRY[instance.target_key] = instance
    return importer_cls


def get_importer(target_key: str) -> Optional[BaseImporter]:
    """Return the registered importer for the given target key, or None."""
    return _REGISTRY.get(target_key)


def list_importers() -> List[BaseImporter]:
    """Return all registered importers, ordered by display name."""
    return sorted(_REGISTRY.values(), key=lambda i: i.display_name)


def is_registered(target_key: str) -> bool:
    """Return True if an importer is registered for the target key."""
    return target_key in _REGISTRY