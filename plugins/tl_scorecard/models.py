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
from core.models.abstract import BaseModel, TrackedFieldsMixin


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


class Meeting(TrackedFieldsMixin, BaseModel, DocumentedEventMixin):
    """Covers three KPIs at once (gap-audit findings #12/#13):
    1-on-1 compliance (meeting_type=one_on_one, counterparty=team member),
    the TL-Italy sync count (meeting_type=tl_sync, counterparty is whoever
    that Italy Technical Lead is — deliberately NOT constrained to
    get_team_member_ids(), since a sync counterparty is not a direct
    report), and team-meeting governance (meeting_type=team_meeting, `team`
    set, HRBP presence tracked via `MeetingAttendee.role`, 24h notes
    circulation checked as notes_published_at - created_at)."""
    tracked_fields = ('occurred_on', 'shared_summary', 'shared_at')
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
    # What the counterparty may read. `notes` stays the organizer's private
    # record; `notes_published_at` is the 24h team-meeting KPI clock, not this.
    shared_summary = models.TextField(blank=True)
    shared_at = models.DateTimeField(null=True, blank=True)

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
    # The attendee's own notes. Visible to that attendee and staff only.
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'tl_scorecard_meeting_attendees'
        constraints = [
            models.UniqueConstraint(fields=['meeting', 'user'], name='unique_meeting_attendee'),
        ]


class IdleFlag(TrackedFieldsMixin, BaseModel, DocumentedEventMixin):
    """Idle-risk flag (gap-audit finding #9 — part 1: the point-in-time
    flag itself). The recurring weekly report the KPI also requires lives
    in the child `IdleStatusUpdate` model below."""
    tracked_fields = ('status',)
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


# ---------------------------------------------------------------------------
# Phase 3 — see the approved plan. Design principle carried through all four
# models below: the human judgment call (something happened, someone
# decided) still needs one small manual entry — that can't be invented from
# data that doesn't exist — but everything downstream (SLA timers, due
# dates, lateness, ratios) is computed automatically in services.py, never
# typed in. Escalations get NO new model at all: they're computed live from
# these plus Phase 1/2 data (see services.py's escalation_candidates()).
# ---------------------------------------------------------------------------

class Absence(TrackedFieldsMixin, BaseModel, DocumentedEventMixin):
    """Unplanned/unjustified absence (gap-audit finding #5) — distinct from
    LeaveRequest, which is pre-approved by definition. The 5-working-day
    "addressed within" SLA is computed in services.py from flagged_on vs
    addressed_on, not stored as a duration."""
    tracked_fields = ('addressed_on',)
    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='absences')
    flagged_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='absences_flagged')
    absence_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    addressed_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'tl_scorecard_absences'
        ordering = ['-absence_date']
        indexes = [models.Index(fields=['employee', 'absence_date'])]

    def __str__(self):
        return f'Absence: {self.employee} — {self.absence_date}'


class PIPRecord(TrackedFieldsMixin, BaseModel, DocumentedEventMixin):
    """Performance Improvement Plan (gap-audit finding — "PIPs executed
    only with prior HR approval, evidence-based"). `approved_by`/
    `approved_at` are the entire approval model per decision — no
    multi-step workflow. "Pending too long" is computed in services.py from
    created_at vs approved_at, not stored."""
    tracked_fields = ('status',)
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='pip_records')
    tl = models.ForeignKey(User, on_delete=models.CASCADE, related_name='pip_records_managed')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    start_date = models.DateField()
    approved_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='pip_records_approved',
        help_text='Set by an HR user when the PIP is approved. Null = pending approval.',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    # What the employee may read; `notes` stays the TL's private evidence.
    shared_notes = models.TextField(blank=True)
    closed_on = models.DateField(null=True, blank=True)
    status_note = models.TextField(
        blank=True, help_text='Reason recorded when a PIP is returned, completed or cancelled.',
    )

    class Meta:
        db_table = 'tl_scorecard_pip_records'
        ordering = ['-start_date']
        indexes = [models.Index(fields=['employee', 'status'])]

    @property
    def awaiting_approval(self):
        """Not yet approved. Plans saved before `status` became server-controlled
        were stored 'active' without an approval, so those count as pending too."""
        return self.approved_at is None and self.status in ('draft', 'active')

    def __str__(self):
        return f'PIP: {self.employee} ({self.status})'


class PromotionFlag(TrackedFieldsMixin, BaseModel):
    """High-potential/promotion nomination (gap-audit finding — "identify
    high-potential members for internal promotion, target 3%/year"). The
    nomination itself is a judgment call; the 3% ratio is computed in
    services.py from team_size vs promoted-count, never typed in."""
    tracked_fields = ('status',)
    STATUS_CHOICES = [
        ('nominated', 'Nominated'),
        ('promoted', 'Promoted'),
        ('declined', 'Declined'),
    ]

    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='promotion_flags')
    nominated_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='promotion_flags_raised')
    nominated_on = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='nominated')
    decided_on = models.DateField(null=True, blank=True)
    decided_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='promotion_flags_decided',
    )
    decision_note = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'tl_scorecard_promotion_flags'
        ordering = ['-nominated_on']

    def __str__(self):
        return f'Promotion flag: {self.employee} ({self.status})'


class EPRCycle(TrackedFieldsMixin, BaseModel):
    """One EPR cycle per (user, year) — 3 fixed stages. Due dates are NOT
    stored: services.py computes them from the year (Q1/Q3/Q4-end) so a TL
    never types a due date, and the schedule can be tuned in one place.
    `goals` (child EPRGoal) must reach 5 before goal_setting_completed_at
    can be set — enforced in the viewset, not here (keeps the model a pure
    data holder, matching this plugin's other models)."""
    tracked_fields = ('goal_setting_completed_at', 'mid_year_completed_at', 'final_review_completed_at')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='epr_cycles')
    year = models.PositiveIntegerField()
    goal_setting_completed_at = models.DateTimeField(null=True, blank=True)
    mid_year_completed_at = models.DateTimeField(null=True, blank=True)
    final_review_completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'tl_scorecard_epr_cycles'
        ordering = ['-year']
        constraints = [
            models.UniqueConstraint(fields=['user', 'year'], name='unique_epr_cycle_per_user_year'),
        ]

    def __str__(self):
        return f'EPR {self.year}: {self.user}'


class EPRGoal(BaseModel):
    """A single goal within an EPRCycle. Deliberately just a short
    description — the actual review conversation/content lives wherever it
    already happens (Workday); this only tracks that ≥5 goals exist and
    when the cycle's stages were completed, for the KPI."""
    cycle = models.ForeignKey(EPRCycle, on_delete=models.CASCADE, related_name='goals')
    description = models.CharField(max_length=255)

    class Meta:
        db_table = 'tl_scorecard_epr_goals'
        ordering = ['id']


class EPRStageRecord(BaseModel):
    """Evidence for one completed EPR stage — created only by
    ``EPRCycleViewSet.complete_stage``, one per (cycle, stage). Carries what
    the bare ``*_completed_at`` timestamp could not: what was agreed
    (``summary``), where the review artifact lives (``reference_url``, e.g.
    the Workday doc), who recorded it, and whether the summary is shared
    with the employee on My Records."""
    STAGE_CHOICES = [
        ('goal_setting', 'Goal setting'),
        ('mid_year', 'Mid-year'),
        ('final_review', 'Final review'),
    ]
    cycle = models.ForeignKey(
        EPRCycle, on_delete=models.CASCADE, related_name='stage_records'
    )
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES)
    summary = models.TextField()
    reference_url = models.URLField(
        blank=True, help_text='Link to the review artifact (e.g. Workday).'
    )
    shared_with_employee = models.BooleanField(default=False)
    recorded_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name='epr_stage_records'
    )

    class Meta:
        db_table = 'tl_scorecard_epr_stage_records'
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['cycle', 'stage'],
                name='unique_epr_stage_record_per_cycle_stage',
            ),
        ]

    def __str__(self):
        return f'{self.get_stage_display()}: {self.cycle}'


class HbprGovernanceEvidence(TrackedFieldsMixin, BaseModel):
    """Evidence of the HBPR ↔ Albanian TL governance relationship.

    Two shapes, one table:

    - ``cadence_meeting`` — a recurring weekly/biweekly/monthly meeting.
      ``reporting_year`` is NULL and rows are repeatable.
    - ``epr_mid_year`` / ``epr_year_end`` — the HBPR's participation in the AL
      TL's mid-year / year-end EPR. ``reporting_year`` is required and the row
      is unique per ``(assignment, kind, reporting_year)``.

    Authored by the assigned AL TL only (the HBPR participates but is
    read-only); read and exported by the assigned HBPR and staff. The AL TL
    later hands the evidence to their manager, so rows are never deleted —
    ``recorded_by``/``updated_by`` keep the audit trail.
    """
    tracked_fields = ('occurred_on', 'shared_summary', 'action_items', 'reference_url')

    KIND_CHOICES = [
        ('cadence_meeting', 'Cadence meeting'),
        ('epr_mid_year', 'EPR mid-year participation'),
        ('epr_year_end', 'EPR year-end participation'),
    ]
    EPR_KINDS = ('epr_mid_year', 'epr_year_end')

    assignment = models.ForeignKey(
        'users.HbprAlbanianTlAssignment',
        on_delete=models.PROTECT,
        related_name='governance_evidence',
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    occurred_on = models.DateField()
    reporting_year = models.PositiveIntegerField(null=True, blank=True)
    shared_summary = models.TextField(blank=True)
    action_items = models.TextField(blank=True)
    reference_url = models.URLField(blank=True)
    recorded_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name='hbpr_evidence_recorded',
    )
    updated_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='hbpr_evidence_updated',
    )

    class Meta:
        db_table = 'tl_scorecard_hbpr_governance_evidence'
        ordering = ['-occurred_on', '-id']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(kind__in=['epr_mid_year', 'epr_year_end'],
                             reporting_year__isnull=False)
                    | models.Q(kind='cadence_meeting', reporting_year__isnull=True)
                ),
                name='hbpr_evidence_year_matches_kind',
            ),
            models.UniqueConstraint(
                fields=['assignment', 'kind', 'reporting_year'],
                condition=models.Q(kind__in=['epr_mid_year', 'epr_year_end']),
                name='unique_hbpr_epr_evidence_per_year',
            ),
        ]
        indexes = [
            models.Index(
                fields=['assignment', 'kind', 'occurred_on'],
                name='hbpr_evidence_assign_kind_idx',
            ),
            models.Index(
                fields=['reporting_year', 'kind'],
                name='hbpr_evidence_year_kind_idx',
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.kind in self.EPR_KINDS and self.reporting_year is None:
            raise ValidationError(
                {'reporting_year': 'Required for EPR participation evidence.'}
            )
        if self.kind == 'cadence_meeting' and self.reporting_year is not None:
            raise ValidationError(
                {'reporting_year': 'Only EPR evidence carries a reporting year.'}
            )

    def __str__(self):
        return f'{self.get_kind_display()} — {self.occurred_on}'
