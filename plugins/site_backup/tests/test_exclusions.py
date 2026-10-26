"""Transient and credential rows must not travel in a Site Backup (plan A4)."""
from django.apps import apps
from django.test import SimpleTestCase

from plugins.site_backup.services.backup import dumpable_model_labels, is_excluded


class SiteBackupExclusionTests(SimpleTestCase):
    def test_onboarding_exports_are_excluded(self):
        # Rows point at files in EXPORT_ROOT that expire after 24 hours; restoring them
        # would resurrect "ready" exports whose files are long gone.
        model = apps.get_model('onboarding', 'ClientExport')
        self.assertTrue(is_excluded(model))
        self.assertNotIn('onboarding.clientexport', dumpable_model_labels())

    def test_real_onboarding_data_is_still_backed_up(self):
        self.assertIn('onboarding.document', dumpable_model_labels())
        self.assertIn('onboarding.folder', dumpable_model_labels())
