from django.test import SimpleTestCase

from plugins.control_room.plugin import ControlRoomPlugin


class ConfigSchemaTests(SimpleTestCase):
    def test_no_unconsumed_config_keys(self):
        # The dashboard reads status_mode/include_rejected from query params.
        self.assertEqual(ControlRoomPlugin().get_config_schema(), {})
