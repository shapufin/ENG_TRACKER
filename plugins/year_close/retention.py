"""How long each archived category is kept, and where it shows in the Archives area.

Retention is counted in whole years after the archived year: a 2025 set with 3 years
is removable from 31 December 2028. Payroll keeps longer than the rest (owner
decision, 2026-11-12). Nothing here deletes anything; the purge is a later,
superuser-confirmed step.
"""
from datetime import date

from django.conf import settings


def standard_years() -> int:
    return int(getattr(settings, 'YEAR_RETENTION_YEARS', 3))


def payroll_years() -> int:
    return int(getattr(settings, 'PAYROLL_RETENTION_YEARS', 5))


def removal_on(year: int, years: int) -> date:
    return date(year + years, 12, 31)


# (key, label, manifest count key, where the data lives, payroll-length retention?)
CATEGORIES = [
    ('payroll', 'Payroll', 'payroll_months', 'company', True),
    ('overtime', 'Overtime', 'overtime', 'team', False),
    ('standby', 'Standby', 'standby', 'team', False),
    ('leave', 'Leave', 'leave', 'team', False),
    ('scorecard', 'Scorecard months', 'scorecard_months', 'company', False),
    ('epr', 'EPR cycles', 'epr_cycles', 'company', False),
    ('engagement', 'Engagement months', 'engagement_months', 'company', False),
    ('evidence', 'HBPR evidence', 'governance_evidence', 'company', False),
    ('records', 'Leader records', 'leader_records', 'company', False),
]
