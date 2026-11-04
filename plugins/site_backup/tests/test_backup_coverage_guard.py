"""Guard: a new model or field must not silently break, or silently leak through, site backup.

When one of these fails you are changing something backup/restore touches. Decide
(and write down in docs/site-backup-and-restore.md) whether the new data belongs in
an archive, then either fix the model or update the list below on purpose.
"""
import re
import tempfile

from django.apps import apps as django_apps
from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from plugins.site_backup.services import backup as backup_service
from plugins.site_backup.services import restore as restore_service
from plugins.site_backup.services.backup import is_excluded
from plugins.site_backup.services.dependency_graph import (
    build_dependents_map,
    topological_save_order,
)

SECRET_FIELD = re.compile(r'secret|token|totp|otp|seed|backup_code|private_key|api_key|password', re.I)

# Fields that look secret but are reviewed and safe to put in a downloadable archive
# (hashed credentials, public identifiers, or values useless without a server-side key).
REVIEWED_SECRET_LOOKALIKES = {
    'auth.user.password',  # salted hash
}


class BackupCoverageGuardTests(TestCase):
    def test_secret_looking_fields_are_excluded_or_reviewed(self):
        found = set()
        for model in django_apps.get_models():
            if is_excluded(model):
                continue
            for field in model._meta.concrete_fields:
                if SECRET_FIELD.search(field.name):
                    found.add(f'{model._meta.app_label}.{model._meta.model_name}.{field.name}')
        self.assertEqual(
            found - REVIEWED_SECRET_LOOKALIKES,
            set(),
            'These fields would travel in a downloadable site backup. Add the model to '
            'EXCLUDED_MODELS in services/backup.py, or list the field in '
            'REVIEWED_SECRET_LOOKALIKES with a reason.',
        )

    def test_every_backed_up_model_has_a_save_order(self):
        labels = set(backup_service.dumpable_model_labels())
        order = set(topological_save_order(labels, build_dependents_map()))
        self.assertEqual(labels - order, set())

    def test_full_round_trip_restores_every_model(self):
        user = User.objects.create_user(username='guard', password='x', is_superuser=True)
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            record = backup_service.create_backup(user, include_media=False)
            with record.file.open('rb') as fh:
                preview = restore_service.preview(fh)
            self.assertTrue(preview['schema_compatible'])
            labels = [group['model'] for group in preview['model_groups']]
            self.assertIn('auth.user', labels)
            with record.file.open('rb') as fh:
                result = restore_service.commit(fh, approved_models=labels, confirmed=True, user=user)
        self.assertGreaterEqual(result['updated']['auth.user'], 1)
