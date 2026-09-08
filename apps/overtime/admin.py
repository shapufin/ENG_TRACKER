# OvertimeLog is intentionally NOT registered in Django admin.
# All overtime changes must go through the REST API to preserve the audit
# trail, approval workflow, and finalized-payroll immutability guards.
# Registering it here would require replicating the _ensure_not_in_finalized_payroll
# checks from viewsets.py in save_model/delete_model/delete_queryset.
