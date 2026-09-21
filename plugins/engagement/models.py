"""
TL Engagement Metrics models.

TLApprovalMetric is a MonthlyKPI-style pre-computed snapshot, one row per
(leader, team, month). Populated by the `recompute_tl_metrics` management
command, never by request-time aggregation.
"""
from django.contrib.auth.models import User
from django.db import models

from core.models.abstract import BaseModel
from apps.users.models import Team


class TLApprovalMetric(BaseModel):
    """Pre-computed monthly approval metrics for one TL over one team."""

    leader = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='engagement_metrics',
        db_index=True,
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='engagement_metrics',
        db_index=True,
    )
    month = models.DateField(help_text='First day of the month', db_index=True)

    # Per-request-type breakdown: {"leave": {...}, "overtime": {...}, "standby": {...}}
    metrics = models.JSONField(default=dict, blank=True)

    team_size = models.PositiveIntegerField(default=0)
    active_submitters = models.PositiveIntegerField(default=0)
    approval_rate_pct = models.FloatField(null=True, blank=True)
    resubmission_count = models.PositiveIntegerField(default=0)

    engagement_score = models.FloatField(null=True, blank=True)
    score_speed = models.FloatField(null=True, blank=True)
    score_approval_rate = models.FloatField(null=True, blank=True)
    score_activity = models.FloatField(null=True, blank=True)
    score_consistency = models.FloatField(null=True, blank=True)

    computed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'engagement_tl_approval_metrics'
        ordering = ['-month', 'leader_id', 'team_id']
        constraints = [
            models.UniqueConstraint(
                fields=['leader', 'team', 'month'],
                name='unique_tl_team_month',
            ),
        ]
        indexes = [
            models.Index(fields=['leader', 'month']),
            models.Index(fields=['team', 'month']),
        ]

    def __str__(self):
        return f"{self.leader.username} / {self.team.name} / {self.month}"
