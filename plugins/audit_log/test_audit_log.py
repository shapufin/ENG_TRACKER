from django.test import TestCase
from django.contrib.auth.models import User
from plugins.audit_log.models import AuditLog, AuditLogFilter
from plugins.audit_log.plugin import AuditLogPlugin


class AuditLogPluginTestCase(TestCase):
    def setUp(self):
        self.plugin = AuditLogPlugin()

    def test_plugin_metadata(self):
        """Test plugin metadata."""
        self.assertEqual(self.plugin.name, 'audit_log')
        self.assertEqual(self.plugin.version, '1.0.0')
        self.assertIn('Audit', self.plugin.verbose_name)

    def test_plugin_config_schema(self):
        """Test plugin configuration schema."""
        schema = self.plugin.get_config_schema()
        self.assertIn('retention_days', schema)
        self.assertIn('log_level', schema)
        self.assertIn('enable_ip_logging', schema)

    def test_plugin_config_validation(self):
        """Test plugin configuration validation."""
        # Valid config
        valid_config = {'retention_days': 365}
        self.assertTrue(self.plugin.validate_config(valid_config))

        # Invalid config
        invalid_config = {'retention_days': -1}
        with self.assertRaises(ValueError):
            self.plugin.validate_config(invalid_config)


class AuditLogTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.log = AuditLog.objects.create(
            user=self.user,
            action='create',
            description='Created a new record',
            ip_address='192.168.1.1',
            status='success',
        )

    def test_audit_log_creation(self):
        """Test audit log creation."""
        self.assertEqual(self.log.user, self.user)
        self.assertEqual(self.log.action, 'create')
        self.assertEqual(self.log.status, 'success')

    def test_audit_log_str(self):
        """Test audit log string representation."""
        self.assertIn('testuser', str(self.log))
        self.assertIn('Create', str(self.log))


class AuditLogFilterTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.filter = AuditLogFilter.objects.create(
            user=self.user,
            name='My Filter',
            description='Test filter',
            action='create',
            is_public=False,
        )

    def test_filter_creation(self):
        """Test filter creation."""
        self.assertEqual(self.filter.user, self.user)
        self.assertEqual(self.filter.name, 'My Filter')
        self.assertEqual(self.filter.action, 'create')

    def test_filter_str(self):
        """Test filter string representation."""
        self.assertIn('testuser', str(self.filter))
        self.assertIn('My Filter', str(self.filter))
