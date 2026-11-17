"""Daily retention job of the audit_log plugin (audit 2026-11-16 M9)."""
from django.core.management import call_command


def purge():
    call_command('purge_audit_logs', '--if-configured', verbosity=0)
