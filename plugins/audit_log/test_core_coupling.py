"""Config keys must be consumed; retention must actually be enforceable."""

from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from apps.plugins.models import Plugin
from plugins.audit_log.models import AuditLog
from plugins.audit_log.plugin import AuditLogPlugin
from plugins.audit_log.signals import log_action


class ConfigSchemaTests(SimpleTestCase):
    def test_only_consumed_keys_are_declared(self):
        self.assertEqual(set(AuditLogPlugin().get_config_schema()), {'retention_days'})


class PurgeAuditLogsTests(TestCase):
    def _log(self, age_days):
        log_action(user=None, action='login', description=f'{age_days}d')
        AuditLog.objects.filter(description=f'{age_days}d').update(
            timestamp=timezone.now() - timedelta(days=age_days)
        )

    def test_purge_uses_configured_retention_days(self):
        Plugin.objects.update_or_create(
            name='audit_log',
            defaults={
                'verbose_name': 'Audit Log', 'version': '1', 'is_enabled': True,
                'config': {'retention_days': 30},
            },
        )
        self._log(10)
        self._log(45)
        call_command('purge_audit_logs', stdout=StringIO())
        self.assertEqual(
            list(AuditLog.objects.values_list('description', flat=True)), ['10d']
        )

    def test_days_option_overrides_config_and_defaults_to_365(self):
        self._log(200)
        self._log(400)
        call_command('purge_audit_logs', stdout=StringIO())
        self.assertEqual(
            list(AuditLog.objects.values_list('description', flat=True)), ['200d']
        )
        call_command('purge_audit_logs', '--days', '100', stdout=StringIO())
        self.assertFalse(AuditLog.objects.exists())


class PurgeIfConfiguredTests(TestCase):
    """Boot-time purge must never delete anything the admin did not opt into."""

    def _log_old(self):
        log_action(user=None, action='login', description='old')
        AuditLog.objects.filter(description='old').update(
            timestamp=timezone.now() - timedelta(days=4000)
        )

    def test_if_configured_is_a_no_op_without_an_explicit_retention(self):
        self._log_old()
        call_command('purge_audit_logs', '--if-configured', stdout=StringIO())
        self.assertEqual(AuditLog.objects.count(), 1)
        Plugin.objects.update_or_create(
            name='audit_log',
            defaults={'verbose_name': 'Audit Log', 'version': '1', 'is_enabled': True, 'config': {}},
        )
        call_command('purge_audit_logs', '--if-configured', stdout=StringIO())
        self.assertEqual(AuditLog.objects.count(), 1)

    def test_if_configured_purges_when_retention_is_set(self):
        self._log_old()
        Plugin.objects.update_or_create(
            name='audit_log',
            defaults={
                'verbose_name': 'Audit Log', 'version': '1', 'is_enabled': True,
                'config': {'retention_days': 30},
            },
        )
        call_command('purge_audit_logs', '--if-configured', stdout=StringIO())
        self.assertEqual(AuditLog.objects.count(), 0)
