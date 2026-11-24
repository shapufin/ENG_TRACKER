"""Re-enabling the plugin reconnects its receivers (2026-11-24).

``ready()`` used to be ``from . import signals``: a cached import connects nothing the
second time, so disable then enable (``activate_plugin`` calls ``ready()``) left the
worker with no KPI recompute until a restart.
"""
from django.db.models.signals import post_delete, post_save
from django.test import SimpleTestCase

from plugins.ticket_kpi.models import TicketImportBatch
from plugins.ticket_kpi.plugin import TicketKPIPlugin
from plugins.ticket_kpi.signals import (
    auto_match_links_on_batch_import,
    compute_kpi_on_import,
    delete_kpi_on_batch_remove,
)


def _connected(signal, receiver):
    return any(receiver in group for group in signal._live_receivers(TicketImportBatch))


class ReenableTests(SimpleTestCase):
    def test_ready_after_disable_reconnects_every_receiver(self):
        plugin = TicketKPIPlugin()
        plugin.disable()
        self.addCleanup(plugin.ready)
        plugin.ready()
        self.assertTrue(_connected(post_save, compute_kpi_on_import))
        self.assertTrue(_connected(post_save, auto_match_links_on_batch_import))
        self.assertTrue(_connected(post_delete, delete_kpi_on_batch_remove))

    def test_ready_twice_does_not_double_connect(self):
        plugin = TicketKPIPlugin()
        plugin.ready()
        plugin.ready()
        sync, _ = post_save._live_receivers(TicketImportBatch)
        self.assertEqual(sync.count(compute_kpi_on_import), 1)
