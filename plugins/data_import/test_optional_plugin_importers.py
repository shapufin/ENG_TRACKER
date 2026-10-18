"""An importer that needs a plugin which is not installed must be skipped,
not take down the whole data_import plugin (plugin-removal safety)."""

from django.test import SimpleTestCase

from plugins.data_import.importers import import_importer_module


def _raiser(missing):
    def importer(_name):
        raise ModuleNotFoundError(f"No module named {missing!r}", name=missing)
    return importer


class OptionalPluginImporterTests(SimpleTestCase):
    def test_missing_other_plugin_is_skipped(self):
        self.assertFalse(
            import_importer_module('plugins.data_import.importers.skills', _raiser('plugins.skills'))
        )
        self.assertFalse(
            import_importer_module('x', _raiser('plugins.control_room.models'))
        )

    def test_missing_third_party_library_still_fails_loudly(self):
        with self.assertRaises(ModuleNotFoundError):
            import_importer_module('x', _raiser('openpyxl'))

    def test_missing_own_module_still_fails_loudly(self):
        with self.assertRaises(ModuleNotFoundError):
            import_importer_module('x', _raiser('plugins.data_import.importers.helpers'))

    def test_success_returns_true(self):
        self.assertTrue(import_importer_module('x', lambda _n: object()))
