"""Importers cannot attach records to an archived client, or flip a client's state (plan A2)."""
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from plugins.data_import.importers.clients import ClientImporter
from plugins.data_import.importers.overtime_logs import OvertimeLogImporter
from plugins.data_import.importers.standby_logs import StandbyLogImporter

NO_UPDATE = {"update_existing": False}
UPDATE = {"update_existing": True}


def row(**values):
    return {"__row_index": 1, **values}


class InactiveClientImportTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user(username="ic_admin", is_staff=True)
        self.user = User.objects.create_user(username="mrossi", email="m.rossi@example.com")
        self.live = Client.objects.create(code="LIVE", name="Live")
        self.gone = Client.objects.create(code="GONE", name="Gone", is_active=False)

    def test_overtime_row_for_archived_client_is_an_error(self):
        result = OvertimeLogImporter().commit_row(
            row(username="mrossi", client_code="GONE", date=date(2026, 1, 5), hours=Decimal("3")),
            NO_UPDATE, context={"actor": self.actor},
        )
        self.assertEqual(result.status, "error")
        self.assertIn("archived", result.errors[0])
        self.assertFalse(OvertimeLog.objects.exists())

    def test_standby_row_for_archived_client_is_an_error(self):
        result = StandbyLogImporter().commit_row(
            row(username="mrossi", date=date(2026, 1, 5), hours=Decimal("8"), client_codes="LIVE,GONE"),
            NO_UPDATE, context={"actor": self.actor},
        )
        self.assertEqual(result.status, "error")
        self.assertIn("Gone", result.errors[0])
        self.assertFalse(StandbyLog.objects.exists())

    def test_client_importer_cannot_reactivate_an_archived_client(self):
        ClientImporter().commit_row(
            row(code="GONE", name="Gone", is_active=True), UPDATE,
        )
        self.assertFalse(Client.objects.get(code="GONE").is_active)

    def test_client_importer_cannot_deactivate_a_client(self):
        ClientImporter().commit_row(
            row(code="LIVE", name="Live", is_active=False), UPDATE,
        )
        self.assertTrue(Client.objects.get(code="LIVE").is_active)

    def test_client_importer_no_longer_offers_an_active_column(self):
        keys = {f.key for f in ClientImporter().get_fields()}
        self.assertNotIn("is_active", keys)
