from django.test import SimpleTestCase

from plugins.analytics.plugin import AnalyticsPlugin


class ConfigSchemaTests(SimpleTestCase):
    def test_no_unconsumed_config_keys(self):
        # Snapshot frequency / retention live on the AnalyticsConfiguration model.
        self.assertEqual(AnalyticsPlugin().get_config_schema(), {})
