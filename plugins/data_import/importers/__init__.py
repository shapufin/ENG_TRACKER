"""
Importer registry entries.

Importing every module in this package registers the concrete importers with
the registry, so a new target file needs no edit here. Modules that register
nothing (base, helpers, registry, ...) are imported too, which is harmless.
"""

import importlib
import pkgutil

for _module in pkgutil.iter_modules(__path__):
    importlib.import_module(f"{__name__}.{_module.name}")
