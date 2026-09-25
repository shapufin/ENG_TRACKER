"""
Phase 2 models — see the approved plan. Each closes a specific gap found in
the KPI gap audit; cited in each model's docstring.

`attachment`/evidence is deliberately a plain `reference_url` (a link to
wherever the evidence already lives — an onboarding document, a shared
doc, etc.), not a new file-upload endpoint. Building validated file storage
across four new models is real new security surface this phase doesn't
need yet; a link is enough to satisfy "documented" for now.
"""
from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.users.models.core import Team
from core.models.abstract import BaseModel


class DocumentedEventMixin(models.Model):
    """Shared 'documented evidence' shape (gap-audit finding #10) — every
    Phase 2/3 model that needs to prove something happened inherits this
    instead of reinventing its own ad-hoc notes field. Deliberately a plain
    abstract base, not a polymorphic table (generic FKs fight the ORM)."""
    notes = models.TextField(blank=True)
    reference_url = models.URLField(blank=True, help_text='Link to evidence stored elsewhere.')
    recorded_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        abstract = True


class Meeting(BaseModel, DocumentedEventMixin):
    """Covers three KPIs at once (gap-audit findings #12/#13):
    1-on-1 compliance (meeting_type=one_on_one, counterparty=team member),
    the TL-Italy sync count (meeting_type=tl_sync, counterparty is whoever
    that Italy Technical Lead is — deliberately NOT constrained to
    get_team_member_ids(), since a sync counterparty is not a direct
    report), and team-meeting governance (meeting_type=team_meeting, `team`
    set, HRBP presence tracked via `MeetingAttendee.role`, 24h notes
    circulation checked as notes_published_at - created_at)."""
    MEETING_TYPE_CHOICES = [
        ('one_on_one', 'One-on-one'),
        ('tl_sync', 'TL Sync'),
        ('team_meeting', 'Team Meeting'),
    ]

    meeting_type = models.CharField(max_length=20, choices=MEETING_TYPE_CHOICES)
    organizer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='meetings_organized')
    counterparty = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='meetings_as_counterparty',
        help_text='Single counterpart for one_on_one/tl_sync. Not used for team_meeting (see attendees).',
    )
    team = models.ForeignKey(
        Team, null=True, blank=True, on_delete=models.SET_NULL, related_name='meetings',
        help_text='Set for team_meeting; optional for one_on_one/tl_sync.',
    )
    occurred_on = models.DateField()
    notes_published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'tl_scorecard_meetings'
        ordering = ['-occurred_on']
        indexes = [
            models.Index(fields=['organizer', 'meeting_type', 'occurred_on']),
            models.Index(fields=['counterparty', 'occurred_on']),
        ]

    def __str__(self):
        return f'{self.get_meeting_type_display()} — {self.occurred_on}'


class MeetingAttendee(BaseModel):
    """Attendee roles for a Meeting — the mechanism that makes HRBP presence
    on team meetings checkable (gap-audit finding #13), rather than a bare
    M2M that can't distinguish "HRBP was there" from "just a member"."""
    ROLE_CHOICES = [
        ('member', 'Member'),
        ('hrbp', 'HRBP'),
        ('observer', 'Observer'),
    ]

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name='attendees')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='meeting_attendances')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member')

    class Meta:
        db_table = 'tl_scorecard_meeting_attendees'
        constraints = [
            models.UniqueConstraint(fields=['meeting', 'user'], name='unique_meeting_attendee'),
        ]


class IdleFlag(BaseModel, DocumentedEventMixin):
    """Idle-risk flag (gap-audit finding #9 — part 1: the point-in-time
    flag itself). The recurring weekly report the KPI also requires lives
    in the child `IdleStatusUpdate` model below."""
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('resolved', 'Resolved'),
    ]

    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='idle_flags')
    flagged_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='idle_flags_raised')
    flagged_on = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    productivity_task = models.TextField(blank=True)
    resolved_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'tl_scorecard_idle_flags'
        ordering = ['-flagged_on']
        indexes = [models.Index(fields=['employee', 'status'])]

    def __str__(self):
        return f'Idle flag: {self.employee} ({self.status})'


class IdleStatusUpdate(BaseModel):
    """Weekly recurring log for an IdleFlag (gap-audit finding #9 — part 2:
    a flag alone is point-in-time, the KPI needs the weekly cadence too)."""
    flag = models.ForeignKey(IdleFlag, on_delete=models.CASCADE, related_name='status_updates')
    week_of = models.DateField(help_text='Monday of the reported week.')
    status_note = models.TextField(blank=True)
    productivity_task_snapshot = models.TextField(blank=True)
    recorded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'tl_scorecard_idle_status_updates'
        ordering = ['-week_of']
        constraints = [
            models.UniqueConstraint(fields=['flag', 'week_of'], name='unique_idle_status_per_week'),
        ]


class ReviewDelivery(BaseModel, DocumentedEventMixin):
    """Answers "≥12 monthly management reviews to Ops/GM" (gap-audit
    finding #6) — a lightweight event log, not a full review-content model.
    `recipient` is free text (not a FK to User): Ops/GM stakeholders may not
    all be system users."""
    leader = models.ForeignKey(User, on_delete=models.CASCADE, related_name='review_deliveries')
    period = models.CharField(max_length=7, help_text='YYYY-MM the review covers.')
    recipient = models.CharField(max_length=255)
    delivered_on = models.DateField()

    class Meta:
        db_table = 'tl_scorecard_review_deliveries'
        ordering = ['-delivered_on']
        indexes = [models.Index(fields=['leader', 'period'])]

    def __str__(self):
        return f'Review to {self.recipient} — {self.period}'


class EngagementSurveyResponse(BaseModel):
    """The genuinely new sentiment/pulse score (decision #2 in the plan) —
    distinct from the engagement plugin's existing approval-behavior score.
    One response per respondent per period."""
    respondent = models.ForeignKey(User, on_delete=models.CASCADE, related_name='engagement_survey_responses')
    team = models.ForeignKey(
        Team, null=True, blank=True, on_delete=models.SET_NULL, related_name='engagement_survey_responses',
    )
    period = models.CharField(max_length=7, help_text='YYYY-MM the response covers.')
    score = models.PositiveSmallIntegerField(validators=[MinValueValidator(0), MaxValueValidator(10)])
    submitted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'tl_scorecard_engagement_survey_responses'
        ordering = ['-period']
        constraints = [
            models.UniqueConstraint(fields=['respondent', 'period'], name='unique_survey_response_per_period'),
        ]

    def __str__(self):
        return f'{self.respondent} — {self.period}: {self.score}/10'
