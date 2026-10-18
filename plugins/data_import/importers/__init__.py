"""
Importer registry entries.

Importing every module in this package registers the concrete importers with
the registry, so a new target file needs no edit here. Modules that register
nothing (base, helpers, registry, ...) are imported too, which is harmless.

An importer module that needs another plugin (skills, control_room, ...) is
skipped when that plugin is not installed, so removing one plugin never takes
down the whole importer. Any other import error still fails loudly.
"""

import importlib
import logging
import pkgutil

logger = logging.getLogger(__name__)

_OWN_PACKAGE = "plugins.data_import"


def import_importer_module(name, importer=importlib.import_module):
    """Import one importer module; return False if it needs an absent plugin."""
    try:
        importer(name)
    except ModuleNotFoundError as exc:
        missing = exc.name or ""
        if missing.startswith("plugins.") and not missing.startswith(_OWN_PACKAGE):
            logger.warning("Skipping importer %s: plugin %s is not installed.", name, missing)
            return False
        raise
    return True


for _module in pkgutil.iter_modules(__path__):
    import_importer_module(f"{__name__}.{_module.name}")
