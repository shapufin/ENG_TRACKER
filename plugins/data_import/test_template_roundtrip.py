"""A downloaded template must auto-map every one of its own columns on re-upload."""

from django.test import TestCase

from core.utils.tabular_file import suggest_mapping
from plugins.data_import.importers.registry import list_importers
from plugins.data_import.parsing import _template_frame


class TemplateRoundTripTests(TestCase):
    def test_every_template_column_auto_maps(self):
        for importer in list_importers():
            with self.subTest(target=importer.target_key):
                columns = list(_template_frame(importer).columns)
                mapped = suggest_mapping(columns, importer.get_mapping_aliases())
                missing = [f.key for f in importer.get_fields() if f.key not in mapped]
                self.assertEqual(missing, [])
