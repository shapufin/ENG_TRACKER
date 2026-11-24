"""Re-enabling the plugin reconnects the rating-history receivers (2026-11-24).

``ready()`` used to be ``from . import signals``: a cached import connects nothing the
second time, so disable then enable left rating changes unaudited until a restart.
"""
from django.db.models.signals import post_save
from django.test import SimpleTestCase

from plugins.skills import signals
from plugins.skills.models import UserSkill
from plugins.skills.plugin import SkillsPlugin


class ReenableTests(SimpleTestCase):
    def test_ready_after_disable_reconnects_the_history_receiver(self):
        plugin = SkillsPlugin()
        plugin.disable()
        self.addCleanup(plugin.ready)
        plugin.ready()
        sync, _ = post_save._live_receivers(UserSkill)
        self.assertIn(signals._log_rating_change, sync)
