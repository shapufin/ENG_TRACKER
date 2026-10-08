from django.test import SimpleTestCase

from core.utils.csv_safe import csv_safe


class CsvSafeTests(SimpleTestCase):
    def test_prefixes_formula_triggers_in_text(self):
        for text in ("=1+1", "+1", "-1", "@a", "\tx", "\rx", "  =1"):
            self.assertEqual(csv_safe(text), f"'{text}")

    def test_leaves_normal_text_numbers_and_none_alone(self):
        self.assertEqual(csv_safe("plain"), "plain")
        self.assertEqual(csv_safe(-5), -5)
        self.assertEqual(csv_safe(4.5), 4.5)
        self.assertEqual(csv_safe(None), "")
        self.assertEqual(csv_safe(""), "")
